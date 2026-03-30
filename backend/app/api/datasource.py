from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.services.market_data_service import MarketDataService

router = APIRouter(prefix="/api/v1/data-sources", tags=["data-sources"])


@router.get("")
def list_data_sources(db: Session = Depends(get_db)):
    service = MarketDataService(db)
    return service.list_data_sources()
