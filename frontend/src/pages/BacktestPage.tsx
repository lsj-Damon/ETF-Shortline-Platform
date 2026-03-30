import { Button, Card, Col, DatePicker, Form, InputNumber, message, Row, Select, Spin } from 'antd'
import dayjs from 'dayjs'
import { useEffect, useState } from 'react'
import { getStrategyList } from '../api/strategy'
import { getBacktestChart, getBacktestResult, getBacktestTrades, runBacktest, waitForBacktest } from '../api/backtest'
import MetricCards from '../components/MetricCards'
import TradeTable from '../components/TradeTable'
import KlineChart from '../components/KlineChart'
import { useAnalysisStore } from '../store/analysisStore'

export default function BacktestPage() {
  const [strategies, setStrategies] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const { result, trades, chart, selectedTrade, setAnalysis, setSelectedTrade } = useAnalysisStore()

  useEffect(() => {
    getStrategyList().then(setStrategies)
  }, [])

  const onFinish = async (values: any) => {
    const target = strategies.find((item) => item.id === values.strategy_id)
    if (!target) { message.error('请先选择策略'); return }
    setLoading(true)
    try {
      const resp = await runBacktest({
        strategy_id: values.strategy_id,
        symbol: target.symbol,
        start_date: values.date_range[0].format('YYYY-MM-DD'),
        end_date: values.date_range[1].format('YYYY-MM-DD'),
        capital: values.capital,
        fee_rate: values.fee_rate,
        slippage: values.slippage,
      })
      await waitForBacktest(resp.job_id)
      const [resultData, tradeData, chartData] = await Promise.all([
        getBacktestResult(resp.job_id),
        getBacktestTrades(resp.job_id),
        getBacktestChart(resp.job_id),
      ])
      setAnalysis({ jobId: resp.job_id, result: resultData, trades: tradeData, chart: chartData })
      setSelectedTrade(null)
      message.success('回测完成')
    } catch (e: any) {
      message.error(e?.response?.data?.detail || '回测失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <Card title="运行回测" style={{ marginBottom: 16 }}>
        <Form
          layout="inline"
          onFinish={onFinish}
          initialValues={{
            capital: 100000,
            fee_rate: 0.0003,
            slippage: 0.0005,
            date_range: [dayjs('2024-01-01'), dayjs('2024-12-31')],
          }}
        >
          <Form.Item name="strategy_id" label="策略" rules={[{ required: true, message: '请选择策略' }]}>
            <Select
              style={{ width: 260 }}
              options={strategies.map((item) => ({ value: item.id, label: `${item.name} (${item.symbol})` }))}
            />
          </Form.Item>
          <Form.Item name="date_range" label="回测区间" rules={[{ required: true, message: '请选择日期范围' }]}>
            <DatePicker.RangePicker format="YYYY-MM-DD" />
          </Form.Item>
          <Form.Item name="capital" label="本金">
            <InputNumber min={1000} step={10000} style={{ width: 120 }} />
          </Form.Item>
          <Form.Item name="fee_rate" label="手续费">
            <InputNumber min={0} max={0.01} step={0.0001} style={{ width: 100 }} />
          </Form.Item>
          <Form.Item name="slippage" label="滑点">
            <InputNumber min={0} max={0.01} step={0.0001} style={{ width: 100 }} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading}>开始回测</Button>
          </Form.Item>
        </Form>
      </Card>
      <Spin spinning={loading} tip="回测运行中...">
        <MetricCards result={result} />
        <Row gutter={16} style={{ marginTop: 16 }}>
          <Col span={14}><KlineChart chart={chart} selectedTrade={selectedTrade} /></Col>
          <Col span={10}><Card title="交易明细"><TradeTable items={trades} onSelect={setSelectedTrade} selectedTrade={selectedTrade} /></Card></Col>
        </Row>
      </Spin>
    </div>
  )
}
