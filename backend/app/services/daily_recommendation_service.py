from __future__ import annotations

import logging
from datetime import date, datetime

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.daily_recommendation import DailyRecommendationSnapshot
from app.services import decision_service
from app.services.market_data_service import MarketDataService

logger = logging.getLogger(__name__)

SAVE_TIMEFRAMES = ("5m", "15m", "daily")
SAVE_HOUR = 15
SAVE_MINUTE = 10


def _serialize_dt(value):
    return value.isoformat() if hasattr(value, "isoformat") else value


def _as_float(value) -> float | None:
    try:
        if value is None:
            return None
        number = float(value)
    except Exception:
        return None
    return number


def _round_price(value: float | None) -> float | None:
    if value is None:
        return None
    return round(value, 4)


def _parse_date(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise ValueError(f"invalid date: {value}") from exc


def _pick_suggested_buy_price(snapshot: dict) -> float | None:
    if str(snapshot.get("action") or "") != "buy":
        return None
    breakout_trigger = _as_float(snapshot.get("breakout_trigger"))
    if breakout_trigger and breakout_trigger > 0:
        return _round_price(breakout_trigger)
    buy_zone = snapshot.get("buy_zone") or {}
    buy_zone_high = _as_float(buy_zone.get("high"))
    if buy_zone_high and buy_zone_high > 0:
        return _round_price(buy_zone_high)
    return None


def _apply_snapshot_to_row(row: DailyRecommendationSnapshot, snapshot: dict, trade_date: date, saved_at: datetime) -> None:
    buy_zone = snapshot.get("buy_zone") or {}
    sell_zone = snapshot.get("sell_zone") or {}
    row.trade_date = trade_date
    row.timeframe = str(snapshot.get("timeframe") or "")
    row.symbol = str(snapshot.get("symbol") or "")
    row.name = str(snapshot.get("name") or row.symbol)
    row.action = str(snapshot.get("action") or "")
    row.action_label = str(snapshot.get("action_label") or row.action)
    row.confidence = int(snapshot.get("confidence") or 0)
    row.score = int(snapshot.get("score") or 0)
    row.summary = str(snapshot.get("summary") or "")
    row.current_price = _round_price(_as_float(snapshot.get("current_price")))
    row.suggested_buy_price = _pick_suggested_buy_price(snapshot)
    row.buy_zone_low = _round_price(_as_float(buy_zone.get("low")))
    row.buy_zone_high = _round_price(_as_float(buy_zone.get("high")))
    row.sell_zone_low = _round_price(_as_float(sell_zone.get("low")))
    row.sell_zone_high = _round_price(_as_float(sell_zone.get("high")))
    row.breakout_trigger = _round_price(_as_float(snapshot.get("breakout_trigger")))
    row.stop_loss = _round_price(_as_float(snapshot.get("stop_loss")))
    row.take_profit = _round_price(_as_float(snapshot.get("take_profit")))
    scanned_at = snapshot.get("scanned_at")
    if isinstance(scanned_at, str):
        try:
            scanned_at = datetime.fromisoformat(scanned_at)
        except ValueError:
            scanned_at = None
    row.scanned_at = scanned_at if isinstance(scanned_at, datetime) else None
    row.saved_at = saved_at


def save_daily_recommendations(
    db: Session,
    trade_date: date | None = None,
    timeframes: list[str] | tuple[str, ...] | None = None,
) -> dict:
    selected_timeframes = [str(item) for item in (timeframes or SAVE_TIMEFRAMES)]
    target_date = trade_date or datetime.now().date()
    saved_at = datetime.now()

    decision_service.scan_once(selected_timeframes)

    saved_count = 0
    for timeframe in selected_timeframes:
        payload = decision_service.get_live_decisions(limit=500, timeframe=timeframe)
        for snapshot in payload.get("items") or []:
            symbol = str(snapshot.get("symbol") or "")
            if not symbol:
                continue
            try:
                row = (
                    db.query(DailyRecommendationSnapshot)
                    .filter(
                        DailyRecommendationSnapshot.trade_date == target_date,
                        DailyRecommendationSnapshot.timeframe == timeframe,
                        DailyRecommendationSnapshot.symbol == symbol,
                    )
                    .first()
                )
                if not row:
                    row = DailyRecommendationSnapshot(
                        trade_date=target_date,
                        timeframe=timeframe,
                        symbol=symbol,
                    )
                    db.add(row)
                _apply_snapshot_to_row(row, snapshot, target_date, saved_at)
                saved_count += 1
            except Exception:
                logger.exception("failed to save daily recommendation snapshot for %s %s", timeframe, symbol)
    db.commit()
    return {
        "trade_date": target_date.isoformat(),
        "saved": saved_count,
        "timeframes": selected_timeframes,
        "saved_at": saved_at.isoformat(),
    }


def _resolve_tracking(market: MarketDataService, symbol: str, timeframe: str) -> dict:
    try:
        quote = market.get_quote(symbol)
        latest_price = _round_price(_as_float(quote.get("price")))
        if latest_price and latest_price > 0:
            return {
                "latest_price": latest_price,
                "tracking_price_ts": _serialize_dt(quote.get("ts")),
                "is_tracking_stale": False,
            }
    except Exception:
        logger.debug("realtime quote unavailable for %s", symbol)

    try:
        bars = market.get_bars(symbol=symbol, timeframe=timeframe, limit=1)
        if bars:
            bar = bars[-1]
            latest_price = _round_price(_as_float(bar.get("close")))
            if latest_price and latest_price > 0:
                return {
                    "latest_price": latest_price,
                    "tracking_price_ts": bar.get("ts"),
                    "is_tracking_stale": True,
                }
    except Exception:
        logger.debug("local fallback bars unavailable for %s %s", symbol, timeframe)

    return {
        "latest_price": None,
        "tracking_price_ts": None,
        "is_tracking_stale": True,
    }


def _serialize_record(row: DailyRecommendationSnapshot, tracking: dict) -> dict:
    latest_price = tracking.get("latest_price")
    suggested_buy_price = row.suggested_buy_price
    tracking_return_pct = None
    if row.action == "buy" and suggested_buy_price and latest_price:
        tracking_return_pct = round((latest_price - suggested_buy_price) / suggested_buy_price * 100, 2)

    return {
        "id": row.id,
        "trade_date": _serialize_dt(row.trade_date),
        "timeframe": row.timeframe,
        "symbol": row.symbol,
        "name": row.name,
        "action": row.action,
        "action_label": row.action_label,
        "confidence": row.confidence,
        "score": row.score,
        "summary": row.summary,
        "current_price": row.current_price,
        "suggested_buy_price": row.suggested_buy_price,
        "buy_zone": {"low": row.buy_zone_low, "high": row.buy_zone_high},
        "sell_zone": {"low": row.sell_zone_low, "high": row.sell_zone_high},
        "breakout_trigger": row.breakout_trigger,
        "stop_loss": row.stop_loss,
        "take_profit": row.take_profit,
        "scanned_at": _serialize_dt(row.scanned_at),
        "saved_at": _serialize_dt(row.saved_at),
        "latest_price": latest_price,
        "tracking_return_pct": tracking_return_pct,
        "tracking_price_ts": tracking.get("tracking_price_ts"),
        "is_tracking_stale": tracking.get("is_tracking_stale", True),
    }


def list_daily_recommendations(
    db: Session,
    start_date: str | None = None,
    end_date: str | None = None,
    timeframe: str | None = None,
    action: str | None = None,
    symbol: str | None = None,
) -> dict:
    start = _parse_date(start_date)
    end = _parse_date(end_date)
    query = db.query(DailyRecommendationSnapshot)
    if start:
        query = query.filter(DailyRecommendationSnapshot.trade_date >= start)
    if end:
        query = query.filter(DailyRecommendationSnapshot.trade_date <= end)
    if timeframe:
        query = query.filter(DailyRecommendationSnapshot.timeframe == timeframe)
    if action:
        query = query.filter(DailyRecommendationSnapshot.action == action)
    if symbol:
        symbol_keyword = symbol.strip().upper()
        query = query.filter(
            or_(
                DailyRecommendationSnapshot.symbol.contains(symbol_keyword),
                DailyRecommendationSnapshot.name.contains(symbol.strip()),
            )
        )

    rows = (
        query.order_by(
            DailyRecommendationSnapshot.trade_date.desc(),
            DailyRecommendationSnapshot.saved_at.desc(),
            DailyRecommendationSnapshot.symbol.asc(),
        )
        .all()
    )

    market = MarketDataService(db)
    tracking_cache: dict[tuple[str, str], dict] = {}
    items = []
    for row in rows:
        key = (row.symbol, row.timeframe)
        tracking = tracking_cache.get(key)
        if not tracking:
            tracking = _resolve_tracking(market, row.symbol, row.timeframe)
            tracking_cache[key] = tracking
        items.append(_serialize_record(row, tracking))

    return {"items": items, "count": len(items)}


def get_daily_recommendation_detail(db: Session, snapshot_id: int) -> dict | None:
    row = db.query(DailyRecommendationSnapshot).filter(DailyRecommendationSnapshot.id == snapshot_id).first()
    if not row:
        return None
    tracking = _resolve_tracking(MarketDataService(db), row.symbol, row.timeframe)
    return _serialize_record(row, tracking)