from __future__ import annotations

import asyncio
import json
import logging
import math
from collections import deque
from datetime import datetime, timedelta
from typing import AsyncIterator

import pandas as pd
from sqlalchemy.orm import Session

from app.core.db import SessionLocal
from app.models.etf import EtfBarMeta, EtfSymbol
from app.services.indicator_service import IndicatorService
from app.services.market_data_service import MarketDataService

logger = logging.getLogger(__name__)

SCAN_INTERVAL_MIN = 5
MAX_EVENTS = 200
MAX_SNAPSHOTS = 200

_SUPPORTED_TIMEFRAMES = ("5m", "15m", "daily")
_snapshots: dict[str, dict[str, dict]] = {timeframe: {} for timeframe in _SUPPORTED_TIMEFRAMES}
_events: deque[dict] = deque(maxlen=MAX_EVENTS)
_subscribers: list[asyncio.Queue] = []
_last_scan_at: dict[str, datetime | None] = {timeframe: None for timeframe in _SUPPORTED_TIMEFRAMES}

_ACTION_LABELS = {
    "buy": "买入",
    "watch": "观察",
    "reduce": "减仓",
    "sell": "卖出",
}


def _normalize_timeframe(timeframe: str | None) -> str:
    value = (timeframe or "5m").lower()
    if value not in _SUPPORTED_TIMEFRAMES:
        raise ValueError(f"unsupported timeframe: {timeframe}")
    return value


def _serialize_dt(value):
    return value.isoformat() if hasattr(value, "isoformat") else value


def _as_float(value, default: float = 0.0) -> float:
    try:
        if value is None or pd.isna(value):
            return default
    except Exception:
        pass
    try:
        return float(value)
    except Exception:
        return default


def _round_price(value: float) -> float:
    return round(max(value, 0.0), 4)


def _safe_number_candidates(*values) -> list[float]:
    candidates: list[float] = []
    for value in values:
        number = _as_float(value, default=math.nan)
        if not math.isnan(number) and number > 0:
            candidates.append(number)
    return candidates


def _calculate_atr_pct(df: pd.DataFrame, price: float) -> float:
    prev_close = df["close"].shift(1)
    tr = pd.concat(
        [
            (df["high"] - df["low"]).abs(),
            (df["high"] - prev_close).abs(),
            (df["low"] - prev_close).abs(),
        ],
        axis=1,
    ).max(axis=1)
    atr14 = tr.rolling(14).mean()
    return _as_float(atr14.iloc[-1]) / price if price > 0 else 0.0


def _trend_bias_from_score(score: int) -> str:
    if score >= 15:
        return "偏多"
    if score <= 6:
        return "偏空"
    return "中性"


def _pick_scan_targets(db: Session, timeframes: list[str] | None = None) -> dict[str, list[dict]]:
    active_timeframes = timeframes or list(_SUPPORTED_TIMEFRAMES)
    metas = db.query(EtfBarMeta).filter(EtfBarMeta.timeframe.in_(active_timeframes)).all()
    if not metas:
        return {timeframe: [] for timeframe in active_timeframes}

    unique_pairs: dict[tuple[str, str], EtfBarMeta] = {}
    for meta in metas:
        unique_pairs[(meta.symbol, meta.timeframe)] = meta

    symbols = sorted({symbol for symbol, _ in unique_pairs.keys()})
    names = {
        row.symbol: row.name
        for row in db.query(EtfSymbol).filter(EtfSymbol.symbol.in_(symbols)).all()
    }

    targets: dict[str, list[dict]] = {timeframe: [] for timeframe in active_timeframes}
    for (symbol, timeframe), _meta in unique_pairs.items():
        targets.setdefault(timeframe, []).append(
            {
                "symbol": symbol,
                "name": names.get(symbol, symbol),
                "timeframe": timeframe,
            }
        )
    for timeframe in targets:
        targets[timeframe] = sorted(targets[timeframe], key=lambda item: item["symbol"])
    return targets


