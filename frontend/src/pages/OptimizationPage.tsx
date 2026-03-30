import { Button, Card, DatePicker, Form, InputNumber, message, Select, Table } from 'antd'
import dayjs from 'dayjs'
import { useEffect, useState } from 'react'
import { runOptimization } from '../api/backtest'
import { getStrategyList } from '../api/strategy'
import OptimizationHeatmap from '../components/OptimizationHeatmap'

function pct(v: number | null | undefined) {
  if (v == null) return '-'
  return `${(v * 100).toFixed(2)}%`
}

const { RangePicker } = DatePicker

export default function OptimizationPage() {
  const [strategies, setStrategies] = useState<any[]>([])
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    getStrategyList().then(setStrategies)
  }, [])

  const onFinish = async (values: any) => {
    const strategy = strategies.find((s) => s.id === values.strategy_id)
    if (!strategy) { message.error('请先选择策略'); return }
    setLoading(true)
    try {
      const res = await runOptimization({
        strategy_id: values.strategy_id,
        symbol: strategy.symbol,
        timeframe: strategy.timeframe,
        start_date: values.date_range[0].format('YYYY-MM-DD'),
        end_date: values.date_range[1].format('YYYY-MM-DD'),
        ma_fast_list: [values.fast1, values.fast2, values.fast3].filter(Boolean),
        ma_slow_list: [values.slow1, values.slow2, values.slow3].filter(Boolean),
      })
      setItems(Array.isArray(res) ? res : (res.items || []))
      message.success('参数优化完成')
    } catch (e: any) {
      message.error(e?.response?.data?.detail || '参数优化失败')
    } finally {
      setLoading(false)
    }
  }

  const columns = [
    { title: '快线', dataIndex: 'ma_fast', width: 70, sorter: (a: any, b: any) => a.ma_fast - b.ma_fast },
    { title: '慢线', dataIndex: 'ma_slow', width: 70, sorter: (a: any, b: any) => a.ma_slow - b.ma_slow },
    {
      title: '策略收益', dataIndex: 'total_return', width: 100,
      render: (v: number) => <span style={{ color: v >= 0 ? '#cf1322' : '#389e0d' }}>{pct(v)}</span>,
      sorter: (a: any, b: any) => a.total_return - b.total_return,
      defaultSortOrder: 'descend' as const,
    },
    { title: '基准收益', dataIndex: 'benchmark_return', width: 100, render: (v: number) => pct(v) },
    {
      title: 'Alpha', dataIndex: 'alpha', width: 90,
      render: (v: number) => <span style={{ color: v >= 0 ? '#cf1322' : '#389e0d' }}>{pct(v)}</span>,
      sorter: (a: any, b: any) => a.alpha - b.alpha,
    },
    {
      title: '最大回撤', dataIndex: 'max_drawdown', width: 100,
      render: (v: number) => <span style={{ color: '#cf1322' }}>{pct(v)}</span>,
      sorter: (a: any, b: any) => a.max_drawdown - b.max_drawdown,
    },
    {
      title: 'Sharpe', dataIndex: 'sharpe', width: 80,
      render: (v: number) => v?.toFixed(3) ?? '-',
      sorter: (a: any, b: any) => a.sharpe - b.sharpe,
    },
    {
      title: 'Calmar', dataIndex: 'calmar', width: 80,
      render: (v: number) => v?.toFixed(3) ?? '-',
      sorter: (a: any, b: any) => a.calmar - b.calmar,
    },
    { title: '胜率', dataIndex: 'win_rate', width: 80, render: (v: number) => pct(v) },
    { title: '交易次数', dataIndex: 'trade_count', width: 80 },
  ]

  return (
    <div>
      <Card title="参数优化" style={{ marginBottom: 16 }}>
        <Form
          layout="inline"
          onFinish={onFinish}
          initialValues={{
            fast1: 5, fast2: 10, fast3: 15,
            slow1: 20, slow2: 30, slow3: 40,
            date_range: [dayjs('2024-01-01'), dayjs('2024-12-31')],
          }}
        >
          <Form.Item name="strategy_id" label="策略" rules={[{ required: true }]}>
            <Select style={{ width: 240 }} options={strategies.map((s) => ({ value: s.id, label: `${s.name} (${s.symbol})` }))} />
          </Form.Item>
          <Form.Item name="date_range" label="区间" rules={[{ required: true }]}>
            <RangePicker />
          </Form.Item>
          <Form.Item name="fast1" label="快线"><InputNumber style={{ width: 64 }} /></Form.Item>
          <Form.Item name="fast2"><InputNumber style={{ width: 64 }} /></Form.Item>
          <Form.Item name="fast3"><InputNumber style={{ width: 64 }} /></Form.Item>
          <Form.Item name="slow1" label="慢线"><InputNumber style={{ width: 64 }} /></Form.Item>
          <Form.Item name="slow2"><InputNumber style={{ width: 64 }} /></Form.Item>
          <Form.Item name="slow3"><InputNumber style={{ width: 64 }} /></Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading}>开始优化</Button>
          </Form.Item>
        </Form>
      </Card>
      <OptimizationHeatmap items={items} />
      <Card title={`优化结果（共 ${items.length} 组）`} style={{ marginTop: 16 }}>
        <Table
          rowKey={(row) => `${row.ma_fast}-${row.ma_slow}`}
          dataSource={items}
          columns={columns}
          pagination={{ pageSize: 10 }}
          size="small"
          scroll={{ x: 780 }}
        />
      </Card>
    </div>
  )
}
