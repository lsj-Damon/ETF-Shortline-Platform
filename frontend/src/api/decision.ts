import http from './http'

export const getLiveDecisions = async (limit = 20, timeframe = '5m') => {
  const res = await http.get('/api/v1/decisions/live', { params: { limit, timeframe } })
  return res.data
}

export const getDecisionDetail = async (symbol: string, timeframe = '5m') => {
  const res = await http.get(`/api/v1/decisions/live/${symbol}`, { params: { timeframe } })
  return res.data
}

export const getDecisionSymbols = async (timeframe = '5m') => {
  const res = await http.get('/api/v1/decisions/symbols', { params: { timeframe } })
  return res.data
}

export const getDecisionChart = async (symbol: string, timeframe = '5m', limit = 240) => {
  const res = await http.get(`/api/v1/decisions/live/${symbol}/chart`, { params: { timeframe, limit } })
  return res.data
}

export const getRecentDecisionEvents = async (limit = 30, timeframe = '5m') => {
  const res = await http.get('/api/v1/decisions/recent-events', { params: { limit, timeframe } })
  return res.data
}

export const getLatestPlans = async (limit = 20, timeframe = '5m') => {
  const res = await http.get('/api/v1/plans/latest', { params: { limit, timeframe } })
  return res.data
}

export const scanDecisions = async (timeframe?: string) => {
  const res = await http.post('/api/v1/decisions/scan', null, { params: timeframe ? { timeframe } : {} })
  return res.data
}