def _compute_snapshot(
    symbol: str,
    name: str,
    timeframe: str,
    bars: list[dict],
    quote: dict | None,
    scanned_at: datetime,
) -> dict | None:
    if len(bars) < 30:
        return None

    df = pd.DataFrame(bars)
    if df.empty:
        return None
    df["ts"] = pd.to_datetime(df["ts"])
    for col in ("open", "high", "low", "close", "volume"):
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")
    df = df.dropna(subset=["ts", "close", "high", "low"]).sort_values("ts").reset_index(drop=True)
    if len(df) < 30:
        return None

    enriched = IndicatorService.enrich(df)
    last = enriched.iloc[-1]
    prev = enriched.iloc[-2]

    current_price = _as_float((quote or {}).get("price"), _as_float(last.get("close")))
    last_close = _as_float(last.get("close"), current_price)
    prev_close = _as_float(prev.get("close"), last_close)
    change_pct = _as_float(
        (quote or {}).get("change_pct"),
        ((current_price - prev_close) / prev_close * 100) if prev_close else 0.0,
    )

    ma5 = _as_float(last.get("ma5"))
    ma10 = _as_float(last.get("ma10"))
    ma20 = _as_float(last.get("ma20"))
    boll_upper = _as_float(last.get("boll_upper"))
    boll_mid = _as_float(last.get("boll_mid"))
    boll_lower = _as_float(last.get("boll_lower"))
    breakout_high = _as_float(last.get("breakout_high_20"))
    recent_high = _as_float(enriched["high"].tail(20).max())
    recent_low = _as_float(enriched["low"].tail(20).min())
    macd = _as_float(last.get("macd"))
    macd_signal = _as_float(last.get("macd_signal"))
    prev_macd = _as_float(prev.get("macd"))
    prev_macd_signal = _as_float(prev.get("macd_signal"))
    k = _as_float(last.get("kdj_k"))
    d = _as_float(last.get("kdj_d"))
    prev_k = _as_float(prev.get("kdj_k"))
    prev_d = _as_float(prev.get("kdj_d"))
    rsi = _as_float(last.get("rsi14"))
    volume = _as_float(last.get("volume"))
    volume_ma20 = _as_float(last.get("volume_ma20"))
    vol_ratio = volume / volume_ma20 if volume_ma20 > 0 else 1.0
    atr_pct = _calculate_atr_pct(enriched, current_price)
    recent_drawdown = (current_price / recent_high - 1) if recent_high else 0.0

    reason_tags: list[str] = []

    if current_price > ma5 > ma10 > ma20 and macd >= macd_signal:
        trend_score = 20
        reason_tags.extend(["均线多头", "MACD偏强"])
    elif current_price > ma10 > ma20:
        trend_score = 16
        reason_tags.append("价格站上中期均线")
    elif current_price > ma20 and macd >= 0:
        trend_score = 12
        reason_tags.append("趋势仍偏多")
    elif current_price < ma20 and macd < macd_signal:
        trend_score = 4
        reason_tags.extend(["跌破MA20", "MACD转弱"])
    else:
        trend_score = 8
        reason_tags.append("趋势中性")

    if vol_ratio >= 1.5 and current_price >= last_close:
        volume_score = 18
        reason_tags.append("放量强化")
    elif vol_ratio >= 1.15:
        volume_score = 14
        reason_tags.append("量能配合")
    elif vol_ratio >= 0.9:
        volume_score = 9
    else:
        volume_score = 5
        reason_tags.append("量能偏弱")

    support_candidates = [x for x in _safe_number_candidates(ma5, ma10, ma20, boll_mid, recent_low) if x <= current_price * 1.03]
    resistance_candidates = [x for x in _safe_number_candidates(boll_upper, breakout_high, recent_high) if x >= current_price * 0.99]
    primary_support = max(support_candidates) if support_candidates else current_price * 0.985
    primary_resistance = min(resistance_candidates) if resistance_candidates else current_price * 1.04

    if current_price <= primary_support * 1.01 and current_price >= ma20:
        position_score = 17
        reason_tags.append("回踩支撑区")
    elif breakout_high and current_price > breakout_high:
        position_score = 18
        reason_tags.append("站上突破位")
    elif boll_upper and current_price >= boll_upper * 0.995:
        position_score = 6
        reason_tags.append("逼近上轨压力")
    else:
        position_score = 11

    macd_cross = prev_macd <= prev_macd_signal and macd > macd_signal
    ma_cross = _as_float(prev.get("ma5")) <= _as_float(prev.get("ma10")) and ma5 > ma10
    kdj_rebound = prev_k <= prev_d and k > d and rsi < 68
    breakout_now = breakout_high > 0 and _as_float(prev.get("close")) <= breakout_high and current_price > breakout_high
    breakdown_now = ma20 > 0 and _as_float(prev.get("close")) >= ma20 and current_price < ma20

    if breakout_now and vol_ratio > 1.1:
        trigger_score = 20
        reason_tags.append("放量突破触发")
    elif ma_cross or macd_cross:
        trigger_score = 15
        reason_tags.append("趋势触发出现")
    elif kdj_rebound and current_price > ma20:
        trigger_score = 12
        reason_tags.append("低位反弹信号")
    elif breakdown_now:
        trigger_score = 2
        reason_tags.append("跌破关键支撑")
    else:
        trigger_score = 7

    if atr_pct <= 0.015 and recent_drawdown > -0.04:
        risk_score = 18
        reason_tags.append("波动可控")
    elif atr_pct <= 0.03:
        risk_score = 13
    elif atr_pct <= 0.05:
        risk_score = 8
        reason_tags.append("波动放大")
    else:
        risk_score = 4
        reason_tags.append("高波动风险")
    if current_price < ma20:
        risk_score = max(risk_score - 3, 2)

    total_score = int(trend_score + volume_score + position_score + trigger_score + risk_score)
    confidence = max(35, min(total_score, 96))
    trend_bias = _trend_bias_from_score(trend_score)
    risk_level = "低" if risk_score >= 15 else "中" if risk_score >= 9 else "高"

    buy_zone_low = _round_price(primary_support * 0.997)
    buy_zone_high = _round_price(max(primary_support * 1.005, current_price * 0.995))
    if buy_zone_low > buy_zone_high:
        buy_zone_low, buy_zone_high = buy_zone_high, buy_zone_low

    sell_zone_low = _round_price(primary_resistance * 0.995)
    sell_zone_high = _round_price(max(primary_resistance * 1.01, current_price * 1.02))
    if sell_zone_low > sell_zone_high:
        sell_zone_low, sell_zone_high = sell_zone_high, sell_zone_low

    stop_loss_candidates = _safe_number_candidates(
        primary_support * 0.985,
        ma20 * 0.985 if ma20 else 0,
        boll_lower * 0.995 if boll_lower else 0,
    )
    stop_loss = _round_price(min(stop_loss_candidates) if stop_loss_candidates else current_price * 0.97)
    take_profit = _round_price(max(sell_zone_high, current_price * 1.04))
    breakout_trigger = _round_price(max(_safe_number_candidates(breakout_high, recent_high, primary_resistance)))

    bearish_stack = current_price < ma10 < ma20 and macd < macd_signal
    if current_price <= stop_loss or (bearish_stack and breakdown_now):
        action = "sell"
    elif current_price >= sell_zone_low and total_score < 70:
        action = "reduce"
    elif total_score >= 76 and current_price <= buy_zone_high * 1.01:
        action = "buy"
    elif total_score >= 58:
        action = "watch"
    else:
        action = "reduce" if trend_bias == "偏空" else "watch"

    summary = {
        "buy": f"趋势与量能配合较好，当前可关注 {buy_zone_low}-{buy_zone_high} 的低吸/确认买点。",
        "watch": f"结构未坏但触发不足，重点观察 {breakout_trigger} 的突破与 {buy_zone_low} 附近支撑。",
        "reduce": f"上行动能转弱，若反抽至 {sell_zone_low}-{sell_zone_high} 可考虑分批减仓。",
        "sell": f"风险条件优先，若继续跌破 {stop_loss} 附近支撑应以卖出/防守为主。",
    }[action]

    invalid_condition = (
        f"若跌破 {stop_loss} 或重新失守 MA20，当前计划失效"
        if action in ("buy", "watch")
        else f"若重新放量站上 {breakout_trigger}，需重新评估卖出计划"
    )

    plan = {
        "bias": trend_bias,
        "focus": f"{timeframe} 节奏下优先观察 {'低吸承接' if action in ('buy', 'watch') else '防守与兑现'}。",
        "risk_note": f"当前风险等级为{risk_level}，关键防守位 {stop_loss}。",
        "key_levels": {
            "support": _round_price(primary_support),
            "resistance": _round_price(primary_resistance),
            "breakout_trigger": breakout_trigger,
            "buy_zone_low": buy_zone_low,
            "buy_zone_high": buy_zone_high,
            "sell_zone_low": sell_zone_low,
            "sell_zone_high": sell_zone_high,
            "stop_loss": stop_loss,
            "take_profit": take_profit,
        },
        "scenarios": [
            {
                "key": "low_buy",
                "title": "低吸剧本",
                "trigger": f"回踩 {buy_zone_low}-{buy_zone_high} 支撑带且量能未明显失真。",
                "execution": f"可考虑分批关注，首个防守位看 {stop_loss}。",
                "invalid": f"若有效跌破 {stop_loss}，低吸剧本失效。",
            },
            {
                "key": "breakout",
                "title": "突破剧本",
                "trigger": f"放量站上 {breakout_trigger}，确认突破结构。",
                "execution": f"突破后优先看 {sell_zone_low}-{sell_zone_high} 的上方兑现区。",
                "invalid": f"突破后若重新跌回 {_round_price(primary_resistance)} 下方，应降低追价意愿。",
            },
            {
                "key": "reduce",
                "title": "止盈/减仓剧本",
                "trigger": f"上冲至 {sell_zone_low}-{sell_zone_high} 或动能明显衰减。",
                "execution": "可按计划分批兑现，保留仓位等待更高质量信号。",
                "invalid": f"若量能继续增强并强势突破 {sell_zone_high}，减仓节奏需重新评估。",
            },
            {
                "key": "no_trade",
                "title": "放弃剧本",
                "trigger": f"跌破 {stop_loss} 或波动/风险快速恶化。",
                "execution": "优先防守，不做逆势抄底。",
                "invalid": f"若重新放量站回 {breakout_trigger} 上方，可恢复观察。",
            },
        ],
    }

    return {
        "symbol": symbol,
        "name": name,
        "timeframe": timeframe,
        "action": action,
        "action_label": _ACTION_LABELS[action],
        "confidence": confidence,
        "score": total_score,
        "trend_bias": trend_bias,
        "risk_level": risk_level,
        "current_price": round(current_price, 4),
        "last_close": round(last_close, 4),
        "change_pct": round(change_pct, 4),
        "buy_zone": {"low": buy_zone_low, "high": buy_zone_high},
        "sell_zone": {"low": sell_zone_low, "high": sell_zone_high},
        "stop_loss": stop_loss,
        "take_profit": take_profit,
        "breakout_trigger": breakout_trigger,
        "support": _round_price(primary_support),
        "resistance": _round_price(primary_resistance),
        "score_breakdown": {
            "trend": trend_score,
            "volume": volume_score,
            "position": position_score,
            "trigger": trigger_score,
            "risk": risk_score,
        },
        "reason_tags": reason_tags[:6],
        "summary": summary,
        "invalid_condition": invalid_condition,
        "plan": plan,
        "last_bar_ts": str(last.get("ts", "")),
        "quote_ts": _serialize_dt((quote or {}).get("ts")),
        "scanned_at": scanned_at.isoformat(),
    }


