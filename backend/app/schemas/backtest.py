from pydantic import BaseModel, Field


class BacktestRunRequest(BaseModel):
    strategy_id: int
    symbol: str = Field(..., min_length=4, max_length=16)
    start_date: str
    end_date: str
    capital: float = 100000
    fee_rate: float = 0.0003
    slippage: float = 0.0005


class OptimizationRunRequest(BaseModel):
    symbol: str
    timeframe: str = "5m"
    strategy_id: int
    start_date: str
    end_date: str
    ma_fast_list: list[int] = [5, 10, 15]
    ma_slow_list: list[int] = [20, 30, 40]
