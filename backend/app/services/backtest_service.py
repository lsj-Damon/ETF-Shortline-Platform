import json
import math
import re
from datetime import datetime

import pandas as pd
from sqlalchemy.orm import Session

from app.models.backtest import BacktestJob, BacktestResult, TradeDetail
from app.models.strategy import Strategy
from app.services.indicator_service import IndicatorService
from app.services.market_data_service import MarketDataService
from app.services.strategy_engine import StrategyEngine


def _collect_ma_periods(rules: list[dict]) -> list[int]:
    """Extract MA/EMA period numbers referenced in rule field/value strings, e.g. 'ma30' -> 30."""
    periods: set[int] = set()
    for rule in rules:
        for key in ('field', 'value'):
            m = re.match(r'^(?:ma|ema)(\d+)$', str(rule.get(key, '')))
            if m:
                periods.add(int(m.group(1)))
    return list(periods)


class BacktestService:
    def __init__(self, db: Session):
        self.db = db
        self.market = MarketDataService(db)

    def run(
        self,
        strategy_id: int,
        symbol: str,
        start_date: str,
        end_date: str,
        capital: float,
        fee_rate: float,
        slippage: float,
        entry_rules: list | None = None,
        exit_rules: list | None = None,
        existing_job_id: int | None = None,
    ):
        """Run a backtest simulation and persist results.

        entry_rules / exit_rules: override the strategy's stored rules (used by
        OptimizationService without mutating the DB object).

        existing_job_id: if provided, reuse this pre-created BacktestJob row
        instead of inserting a new one (used by the async API endpoint).
        """
        strategy = self.db.query(Strategy).filter(Strategy.id == strategy_id).first()
        if not strategy:
            raise ValueError('strategy not found')

        bars = self.market.get_bars(symbol=symbol, timeframe=strategy.timeframe, start=start_date, end=end_date, limit=10000)
        if not bars:
            raise ValueError('no bars found, please import history first')

        df = pd.DataFrame(bars)
        for col in ['open', 'high', 'low', 'close', 'volume']:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors='coerce')
        df['ts'] = pd.to_datetime(df['ts'])

        _entry = entry_rules if entry_rules is not None else json.loads(strategy.entry_rules_json or '[]')
        _exit = exit_rules if exit_rules is not None else json.loads(strategy.exit_rules_json or '[]')

        # Compute any extra MA periods the rules reference (e.g. ma30, ema15)
        extra_periods = _collect_ma_periods(_entry + _exit)
        df = IndicatorService.enrich(df, extra_ma_periods=extra_periods)

        entries = StrategyEngine.build_signal(df, _entry)
        exits = StrategyEngine.build_signal(df, _exit)

        if existing_job_id is not None:
            job = self.db.query(BacktestJob).filter(BacktestJob.id == existing_job_id).first()
            if not job:
                raise ValueError(f'job {existing_job_id} not found')
            job.status = 'running'
            self.db.commit()
        else:
            job = BacktestJob(
                strategy_id=strategy.id,
                symbol=symbol,
                timeframe=strategy.timeframe,
                start_date=start_date,
                end_date=end_date,
                capital=capital,
                fee_rate=fee_rate,
                slippage=slippage,
                status='running',
            )
            self.db.add(job)
            self.db.commit()
            self.db.refresh(job)

        trades, summary, chart = self._simulate(
            df, entries, exits, capital, fee_rate, slippage,
            strategy.stop_loss_pct, strategy.take_profit_pct, strategy.max_hold_bars,
        )

        result = BacktestResult(
            job_id=job.id,
            total_return=summary['total_return'],
            max_drawdown=summary['max_drawdown'],
            win_rate=summary['win_rate'],
            profit_factor=summary['profit_factor'],
            trade_count=summary['trade_count'],
            sharpe=summary['sharpe'],
            result_json=json.dumps({'summary': summary, 'chart': chart}, ensure_ascii=False),
        )
        self.db.add(result)
        for trade in trades:
            self.db.add(TradeDetail(job_id=job.id, symbol=symbol, **trade))
        job.status = 'finished'
        job.finished_at = datetime.utcnow()
        self.db.commit()
        return job.id

    def get_result(self, job_id: int):
        result = self.db.query(BacktestResult).filter(BacktestResult.job_id == job_id).first()
        if not result:
            return None
        payload = json.loads(result.result_json or '{}')
        return {
            'job_id': job_id,
            'total_return': result.total_return,
            'max_drawdown': result.max_drawdown,
            'win_rate': result.win_rate,
            'profit_factor': result.profit_factor,
            'trade_count': result.trade_count,
            'sharpe': result.sharpe,
            **payload,
        }

    def get_trades(self, job_id: int):
        rows = self.db.query(TradeDetail).filter(TradeDetail.job_id == job_id).all()
        return [
            {
                'id': row.id,
                'symbol': row.symbol,
                'entry_time': row.entry_time,
                'entry_price': row.entry_price,
                'exit_time': row.exit_time,
                'exit_price': row.exit_price,
                'pnl': row.pnl,
                'pnl_pct': row.pnl_pct,
                'hold_bars': row.hold_bars,
                'exit_reason': row.exit_reason,
            }
            for row in rows
        ]

    def get_chart(self, job_id: int):
        result = self.get_result(job_id)
        return result.get('chart', {}) if result else {}

    def _simulate(
        self, df, entries, exits, capital, fee_rate, slippage,
        stop_loss_pct, take_profit_pct, max_hold_bars,
    ):
        cash = capital
        equity_curve: list[dict] = []
        trades: list[dict] = []
        in_position = False
        entry_price = 0.0
        entry_time: str | None = None
        entry_idx: int | None = None
        quantity = 0.0

        for i in range(len(df) - 1):
            close_price = float(df.iloc[i]['close'])
            next_open = float(df.iloc[i + 1]['open'])
            ts = str(df.iloc[i]['ts'])

            if not in_position and bool(entries.iloc[i]):
                # Buy at next bar open + slippage; fee is charged on cash deployed
                buy_price = next_open * (1 + slippage)
                fee_paid = cash * fee_rate
                net_cash = cash - fee_paid
                raw_quantity = net_cash / buy_price
                # Round down to nearest 100-share lot (A-share minimum trading unit).
                # For very low-priced ETFs, skip rounding if 1 lot is unaffordable.
                if buy_price >= 0.1 and raw_quantity >= 100:
                    quantity = (raw_quantity // 100) * 100
                else:
                    quantity = raw_quantity
                entry_price = buy_price
                entry_time = str(df.iloc[i + 1]['ts'])
                entry_idx = i + 1
                cash = 0.0
                in_position = True

            elif in_position:
                pnl_pct = (close_price - entry_price) / entry_price if entry_price else 0.0
                hold_bars = i - (entry_idx or i)
                exit_reason: str | None = None

                if stop_loss_pct > 0 and pnl_pct <= -stop_loss_pct:
                    exit_reason = 'stop_loss'
                elif take_profit_pct > 0 and pnl_pct >= take_profit_pct:
                    exit_reason = 'take_profit'
                elif max_hold_bars > 0 and hold_bars >= max_hold_bars:
                    exit_reason = 'max_hold'
                elif bool(exits.iloc[i]):
                    exit_reason = 'signal'

                if exit_reason:
                    sell_price = next_open * (1 - slippage)
                    gross = quantity * sell_price
                    cash = gross * (1 - fee_rate)

                    trade_pnl_pct = (sell_price - entry_price) / entry_price if entry_price else 0.0
                    prev_equity = trades[-1]['_equity_after'] if trades else capital
                    pnl = cash - prev_equity

                    trades.append({
                        'entry_time': entry_time,
                        'entry_price': round(entry_price, 4),
                        'exit_time': str(df.iloc[i + 1]['ts']),
                        'exit_price': round(sell_price, 4),
                        'pnl': round(pnl, 4),
                        'pnl_pct': round(trade_pnl_pct, 6),
                        'hold_bars': hold_bars,
                        'exit_reason': exit_reason,
                        '_equity_after': cash,
                    })
                    in_position = False
                    quantity = 0.0

            equity = cash if not in_position else quantity * close_price
            equity_curve.append({
                'ts': ts,
                'equity': round(equity, 2),
                'close': close_price,
                'entry': bool(entries.iloc[i]),
                'exit': bool(exits.iloc[i]),
            })

        # Strip internal helper key before persisting
        for t in trades:
            t.pop('_equity_after', None)

        # --- Performance metrics ---
        pnl_pct_list = [t['pnl_pct'] for t in trades]
        wins = [x for x in pnl_pct_list if x > 0]
        losses = [x for x in pnl_pct_list if x < 0]

        total_return = (equity_curve[-1]['equity'] - capital) / capital if equity_curve else 0.0

        equity_series = pd.Series([e['equity'] for e in equity_curve]) if equity_curve else pd.Series(dtype=float)
        rolling_max = equity_series.cummax()
        drawdown = ((equity_series - rolling_max) / rolling_max).fillna(0)
        max_drawdown = float(drawdown.min()) if not drawdown.empty else 0.0

        # Annualised Sharpe ratio using daily equity returns (x √252)
        daily_returns = equity_series.pct_change().dropna()
        if len(daily_returns) > 1 and daily_returns.std() > 0:
            sharpe = float((daily_returns.mean() / daily_returns.std()) * math.sqrt(252))
        else:
            sharpe = 0.0

        profit_factor = (
            sum(wins) / abs(sum(losses))
            if losses and sum(losses) != 0
            else float(sum(wins)) if wins else 0.0
        )

        # --- Benchmark: buy-and-hold on the same asset ---
        bm_start = float(df.iloc[0]['close'])
        bm_end = float(df.iloc[-1]['close'])
        benchmark_return = (bm_end - bm_start) / bm_start if bm_start else 0.0
        alpha = total_return - benchmark_return

        # Calmar ratio: annualised return / abs(max drawdown)
        n_bars = len(equity_curve)
        ann_factor = 252 / max(n_bars, 1)
        ann_return = (1 + total_return) ** ann_factor - 1
        calmar = float(ann_return / abs(max_drawdown)) if max_drawdown != 0 else 0.0

        summary = {
            'total_return': round(total_return, 6),
            'benchmark_return': round(benchmark_return, 6),
            'alpha': round(alpha, 6),
            'max_drawdown': round(max_drawdown, 6),
            'calmar': round(calmar, 4),
            'win_rate': round(len(wins) / len(pnl_pct_list), 6) if pnl_pct_list else 0.0,
            'profit_factor': round(profit_factor, 6),
            'trade_count': len(trades),
            'sharpe': round(sharpe, 4),
        }

        # Benchmark equity curve (buy-and-hold scaled to same capital)
        benchmark_curve = [
            {'ts': e['ts'], 'equity': round(capital * float(df.iloc[i]['close']) / bm_start, 2)}
            for i, e in enumerate(equity_curve)
        ] if bm_start else []

        default_cols = ['ts', 'open', 'high', 'low', 'close', 'volume']
        indicator_cols = [c for c in df.columns if c not in default_cols and c != 'ts']
        export_cols = default_cols + [c for c in indicator_cols if c in df.columns]
        chart = {
            'bars': df[export_cols].fillna('').to_dict(orient='records'),
            'equity_curve': equity_curve,
            'benchmark_curve': benchmark_curve,
            'buy_signals': [t['entry_time'] for t in trades],
            'sell_signals': [t['exit_time'] for t in trades],
        }
        return trades, summary, chart
