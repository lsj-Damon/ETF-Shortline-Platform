import { Card, Radio } from 'antd'
import * as echarts from 'echarts'
import { useEffect, useRef, useState } from 'react'

type Metric = 'total_return' | 'alpha' | 'sharpe' | 'max_drawdown' | 'calmar'

const METRIC_LABELS: Record<Metric, string> = {
  total_return: '策略收益',
  alpha: '超额收益 α',
  sharpe: 'Sharpe',
  max_drawdown: '最大回撤',
  calmar: 'Calmar',
}

interface Props {
  items: any[]
}

export default function OptimizationHeatmap({ items }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<echarts.ECharts | null>(null)
  const [metric, setMetric] = useState<Metric>('total_return')

  useEffect(() => {
    if (!containerRef.current) return
    chartRef.current = echarts.init(containerRef.current, undefined, { renderer: 'canvas' })
    return () => { chartRef.current?.dispose() }
  }, [])

  useEffect(() => {
    const instance = chartRef.current
    if (!instance || items.length === 0) { instance?.clear(); return }

    const fastVals = [...new Set(items.map((d) => d.ma_fast))].sort((a, b) => a - b)
    const slowVals = [...new Set(items.map((d) => d.ma_slow))].sort((a, b) => a - b)

    const data = items.map((d) => {
      const raw = d[metric] as number
      const v = metric === 'max_drawdown' ? -raw : raw  // flip drawdown so bigger = better = warmer
      return [fastVals.indexOf(d.ma_fast), slowVals.indexOf(d.ma_slow), raw, v]
    })

    const vArr = data.map((d) => d[3] as number)
    const minV = Math.min(...vArr)
    const maxV = Math.max(...vArr)

    const option: echarts.EChartsOption = {
      animation: false,
      tooltip: {
        formatter: (p: any) => {
          const [fi, si, raw] = p.data
          const label = metric === 'max_drawdown' || metric === 'total_return' || metric === 'alpha'
            ? `${(raw * 100).toFixed(2)}%`
            : Number(raw).toFixed(3)
          return `快线 MA${fastVals[fi]}  慢线 MA${slowVals[si]}<br/>${METRIC_LABELS[metric]}: ${label}`
        },
      },
      grid: { left: 60, right: 80, top: 40, bottom: 40 },
      xAxis: {
        type: 'category',
        data: fastVals.map((v) => `MA${v}`),
        name: '快线',
        axisLabel: { fontSize: 11 },
      },
      yAxis: {
        type: 'category',
        data: slowVals.map((v) => `MA${v}`),
        name: '慢线',
        axisLabel: { fontSize: 11 },
      },
      visualMap: {
        min: minV,
        max: maxV,
        calculable: true,
        orient: 'vertical',
        right: 8,
        top: 'center',
        inRange: { color: ['#14b143', '#fffbe6', '#ef232a'] },
      },
      series: [{
        type: 'heatmap',
        data: data.map(([x, y, raw, v]) => [x, y, v, raw]),
        label: {
          show: fastVals.length <= 8 && slowVals.length <= 8,
          fontSize: 10,
          formatter: (p: any) => {
            const raw = p.data[3] as number
            return metric === 'max_drawdown' || metric === 'total_return' || metric === 'alpha'
              ? `${(raw * 100).toFixed(1)}%`
              : Number(raw).toFixed(2)
          },
        },
        emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,.5)' } },
      }],
    }

    instance.setOption(option, { notMerge: true })
  }, [items, metric])

  useEffect(() => {
    const observer = new ResizeObserver(() => chartRef.current?.resize())
    if (containerRef.current) observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  if (items.length === 0) return null

  return (
    <Card
      title="参数热力图"
      style={{ marginTop: 16 }}
      extra={
        <Radio.Group size="small" value={metric} onChange={(e) => setMetric(e.target.value)}>
          {(Object.keys(METRIC_LABELS) as Metric[]).map((k) => (
            <Radio.Button key={k} value={k}>{METRIC_LABELS[k]}</Radio.Button>
          ))}
        </Radio.Group>
      }
    >
      <div ref={containerRef} style={{ width: '100%', height: 340 }} />
    </Card>
  )
}