def _push_event(event: dict) -> None:
    _events.appendleft(event)
    for queue in list(_subscribers):
        try:
            queue.put_nowait(event)
        except asyncio.QueueFull:
            pass


def _build_event(previous: dict | None, current: dict, scanned_at: datetime) -> dict | None:
    if not previous:
        return None

    action_changed = previous.get("action") != current.get("action")
    confidence_changed = abs(int(previous.get("confidence", 0)) - int(current.get("confidence", 0))) >= 8
    if not action_changed and not confidence_changed:
        return None

    if action_changed:
        headline = f"{current['name']} {current['timeframe']} 由{_ACTION_LABELS.get(previous['action'], previous['action'])}切换为{current['action_label']}"
    else:
        headline = f"{current['name']} {current['timeframe']} 置信度变化至 {current['confidence']}"

    return {
        "id": f"{current['symbol']}-{current['timeframe']}-{scanned_at.timestamp()}",
        "symbol": current["symbol"],
        "name": current["name"],
        "timeframe": current["timeframe"],
        "action": current["action"],
        "action_label": current["action_label"],
        "headline": headline,
        "summary": current["summary"],
        "confidence": current["confidence"],
        "price": current["current_price"],
        "scanned_at": scanned_at.isoformat(),
    }


def scan_once(timeframes: list[str] | None = None) -> list[dict]:
    fired_events: list[dict] = []
    scanned_at = datetime.now()
    active_timeframes = [_normalize_timeframe(item) for item in timeframes] if timeframes else list(_SUPPORTED_TIMEFRAMES)
    db = SessionLocal()
    try:
        market = MarketDataService(db)
        grouped_targets = _pick_scan_targets(db, active_timeframes)

        for timeframe in active_timeframes:
            next_snapshots: dict[str, dict] = {}
            for target in grouped_targets.get(timeframe, [])[:MAX_SNAPSHOTS]:
                symbol = target["symbol"]
                try:
                    bars = market.get_bars(symbol=symbol, timeframe=timeframe, limit=200)
                    if len(bars) < 30:
                        continue
                    try:
                        quote = market.get_quote(symbol)
                    except Exception:
                        quote = None

                    snapshot = _compute_snapshot(
                        symbol=symbol,
                        name=target["name"],
                        timeframe=timeframe,
                        bars=bars,
                        quote=quote,
                        scanned_at=scanned_at,
                    )
                    if not snapshot:
                        continue

                    previous = _snapshots.get(timeframe, {}).get(symbol)
                    next_snapshots[symbol] = snapshot
                    event = _build_event(previous, snapshot, scanned_at)
                    if event:
                        _push_event(event)
                        fired_events.append(event)
                except Exception as exc:
                    logger.warning("decision scan failed for %s %s: %s", symbol, timeframe, exc)

            _snapshots[timeframe] = next_snapshots
            _last_scan_at[timeframe] = scanned_at
    finally:
        db.close()
    return fired_events


