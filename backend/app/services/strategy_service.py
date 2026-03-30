import json
from sqlalchemy.orm import Session

from app.models.strategy import Strategy
from app.schemas.strategy import StrategyCreateRequest, StrategyUpdateRequest
from app.services.rule_validation_service import RuleValidationService


class StrategyService:
    def __init__(self, db: Session):
        self.db = db

    def list_strategies(self) -> list[Strategy]:
        return self.db.query(Strategy).order_by(Strategy.updated_at.desc()).all()

    def create_strategy(self, payload: StrategyCreateRequest) -> Strategy:
        RuleValidationService.validate_rules(payload.entry_rules)
        RuleValidationService.validate_rules(payload.exit_rules)
        item = Strategy(
            name=payload.name,
            symbol=payload.symbol,
            timeframe=payload.timeframe,
            entry_rules_json=json.dumps([rule.model_dump() for rule in payload.entry_rules], ensure_ascii=False),
            exit_rules_json=json.dumps([rule.model_dump() for rule in payload.exit_rules], ensure_ascii=False),
            stop_loss_pct=payload.stop_loss_pct,
            take_profit_pct=payload.take_profit_pct,
            max_hold_bars=payload.max_hold_bars,
        )
        self.db.add(item)
        self.db.commit()
        self.db.refresh(item)
        return item

    def update_strategy(self, strategy_id: int, payload: StrategyUpdateRequest) -> Strategy | None:
        RuleValidationService.validate_rules(payload.entry_rules)
        RuleValidationService.validate_rules(payload.exit_rules)
        item = self.db.query(Strategy).filter(Strategy.id == strategy_id).first()
        if not item:
            return None
        item.name = payload.name
        item.symbol = payload.symbol
        item.timeframe = payload.timeframe
        item.entry_rules_json = json.dumps([rule.model_dump() for rule in payload.entry_rules], ensure_ascii=False)
        item.exit_rules_json = json.dumps([rule.model_dump() for rule in payload.exit_rules], ensure_ascii=False)
        item.stop_loss_pct = payload.stop_loss_pct
        item.take_profit_pct = payload.take_profit_pct
        item.max_hold_bars = payload.max_hold_bars
        self.db.commit()
        self.db.refresh(item)
        return item

    def get_strategy(self, strategy_id: int) -> Strategy | None:
        return self.db.query(Strategy).filter(Strategy.id == strategy_id).first()

    def delete_strategy(self, strategy_id: int) -> bool:
        item = self.db.query(Strategy).filter(Strategy.id == strategy_id).first()
        if not item:
            return False
        self.db.delete(item)
        self.db.commit()
        return True
