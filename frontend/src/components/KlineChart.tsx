import { Card, Empty, Radio, Space, Tag, Typography } from 'antd'
import * as echarts from 'echarts'
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

interface Bar {
  ts: string
  open: number
  high: number
  low: number
  close: number
  [key: string]: any
}

interface Marker {
  ts: string
  side: 'buy' | 'sell'
  kind?: string
  label?: string
  price?: number
  reason?: string
  score?: number
}

interface RangeLevel {
  low?: number
  high?: number
}

interface ChartLevels {
  buy_zone?: RangeLevel
  sell_zone?: RangeLevel
  breakout_trigger?: number
  stop_loss?: number
  take_profit?: number
  support?: number
  resistance?: number
}

interface ChartMeta {
  is_realtime?: boolean
  source?: string
  insufficient_bars?: boolean
  has_candidates?: boolean
}

interface ChartData {
  bars?: Bar[]
  markers?: Marker[]
  levels?: ChartLevels
  meta?: ChartMeta
  buy_signals?: string[]
  sell_signals?: string[]
  equity_curve?: { ts: string; equity: number }[]
  benchmark_curve?: { ts: string; equity: number }[]
}

interface KlineChartProps {
  chart: ChartData | null
  selectedTrade?: any
  title?: string
  height?: number
  hideCard?: boolean
  extra?: ReactNode
}

type SubPane = 'volume' | 'macd' | 'kdj'

function tsKey(ts: string): string {
  const normalized = String(ts ?? '').replace('T', ' ')
  return normalized.length > 16 ? normalized.slice(0, 16) : normalized
}

function safeNum(v: any): number | null {
  if (v == null || v === '') return null
  const n = +v
  return isFinite(n) ? n : null
}

function formatPrice(value?: number | null): string {
  if (value == null || !isFinite(value)) return '--'
  return Number(value).toFixed(4)
}

function markerTooltip(params: any): string {
  const data = params?.data || {}
  const title = data.label || (data.side === 'buy' ? '候选买点' : '候选卖点')
  const reason = data.reason ? `<br/>${data.reason}` : ''
  return `${title}<br/>时间 ${data.ts || '--'}<br/>价格 ${formatPrice(data.price)}${reason}`
}

function buildLegacyMarkers(chart: ChartData | null, bars: Bar[]): Marker[] {
  const buySet = new Set(chart?.buy_signals ?? [])
  const sellSet = new Set(chart?.sell_signals ?? [])
  return bars.flatMap((bar) => {
    const items: Marker[] = []
    if (buySet.has(String(bar.ts))) {
      items.push({
        ts: String(bar.ts),
        side: 'buy',
        label: '买入信号',
        price: safeNum(bar.low) ?? safeNum(bar.close) ?? undefined,
        reason: '回测/信号分析买入点',
      })
    }
    if (sellSet.has(String(bar.ts))) {
      items.push({
        ts: String(bar.ts),
        side: 'sell',
        label: '卖出信号',
        price: safeNum(bar.high) ?? safeNum(bar.close) ?? undefined,
        reason: '回测/信号分析卖出点',
      })
    }
    return items
  })
}

