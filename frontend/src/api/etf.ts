import http from './http'

export interface EtfItem {
  symbol: string
  name: string
  market: string
  category: string
  status: string
}

export interface ImportPayload {
  symbol: string
  timeframe: string
  start_date: string
  end_date: string
  source: string
}

export const getDataSources = async () => {
  const res = await http.get('/api/v1/data-sources')
  return res.data
}

export const getEtfList = async () => {
  const res = await http.get('/api/v1/etfs')
  return res.data as EtfItem[]
}

export const importEtfHistory = async (payload: ImportPayload) => {
  const res = await http.post('/api/v1/etfs/import-history', payload)
  return res.data
}

export const getEtfBars = async (symbol: string, timeframe = 'daily') => {
  const res = await http.get(`/api/v1/etfs/${symbol}/bars`, { params: { timeframe } })
  return res.data
}

export const getEtfQuote = async (symbol: string) => {
  const res = await http.get(`/api/v1/etfs/${symbol}/quote`)
  return res.data
}
