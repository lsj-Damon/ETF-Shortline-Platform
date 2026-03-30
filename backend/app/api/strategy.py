import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.schemas.strategy import StrategyCreateRequest, StrategyUpdateRequest
from app.services.strategy_service import StrategyService

router = APIRouter(prefix="/api/v1/strategies", tags=["strategies"])


def serialize_strategy(item):
    return {
        "id": item.id,
        "name": item.name,
        "symbol": item.symbol,
        "timeframe": item.timeframe,
        "entry_rules": json.loads(item.entry_rules_json or "[]"),
        "exit_rules": json.loads(item.exit_rules_json or "[]"),
        "stop_loss_pct": item.stop_loss_pct,
        "take_profit_pct": item.take_profit_pct,
        "max_hold_bars": item.max_hold_bars,
        "created_at": item.created_at,
        "updated_at": item.updated_at,
    }


@router.get("")
def list_strategies(db: Session = Depends(get_db)):
    service = StrategyService(db)
    return [serialize_strategy(item) for item in service.list_strategies()]


@router.post("")
def create_strategy(payload: StrategyCreateRequest, db: Session = Depends(get_db)):
    service = StrategyService(db)
    try:
        item = service.create_strategy(payload)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return serialize_strategy(item)


@router.get("/{strategy_id}")
def get_strategy(strategy_id: int, db: Session = Depends(get_db)):
    service = StrategyService(db)
    item = service.get_strategy(strategy_id)
    if not item:
        raise HTTPException(status_code=404, detail="strategy not found")
    return serialize_strategy(item)


@router.put("/{strategy_id}")
def update_strategy(strategy_id: int, payload: StrategyUpdateRequest, db: Session = Depends(get_db)):
    service = StrategyService(db)
    try:
        item = service.update_strategy(strategy_id, payload)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not item:
        raise HTTPException(status_code=404, detail="strategy not found")
    return serialize_strategy(item)


@router.delete("/{strategy_id}")
def delete_strategy(strategy_id: int, db: Session = Depends(get_db)):
    service = StrategyService(db)
    ok = service.delete_strategy(strategy_id)
    if not ok:
        raise HTTPException(status_code=404, detail="strategy not found")
    return {"success": True}
