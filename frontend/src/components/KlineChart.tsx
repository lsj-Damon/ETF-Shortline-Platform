import { Card, Radio } from 'antd'
import * as echarts from 'echarts'
import { useEffect, useRef, useState } from 'react'

interface Bar {
  ts: string
  open: number
  high: number
  low: number
  close: number
  [key: string]: any
}

interface ChartData {
  bars?: Bar[]
  buy_signals?: string[]
  sell_signals?: string[]
  equity_curve?: { ts: string; equity: number }[]
  benchmark_curve?: { ts: string; equity: number }[]
}

type SubPane = 'volume' | 'macd' | 'kdj'

function tsLabel(ts: string): string {
  // Shorten ISO timestamps to 'YYYY-MM-DD' for daily bars
  return ts.length > 10 ? ts.slice(0, 10) : ts
}

function safeNum(v: any): number | null {
  if (v == null || v === '') return null
  const n = +v
  return isFinite(n) ? n : null
}

export default function KlineChart({ chart, selectedTrade }: { chart: ChartData | null; selectedTrade?: any }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<echarts.ECharts | null>(null)
  const [subPane, setSubPane] = useState<SubPane>('volume')

  useEffect(() => {
    if (!containerRef.current) return
    chartRef.current = echarts.init(containerRef.current, undefined, { renderer: 'canvas' })
    return () => { chartRef.current?.dispose() }
  }, [])

  useEffect(() => {
    const instance = chartRef.current
    if (!instance) return

    const bars: Bar[] = chart?.bars ?? []
    const buySet = new Set(chart?.buy_signals ?? [])
    const sellSet = new Set(chart?.sell_signals ?? [])
    const equityCurve = chart?.equity_curve ?? []
    const benchmarkCurve = chart?.benchmark_curve ?? []

    if (bars.length === 0) { instance.clear(); return }

    const labels = bars.map((b) => tsLabel(String(b.ts)))
    const candleData = bars.map((b) => [+b.open, +b.close, +b.low, +b.high])
    const ma5Data = bars.map((b) => safeNum(b.ma5))
    const ma10Data = bars.map((b) => safeNum(b.ma10))
    const ma20Data = bars.map((b) => safeNum(b.ma20))
    const bollUpper = bars.map((b) => safeNum(b.boll_upper))
    const bollMid = bars.map((b) => safeNum(b.boll_mid))
    const bollLower = bars.map((b) => safeNum(b.boll_lower))
    const volumeData = bars.map((b) => +b.volume || 0)
    const macdData = bars.map((b) => safeNum(b.macd))
    const macdSignal = bars.map((b) => safeNum(b.macd_signal))
    const macdHist = bars.map((b) => safeNum(b.macd_hist))
    const kdjK = bars.map((b) => safeNum(b.kdj_k))
    const kdjD = bars.map((b) => safeNum(b.kdj_d))
    const kdjJ = bars.map((b) => safeNum(b.kdj_j))
    const equityLabels = equityCurve.map((e) => tsLabel(String(e.ts)))
    const equityData = equityCurve.map((e) => +e.equity)
    const benchmarkData = benchmarkCurve.map((e) => +e.equity)

    const buyMarkers = bars
      .map((b, i) => buySet.has(String(b.ts)) ? { coord: [labels[i], +b.low * 0.995], value: 'B' } : null)
      .filter(Boolean)
    const sellMarkers = bars
      .map((b, i) => sellSet.has(String(b.ts)) ? { coord: [labels[i], +b.high * 1.005], value: 'S' } : null)
      .filter(Boolean)

    const markLines: any[] = []
    if (selectedTrade) {
      const el = tsLabel(String(selectedTrade.entry_time))
      const xl = tsLabel(String(selectedTrade.exit_time))
      markLines.push(
        [{ xAxis: el, lineStyle: { color: '#52c41a', type: 'dashed' } }, { xAxis: el }],
        [{ xAxis: xl, lineStyle: { color: '#ff4d4f', type: 'dashed' } }, { xAxis: xl }],
      )
    }

    // Sub-pane series
    const subSeries: any[] = subPane === 'macd'
      ? [
          { name: 'MACD', type: 'line', xAxisIndex: 1, yAxisIndex: 1, data: macdData, lineStyle: { width: 1, color: '#1677ff' }, showSymbol: false },
          { name: 'Signal', type: 'line', xAxisIndex: 1, yAxisIndex: 1, data: macdSignal, lineStyle: { width: 1, color: '#ff7a00' }, showSymbol: false },
          {
            name: 'Hist', type: 'bar', xAxisIndex: 1, yAxisIndex: 1, data: macdHist,
            itemStyle: { color: (p: any) => (macdHist[p.dataIndex] ?? 0) >= 0 ? '#ef232a' : '#14b143' },
          },
        ]
      : subPane === 'kdj'
      ? [
          { name: 'K', type: 'line', xAxisIndex: 1, yAxisIndex: 1, data: kdjK, lineStyle: { width: 1, color: '#1677ff' }, showSymbol: false },
          { name: 'D', type: 'line', xAxisIndex: 1, yAxisIndex: 1, data: kdjD, lineStyle: { width: 1, color: '#ff7a00' }, showSymbol: false },
          { name: 'J', type: 'line', xAxisIndex: 1, yAxisIndex: 1, data: kdjJ, lineStyle: { width: 1, color: '#a855f7' }, showSymbol: false },
        ]
      : [
          {
            name: '成交量', type: 'bar', xAxisIndex: 1, yAxisIndex: 1, data: volumeData,
            itemStyle: { color: (p: any) => +bars[p.dataIndex].close >= +bars[p.dataIndex].open ? '#ef232a' : '#14b143' },
          },
        ]

    const legendData = ['K线', 'MA5', 'MA10', 'MA20', '布林上轨', '布林中轨', '布林下轨', '资金曲线', '基准(持有)']

    const option: echarts.EChartsOption = {
      animation: false,
      tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
      legend: { data: legendData, top: 4, textStyle: { fontSize: 11 } },
      axisPointer: { link: [{ xAxisIndex: 'all' }] },
      grid: [
        { left: 60, right: 60, top: 40, height: '44%' },
        { left: 60, right: 60, top: '58%', height: '14%' },
        { left: 60, right: 60, top: '76%', height: '16%' },
      ],
      xAxis: [
        { type: 'category', data: labels, gridIndex: 0, axisLabel: { show: false }, scale: true },
        { type: 'category', data: labels, gridIndex: 1, axisLabel: { show: false }, scale: true },
        { type: 'category', data: equityLabels, gridIndex: 2, scale: true, axisLabel: { fontSize: 10 } },
      ],
      yAxis: [
        { scale: true, gridIndex: 0, splitNumber: 4 },
        { scale: true, gridIndex: 1, splitNumber: 2 },
        { scale: true, gridIndex: 2, splitNumber: 2 },
      ],
      dataZoom: [
        { type: 'inside', xAxisIndex: [0, 1], start: Math.max(0, 100 - Math.round(120 / bars.length * 100)), end: 100 },
        { type: 'slider', xAxisIndex: [0, 1], bottom: 4, height: 18 },
      ],
      series: [
        {
          name: 'K线', type: 'candlestick', xAxisIndex: 0, yAxisIndex: 0, data: candleData,
          itemStyle: { color: '#ef232a', color0: '#14b143', borderColor: '#ef232a', borderColor0: '#14b143' },
          markPoint: {
            symbolSize: 26,
            data: [
              ...buyMarkers.map((m: any) => ({ ...m, itemStyle: { color: '#52c41a' }, label: { color: '#fff', fontSize: 10 } })),
              ...sellMarkers.map((m: any) => ({ ...m, itemStyle: { color: '#ff4d4f' }, label: { color: '#fff', fontSize: 10 } })),
            ],
          },
          markLine: markLines.length ? { silent: true, symbol: 'none', data: markLines } : undefined,
        },
        { name: 'MA5', type: 'line', xAxisIndex: 0, yAxisIndex: 0, data: ma5Data, smooth: true, lineStyle: { width: 1 }, showSymbol: false },
        { name: 'MA10', type: 'line', xAxisIndex: 0, yAxisIndex: 0, data: ma10Data, smooth: true, lineStyle: { width: 1 }, showSymbol: false },
        { name: 'MA20', type: 'line', xAxisIndex: 0, yAxisIndex: 0, data: ma20Data, smooth: true, lineStyle: { width: 1 }, showSymbol: false },
        { name: '布林上轨', type: 'line', xAxisIndex: 0, yAxisIndex: 0, data: bollUpper, lineStyle: { width: 1, type: 'dashed', color: '#aaa' }, showSymbol: false },
        { name: '布林中轨', type: 'line', xAxisIndex: 0, yAxisIndex: 0, data: bollMid, lineStyle: { width: 1, type: 'dashed', color: '#999' }, showSymbol: false },
        { name: '布林下轨', type: 'line', xAxisIndex: 0, yAxisIndex: 0, data: bollLower, lineStyle: { width: 1, type: 'dashed', color: '#aaa' }, showSymbol: false },
        ...subSeries,
        {
          name: '资金曲线', type: 'line', xAxisIndex: 2, yAxisIndex: 2, data: equityData,
          smooth: true, lineStyle: { width: 1.5, color: '#1677ff' }, showSymbol: false,
          areaStyle: { color: 'rgba(22,119,255,0.08)' },
        },
        {
          name: '基准(持有)', type: 'line', xAxisIndex: 2, yAxisIndex: 2, data: benchmarkData,
          smooth: true, lineStyle: { width: 1.5, color: '#aaa', type: 'dashed' }, showSymbol: false,
        },
      ],
    }

    instance.setOption(option, { notMerge: true })
  }, [chart, selectedTrade, subPane])

  useEffect(() => {
    const observer = new ResizeObserver(() => chartRef.current?.resize())
    if (containerRef.current) observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  return (
    <Card
      title="K线图 & 买卖点"
      styles={{ body: { padding: 8 } }}
      extra={
        <Radio.Group size="small" value={subPane} onChange={(e) => setSubPane(e.target.value)}>
          <Radio.Button value="volume">成交量</Radio.Button>
          <Radio.Button value="macd">MACD</Radio.Button>
          <Radio.Button value="kdj">KDJ</Radio.Button>
        </Radio.Group>
      }
    >
      <div ref={containerRef} style={{ width: '100%', height: 560 }} />
    </Card>
  )
}
