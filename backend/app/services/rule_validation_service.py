from app.schemas.strategy import RuleItem


ALLOWED_FIELDS = {
    'close', 'open', 'high', 'low',
    'ma5', 'ma10', 'ma20',
    'ema5', 'ema10', 'ema12', 'ema26',
    'volume', 'volume_ma20',
    'rsi14',
    'macd', 'macd_signal', 'macd_hist',
    'boll_upper', 'boll_mid', 'boll_lower',
    'kdj_k', 'kdj_d', 'kdj_j',
    'breakout_high_20', 'breakout_low_20',
}

ALLOWED_OPS = {'gt', 'lt', 'cross_above', 'cross_below'}


class RuleValidationService:
    @staticmethod
    def validate_rules(rules: list[RuleItem]) -> None:
        for idx, rule in enumerate(rules, start=1):
            if rule.field not in ALLOWED_FIELDS:
                raise ValueError(f'第 {idx} 条规则字段不支持: {rule.field}')
            if rule.op not in ALLOWED_OPS:
                raise ValueError(f'第 {idx} 条规则操作符不支持: {rule.op}')
            if not str(rule.value).strip():
                raise ValueError(f'第 {idx} 条规则的比较值不能为空')
