from pathlib import Path

import pandas as pd
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.etf import EtfBarMeta, EtfSymbol
from app.services.datasource.akshare_source import AkshareDataSource
from app.services.datasource.base import BaseDataSource


class MarketDataService:
    def __init__(self, db: Session):
        self.db = db
        self.settings = get_settings()
        self.data_sources: dict[str, BaseDataSource] = {
            "akshare": AkshareDataSource(),
        }

    def list_data_sources(self) -> list[dict]:
        return [
            {
                "code": item.code,
                "name": item.name,
                "type": item.source_type,
                "enabled": True,
            }
            for item in self.data_sources.values()
        ]

    def list_etfs(self) -> list[EtfSymbol]:
        symbols = self.db.query(EtfSymbol).order_by(EtfSymbol.symbol.asc()).all()
        if symbols:
            return symbols

        fetched = self._resolve_data_source(self.settings.default_data_source).search_etfs()
        for item in fetched:
            existing = self.db.query(EtfSymbol).filter(EtfSymbol.symbol == item["symbol"]).first()
            if existing:
                continue
            self.db.add(EtfSymbol(**item))
        self.db.commit()
        return self.db.query(EtfSymbol).order_by(EtfSymbol.symbol.asc()).all()

    def import_history(self, symbol: str, timeframe: str, start_date: str, end_date: str, source: str = "akshare") -> EtfBarMeta:
        data_source = self._resolve_data_source(source)
        df = data_source.fetch_history(symbol=symbol, timeframe=timeframe, start_date=start_date, end_date=end_date)
        storage_path = self._save_parquet(symbol=symbol, timeframe=timeframe, df=df)

        meta = self.db.query(EtfBarMeta).filter(
            EtfBarMeta.symbol == symbol,
            EtfBarMeta.timeframe == timeframe,
        ).first()
        if not meta:
            meta = EtfBarMeta(symbol=symbol, timeframe=timeframe, storage_path=storage_path)
            self.db.add(meta)

        meta.start_time = df["ts"].min().to_pydatetime() if not df.empty else None
        meta.end_time = df["ts"].max().to_pydatetime() if not df.empty else None
        meta.bar_count = len(df)
        meta.storage_path = storage_path
        meta.source = str(df.attrs.get("source", data_source.code))
        self.db.commit()
        self.db.refresh(meta)
        return meta

    def get_bars(self, symbol: str, timeframe: str, start: str | None = None, end: str | None = None, limit: int = 500) -> list[dict]:
        meta = self.db.query(EtfBarMeta).filter(
            EtfBarMeta.symbol == symbol,
            EtfBarMeta.timeframe == timeframe,
        ).first()
        if not meta:
            return []
        df = pd.read_parquet(meta.storage_path)
        if start:
            df = df[df["ts"] >= pd.to_datetime(start)]
        if end:
            df = df[df["ts"] <= pd.to_datetime(end)]
        df = df.sort_values("ts").tail(limit)
        records = df.to_dict(orient="records")
        for item in records:
            if hasattr(item.get("ts"), "isoformat"):
                item["ts"] = item["ts"].isoformat()
        return records

    def get_quote(self, symbol: str) -> dict:
        return self._resolve_data_source(self.settings.default_data_source).fetch_realtime(symbol)

    def _resolve_data_source(self, source: str | None) -> BaseDataSource:
        source_code = (source or self.settings.default_data_source or "akshare").lower()
        data_source = self.data_sources.get(source_code)
        if data_source:
            return data_source
        if source_code == "tushare":
            raise ValueError("Tushare 数据源当前未接入，请选择 AKShare")
        raise ValueError(f"不支持的数据源: {source_code}")

    def _save_parquet(self, symbol: str, timeframe: str, df: pd.DataFrame) -> str:
        base_dir = Path(self.settings.data_dir) / "bars" / symbol
        base_dir.mkdir(parents=True, exist_ok=True)
        path = base_dir / f"{timeframe}.parquet"
        df.to_parquet(path, index=False)
        return str(path)