def ensure_fresh(timeframe: str | None = None, max_age_seconds: int = SCAN_INTERVAL_MIN * 60) -> None:
    active_timeframes = [_normalize_timeframe(timeframe)] if timeframe else list(_SUPPORTED_TIMEFRAMES)
    stale = False
    for item in active_timeframes:
        if not _snapshots.get(item) or _last_scan_at.get(item) is None:
            stale = True
            break
        if datetime.now() - _last_scan_at[item] > timedelta(seconds=max_age_seconds):
            stale = True
            break
    if stale:
        scan_once(active_timeframes)


def get_live_decisions(limit: int = 20, timeframe: str | None = None) -> dict:
    selected_timeframe = _normalize_timeframe(timeframe)
    ensure_fresh(selected_timeframe)
    items = sorted(
        _snapshots.get(selected_timeframe, {}).values(),
        key=lambda item: (item.get("score", 0), item.get("confidence", 0)),
        reverse=True,
    )[:limit]
    return {
        "items": items,
        "timeframe": selected_timeframe,
        "last_scan_at": _serialize_dt(_last_scan_at.get(selected_timeframe)),
        "count": len(items),
    }


def get_live_decision(symbol: str, timeframe: str | None = None) -> dict | None:
    selected_timeframe = _normalize_timeframe(timeframe)
    ensure_fresh(selected_timeframe)
    return _snapshots.get(selected_timeframe, {}).get(symbol)


