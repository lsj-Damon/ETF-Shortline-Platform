# Daily Recommendation Record Design

## Goal

Add a new page that records end-of-day trading recommendations automatically and lets the user track the follow-up performance of buy recommendations.

## User Requirement

- recommendations should be saved automatically after market close
- the page should preserve a daily record instead of only showing in-memory live snapshots
- buy recommendations should store a concrete suggested buy price
- the user should be able to review and track later performance

## Recommended Strategy

Use an end-of-day snapshot model:

- persist one recommendation row per trade_date + timeframe + symbol
- run a scheduled end-of-day save after the close
- keep all actions, but emphasize buy recommendation tracking in the page
- calculate follow-up tracking data dynamically when reading the list

## Data Model

Add a new table, for example daily_recommendation_snapshot, with these fields:

- id
- trade_date
- timeframe
- symbol
- name
- action
- action_label
- confidence
- score
- summary
- current_price
- suggested_buy_price
- buy_zone_low
- buy_zone_high
- sell_zone_low
- sell_zone_high
- breakout_trigger
- stop_loss
- take_profit
- scanned_at
- saved_at

Uniqueness rule:

- trade_date + timeframe + symbol must be unique so the save job is idempotent

Suggested buy price rule:

- when action == buy, prefer breakout_trigger
- if that is missing, fall back to buy_zone_high
- for non-buy actions, store null

## Scheduler

Add a dedicated end-of-day job to APScheduler:

- timezone: Asia/Shanghai
- default run time: 15:10
- execution order:
  1. run a fresh decision scan
  2. read the latest snapshots for 5m, 15m, and daily
  3. upsert rows into the daily recommendation table

Behavior:

- repeated execution on the same day updates existing rows instead of inserting duplicates
- partial symbol failures should be logged without aborting the whole batch

## Backend API

Add two read APIs:

- GET /api/v1/daily-recommendations
- GET /api/v1/daily-recommendations/{id}

List filters:

- start_date
- end_date
- timeframe
- action
- symbol

List response should include:

- stored snapshot fields
- latest_price
- tracking_return_pct
- tracking_price_ts
- is_tracking_stale

Tracking rules:

- for buy rows, compute (latest_price - suggested_buy_price) / suggested_buy_price
- for non-buy rows, return null tracking values
- latest price should prefer realtime quote and fall back to the latest local bar close

## Frontend

Add a new page named DailyRecommendationPage and a new sidebar entry:

- page label: daily recommendation record in Chinese UI copy

Top filters:

- date range
- timeframe
- action
- ETF search

Main table columns:

- date
- timeframe
- ETF
- action
- confidence
- recommendation-day price
- suggested buy price
- latest price
- tracking return
- summary
- saved time

Row detail or drawer content:

- full recommendation summary
- buy zone / sell zone
- breakout trigger
- stop loss / take profit
- scan time
- save time

UI scope for v1:

- focus on searchable history and latest follow-up performance
- do not add advanced analytics such as max drawdown, triggered-entry audit, or multi-horizon return breakdown yet

## Error Handling

- if the scheduled save fails, log the job failure without crashing the app
- if quote retrieval fails, fall back to local bar data
- if tracking data is unavailable, the page should still render the saved record with --
- if no recommendations exist for the filters, show an empty state rather than an error

## Testing

Backend:

- suggested buy price generation
- daily upsert behavior
- list filter coverage
- tracking return calculation

Frontend:

- page loads and renders the table
- filters change the query correctly
- empty state renders correctly
- production build passes

## Out of Scope

- trade execution logs
- manual recommendation editing
- multi-user ownership
- advanced performance analytics dashboards