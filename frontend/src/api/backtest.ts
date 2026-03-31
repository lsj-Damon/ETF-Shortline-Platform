import http from './http'

export const runBacktest = async (payload: any) => {
  const res = await http.post('/api/v1/backtests/run', payload)
  return res.data
}

/** Poll until job status is 'finished' or 'failed'. Rejects on failure. */
export const waitForBacktest = async (jobId: number, intervalMs = 800, timeoutMs = 120_000): Promise<void> => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const res = await http.get(`/api/v1/backtests/${jobId}/status`)
    const { status, error } = res.data
    if (status === 'finished') return
    if (status === 'failed') throw new Error(error || '回测执行失败')
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  throw new Error('回测超时，请检查数据是否已导入')
}

export const getBacktestResult = async (jobId: number) => {
  const res = await http.get(`/api/v1/backtests/${jobId}`)
  return res.data
}

export const getBacktestTrades = async (jobId: number) => {
  const res = await http.get(`/api/v1/backtests/${jobId}/trades`)
  return res.data
}

export const getBacktestChart = async (jobId: number) => {
  const res = await http.get(`/api/v1/backtests/${jobId}/chart`)
  return res.data
}

export const runOptimization = async (payload: any) => {
  const res = await http.post('/api/v1/optimizations/run', payload)
  return res.data
}