export default function KlineChart({
  chart,
  selectedTrade,
  title = 'K线图 & 买卖点',
  height,
  hideCard = false,
  extra,
}: KlineChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<echarts.ECharts | null>(null)
  const [subPane, setSubPane] = useState<SubPane>('volume')

  useEffect(() => {
    if (!containerRef.current) return
    chartRef.current = echarts.init(containerRef.current, undefined, { renderer: 'canvas' })
    return () => {
      chartRef.current?.dispose()
    }
  }, [])

  useEffect(() => {
    const instance = chartRef.current
    if (!instance) return

    const bars: Bar[] = chart?.bars ?? []
    const equityCurve = chart?.equity_curve ?? []
    const benchmarkCurve = chart?.benchmark_curve ?? []
    const showPerformance = equityCurve.length > 0 || benchmarkCurve.length > 0
    const rawMarkers = (chart?.markers && chart.markers.length > 0) ? chart.markers : buildLegacyMarkers(chart, bars)

    if (bars.length === 0) {
      instance.clear()
      return
    }

    const labels = bars.map((b) => tsKey(String(b.ts)))
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
    const equityLabels = equityCurve.map((e) => tsKey(String(e.ts)))
    const equityData = equityCurve.map((e) => +e.equity)
    const benchmarkData = benchmarkCurve.map((e) => +e.equity)

    const barIndexByTs = new Map(labels.map((label, index) => [label, index]))
    const buyMarkers = rawMarkers
      .filter((marker) => marker.side === 'buy')
      .map((marker) => {
        const key = tsKey(String(marker.ts))
        const bar = barIndexByTs.has(key) ? bars[barIndexByTs.get(key)!] : null
        const fallbackPrice = bar ? (safeNum(bar.low) ?? safeNum(bar.close)) : null
        return {
          value: [key, safeNum(marker.price) ?? fallbackPrice ?? 0],
          ts: marker.ts,
          side: marker.side,
          kind: marker.kind,
          label: marker.label || '候选买点',
          reason: marker.reason,
          price: safeNum(marker.price) ?? fallbackPrice ?? 0,
        }
      })
      .filter((item) => item.value[1] > 0)
    const sellMarkers = rawMarkers
      .filter((marker) => marker.side === 'sell')
      .map((marker) => {
        const key = tsKey(String(marker.ts))
        const bar = barIndexByTs.has(key) ? bars[barIndexByTs.get(key)!] : null
        const fallbackPrice = bar ? (safeNum(bar.high) ?? safeNum(bar.close)) : null
        return {
          value: [key, safeNum(marker.price) ?? fallbackPrice ?? 0],
          ts: marker.ts,
          side: marker.side,
          kind: marker.kind,
          label: marker.label || '候选卖点',
          reason: marker.reason,
          price: safeNum(marker.price) ?? fallbackPrice ?? 0,
        }
      })
      .filter((item) => item.value[1] > 0)

    const markLines: any[] = []
    const levels = chart?.levels
    const lineConfigs = [
      { value: safeNum(levels?.buy_zone?.low), label: '买区下沿', color: '#0f8a5f', type: 'dashed' },
      { value: safeNum(levels?.buy_zone?.high), label: '买区上沿', color: '#0f8a5f', type: 'dashed' },
      { value: safeNum(levels?.sell_zone?.low), label: '卖区下沿', color: '#c43d3d', type: 'dashed' },
      { value: safeNum(levels?.sell_zone?.high), label: '卖区上沿', color: '#c43d3d', type: 'dashed' },
      { value: safeNum(levels?.breakout_trigger), label: '突破价', color: '#1677ff', type: 'solid' },
      { value: safeNum(levels?.stop_loss), label: '止损位', color: '#d97706', type: 'solid' },
    ]
    lineConfigs.forEach((item) => {
      if (!item.value) return
      markLines.push({
        yAxis: item.value,
        lineStyle: { color: item.color, type: item.type, width: 1 },
        label: {
          show: true,
          formatter: `${item.label} ${formatPrice(item.value)}`,
          color: item.color,
        },
      })
    })
    if (selectedTrade) {
      const entryLabel = tsKey(String(selectedTrade.entry_time))
      const exitLabel = tsKey(String(selectedTrade.exit_time))
      markLines.push(
        [{ xAxis: entryLabel, lineStyle: { color: '#52c41a', type: 'dashed' } }, { xAxis: entryLabel }],
        [{ xAxis: exitLabel, lineStyle: { color: '#ff4d4f', type: 'dashed' } }, { xAxis: exitLabel }],
      )
    }

    const subSeries: any[] = subPane === 'macd'
      ? [
          { name: 'MACD', type: 'line', xAxisIndex: 1, yAxisIndex: 1, data: macdData, lineStyle: { width: 1, color: '#1677ff' }, showSymbol: false },
          { name: 'Signal', type: 'line', xAxisIndex: 1, yAxisIndex: 1, data: macdSignal, lineStyle: { width: 1, color: '#ff7a00' }, showSymbol: false },
          {
            name: 'Hist',
            type: 'bar',
            xAxisIndex: 1,
            yAxisIndex: 1,
            data: macdHist,
            itemStyle: { color: (p: any) => (macdHist[p.dataIndex] ?? 0) >= 0 ? '#ef232a' : '#14b143' },
          },
        ]
      : subPane === 'kdj'
      ? [
          { name: 'K', type: 'line', xAxisIndex: 1, yAxisIndex: 1, data: kdjK, lineStyle: { width: 1, color: '#1677ff' }, showSymbol: false },
          { name: 'D', type: 'line', xAxisIndex: 1, yAxisIndex: 1, data: kdjD, lineStyle: { width: 1, color: '#ff7a00' }, showSymbol: false },
          { name: 'J', type: 'line', xAxisIndex: 1, yAxisIndex: 1, data: kdjJ, lineStyle: { width: 1, color: '#7c3aed' }, showSymbol: false },
        ]
      : [
          {
            name: '成交量',
            type: 'bar',
            xAxisIndex: 1,
            yAxisIndex: 1,
            data: volumeData,
            itemStyle: { color: (p: any) => +bars[p.dataIndex].close >= +bars[p.dataIndex].open ? '#ef232a' : '#14b143' },
          },
        ]

    const series: any[] = [
      {
        name: 'K线',
        type: 'candlestick',
        xAxisIndex: 0,
        yAxisIndex: 0,
        data: candleData,
        itemStyle: { color: '#ef232a', color0: '#14b143', borderColor: '#ef232a', borderColor0: '#14b143' },
        markLine: markLines.length ? { silent: true, symbol: 'none', data: markLines } : undefined,
      },
      { name: 'MA5', type: 'line', xAxisIndex: 0, yAxisIndex: 0, data: ma5Data, smooth: true, lineStyle: { width: 1 }, showSymbol: false },
      { name: 'MA10', type: 'line', xAxisIndex: 0, yAxisIndex: 0, data: ma10Data, smooth: true, lineStyle: { width: 1 }, showSymbol: false },
      { name: 'MA20', type: 'line', xAxisIndex: 0, yAxisIndex: 0, data: ma20Data, smooth: true, lineStyle: { width: 1 }, showSymbol: false },
      { name: '布林上轨', type: 'line', xAxisIndex: 0, yAxisIndex: 0, data: bollUpper, lineStyle: { width: 1, type: 'dashed', color: '#aaa' }, showSymbol: false },
      { name: '布林中轨', type: 'line', xAxisIndex: 0, yAxisIndex: 0, data: bollMid, lineStyle: { width: 1, type: 'dashed', color: '#999' }, showSymbol: false },
      { name: '布林下轨', type: 'line', xAxisIndex: 0, yAxisIndex: 0, data: bollLower, lineStyle: { width: 1, type: 'dashed', color: '#aaa' }, showSymbol: false },
      {
        name: '候选买点',
        type: 'scatter',
        xAxisIndex: 0,
        yAxisIndex: 0,
        data: buyMarkers,
        symbolSize: 18,
        itemStyle: { color: '#0f8a5f' },
        label: { show: true, formatter: 'B', color: '#fff', fontSize: 10, fontWeight: 700 },
        tooltip: { trigger: 'item', formatter: markerTooltip },
      },
      {
        name: '候选卖点',
        type: 'scatter',
        xAxisIndex: 0,
        yAxisIndex: 0,
        data: sellMarkers,
        symbolSize: 18,
        itemStyle: { color: '#c43d3d' },
        label: { show: true, formatter: 'S', color: '#fff', fontSize: 10, fontWeight: 700 },
        tooltip: { trigger: 'item', formatter: markerTooltip },
      },
      ...subSeries,
    ]

    if (showPerformance) {
      series.push(
        {
          name: '资金曲线',
          type: 'line',
          xAxisIndex: 2,
          yAxisIndex: 2,
          data: equityData,
          smooth: true,
          lineStyle: { width: 1.5, color: '#1677ff' },
          showSymbol: false,
          areaStyle: { color: 'rgba(22,119,255,0.08)' },
        },
        {
          name: '基准(持有)',
          type: 'line',
          xAxisIndex: 2,
          yAxisIndex: 2,
          data: benchmarkData,
          smooth: true,
          lineStyle: { width: 1.5, color: '#aaa', type: 'dashed' },
          showSymbol: false,
        },
      )
    }

    const legendData = [
      'K线',
      'MA5',
      'MA10',
      'MA20',
      '布林上轨',
      '布林中轨',
      '布林下轨',
      ...(buyMarkers.length ? ['候选买点'] : []),
      ...(sellMarkers.length ? ['候选卖点'] : []),
      ...(showPerformance ? ['资金曲线', '基准(持有)'] : []),
    ]

    const option: echarts.EChartsOption = {
      animation: false,
      tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
      legend: { data: legendData, top: 4, textStyle: { fontSize: 11 } },
      axisPointer: { link: [{ xAxisIndex: 'all' }] },
      grid: showPerformance
        ? [
            { left: 60, right: 60, top: 40, height: '44%' },
            { left: 60, right: 60, top: '58%', height: '14%' },
            { left: 60, right: 60, top: '76%', height: '16%' },
          ]
        : [
            { left: 60, right: 60, top: 40, height: '56%' },
            { left: 60, right: 60, top: '70%', height: '18%' },
          ],
      xAxis: showPerformance
        ? [
            { type: 'category', data: labels, gridIndex: 0, axisLabel: { show: false }, scale: true },
            { type: 'category', data: labels, gridIndex: 1, axisLabel: { show: false }, scale: true },
            { type: 'category', data: equityLabels, gridIndex: 2, scale: true, axisLabel: { fontSize: 10 } },
          ]
        : [
            { type: 'category', data: labels, gridIndex: 0, axisLabel: { show: false }, scale: true },
            { type: 'category', data: labels, gridIndex: 1, scale: true, axisLabel: { fontSize: 10 } },
          ],
      yAxis: showPerformance
        ? [
            { scale: true, gridIndex: 0, splitNumber: 4 },
            { scale: true, gridIndex: 1, splitNumber: 2 },
            { scale: true, gridIndex: 2, splitNumber: 2 },
          ]
        : [
            { scale: true, gridIndex: 0, splitNumber: 4 },
            { scale: true, gridIndex: 1, splitNumber: 2 },
          ],
      dataZoom: [
        { type: 'inside', xAxisIndex: [0, 1], start: Math.max(0, 100 - Math.round(120 / bars.length * 100)), end: 100 },
        { type: 'slider', xAxisIndex: [0, 1], bottom: 4, height: 18 },
      ],
      series,
    }

    instance.setOption(option, { notMerge: true })
  }, [chart, selectedTrade, subPane])

  useEffect(() => {
    const observer = new ResizeObserver(() => chartRef.current?.resize())
    if (containerRef.current) observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  const bars = chart?.bars ?? []
  const chartHeight = height ?? ((chart?.equity_curve?.length || chart?.benchmark_curve?.length) ? 560 : 460)
  const statusTags = (
    <Space size={8} wrap>
      {chart?.meta?.is_realtime != null && (
        <Tag color={chart.meta.is_realtime ? 'green' : 'gold'}>
          {chart.meta.is_realtime ? '实时' : '本地回退'}
        </Tag>
      )}
      {chart?.meta?.has_candidates === false && bars.length > 0 && <Tag>暂无候选点</Tag>}
      {chart?.meta?.source && <Tag>{chart.meta.source}</Tag>}
    </Space>
  )
  const toolbar = (
    <Space size={8} wrap>
      {extra}
      {statusTags}
      <Radio.Group size="small" value={subPane} onChange={(e) => setSubPane(e.target.value)}>
        <Radio.Button value="volume">成交量</Radio.Button>
        <Radio.Button value="macd">MACD</Radio.Button>
        <Radio.Button value="kdj">KDJ</Radio.Button>
      </Radio.Group>
    </Space>
  )

  const content = (
    <div style={{ position: 'relative' }}>
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: chartHeight,
          visibility: bars.length > 0 ? 'visible' : 'hidden',
        }}
      />
      {bars.length === 0 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            minHeight: Math.max(chartHeight - 40, 220),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Empty description={chart?.meta?.insufficient_bars ? '数据不足，无法生成候选买卖点' : '暂无 K 线数据'} />
        </div>
      )}
    </div>
  )

  if (hideCard) {
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
          {title ? <Typography.Text strong>{title}</Typography.Text> : <span />}
          {toolbar}
        </div>
        {content}
      </div>
    )
  }

  return (
    <Card title={title} styles={{ body: { padding: 8 } }} extra={toolbar}>
      {content}
    </Card>
  )
}
