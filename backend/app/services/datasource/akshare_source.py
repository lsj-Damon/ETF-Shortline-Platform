from datetime import datetime
import re

import akshare as ak
import pandas as pd

from app.services.datasource.base import BaseDataSource


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
        df = ak.fund_etf_category_sina(symbol="ETF基金")
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
            df = ak.fund_etf_hist_em(symbol=symbol, period="daily", start_date=start_date.replace("-", ""), end_date=end_date.replace("-", ""), adjust="qfq")
            df = df.rename(
                columns={
                    "日期": "ts",
                    "开盘": "open",
                    "收盘": "close",
                    "最高": "high",
                    "最低": "low",
                    "成交量": "volume",
                    "成交额": "amount",
                    "振幅": "amplitude",
                    "涨跌幅": "change_pct",
                }
            )
        else:
            period = TIMEFRAME_MAP.get(timeframe, "5")
            df = ak.fund_etf_hist_min_em(symbol=symbol, period=period, adjust="qfq", start_date=start_date, end_date=end_date)
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
            df = ak.fund_etf_spot_em()
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

        # Fallback: try fetching last 5 days of daily bars from AKShare directly
        # (does not depend on locally cached Parquet)
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
