import http from './http'

export interface DailyRecommendationItem {
  id: number
  trade_date: string
  timeframe: string
  symbol: string
  name: string
  action: string
  action_label: string
  confidence: number
  score: number
  summary: string
  current_price: number | null
  suggested_buy_price: number | null
  latest_price: number | null
  tracking_return_pct: number | null
  tracking_price_ts: string | null
  is_tracking_stale: boolean
  saved_at: string
  scanned_at: string | null
  buy_zone: { low?: number | null; high?: number | null }
  sell_zone: { low?: number | null; high?: number | null }
  breakout_trigger: number | null
  stop_loss: number | null
  take_profit: number | null
}

export interface DailyRecommendationListResponse {
  items: DailyRecommendationItem[]
  count: number
}

export const getDailyRecommendations = async (params?: {
  start_date?: string
  end_date?: string
  timeframe?: string
  action?: string
  symbol?: string
}) => {
  const res = await http.get('/api/v1/daily-recommendations', { params })
  return res.data as DailyRecommendationListResponse
}

export const getDailyRecommendationDetail = async (id: number) => {
  const res = await http.get(`/api/v1/daily-recommendations/${id}`)
  return res.data as DailyRecommendationItem
}