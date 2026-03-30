from abc import ABC, abstractmethod
import pandas as pd


class BaseDataSource(ABC):
    code: str = "base"
    name: str = "Base"
    source_type: str = "custom"

    @abstractmethod
    def search_etfs(self) -> list[dict]:
        raise NotImplementedError

    @abstractmethod
    def fetch_history(self, symbol: str, timeframe: str, start_date: str, end_date: str) -> pd.DataFrame:
        raise NotImplementedError

    @abstractmethod
    def fetch_realtime(self, symbol: str) -> dict:
        raise NotImplementedError
