import { Button, Card, Col, Descriptions, Input, message, Row } from 'antd'
import { useState } from 'react'
import { getBacktestChart, getBacktestResult, getBacktestTrades } from '../api/backtest'
import KlineChart from '../components/KlineChart'
import MetricCards from '../components/MetricCards'
import TradeTable from '../components/TradeTable'
import { useAnalysisStore } from '../store/analysisStore'

export default function SignalAnalysisPage() {
  const { result, trades, chart, selectedTrade, setSelectedTrade, jobId, setAnalysis } = useAnalysisStore()
  const [inputJobId, setInputJobId] = useState('')
  const [loadingJob, setLoadingJob] = useState(false)

  const loadJob = async () => {
    const id = parseInt(inputJobId)
    if (!id) { message.error('请输入有效的任务ID'); return }
    setLoadingJob(true)
    try {
      const [resultData, tradeData, chartData] = await Promise.all([
        getBacktestResult(id),
        getBacktestTrades(id),
        getBacktestChart(id),
      ])
      setAnalysis({ jobId: id, result: resultData, trades: tradeData, chart: chartData })
      setSelectedTrade(null)
      message.success(`已加载任务 #${id}`)
    } catch {
      message.error('未找到该任务，请确认任务ID正确')
    } finally {
      setLoadingJob(false)
    }
  }

  return (
    <div>
      <Card size="small" style={{ marginBottom: 12 }}>
        <Input.Search
          placeholder="输入历史回测任务ID直接加载"
          value={inputJobId}
          onChange={(e) => setInputJobId(e.target.value)}
          onSearch={loadJob}
          enterButton={<Button loading={loadingJob}>加载</Button>}
          style={{ maxWidth: 340 }}
        />
      </Card>
      {!result ? (
        <Card>尚无数据 — 请先在回测中心运行回测，或输入已有任务ID加载。</Card>
      ) : (
        <>
      <MetricCards result={result} />
      <Row gutter={16} style={{ marginTop: 16 }}>
        <Col span={16}>
          <KlineChart chart={chart} selectedTrade={selectedTrade} />
        </Col>
        <Col span={8}>
          <Card title="当前选中交易详情">
            {selectedTrade ? (
              <Descriptions column={1} size="small">
                <Descriptions.Item label="任务ID">{jobId}</Descriptions.Item>
                <Descriptions.Item label="买入时间">{selectedTrade.entry_time}</Descriptions.Item>
                <Descriptions.Item label="买入价">{Number(selectedTrade.entry_price).toFixed(4)}</Descriptions.Item>
                <Descriptions.Item label="卖出时间">{selectedTrade.exit_time}</Descriptions.Item>
                <Descriptions.Item label="卖出价">{Number(selectedTrade.exit_price).toFixed(4)}</Descriptions.Item>
                <Descriptions.Item label="收益">
                  <span style={{ color: selectedTrade.pnl >= 0 ? '#cf1322' : '#389e0d' }}>
                    {selectedTrade.pnl >= 0 ? '+' : ''}{Number(selectedTrade.pnl).toFixed(2)}
                  </span>
                </Descriptions.Item>
                <Descriptions.Item label="收益率">
                  <span style={{ color: selectedTrade.pnl_pct >= 0 ? '#cf1322' : '#389e0d' }}>
                    {selectedTrade.pnl_pct >= 0 ? '+' : ''}{(Number(selectedTrade.pnl_pct) * 100).toFixed(2)}%
                  </span>
                </Descriptions.Item>
                <Descriptions.Item label="持仓bars">{selectedTrade.hold_bars}</Descriptions.Item>
                <Descriptions.Item label="退出原因">{selectedTrade.exit_reason}</Descriptions.Item>
              </Descriptions>
            ) : '点击右下方交易明细中的某一笔交易，可联动查看买卖点。'}
          </Card>
        </Col>
      </Row>
      <Card title="交易明细" style={{ marginTop: 16 }}>
        <TradeTable items={trades} onSelect={setSelectedTrade} selectedTrade={selectedTrade} />
      </Card>
        </>
      )}
    </div>
  )
}
