"""Default strategy seed data.

Inserts pre-defined ETF strategies on first startup if the strategy table is empty.
All rules use only fields validated by RuleValidationService (ALLOWED_FIELDS).
"""
import json
import logging

from sqlalchemy.orm import Session

from app.models.strategy import Strategy

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Default strategies
# Signals derived from widely-used A-share ETF quantitative approaches:
#   - Dual-MA golden cross (趋势跟随)
#   - MACD golden cross (动量)
#   - KDJ oversold rebound (超卖反弹)
#   - Bollinger lower-band bounce (均值回归)
#   - RSI oversold breakout (超卖反弹)
#   - 20-day price breakout (突破)
#   - EMA golden cross + volume (量价共振)
#   - Triple-MA bull arrangement (多头排列)
# ---------------------------------------------------------------------------

DEFAULT_STRATEGIES: list[dict] = [
    {
        "name": "双均线金叉策略 (MA5/MA20)",
        "symbol": "510300",  # 沪深300 ETF
        "timeframe": "daily",
        "entry_rules": [
            # MA5 上穿 MA20 形成金叉
            {"field": "ma5", "op": "cross_above", "value": "ma20"},
            # 价格站上 MA20，确认趋势
            {"field": "close", "op": "gt", "value": "ma20"},
        ],
        "exit_rules": [
            # MA5 下穿 MA20 死叉离场
            {"field": "ma5", "op": "cross_below", "value": "ma20"},
        ],
        "stop_loss_pct": 5.0,
        "take_profit_pct": 15.0,
        "max_hold_bars": 20,
    },
    {
        "name": "MACD金叉策略",
        "symbol": "510500",  # 中证500 ETF
        "timeframe": "daily",
        "entry_rules": [
            # MACD 线上穿信号线（金叉）
            {"field": "macd", "op": "cross_above", "value": "macd_signal"},
            # MACD 柱由负转正，确认动量
            {"field": "macd_hist", "op": "gt", "value": "0"},
            # 价格在 MA20 之上，过滤下跌趋势
            {"field": "close", "op": "gt", "value": "ma20"},
        ],
        "exit_rules": [
            # MACD 线下穿信号线（死叉）
            {"field": "macd", "op": "cross_below", "value": "macd_signal"},
        ],
        "stop_loss_pct": 5.0,
        "take_profit_pct": 12.0,
        "max_hold_bars": 15,
    },
    {
        "name": "KDJ超卖反弹策略",
        "symbol": "159915",  # 创业板 ETF
        "timeframe": "daily",
        "entry_rules": [
            # K 线上穿 D 线（KDJ金叉）
            {"field": "kdj_k", "op": "cross_above", "value": "kdj_d"},
            # J 值超卖区回升（J < 30 附近入场）
            {"field": "kdj_j", "op": "lt", "value": "35"},
        ],
        "exit_rules": [
            # K 线下穿 D 线（KDJ死叉）
            {"field": "kdj_k", "op": "cross_below", "value": "kdj_d"},
            # 或 J 值进入超买区
            # {"field": "kdj_j", "op": "gt", "value": "80"},
        ],
        "stop_loss_pct": 4.0,
        "take_profit_pct": 10.0,
        "max_hold_bars": 10,
    },
    {
        "name": "布林带下轨反弹策略",
        "symbol": "510050",  # 上证50 ETF
        "timeframe": "daily",
        "entry_rules": [
            # 价格上穿布林下轨（超卖反弹信号）
            {"field": "close", "op": "cross_above", "value": "boll_lower"},
            # RSI 处于超卖区确认
            {"field": "rsi14", "op": "lt", "value": "45"},
        ],
        "exit_rules": [
            # 价格触及布林中轨止盈
            {"field": "close", "op": "gt", "value": "boll_mid"},
        ],
        "stop_loss_pct": 3.0,
        "take_profit_pct": 8.0,
        "max_hold_bars": 10,
    },
    {
        "name": "RSI超卖反弹策略",
        "symbol": "510300",  # 沪深300 ETF
        "timeframe": "daily",
        "entry_rules": [
            # RSI 上穿 30（从超卖区反弹）
            {"field": "rsi14", "op": "cross_above", "value": "30"},
            # 价格在 MA20 以上，避免下跌趋势中抄底
            {"field": "close", "op": "gt", "value": "ma20"},
        ],
        "exit_rules": [
            # RSI 进入超买区（>70）离场
            {"field": "rsi14", "op": "gt", "value": "70"},
        ],
        "stop_loss_pct": 4.0,
        "take_profit_pct": 10.0,
        "max_hold_bars": 15,
    },
    {
        "name": "20日价格突破策略",
        "symbol": "159919",  # 沪深300 ETF (深交所)
        "timeframe": "daily",
        "entry_rules": [
            # 收盘价突破近20日最高价（趋势突破入场）
            {"field": "close", "op": "cross_above", "value": "breakout_high_20"},
            # 成交量放大确认突破有效性
            {"field": "volume", "op": "gt", "value": "volume_ma20"},
        ],
        "exit_rules": [
            # 收盘价跌破近20日最低价
            {"field": "close", "op": "cross_below", "value": "breakout_low_20"},
        ],
        "stop_loss_pct": 6.0,
        "take_profit_pct": 20.0,
        "max_hold_bars": 30,
    },
    {
        "name": "EMA金叉放量策略 (EMA12/EMA26)",
        "symbol": "512880",  # 证券 ETF
        "timeframe": "daily",
        "entry_rules": [
            # EMA12 上穿 EMA26（MACD 原理的均线金叉）
            {"field": "ema12", "op": "cross_above", "value": "ema26"},
            # 成交量高于 MA20，确认量价配合
            {"field": "volume", "op": "gt", "value": "volume_ma20"},
            # 价格在 EMA26 上方
            {"field": "close", "op": "gt", "value": "ema26"},
        ],
        "exit_rules": [
            # EMA12 下穿 EMA26
            {"field": "ema12", "op": "cross_below", "value": "ema26"},
        ],
        "stop_loss_pct": 5.0,
        "take_profit_pct": 15.0,
        "max_hold_bars": 20,
    },
    {
        "name": "均线多头排列+量能确认策略",
        "symbol": "510500",  # 中证500 ETF
        "timeframe": "daily",
        "entry_rules": [
            # MA5 > MA10（短期均线多头）
            {"field": "ma5", "op": "gt", "value": "ma10"},
            # MA10 > MA20（中期均线多头排列）
            {"field": "ma10", "op": "gt", "value": "ma20"},
            # 价格上穿 MA5（回踩 MA5 后再度上扬入场）
            {"field": "close", "op": "cross_above", "value": "ma5"},
            # 成交量温和放大
            {"field": "volume", "op": "gt", "value": "volume_ma20"},
        ],
        "exit_rules": [
            # 价格跌破 MA10
            {"field": "close", "op": "cross_below", "value": "ma10"},
        ],
        "stop_loss_pct": 4.0,
        "take_profit_pct": 12.0,
        "max_hold_bars": 20,
    },
]


def seed_default_strategies(db: Session) -> None:
    """Insert default strategies if the table is empty."""
    count = db.query(Strategy).count()
    if count > 0:
        logger.info("[seed] strategy table already has %d rows — skipping seed", count)
        return

    logger.info("[seed] inserting %d default strategies", len(DEFAULT_STRATEGIES))
    for s in DEFAULT_STRATEGIES:
        item = Strategy(
            name=s["name"],
            symbol=s["symbol"],
            timeframe=s["timeframe"],
            entry_rules_json=json.dumps(s["entry_rules"], ensure_ascii=False),
            exit_rules_json=json.dumps(s["exit_rules"], ensure_ascii=False),
            stop_loss_pct=s["stop_loss_pct"],
            take_profit_pct=s["take_profit_pct"],
            max_hold_bars=s["max_hold_bars"],
        )
        db.add(item)
    db.commit()
    logger.info("[seed] default strategies inserted successfully")
