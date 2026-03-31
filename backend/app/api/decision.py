import asyncio
from typing import AsyncGenerator

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from app.services import decision_service

router = APIRouter(tags=["decisions"])


async def _event_generator() -> AsyncGenerator[str, None]:
    try:
        async for event in decision_service.subscribe():
            yield f"data: {decision_service.dumps_payload(event)}\n\n"
    except asyncio.CancelledError:
        pass


@router.get("/api/v1/decisions/live")
def list_live_decisions(limit: int = 20):
    return decision_service.get_live_decisions(limit=limit)


@router.get("/api/v1/decisions/live/{symbol}")
def get_live_decision(symbol: str):
    item = decision_service.get_live_decision(symbol)
    if not item:
        raise HTTPException(status_code=404, detail="decision not found for symbol")
    return item


@router.get("/api/v1/decisions/rank")
def get_decision_rank(limit: int = 20):
    return decision_service.get_live_decisions(limit=limit)


@router.get("/api/v1/decisions/recent-events")
def get_recent_events(limit: int = 30):
    return {"items": decision_service.get_recent_events(limit=limit), **decision_service.get_state_meta()}


@router.post("/api/v1/decisions/scan")
def scan_decisions():
    fired = decision_service.scan_once()
    return {
        "fired": len(fired),
        "events": fired,
        **decision_service.get_live_decisions(limit=20),
    }


@router.get("/api/v1/plans/latest")
def get_latest_plans(limit: int = 20):
    return decision_service.get_latest_plans(limit=limit)


@router.get("/api/v1/plans/{symbol}")
def get_symbol_plan(symbol: str):
    item = decision_service.get_plan(symbol)
    if not item:
        raise HTTPException(status_code=404, detail="plan not found for symbol")
    return item


@router.get("/decisions/stream")
async def decision_stream():
    return StreamingResponse(
        _event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
