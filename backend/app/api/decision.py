import asyncio
from typing import AsyncGenerator

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from app.services import decision_service

router = APIRouter(tags=["decisions"])


async def _event_generator(timeframe: str | None) -> AsyncGenerator[str, None]:
    try:
        async for event in decision_service.subscribe(timeframe=timeframe):
            yield f"data: {decision_service.dumps_payload(event)}\n\n"
    except asyncio.CancelledError:
        pass


@router.get("/api/v1/decisions/live")
def list_live_decisions(limit: int = 20, timeframe: str = "5m"):
    return decision_service.get_live_decisions(limit=limit, timeframe=timeframe)


@router.get("/api/v1/decisions/live/{symbol}")
def get_live_decision(symbol: str, timeframe: str = "5m"):
    item = decision_service.get_live_decision(symbol, timeframe=timeframe)
    if not item:
        raise HTTPException(status_code=404, detail="decision not found for symbol")
    return item


@router.get("/api/v1/decisions/rank")
def get_decision_rank(limit: int = 20, timeframe: str = "5m"):
    return decision_service.get_live_decisions(limit=limit, timeframe=timeframe)


@router.get("/api/v1/decisions/recent-events")
def get_recent_events(limit: int = 30, timeframe: str = "5m"):
    return {
        "items": decision_service.get_recent_events(limit=limit, timeframe=timeframe),
        **decision_service.get_state_meta(timeframe=timeframe),
    }


@router.post("/api/v1/decisions/scan")
def scan_decisions(timeframe: str | None = None):
    selected = [timeframe] if timeframe else None
    fired = decision_service.scan_once(timeframes=selected)
    payload = decision_service.get_live_decisions(limit=20, timeframe=timeframe or "5m")
    payload.update({"fired": len(fired), "events": fired})
    return payload


@router.get("/api/v1/plans/latest")
def get_latest_plans(limit: int = 20, timeframe: str = "5m"):
    return decision_service.get_latest_plans(limit=limit, timeframe=timeframe)


@router.get("/api/v1/plans/{symbol}")
def get_symbol_plan(symbol: str, timeframe: str = "5m"):
    item = decision_service.get_plan(symbol, timeframe=timeframe)
    if not item:
        raise HTTPException(status_code=404, detail="plan not found for symbol")
    return item


@router.get("/decisions/stream")
async def decision_stream(timeframe: str | None = None):
    return StreamingResponse(
        _event_generator(timeframe),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