def get_latest_plans(limit: int = 20, timeframe: str | None = None) -> dict:
    selected_timeframe = _normalize_timeframe(timeframe)
    ensure_fresh(selected_timeframe)
    items = sorted(
        _snapshots.get(selected_timeframe, {}).values(),
        key=lambda item: item.get("score", 0),
        reverse=True,
    )[:limit]
    return {
        "items": [
            {
                "symbol": item["symbol"],
                "name": item["name"],
                "timeframe": item["timeframe"],
                "action": item["action"],
                "action_label": item["action_label"],
                "confidence": item["confidence"],
                "bias": item["plan"]["bias"],
                "focus": item["plan"]["focus"],
                "risk_note": item["plan"]["risk_note"],
                "scenarios": item["plan"]["scenarios"],
                "key_levels": item["plan"]["key_levels"],
                "scanned_at": item["scanned_at"],
            }
            for item in items
        ],
        "timeframe": selected_timeframe,
        "last_scan_at": _serialize_dt(_last_scan_at.get(selected_timeframe)),
    }


def get_plan(symbol: str, timeframe: str | None = None) -> dict | None:
    snapshot = get_live_decision(symbol, timeframe)
    if not snapshot:
        return None
    return {
        "symbol": snapshot["symbol"],
        "name": snapshot["name"],
        "timeframe": snapshot["timeframe"],
        "plan": snapshot["plan"],
        "buy_zone": snapshot["buy_zone"],
        "sell_zone": snapshot["sell_zone"],
        "stop_loss": snapshot["stop_loss"],
        "take_profit": snapshot["take_profit"],
        "invalid_condition": snapshot["invalid_condition"],
        "scanned_at": snapshot["scanned_at"],
    }


