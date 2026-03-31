# Trading Decision Center Design

## Goal

Build a phase-1 trading decision center for the ETF shortline platform that helps the user:

- monitor imported ETFs during market hours
- see ranked live opportunities
- view actionable buy/sell/watch guidance with price zones
- review a lightweight next-session trading plan
- receive real-time action-change events

## Scope

Phase 1 focuses on live decision snapshots and an opinionated dashboard UI. It does not add database migrations. Decision data is kept in memory and refreshed by scheduled scans plus manual refresh.

## Backend

- Add `DecisionService` to scan imported ETFs, compute indicators, score decisions, and keep in-memory snapshots.
- Reuse existing parquet bars, indicator enrichment, and quote fetching.
- Add JSON APIs for live decisions, single-symbol detail, ranking, plans, recent events, and manual scan.
- Add SSE stream for action-change events.
- Hook a scheduled scan into the existing app scheduler.

## Decision Model

Each ETF snapshot returns:

- action: `buy`, `watch`, `reduce`, `sell`
- confidence: 0-100
- total score and score breakdown
- current price, change percent, timeframe used
- buy zone, sell zone, stop loss, take profit
- reason tags and summary
- next-session plan scenarios

## Frontend

- Add a new `交易决策中心` page and sidebar entry.
- Use a trading-terminal inspired layout with:
  - opportunity ranking list
  - selected ETF live decision panel
  - next-session plan card
  - real-time event feed
- Pull initial data from JSON APIs and subscribe to SSE updates.

## UI Direction

The requested `ui ur pro max` skill is not available in this session, so the implementation will follow the repo's existing stack with a more premium dashboard treatment:

- strong information hierarchy
- warmer paper-like surfaces instead of generic flat cards
- clear action colors for buy/watch/reduce/sell
- compact, data-dense cards suitable for trading use

## Constraints

- Only ETFs with imported historical data are scanned in phase 1.
- No persistence for decision snapshots in phase 1.
- Next-session plans are derived from the latest snapshot instead of a dedicated end-of-day batch job.
