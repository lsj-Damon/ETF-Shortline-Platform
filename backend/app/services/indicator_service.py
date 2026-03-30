import pandas as pd
import numpy as np

# Default MA / EMA periods always computed
_DEFAULT_MA_PERIODS = [5, 10, 20]
_DEFAULT_EMA_PERIODS = [5, 10, 12, 26]


class IndicatorService:
    @staticmethod
    def enrich(df: pd.DataFrame, extra_ma_periods: list[int] | None = None) -> pd.DataFrame:
        """Enrich OHLCV DataFrame with technical indicators.

        Computes: MA, EMA, RSI14, MACD, Bollinger Bands (20,2), KDJ(9),
        volume MA20, breakout levels.

        extra_ma_periods: additional MA/EMA periods beyond the defaults
        (e.g. [30, 50] when optimization rules reference ma30).
        """
        data = df.copy()
        data = data.sort_values('ts').reset_index(drop=True)
        close = data['close']

        # --- MA / EMA (dynamic periods) ---
        all_periods = sorted(set(_DEFAULT_MA_PERIODS + _DEFAULT_EMA_PERIODS + (extra_ma_periods or [])))
        for p in all_periods:
            col_ma = f'ma{p}'
            col_ema = f'ema{p}'
            if col_ma not in data.columns:
                data[col_ma] = close.rolling(p).mean()
            if col_ema not in data.columns:
                data[col_ema] = close.ewm(span=p, adjust=False).mean()

        # --- Volume MA ---
        if 'volume' in data.columns:
            data['volume_ma20'] = data['volume'].rolling(20).mean()

        # --- RSI 14 ---
        delta = close.diff()
        gain = delta.clip(lower=0).rolling(14).mean()
        loss = (-delta.clip(upper=0)).rolling(14).mean()
        rs = gain / loss.replace(0, pd.NA)
        data['rsi14'] = 100 - (100 / (1 + rs.astype(float)))

        # --- MACD (12,26,9) ---
        ema12 = close.ewm(span=12, adjust=False).mean()
        ema26 = close.ewm(span=26, adjust=False).mean()
        data['macd'] = ema12 - ema26
        data['macd_signal'] = data['macd'].ewm(span=9, adjust=False).mean()
        data['macd_hist'] = data['macd'] - data['macd_signal']

        # --- Bollinger Bands (20, 2σ) ---
        boll_mid = close.rolling(20).mean()
        boll_std = close.rolling(20).std(ddof=0)
        data['boll_upper'] = boll_mid + 2 * boll_std
        data['boll_mid'] = boll_mid
        data['boll_lower'] = boll_mid - 2 * boll_std

        # --- KDJ (9,3,3) ---
        low9 = data['low'].rolling(9).min()
        high9 = data['high'].rolling(9).max()
        range9 = (high9 - low9).replace(0, np.nan)
        rsv = (close - low9) / range9 * 100
        k = rsv.ewm(com=2, adjust=False).mean()   # smoothing = 1/3
        d = k.ewm(com=2, adjust=False).mean()
        data['kdj_k'] = k
        data['kdj_d'] = d
        data['kdj_j'] = 3 * k - 2 * d

        # --- Breakout levels ---
        data['breakout_high_20'] = data['high'].rolling(20).max().shift(1)
        data['breakout_low_20'] = data['low'].rolling(20).min().shift(1)
        return data
