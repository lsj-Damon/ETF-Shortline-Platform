import { Button, Card, Col, DatePicker, Descriptions, Drawer, Empty, Input, Row, Select, Space, Statistic, Table, Tag, Typography, message } from 'antd'
import dayjs, { Dayjs } from 'dayjs'
import { useEffect, useMemo, useState } from 'react'
import { DailyRecommendationItem, getDailyRecommendationDetail, getDailyRecommendations } from '../api/recommendation'

const { RangePicker } = DatePicker

const timeframeOptions = [
  { label: '全部周期', value: '' },
  { label: '5分钟', value: '5m' },
  { label: '15分钟', value: '15m' },
  { label: '日线', value: 'daily' },
]

const actionOptions = [
  { label: '全部动作', value: '' },
  { label: '买入', value: 'buy' },
  { label: '观察', value: 'watch' },
  { label: '减仓', value: 'reduce' },
  { label: '卖出', value: 'sell' },
]

const actionColors: Record<string, string> = {
  buy: 'green',
  watch: 'gold',
  reduce: 'orange',
  sell: 'red',
}

const defaultRange = (): [Dayjs, Dayjs] => [dayjs().subtract(30, 'day'), dayjs()]

function formatPrice(value?: number | null) {
  if (typeof value !== 'number') return '--'
  return value.toFixed(4)
}

