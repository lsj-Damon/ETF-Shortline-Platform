# Decision Center Realtime K-Line Design

## Goal

Extend the trading decision center so that clicking an ETF shows an embedded realtime K-line in the current decision detail area, with model-derived candidate buy and sell markers.

## User Experience

- Clicking an ETF keeps the user on the decision center page.
- The middle detail panel shows both textual decision guidance and a realtime K-line.
- The chart marks the most relevant candidate buy and sell points derived from the current decision model.
- The chart updates when the user changes timeframe, refreshes decisions, or receives new action events for the selected ETF.

## Scope

- Add a decision-center chart API for a single ETF and timeframe.
- Fetch the latest bars from the data source when possible.
- Fall back to locally imported bars if realtime fetch fails.
- Reuse the existing K-line component and extend it for richer markers and horizontal decision levels.

## Non-Goals

- No historical best-point backfilling or hindsight optimization.
- No new database tables or migrations.
- No separate chart page, modal, or drawer.

## Backend Design

### API

Add:

- `GET /api/v1/decisions/live/{symbol}/chart?timeframe=5m&limit=240`

Response payload:

- `bars`: latest bars for the requested symbol and timeframe
- `markers`: model-derived candidate buy/sell points
- `levels`: buy zone, sell zone, breakout trigger, stop loss, and other key prices
- `meta`: realtime/fallback status, last bar time, scan time, symbol, timeframe

### Data Source Strategy

- First try to fetch recent bars directly from the configured market data source.
- For `5m` and `15m`, fetch a recent rolling window and tail to the requested limit.
- For `daily`, fetch a recent date window and tail to the requested limit.
- If the realtime request fails or returns too few bars, fall back to locally imported bars through `MarketDataService.get_bars()`.
- The response includes `meta.is_realtime` so the frontend can show the current data mode.

### Marker Generation

Marker generation reuses the current decision-model vocabulary and key levels from the latest snapshot.

Candidate buy types:

- `support_rebound`: price revisits the buy zone and shows rebound confirmation
- `breakout_confirm`: price closes above the breakout trigger with volume/trend confirmation

Candidate sell types:

- `take_profit`: price reaches the sell zone and momentum weakens
- `stop_loss_exit`: price breaks stop loss or a clear breakdown condition appears

Selection rules:

- Search only the most recent window of bars
- Keep at most 2 buy markers and 2 sell markers
- Score candidates and keep the most representative recent points
- Bias marker selection by the current snapshot action:
  - `buy/watch`: prioritize buy markers, keep only defensive sell markers
  - `reduce/sell`: prioritize sell markers, keep at most one reversal-watch buy marker

## Frontend Design

### Detail Panel

- Keep the existing decision summary tiles and plan content.
- Add an embedded chart section inside the current decision detail card.
- Load decision detail and chart detail together when the selected ETF or timeframe changes.

### Chart Rendering

- Extend the shared `KlineChart` component to support:
  - structured markers with labels and reason text
  - horizontal level lines for buy/sell zones, breakout trigger, and stop loss
  - an optional embedded mode without an outer card
  - realtime/fallback status display
- Preserve compatibility with existing backtest and signal-analysis chart payloads.

### Refresh Behavior

- Refresh the selected ETF chart when:
  - the user selects a different ETF
  - the user changes timeframe
  - the user clicks manual refresh
  - a new SSE event arrives for the selected ETF and timeframe
  - a lightweight polling interval fires for the currently selected ETF

## Empty States and Error Handling

- If bars are insufficient, show the decision detail text and an empty chart section.
- If realtime bar loading fails, display fallback local bars and label the chart as fallback.
- If no high-quality candidates exist, still render the K-line and decision levels without marker points.

## Verification

- Backend verification:
  - marker generation for rebound, breakout, take-profit, stop-loss, and no-signal paths
  - realtime fetch fallback behavior
- Frontend verification:
  - ETF selection updates detail and chart together
  - timeframe switching updates chart and marker set
  - SSE and polling refresh the selected chart
  - realtime/fallback and empty states render correctly
