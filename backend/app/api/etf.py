from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.schemas.etf import ImportHistoryRequest
from app.services.market_data_service import MarketDataService

router = APIRouter(prefix="/api/v1/etfs", tags=["etfs"])


@router.get("")
def list_etfs(db: Session = Depends(get_db)):
    service = MarketDataService(db)
    try:
        rows = service.list_etfs()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取 ETF 列表失败: {e}")
    return [
        {
            "symbol": row.symbol,
            "name": row.name,
            "market": row.market,
            "category": row.category,
            "status": row.status,
        }
        for row in rows
    ]


@router.post("/import-history")
def import_history(payload: ImportHistoryRequest, db: Session = Depends(get_db)):
    service = MarketDataService(db)
    try:
        meta = service.import_history(
            symbol=payload.symbol,
            timeframe=payload.timeframe,
            start_date=payload.start_date,
            end_date=payload.end_date,
            source=payload.source,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"导入失败: {e}")
    return {
        "symbol": meta.symbol,
        "timeframe": meta.timeframe,
        "start_time": meta.start_time,
        "end_time": meta.end_time,
        "bar_count": meta.bar_count,
        "storage_path": meta.storage_path,
        "source": meta.source,
        "updated_at": meta.updated_at,
    }


@router.get("/{symbol}/bars")
def get_bars(
    symbol: str,
    timeframe: str = Query(default="daily"),
    start: str | None = Query(default=None),
    end: str | None = Query(default=None),
    limit: int = Query(default=500, ge=1, le=5000),
    db: Session = Depends(get_db),
):
    service = MarketDataService(db)
    items = service.get_bars(symbol=symbol, timeframe=timeframe, start=start, end=end, limit=limit)
    return {"symbol": symbol, "timeframe": timeframe, "items": items}


@router.get("/{symbol}/quote")
def get_quote(symbol: str, db: Session = Depends(get_db)):
    service = MarketDataService(db)
    try:
        return service.get_quote(symbol)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"获取行情失败: {e}")
