import pandas as pd


def _cross_above(left: pd.Series, right: pd.Series) -> pd.Series:
    return (left > right) & (left.shift(1) <= right.shift(1))


def _cross_below(left: pd.Series, right: pd.Series) -> pd.Series:
    return (left < right) & (left.shift(1) >= right.shift(1))


class StrategyEngine:
    @staticmethod
    def _resolve_value(df: pd.DataFrame, value: str):
        if value in df.columns:
            return df[value]
        try:
            return float(value)
        except Exception:
            return value

    @classmethod
    def build_signal(cls, df: pd.DataFrame, rules: list[dict]) -> pd.Series:
        if not rules:
            return pd.Series([False] * len(df), index=df.index)

        signal = pd.Series([True] * len(df), index=df.index)
        for rule in rules:
            field = rule.get('field')
            op = rule.get('op')
            value = rule.get('value')
            left = df[field]
            right = cls._resolve_value(df, value)

            if op == 'gt':
                current = left > right
            elif op == 'lt':
                current = left < right
            elif op == 'cross_above':
                current = _cross_above(left, right)
            elif op == 'cross_below':
                current = _cross_below(left, right)
            else:
                current = pd.Series([False] * len(df), index=df.index)
            signal = signal & current.fillna(False)
        return signal.fillna(False)
