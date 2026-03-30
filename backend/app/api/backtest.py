import logging
import threading

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.db import SessionLocal, get_db
from app.models.backtest import BacktestJob
from app.schemas.backtest import BacktestRunRequest, OptimizationRunRequest
from app.services.backtest_service import BacktestService
from app.services.optimization_service import OptimizationService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1", tags=["backtests"])


def _run_in_background(job_id: int, kwargs: dict) -> None:
    """Execute backtest simulation in a daemon thread with its own DB session."""
    db = SessionLocal()
    try:
        BacktestService(db).run(existing_job_id=job_id, **kwargs)
    except Exception:
        logger.exception('Background backtest failed job_id=%s', job_id)
        job = db.query(BacktestJob).filter(BacktestJob.id == job_id).first()
        if job:
            job.status = 'failed'
            db.commit()
    finally:
        db.close()


@router.post('/backtests/run')
def run_backtest(payload: BacktestRunRequest, db: Session = Depends(get_db)):
    """Submit a backtest. Returns job_id immediately; result is ready when
    GET /backtests/{job_id}/status returns status=="finished".
    """
    from app.models.strategy import Strategy
    strategy = db.query(Strategy).filter(Strategy.id == payload.strategy_id).first()
    if not strategy:
        raise HTTPException(status_code=400, detail='strategy not found')

    # Pre-create the job row so the client has a stable job_id before simulation starts
    job = BacktestJob(
        strategy_id=payload.strategy_id,
        symbol=payload.symbol,
        timeframe=strategy.timeframe,
        start_date=payload.start_date,
        end_date=payload.end_date,
        capital=payload.capital,
        fee_rate=payload.fee_rate,
        slippage=payload.slippage,
        status='pending',
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    kwargs = dict(
        strategy_id=payload.strategy_id,
        symbol=payload.symbol,
        start_date=payload.start_date,
        end_date=payload.end_date,
        capital=payload.capital,
        fee_rate=payload.fee_rate,
        slippage=payload.slippage,
    )
    t = threading.Thread(target=_run_in_background, args=(job.id, kwargs), daemon=True)
    t.start()
    return {'job_id': job.id, 'status': 'pending'}


@router.get('/backtests/{job_id}/status')
def get_backtest_status(job_id: int, db: Session = Depends(get_db)):
    """Poll this endpoint until status == 'finished' or 'failed'."""
    job = db.query(BacktestJob).filter(BacktestJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail='job not found')
    return {'job_id': job_id, 'status': job.status}


@router.get('/backtests/{job_id}')
def get_backtest_result(job_id: int, db: Session = Depends(get_db)):
    job = db.query(BacktestJob).filter(BacktestJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail='job not found')
    if job.status not in ('finished',):
        raise HTTPException(status_code=202, detail=f'job not ready, status: {job.status}')
    service = BacktestService(db)
    result = service.get_result(job_id)
    if not result:
        raise HTTPException(status_code=404, detail='backtest result not found')
    return result


@router.get('/backtests/{job_id}/trades')
def get_backtest_trades(job_id: int, db: Session = Depends(get_db)):
    service = BacktestService(db)
    return service.get_trades(job_id)


@router.get('/backtests/{job_id}/chart')
def get_backtest_chart(job_id: int, db: Session = Depends(get_db)):
    service = BacktestService(db)
    return service.get_chart(job_id)


@router.post('/optimizations/run')
def run_optimization(payload: OptimizationRunRequest, db: Session = Depends(get_db)):
    service = OptimizationService(db)
    try:
        results = service.run(payload)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {'items': results}
