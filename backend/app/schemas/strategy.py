from datetime import datetime
from pydantic import BaseModel, Field


class RuleItem(BaseModel):
    field: str
    op: str
    value: str


class StrategyCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=128)
    symbol: str = Field(..., min_length=4, max_length=16)
    timeframe: str = Field(default="daily")
    entry_rules: list[RuleItem] = Field(default_factory=list)
    exit_rules: list[RuleItem] = Field(default_factory=list)
    stop_loss_pct: float = 0.0
    take_profit_pct: float = 0.0
    max_hold_bars: int = 0


class StrategyUpdateRequest(StrategyCreateRequest):
    pass


class StrategyResponse(BaseModel):
    id: int
    name: str
    symbol: str
    timeframe: str
    entry_rules: list[RuleItem]
    exit_rules: list[RuleItem]
    stop_loss_pct: float
    take_profit_pct: float
    max_hold_bars: int
    created_at: datetime
    updated_at: datetime
