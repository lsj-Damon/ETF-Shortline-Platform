import http from './http'

export const getLiveDecisions = async (limit = 20) => {
  const res = await http.get('/api/v1/decisions/live', { params: { limit } })
  return res.data
}

export const getDecisionDetail = async (symbol: string) => {
  const res = await http.get(`/api/v1/decisions/live/${symbol}`)
  return res.data
}

export const getRecentDecisionEvents = async (limit = 30) => {
  const res = await http.get('/api/v1/decisions/recent-events', { params: { limit } })
  return res.data
}

export const getLatestPlans = async (limit = 20) => {
  const res = await http.get('/api/v1/plans/latest', { params: { limit } })
  return res.data
}

export const scanDecisions = async () => {
  const res = await http.post('/api/v1/decisions/scan')
  return res.data
}
