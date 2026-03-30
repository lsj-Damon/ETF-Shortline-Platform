from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.datasource import router as datasource_router
from app.api.etf import router as etf_router
from app.api.strategy import router as strategy_router
from app.api.backtest import router as backtest_router
from app.core.config import get_settings
from app.core.db import Base, engine
import app.models.etf  # noqa
import app.models.strategy  # noqa
import app.models.backtest  # noqa

settings = get_settings()
Path(settings.data_dir).mkdir(parents=True, exist_ok=True)
Base.metadata.create_all(bind=engine)

app = FastAPI(title="ETF Shortline Platform", version="0.1.0")
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


@app.get("/health")
def health():
    return {"status": "ok", "service": "backend"}
