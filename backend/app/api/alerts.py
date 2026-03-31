"""SSE alerts endpoint.

GET /alerts/stream   — Server-Sent Events stream (keep-alive, ndjson)
GET /alerts/recent   — last N alerts as JSON
POST /alerts/scan    — manually trigger one scan (for testing outside trading hours)
"""

import asyncio
import json
from typing import AsyncGenerator

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.services import signal_monitor_service as monitor

router = APIRouter(prefix="/alerts", tags=["alerts"])


async def _event_generator() -> AsyncGenerator[str, None]:
    """Format each alert as an SSE data line."""
    try:
        async for alert in monitor.subscribe():
            yield f"data: {json.dumps(alert, ensure_ascii=False)}\n\n"
    except asyncio.CancelledError:
        pass


@router.get("/stream")
async def alerts_stream():
    """SSE endpoint. Clients connect with EventSource('/alerts/stream')."""
    return StreamingResponse(
        _event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/recent")
def alerts_recent(limit: int = 50):
    return monitor.get_recent_alerts(limit)


@router.post("/scan")
def alerts_scan():
    """Manually trigger one scan (ignores trading-hours check)."""
    fired = monitor.scan_once()
    return {"fired": len(fired), "alerts": fired}