function formatPct(value?: number | null) {
  if (typeof value !== 'number') return '--'
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}%`
}

function formatTime(value?: string | null) {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', { hour12: false })
}

function formatRange(range?: { low?: number | null; high?: number | null }) {
  if (!range) return '--'
  return `${formatPrice(range.low)} - ${formatPrice(range.high)}`
}

export default function DailyRecommendationPage() {
  const [items, setItems] = useState<DailyRecommendationItem[]>([])
  const [loading, setLoading] = useState(false)
  const [range, setRange] = useState<[Dayjs, Dayjs]>(defaultRange())
  const [timeframe, setTimeframe] = useState('')
  const [action, setAction] = useState('')
  const [symbol, setSymbol] = useState('')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [detail, setDetail] = useState<DailyRecommendationItem | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const loadData = async (next?: {
    range?: [Dayjs, Dayjs]
    timeframe?: string
    action?: string
    symbol?: string
  }) => {
    const targetRange = next?.range ?? range
    const targetTimeframe = next?.timeframe ?? timeframe
    const targetAction = next?.action ?? action
    const targetSymbol = (next?.symbol ?? symbol).trim()

    setLoading(true)
    try {
      const data = await getDailyRecommendations({
        start_date: targetRange[0].format('YYYY-MM-DD'),
        end_date: targetRange[1].format('YYYY-MM-DD'),
        timeframe: targetTimeframe || undefined,
        action: targetAction || undefined,
        symbol: targetSymbol || undefined,
      })
      setItems(data.items || [])
    } catch (e: any) {
      message.error(e?.response?.data?.detail || '加载每日建议记录失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData({ range: defaultRange(), timeframe: '', action: '', symbol: '' })
  }, [])

  const openDetail = async (id: number) => {
    setDrawerOpen(true)
    setDetailLoading(true)
    try {
      const data = await getDailyRecommendationDetail(id)
      setDetail(data)
    } catch (e: any) {
      message.error(e?.response?.data?.detail || '加载建议详情失败')
      setDrawerOpen(false)
    } finally {
      setDetailLoading(false)
    }
  }

  const handleReset = async () => {
    const nextRange = defaultRange()
    setRange(nextRange)
    setTimeframe('')
    setAction('')
    setSymbol('')
    await loadData({ range: nextRange, timeframe: '', action: '', symbol: '' })
  }

  const buyCount = useMemo(() => items.filter((item) => item.action === 'buy').length, [items])
  const trackedBuyItems = useMemo(
    () => items.filter((item) => item.action === 'buy' && typeof item.tracking_return_pct === 'number'),
    [items],
  )
  const avgTrackingReturn = useMemo(() => {
    if (trackedBuyItems.length === 0) return null
    return trackedBuyItems.reduce((sum, item) => sum + (item.tracking_return_pct || 0), 0) / trackedBuyItems.length
  }, [trackedBuyItems])

  const columns = [
    {
      title: '日期',
      dataIndex: 'trade_date',
      width: 110,
    },
    {
      title: '周期',
      dataIndex: 'timeframe',
      width: 90,
    },
    {
      title: 'ETF',
      key: 'symbol',
      width: 170,
      render: (_: unknown, record: DailyRecommendationItem) => `${record.symbol} ${record.name}`,
    },
    {
      title: '建议动作',
      dataIndex: 'action_label',
      width: 100,
      render: (value: string, record: DailyRecommendationItem) => <Tag color={actionColors[record.action] || 'default'}>{value}</Tag>,
    },
    {
      title: '置信度',
      dataIndex: 'confidence',
      width: 90,
    },
    {
      title: '建议日价格',
      dataIndex: 'current_price',
      width: 110,
      render: (value: number | null) => formatPrice(value),
    },
    {
      title: '建议买入价',
      dataIndex: 'suggested_buy_price',
      width: 110,
      render: (value: number | null) => formatPrice(value),
    },
    {
      title: '最新价',
      key: 'latest_price',
      width: 130,
      render: (_: unknown, record: DailyRecommendationItem) => (
        <Space size={6}>
          <span>{formatPrice(record.latest_price)}</span>
          {record.latest_price != null && record.is_tracking_stale && <Tag>本地</Tag>}
        </Space>
      ),
    },
    {
      title: '跟踪收益',
      dataIndex: 'tracking_return_pct',
      width: 110,
      render: (value: number | null) => {
        const text = formatPct(value)
        if (typeof value !== 'number') return text
        return <span style={{ color: value >= 0 ? '#cf1322' : '#389e0d', fontWeight: 600 }}>{text}</span>
      },
    },
    {
      title: '建议摘要',
      dataIndex: 'summary',
      ellipsis: true,
    },
    {
      title: '保存时间',
      dataIndex: 'saved_at',
      width: 170,
      render: (value: string | null) => formatTime(value),
    },
  ]

  return (
    <div>
      <Card
        bordered={false}
        style={{ marginBottom: 16, background: 'linear-gradient(135deg, #fff7e6 0%, #fff 55%, #f6ffed 100%)' }}
      >
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} xl={12}>
            <Typography.Title level={3} style={{ margin: 0 }}>每日建议记录</Typography.Title>
            <Typography.Paragraph type="secondary" style={{ margin: '8px 0 0' }}>
              系统会在收盘后固定保存当天建议。这里可以回看每个 ETF 当时的判断，并持续追踪买入建议后续表现。
            </Typography.Paragraph>
          </Col>
          <Col xs={24} xl={12}>
            <Row gutter={12}>
              <Col xs={8}><Card><Statistic title="记录数" value={items.length} /></Card></Col>
              <Col xs={8}><Card><Statistic title="买入建议" value={buyCount} /></Card></Col>
              <Col xs={8}><Card><Statistic title="买入平均跟踪" value={avgTrackingReturn ?? undefined} precision={2} suffix="%" /></Card></Col>
            </Row>
          </Col>
        </Row>
      </Card>

      <Card title="筛选条件" style={{ marginBottom: 16 }}>
        <Space size={[12, 12]} wrap>
          <RangePicker value={range} onChange={(value) => value && setRange(value as [Dayjs, Dayjs])} />
          <Select style={{ width: 140 }} value={timeframe} onChange={setTimeframe} options={timeframeOptions} />
          <Select style={{ width: 140 }} value={action} onChange={setAction} options={actionOptions} />
          <Input
            allowClear
            style={{ width: 220 }}
            placeholder="搜索 ETF 代码"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            onPressEnter={() => void loadData()}
          />
          <Button type="primary" onClick={() => void loadData()} loading={loading}>查询</Button>
          <Button onClick={() => void handleReset()} disabled={loading}>重置</Button>
        </Space>
      </Card>

      <Card title="建议历史列表">
        {items.length === 0 && !loading ? (
          <div style={{ padding: '48px 0' }}>
            <Empty description="当前筛选条件下暂无记录。收盘后自动快照会逐步累积在这里。" />
          </div>
        ) : (
          <Table
            rowKey="id"
            loading={loading}
            dataSource={items}
            columns={columns}
            pagination={{ pageSize: 12 }}
            scroll={{ x: 1400 }}
            onRow={(record) => ({ onClick: () => void openDetail(record.id), style: { cursor: 'pointer' } })}
          />
        )}
      </Card>

      <Drawer
        open={drawerOpen}
        width={560}
        title={detail ? `${detail.trade_date} · ${detail.symbol} ${detail.name}` : '建议详情'}
        onClose={() => {
          setDrawerOpen(false)
          setDetail(null)
        }}
        loading={detailLoading}
      >
        {detail ? (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Space wrap>
              <Tag color={actionColors[detail.action] || 'default'}>{detail.action_label}</Tag>
              <Tag color="blue">周期 {detail.timeframe}</Tag>
              <Tag>置信度 {detail.confidence}</Tag>
              {detail.is_tracking_stale && <Tag>跟踪价来自本地数据</Tag>}
            </Space>

            <Card size="small" title="建议摘要">
              <Typography.Paragraph style={{ marginBottom: 0 }}>{detail.summary}</Typography.Paragraph>
            </Card>

            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item label="建议日价格">{formatPrice(detail.current_price)}</Descriptions.Item>
              <Descriptions.Item label="建议买入价">{formatPrice(detail.suggested_buy_price)}</Descriptions.Item>
              <Descriptions.Item label="最新价">{formatPrice(detail.latest_price)}</Descriptions.Item>
              <Descriptions.Item label="跟踪收益">{formatPct(detail.tracking_return_pct)}</Descriptions.Item>
              <Descriptions.Item label="买入区">{formatRange(detail.buy_zone)}</Descriptions.Item>
              <Descriptions.Item label="卖出区">{formatRange(detail.sell_zone)}</Descriptions.Item>
              <Descriptions.Item label="突破价">{formatPrice(detail.breakout_trigger)}</Descriptions.Item>
              <Descriptions.Item label="止损位">{formatPrice(detail.stop_loss)}</Descriptions.Item>
              <Descriptions.Item label="止盈位">{formatPrice(detail.take_profit)}</Descriptions.Item>
              <Descriptions.Item label="扫描时间">{formatTime(detail.scanned_at)}</Descriptions.Item>
              <Descriptions.Item label="保存时间">{formatTime(detail.saved_at)}</Descriptions.Item>
              <Descriptions.Item label="跟踪时间">{formatTime(detail.tracking_price_ts)}</Descriptions.Item>
            </Descriptions>
          </Space>
        ) : (
          <Empty description="暂无详情" />
        )}
      </Drawer>
    </div>
  )
}