def get_recent_events(limit: int = 30, timeframe: str | None = None) -> list[dict]:
    selected_timeframe = _normalize_timeframe(timeframe) if timeframe else None
    items = list(_events)
    if selected_timeframe:
        items = [item for item in items if item.get("timeframe") == selected_timeframe]
    return items[:limit]


def get_state_meta(timeframe: str | None = None) -> dict:
    selected_timeframe = _normalize_timeframe(timeframe)
    return {
        "timeframe": selected_timeframe,
        "last_scan_at": _serialize_dt(_last_scan_at.get(selected_timeframe)),
        "tracked": len(_snapshots.get(selected_timeframe, {})),
        "available_timeframes": list(_SUPPORTED_TIMEFRAMES),
    }


async def subscribe(timeframe: str | None = None) -> AsyncIterator[dict]:
    selected_timeframe = _normalize_timeframe(timeframe) if timeframe else None
    queue: asyncio.Queue = asyncio.Queue(maxsize=100)
    _subscribers.append(queue)
    try:
        for event in get_recent_events(10, selected_timeframe):
            yield event
        while True:
            event = await asyncio.wait_for(queue.get(), timeout=30)
            if selected_timeframe and event.get("timeframe") != selected_timeframe:
                continue
            yield event
    except (asyncio.TimeoutError, asyncio.CancelledError):
        pass
    finally:
        try:
            _subscribers.remove(queue)
        except ValueError:
            pass


def dumps_payload(payload: dict) -> str:
    return json.dumps(payload, ensure_ascii=False)
