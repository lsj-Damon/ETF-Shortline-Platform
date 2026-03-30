"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-03-30 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '0001'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'etf_symbol',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('symbol', sa.String(32), nullable=False, unique=True),
        sa.Column('name', sa.String(128), nullable=True),
        sa.Column('market', sa.String(32), nullable=True),
        sa.Column('category', sa.String(64), nullable=True),
        sa.Column('status', sa.String(16), nullable=True),
        sa.Column('created_at', sa.DateTime, nullable=True),
        sa.Column('updated_at', sa.DateTime, nullable=True),
    )
    op.create_index('ix_etf_symbol_symbol', 'etf_symbol', ['symbol'])

    op.create_table(
        'etf_bar_meta',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('symbol', sa.String(32), nullable=False),
        sa.Column('timeframe', sa.String(16), nullable=True),
        sa.Column('start_time', sa.String(32), nullable=True),
        sa.Column('end_time', sa.String(32), nullable=True),
        sa.Column('bar_count', sa.Integer, nullable=True),
        sa.Column('storage_path', sa.String(256), nullable=True),
        sa.Column('source', sa.String(32), nullable=True),
        sa.Column('updated_at', sa.DateTime, nullable=True),
    )
    op.create_index('ix_etf_bar_meta_symbol', 'etf_bar_meta', ['symbol'])

    op.create_table(
        'strategy',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('name', sa.String(128), nullable=False),
        sa.Column('symbol', sa.String(32), nullable=False),
        sa.Column('timeframe', sa.String(16), nullable=True),
        sa.Column('entry_rules_json', sa.Text, nullable=True),
        sa.Column('exit_rules_json', sa.Text, nullable=True),
        sa.Column('stop_loss_pct', sa.Float, nullable=True),
        sa.Column('take_profit_pct', sa.Float, nullable=True),
        sa.Column('max_hold_bars', sa.Integer, nullable=True),
        sa.Column('created_at', sa.DateTime, nullable=True),
        sa.Column('updated_at', sa.DateTime, nullable=True),
    )
    op.create_index('ix_strategy_name', 'strategy', ['name'])
    op.create_index('ix_strategy_symbol', 'strategy', ['symbol'])

    op.create_table(
        'backtest_job',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('strategy_id', sa.Integer, nullable=False),
        sa.Column('symbol', sa.String(32), nullable=False),
        sa.Column('timeframe', sa.String(16), nullable=True),
        sa.Column('start_date', sa.String(32), nullable=True),
        sa.Column('end_date', sa.String(32), nullable=True),
        sa.Column('capital', sa.Float, nullable=True),
        sa.Column('fee_rate', sa.Float, nullable=True),
        sa.Column('slippage', sa.Float, nullable=True),
        sa.Column('status', sa.String(32), nullable=True),
        sa.Column('created_at', sa.DateTime, nullable=True),
        sa.Column('finished_at', sa.DateTime, nullable=True),
    )
    op.create_index('ix_backtest_job_strategy_id', 'backtest_job', ['strategy_id'])
    op.create_index('ix_backtest_job_symbol', 'backtest_job', ['symbol'])

    op.create_table(
        'backtest_result',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('job_id', sa.Integer, nullable=False),
        sa.Column('total_return', sa.Float, nullable=True),
        sa.Column('max_drawdown', sa.Float, nullable=True),
        sa.Column('win_rate', sa.Float, nullable=True),
        sa.Column('profit_factor', sa.Float, nullable=True),
        sa.Column('trade_count', sa.Integer, nullable=True),
        sa.Column('sharpe', sa.Float, nullable=True),
        sa.Column('result_json', sa.Text, nullable=True),
    )
    op.create_index('ix_backtest_result_job_id', 'backtest_result', ['job_id'])

    op.create_table(
        'trade_detail',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('job_id', sa.Integer, nullable=False),
        sa.Column('symbol', sa.String(32), nullable=False),
        sa.Column('entry_time', sa.String(64), nullable=True),
        sa.Column('entry_price', sa.Float, nullable=True),
        sa.Column('exit_time', sa.String(64), nullable=True),
        sa.Column('exit_price', sa.Float, nullable=True),
        sa.Column('pnl', sa.Float, nullable=True),
        sa.Column('pnl_pct', sa.Float, nullable=True),
        sa.Column('hold_bars', sa.Integer, nullable=True),
        sa.Column('exit_reason', sa.String(64), nullable=True),
    )
    op.create_index('ix_trade_detail_job_id', 'trade_detail', ['job_id'])
    op.create_index('ix_trade_detail_symbol', 'trade_detail', ['symbol'])


def downgrade() -> None:
    op.drop_table('trade_detail')
    op.drop_table('backtest_result')
    op.drop_table('backtest_job')
    op.drop_table('strategy')
    op.drop_table('etf_bar_meta')
    op.drop_table('etf_symbol')
