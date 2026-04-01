# Decision Center Cache Design

## Goal

Make the trading decision center feel fast to refresh while preserving timely detail for the currently selected ETF.

## User Requirement

- board areas should feel instant
- the selected ETF detail and K-line should stay relatively fresh
- repeated switching between the same ETFs or timeframes should reuse cached results instead of recalculating everything

## Recommended Strategy

Use a hybrid caching model:

- board data uses in-memory snapshot-derived cache
- detail data continues to come from the current snapshot
- chart data uses short-TTL cache plus stale-while-revalidate
- frontend keeps recent board/detail/chart payloads for instant local replay

## Backend

### Board Cache

Cache key:

- timeframe

Cached payload:

- live decisions
- latest plans
- recent events
- last scan time
- generated time

Behavior:

- rebuilt after a scan for that timeframe
- reused for repeated board requests
- returned with lightweight metadata such as `cache_hit` and `generated_at`

### Chart Cache

Cache key:

- symbol + timeframe + limit

Cached payload:

- bars
- markers
- levels
- metadata

TTL:

- 5m: 8 seconds
- 15m: 12 seconds
- daily: 60 seconds

Behavior:

- fresh cache returns immediately
- stale cache returns immediately with `is_stale=true`, then triggers background refresh
- missing cache computes once, stores, then returns

### Concurrency Control

- add singleflight refresh for the same chart cache key
- add a lightweight per-timeframe scan lock so repeated `ensure_fresh()` calls do not trigger duplicate scans

## Frontend

### Local Replay Cache

Cache recent payloads in memory:

- board by timeframe
- detail by timeframe + symbol
- chart by timeframe + symbol

Behavior:

- on timeframe or ETF switch, replay local cache first if available
- fetch fresh data in the background and replace state when the response is newer

### Request Dedup

- if the same board request is already in flight, reuse it
- if the same detail/chart request is already in flight, reuse it
- when fast-switching ETFs, ignore stale responses from older requests

### Refresh Strategy

- initial page load prioritizes board first, then selected detail/chart
- SSE refresh updates the board immediately
- selected detail/chart refresh only when the event matches the active symbol
- polling continues only for the visible page and selected chart

## Invalidation Rules

- board cache refreshes after scan completion for the same timeframe
- chart cache invalidates on manual refresh, matching scan completion, timeframe switch, or TTL expiry
- no cross-timeframe invalidation

## Verification

- repeated board requests should not rebuild the same payload every time
- repeated chart requests for the same symbol/timeframe should reuse cached or in-flight work
- switching back to a recently viewed ETF should show immediate cached content before background refresh
- UI should show less loading flicker while preserving timely selected-chart updates
