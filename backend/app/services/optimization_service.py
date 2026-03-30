from sqlalchemy.orm import Session

from app.models.strategy import Strategy
from app.schemas.backtest import OptimizationRunRequest
from app.services.backtest_service import BacktestService


class OptimizationService:
    def __init__(self, db: Session):
        self.db = db
        self.backtest_service = BacktestService(db)

    def run(self, payload: OptimizationRunRequest):
        """Grid-search over MA fast/slow pairs.

        Rules are passed directly to backtest_service.run() via the
        entry_rules / exit_rules kwargs — the Strategy DB object is never
        mutated, so the optimization cannot corrupt stored strategy data.
        """
        strategy = self.db.query(Strategy).filter(Strategy.id == payload.strategy_id).first()
        if not strategy:
            raise ValueError('strategy not found')

        results = []
        for fast in payload.ma_fast_list:
            for slow in payload.ma_slow_list:
                if fast >= slow:
                    continue

                entry_rules = [{"field": f"ma{fast}", "op": "cross_above", "value": f"ma{slow}"}]
                exit_rules = [{"field": f"ma{fast}", "op": "cross_below", "value": f"ma{slow}"}]

                job_id = self.backtest_service.run(
                    strategy_id=strategy.id,
                    symbol=payload.symbol,
                    start_date=payload.start_date,
                    end_date=payload.end_date,
                    capital=100000,
                    fee_rate=0.0003,
                    slippage=0.0005,
                    entry_rules=entry_rules,
                    exit_rules=exit_rules,
                )
                result = self.backtest_service.get_result(job_id)
                results.append({'ma_fast': fast, 'ma_slow': slow, **result})

        results.sort(key=lambda x: x.get('total_return', 0), reverse=True)
        return results
