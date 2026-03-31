import logging
from contextlib import asynccontextmanager
from pathlib import Path

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.alerts import router as alerts_router
from app.api.backtest import router as backtest_router
from app.api.decision import router as decision_router
from app.api.datasource import router as datasource_router
from app.api.etf import router as etf_router
from app.api.strategy import router as strategy_router
from app.core.config import get_settings
from app.core.db import Base, engine, SessionLocal
from app.services import decision_service
from app.services import signal_monitor_service as monitor
from app.services.seed_service import seed_default_strategies
import app.models.etf  # noqa
import app.models.strategy  # noqa
import app.models.backtest  # noqa

logger = logging.getLogger(__name__)
settings = get_settings()
Path(settings.data_dir).mkdir(parents=True, exist_ok=True)
Base.metadata.create_all(bind=engine)

_scheduler = AsyncIOScheduler(timezone="Asia/Shanghai")


def _scheduled_scan():
    if monitor._is_trading_now():
        logger.info("[scheduler] trading hours — running signal scan")
        monitor.scan_once()
    else:
        logger.debug("[scheduler] outside trading hours — skipping scan")


def _scheduled_decision_scan():
    try:
        logger.info("[scheduler] running decision scan")
        decision_service.scan_once()
    except Exception:
        logger.exception("[scheduler] decision scan failed")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    with SessionLocal() as db:
        seed_default_strategies(db)
    _scheduler.add_job(
        _scheduled_scan,
        trigger="interval",
        minutes=monitor.SCAN_INTERVAL_MIN,
        id="signal_scan",
        replace_existing=True,
    )
    _scheduler.add_job(
        _scheduled_decision_scan,
        trigger="interval",
        minutes=decision_service.SCAN_INTERVAL_MIN,
        id="decision_scan",
        replace_existing=True,
    )
    _scheduler.start()
    logger.info(
        "APScheduler started — scanning every %d min during trading hours",
        monitor.SCAN_INTERVAL_MIN,
    )
    yield
    _scheduler.shutdown(wait=False)


app = FastAPI(title="ETF Shortline Platform", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(datasource_router)
app.include_router(etf_router)
app.include_router(strategy_router)
app.include_router(backtest_router)
app.include_router(decision_router)
app.include_router(alerts_router)


@app.get("/health")
def health():
    return {"status": "ok", "service": "backend"}
