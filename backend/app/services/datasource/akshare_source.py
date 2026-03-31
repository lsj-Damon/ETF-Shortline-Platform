from datetime import datetime
import logging
import re
import time

import akshare as ak
import pandas as pd
import requests

from app.services.datasource.base import BaseDataSource


logger = logging.getLogger(__name__)


# Monkey-patch requests.Session so every akshare HTTP call carries a
# browser-like User-Agent. Without this, East Money servers close the
# connection immediately when running inside Docker containers.
_DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    "Referer": "https://quote.eastmoney.com/",
}
_orig_request = requests.Session.request


def _patched_request(self, method, url, **kwargs):
    headers = kwargs.pop("headers", None) or {}
    for key, value in _DEFAULT_HEADERS.items():
        headers.setdefault(key, value)
    return _orig_request(self, method, url, headers=headers, **kwargs)


requests.Session.request = _patched_request  # type: ignore


def _retry(fn, retries: int = 3, delay: float = 2.0):
    """Call fn(), retry on RemoteDisconnected / ConnectionError."""
    last_exc: Exception | None = None
    for attempt in range(1, retries + 1):
        try:
            return fn()
        except Exception as e:
            last_exc = e
            if _is_network_error(e):
                if attempt < retries:
                    time.sleep(delay * attempt)
                    continue
            raise
    raise last_exc  # type: ignore


def _is_network_error(exc: Exception) -> bool:
    err = str(exc)
    return any(
        marker in err
        for marker in (
            "RemoteDisconnected",
            "ConnectionError",
            "Connection aborted",
            "Read timed out",
            "ConnectTimeout",
            "Failed to connect after",
        )
    )


TIMEFRAME_MAP = {
    "daily": "daily",
    "1m": "1",
    "5m": "5",
    "15m": "15",
    "30m": "30",
    "60m": "60",
}


class AkshareDataSource(BaseDataSource):
    code = "akshare"
    name = "AKShare"
    source_type = "free"

    def search_etfs(self) -> list[dict]:
        df = _retry(lambda: ak.fund_etf_category_sina(symbol="ETF基金"))
        rows = []
        for _, row in df.iterrows():
            raw_symbol = str(row.get("代码", "")).strip()
            normalized_symbol = re.sub(r"^[a-zA-Z]+", "", raw_symbol)
            rows.append(
                {
                    "symbol": normalized_symbol,
                    "name": str(row.get("名称", "")).strip(),
                    "market": "CN",
                    "category": "ETF",
                    "status": "active",
                }
            )
        return rows

    def fetch_history(self, symbol: str, timeframe: str, start_date: str, end_date: str) -> pd.DataFrame:
        if timeframe == "daily":
            df = self._fetch_daily_history(symbol=symbol, start_date=start_date, end_date=end_date)
        else:
            period = TIMEFRAME_MAP.get(timeframe, "5")
            df = _retry(lambda: ak.fund_etf_hist_min_em(
                symbol=symbol,
                period=period,
                adjust="qfq",
                start_date=start_date,
                end_date=end_date,
            ))
            df = df.rename(
                columns={
                    "时间": "ts",
                    "开盘": "open",
                    "收盘": "close",
                    "最高": "high",
                    "最低": "low",
                    "成交量": "volume",
                    "成交额": "amount",
                    "最新价": "price",
                }
            )
        if "ts" not in df.columns:
            raise ValueError("AKShare 返回数据不含时间列")
        df["ts"] = pd.to_datetime(df["ts"])
        df["symbol"] = symbol
        return df

    def fetch_realtime(self, symbol: str) -> dict:
        try:
            df = _retry(lambda: ak.fund_etf_spot_em())
            normalized = df["代码"].astype(str).str.replace(r"^[a-zA-Z]+", "", regex=True)
            target = df[normalized == str(symbol)]
            if not target.empty:
                row = target.iloc[0]
                return {
                    "symbol": symbol,
                    "price": float(row.get("最新价", 0) or 0),
                    "change_pct": float(row.get("涨跌幅", 0) or 0),
                    "volume": float(row.get("成交量", 0) or 0),
                    "ts": datetime.now(),
                }
        except Exception:
            pass

        # Fallback: fetch from daily history
        try:
            end = datetime.now().strftime("%Y-%m-%d")
            start = "2024-01-01"
            df = self.fetch_history(symbol=symbol, timeframe="daily", start_date=start, end_date=end)
            if df.empty:
                raise ValueError(f"未找到 ETF: {symbol}")
            df = df.sort_values("ts")
            row = df.iloc[-1]
            prev_close = df.iloc[-2]["close"] if len(df) > 1 else row["close"]
            change_pct = 0.0 if float(prev_close) == 0 else (float(row["close"]) - float(prev_close)) / float(prev_close) * 100
            return {
                "symbol": symbol,
                "price": float(row["close"]),
                "change_pct": round(change_pct, 4),
                "volume": float(row.get("volume", 0) or 0),
                "ts": datetime.now(),
                "source": "fallback_daily",
            }
        except Exception as e:
            raise ValueError(f"无法获取 ETF {symbol} 行情: {e}") from e

    def _fetch_daily_history(self, symbol: str, start_date: str, end_date: str) -> pd.DataFrame:
        try:
            df = _retry(
                lambda: ak.fund_etf_hist_em(
                    symbol=symbol,
                    period="daily",
                    start_date=start_date.replace("-", ""),
                    end_date=end_date.replace("-", ""),
                    adjust="qfq",
                )
            )
            df = self._normalize_daily_history(df)
            df.attrs["source"] = self.code
            return df
        except Exception as exc:
            if not _is_network_error(exc):
                raise
            logger.warning("AKShare daily history failed for %s, falling back to Sina: %s", symbol, exc)
            df = self._fetch_daily_history_from_sina(symbol=symbol, start_date=start_date, end_date=end_date)
            df.attrs["source"] = "sina_fallback"
            return df

    def _fetch_daily_history_from_sina(self, symbol: str, start_date: str, end_date: str) -> pd.DataFrame:
        df = _retry(lambda: ak.fund_etf_hist_sina(symbol=self._to_sina_symbol(symbol)))
        if df.empty:
            return self._normalize_daily_history(df)
        start = pd.to_datetime(start_date)
        end = pd.to_datetime(end_date)
        df = df.copy()
        df["date"] = pd.to_datetime(df["date"])
        df = df[(df["date"] >= start) & (df["date"] <= end)]
        return self._normalize_daily_history(df)

    @staticmethod
    def _normalize_daily_history(df: pd.DataFrame) -> pd.DataFrame:
        normalized = df.rename(
            columns={
                "日期": "ts",
                "date": "ts",
                "开盘": "open",
                "open": "open",
                "收盘": "close",
                "close": "close",
                "最高": "high",
                "high": "high",
                "最低": "low",
                "low": "low",
                "成交量": "volume",
                "volume": "volume",
                "成交额": "amount",
                "振幅": "amplitude",
                "涨跌幅": "change_pct",
            }
        )
        for column in ("ts", "open", "close", "high", "low", "volume"):
            if column not in normalized.columns:
                normalized[column] = pd.Series(dtype="object")
        for column in ("amount", "amplitude", "change_pct"):
            if column not in normalized.columns:
                normalized[column] = pd.NA
        return normalized

    @staticmethod
    def _to_sina_symbol(symbol: str) -> str:
        return ("sh" if str(symbol).startswith(("5", "6")) else "sz") + str(symbol)
