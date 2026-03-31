"""Real-time signal monitor.

Runs every SCAN_INTERVAL_MIN minutes during A-share trading hours (09:25–15:05 CST).
For each active strategy it:
  1. Fetches today's intraday minute bars from AKShare (or falls back to latest daily bar).
  2. Computes indicators via IndicatorService.
  3. Evaluates entry / exit rules via StrategyEngine.
  4. If the last bar fires a signal, pushes an alert to the in-memory queue.
"""

from __future__ import annotations

import asyncio
import json
import logging
from collections import deque
from datetime import datetime, timezone
from typing import AsyncIterator

from sqlalchemy.orm import Session

from app.core.db import SessionLocal
from app.models.strategy import Strategy
from app.services.datasource.akshare_source import AkshareDataSource
from app.services.indicator_service import IndicatorService
from app.services.strategy_engine import StrategyEngine

logger = logging.getLogger(__name__)

# ── tunables ─────────────────────────────────────────────────────────────────
SCAN_INTERVAL_MIN = 5          # minutes between scans
MAX_ALERTS = 200               # keep last N alerts in memory
TRADING_START = (9, 25)        # (hour, minute) CST
TRADING_END   = (15, 5)        # (hour, minute) CST

# ── global state ─────────────────────────────────────────────────────────────
_alerts: deque[dict] = deque(maxlen=MAX_ALERTS)
_subscribers: list[asyncio.Queue] = []
_ds = AkshareDataSource()


def _is_trading_now() -> bool:
    """Return True if current CST time is within A-share trading window on a weekday."""
    now = datetime.now()   # server should be in CST; adjust if UTC
    if now.weekday() >= 5:  # Sat/Sun
        return False
    t = (now.hour, now.minute)
    return TRADING_START <= t <= TRADING_END


def _fetch_latest_bars(symbol: str, timeframe: str):
    """Fetch the most recent bars for signal evaluation.

    For intraday timeframes (1m/5m/15m/30m/60m) try AKShare minute bars;
    fall back to daily if the call fails or timeframe is 'daily'.
    """
    try:
        today = datetime.now().strftime("%Y-%m-%d")
        if timeframe != "daily":
            df = _ds.fetch_history(
                symbol=symbol,
                timeframe=timeframe,
                start_date=today,
                end_date=today,
            )
            if not df.empty:
                return df
        # daily / fallback
        start = "2024-01-01"
        df = _ds.fetch_history(
            symbol=symbol,
            timeframe="daily",
            start_date=start,
            end_date=today,
        )
        return df
    except Exception as exc:
        logger.warning("fetch_latest_bars failed for %s: %s", symbol, exc)
        return None


def _push_alert(alert: dict) -> None:
    _alerts.append(alert)
    for q in list(_subscribers):
        try:
            q.put_nowait(alert)
        except asyncio.QueueFull:
            pass


def scan_once() -> list[dict]:
    """Evaluate all strategies once. Returns list of fired alerts."""
    fired: list[dict] = []
    db: Session = SessionLocal()
    try:
        strategies = db.query(Strategy).all()
    finally:
        db.close()

    for strategy in strategies:
        try:
            df = _fetch_latest_bars(strategy.symbol, strategy.timeframe)
            if df is None or df.empty or len(df) < 30:
                continue

            enriched = IndicatorService.enrich(df)
            entry_rules = json.loads(strategy.entry_rules_json or "[]")
            exit_rules  = json.loads(strategy.exit_rules_json  or "[]")

            entry_signal = StrategyEngine.build_signal(enriched, entry_rules)
            exit_signal  = StrategyEngine.build_signal(enriched, exit_rules)

            last_entry = bool(entry_signal.iloc[-1]) if not entry_signal.empty else False
            last_exit  = bool(exit_signal.iloc[-1])  if not exit_signal.empty else False

            if last_entry or last_exit:
                last_bar = enriched.iloc[-1]
                ts_str = str(last_bar.get("ts", ""))
                alert = {
                    "id": f"{strategy.id}-{ts_str}",
                    "strategy_id": strategy.id,
                    "strategy_name": strategy.name,
                    "symbol": strategy.symbol,
                    "signal": "buy" if last_entry else "sell",
                    "price": round(float(last_bar.get("close", 0)), 4),
                    "ts": ts_str,
                    "scanned_at": datetime.now().isoformat(),
                }
                _push_alert(alert)
                fired.append(alert)
                logger.info(
                    "Signal fired: strategy=%s symbol=%s signal=%s price=%s",
                    strategy.name, strategy.symbol, alert["signal"], alert["price"],
                )
        except Exception as exc:
            logger.error("Error scanning strategy %s: %s", strategy.id, exc)

    return fired


def get_recent_alerts(limit: int = 50) -> list[dict]:
    """Return latest alerts (most recent first)."""
    return list(reversed(list(_alerts)))[:limit]


async def subscribe() -> AsyncIterator[dict]:
    """Async generator that yields alerts as they arrive."""
    q: asyncio.Queue = asyncio.Queue(maxsize=100)
    _subscribers.append(q)
    try:
        # Immediately send any recent alerts so client catches up
        for alert in get_recent_alerts(10):
            yield alert
        while True:
            alert = await asyncio.wait_for(q.get(), timeout=30)
            yield alert
    except (asyncio.TimeoutError, asyncio.CancelledError):
        pass
    finally:
        try:
            _subscribers.remove(q)
        except ValueError:
            pass
