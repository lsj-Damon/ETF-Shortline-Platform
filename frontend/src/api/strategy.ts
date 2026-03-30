import http from './http'

export interface RuleItem {
  field: string
  op: string
  value: string
}

export interface StrategyPayload {
  name: string
  symbol: string
  timeframe: string
  entry_rules: RuleItem[]
  exit_rules: RuleItem[]
  stop_loss_pct: number
  take_profit_pct: number
  max_hold_bars: number
}

export const getStrategyList = async () => {
  const res = await http.get('/api/v1/strategies')
  return res.data
}

export const getStrategyDetail = async (id: number) => {
  const res = await http.get(`/api/v1/strategies/${id}`)
  return res.data
}

export const createStrategy = async (payload: StrategyPayload) => {
  const res = await http.post('/api/v1/strategies', payload)
  return res.data
}

export const updateStrategy = async (id: number, payload: StrategyPayload) => {
  const res = await http.put(`/api/v1/strategies/${id}`, payload)
  return res.data
}

export const deleteStrategy = async (id: number) => {
  const res = await http.delete(`/api/v1/strategies/${id}`)
  return res.data
}
