from datetime import datetime
from pydantic import BaseModel, Field


class ImportHistoryRequest(BaseModel):
    symbol: str = Field(..., min_length=4, max_length=16)
    timeframe: str = Field(default="daily")
    start_date: str
    end_date: str
    source: str = Field(default="akshare")


class EtfSymbolResponse(BaseModel):
    symbol: str
    name: str
    market: str
    category: str
    status: str


class EtfBarMetaResponse(BaseModel):
    symbol: str
    timeframe: str
    start_time: datetime | None
    end_time: datetime | None
    bar_count: int
    storage_path: str
    source: str
    updated_at: datetime


class EtfBarsResponse(BaseModel):
    symbol: str
    timeframe: str
    items: list[dict]


class EtfQuoteResponse(BaseModel):
    symbol: str
    price: float
    change_pct: float | None = None
    volume: float | None = None
    ts: datetime
