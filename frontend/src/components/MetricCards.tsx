import { Card, Col, Row, Statistic } from 'antd'

function pct(v: number | undefined | null) {
  if (v == null) return '-'
  return `${(v * 100).toFixed(2)}%`
}

function fmt(v: number | undefined | null, decimals = 2) {
  if (v == null) return '-'
  return Number(v).toFixed(decimals)
}

export default function MetricCards({ result }: { result: any }) {
  if (!result) return null
  // support both flat result and result.summary nested structure
  const s = result.summary ?? result
  return (
    <Row gutter={[12, 12]}>
      <Col span={4}>
        <Card size="small">
          <Statistic
            title="策略收益"
            value={pct(s.total_return)}
            valueStyle={{ color: (s.total_return ?? 0) >= 0 ? '#cf1322' : '#389e0d' }}
          />
        </Card>
      </Col>
      <Col span={4}>
        <Card size="small">
          <Statistic
            title="基准收益（持有）"
            value={pct(s.benchmark_return)}
            valueStyle={{ color: '#888' }}
          />
        </Card>
      </Col>
      <Col span={4}>
        <Card size="small">
          <Statistic
            title="超额收益 α"
            value={pct(s.alpha)}
            valueStyle={{ color: (s.alpha ?? 0) >= 0 ? '#cf1322' : '#389e0d' }}
          />
        </Card>
      </Col>
      <Col span={4}>
        <Card size="small">
          <Statistic
            title="最大回撤"
            value={pct(s.max_drawdown)}
            valueStyle={{ color: '#faad14' }}
          />
        </Card>
      </Col>
      <Col span={4}>
        <Card size="small"><Statistic title="Sharpe" value={fmt(s.sharpe)} /></Card>
      </Col>
      <Col span={4}>
        <Card size="small"><Statistic title="Calmar" value={fmt(s.calmar)} /></Card>
      </Col>
      <Col span={4}>
        <Card size="small"><Statistic title="胜率" value={pct(s.win_rate)} /></Card>
      </Col>
      <Col span={4}>
        <Card size="small"><Statistic title="盈亏比" value={fmt(s.profit_factor)} /></Card>
      </Col>
      <Col span={4}>
        <Card size="small"><Statistic title="交易次数" value={s.trade_count ?? '-'} /></Card>
      </Col>
    </Row>
  )
}
