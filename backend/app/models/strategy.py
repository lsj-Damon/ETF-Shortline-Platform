from datetime import datetime

from sqlalchemy import DateTime, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class Strategy(Base):
    __tablename__ = "strategy"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(128), index=True)
    symbol: Mapped[str] = mapped_column(String(32), index=True)
    timeframe: Mapped[str] = mapped_column(String(16), default="daily")
    entry_rules_json: Mapped[str] = mapped_column(Text, default="[]")
    exit_rules_json: Mapped[str] = mapped_column(Text, default="[]")
    stop_loss_pct: Mapped[float] = mapped_column(Float, default=0.0)
    take_profit_pct: Mapped[float] = mapped_column(Float, default=0.0)
    max_hold_bars: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
