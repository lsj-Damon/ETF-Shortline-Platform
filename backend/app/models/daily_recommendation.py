from datetime import date, datetime

from sqlalchemy import Date, DateTime, Float, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class DailyRecommendationSnapshot(Base):
    __tablename__ = "daily_recommendation_snapshot"
    __table_args__ = (
        UniqueConstraint("trade_date", "timeframe", "symbol", name="uq_daily_recommendation_trade_timeframe_symbol"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    trade_date: Mapped[date] = mapped_column(Date, index=True)
    timeframe: Mapped[str] = mapped_column(String(16), index=True)
    symbol: Mapped[str] = mapped_column(String(32), index=True)
    name: Mapped[str] = mapped_column(String(128), default="")
    action: Mapped[str] = mapped_column(String(16), index=True)
    action_label: Mapped[str] = mapped_column(String(32), default="")
    confidence: Mapped[int] = mapped_column(Integer, default=0)
    score: Mapped[int] = mapped_column(Integer, default=0)
    summary: Mapped[str] = mapped_column(Text, default="")
    current_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    suggested_buy_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    buy_zone_low: Mapped[float | None] = mapped_column(Float, nullable=True)
    buy_zone_high: Mapped[float | None] = mapped_column(Float, nullable=True)
    sell_zone_low: Mapped[float | None] = mapped_column(Float, nullable=True)
    sell_zone_high: Mapped[float | None] = mapped_column(Float, nullable=True)
    breakout_trigger: Mapped[float | None] = mapped_column(Float, nullable=True)
    stop_loss: Mapped[float | None] = mapped_column(Float, nullable=True)
    take_profit: Mapped[float | None] = mapped_column(Float, nullable=True)
    scanned_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    saved_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)