from datetime import datetime

from sqlalchemy import DateTime, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class BacktestJob(Base):
    __tablename__ = "backtest_job"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    strategy_id: Mapped[int] = mapped_column(Integer, index=True)
    symbol: Mapped[str] = mapped_column(String(32), index=True)
    timeframe: Mapped[str] = mapped_column(String(16), default="daily")
    start_date: Mapped[str] = mapped_column(String(32))
    end_date: Mapped[str] = mapped_column(String(32))
    capital: Mapped[float] = mapped_column(Float, default=100000)
    fee_rate: Mapped[float] = mapped_column(Float, default=0.0003)
    slippage: Mapped[float] = mapped_column(Float, default=0.0005)
    status: Mapped[str] = mapped_column(String(32), default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class BacktestResult(Base):
    __tablename__ = "backtest_result"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    job_id: Mapped[int] = mapped_column(Integer, index=True)
    total_return: Mapped[float] = mapped_column(Float, default=0.0)
    max_drawdown: Mapped[float] = mapped_column(Float, default=0.0)
    win_rate: Mapped[float] = mapped_column(Float, default=0.0)
    profit_factor: Mapped[float] = mapped_column(Float, default=0.0)
    trade_count: Mapped[int] = mapped_column(Integer, default=0)
    sharpe: Mapped[float] = mapped_column(Float, default=0.0)
    result_json: Mapped[str] = mapped_column(Text, default="{}")


class TradeDetail(Base):
    __tablename__ = "trade_detail"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    job_id: Mapped[int] = mapped_column(Integer, index=True)
    symbol: Mapped[str] = mapped_column(String(32), index=True)
    entry_time: Mapped[str] = mapped_column(String(64))
    entry_price: Mapped[float] = mapped_column(Float)
    exit_time: Mapped[str] = mapped_column(String(64))
    exit_price: Mapped[float] = mapped_column(Float)
    pnl: Mapped[float] = mapped_column(Float)
    pnl_pct: Mapped[float] = mapped_column(Float)
    hold_bars: Mapped[int] = mapped_column(Integer, default=0)
    exit_reason: Mapped[str] = mapped_column(String(64), default="rule")
