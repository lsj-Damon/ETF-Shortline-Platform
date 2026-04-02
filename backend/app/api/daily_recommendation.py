from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.services import daily_recommendation_service

router = APIRouter(prefix="/api/v1/daily-recommendations", tags=["daily recommendations"])


@router.get("")
def list_daily_recommendations(
    start_date: str | None = None,
    end_date: str | None = None,
    timeframe: str | None = None,
    action: str | None = None,
    symbol: str | None = None,
    db: Session = Depends(get_db),
):
    try:
        return daily_recommendation_service.list_daily_recommendations(
            db,
            start_date=start_date,
            end_date=end_date,
            timeframe=timeframe,
            action=action,
            symbol=symbol,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/{snapshot_id}")
def get_daily_recommendation_detail(snapshot_id: int, db: Session = Depends(get_db)):
    item = daily_recommendation_service.get_daily_recommendation_detail(db, snapshot_id)
    if not item:
        raise HTTPException(status_code=404, detail="daily recommendation not found")
    return item