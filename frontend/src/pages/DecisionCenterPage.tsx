import { Button, Card, Col, Empty, Progress, Row, Space, Tag, Typography, message } from 'antd'
import { ReloadOutlined, ThunderboltOutlined } from '@ant-design/icons'
import { useEffect, useMemo, useState } from 'react'
import { getDecisionDetail, getLiveDecisions, getRecentDecisionEvents, scanDecisions } from '../api/decision'
import './DecisionCenterPage.css'

const scoreLabels: Record<string, string> = {
  trend: '趋势',
  volume: '量能',
  position: '位置',
  trigger: '触发',
  risk: '风险',
}

const actionClass: Record<string, string> = {
  buy: 'decision-action-chip decision-action-chip--buy',
  watch: 'decision-action-chip decision-action-chip--watch',
  reduce: 'decision-action-chip decision-action-chip--reduce',
  sell: 'decision-action-chip decision-action-chip--sell',
}

function formatPct(value?: number) {
  if (typeof value !== 'number') return '--'
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}%`
}

function formatPrice(value?: number) {
  if (typeof value !== 'number') return '--'
  return value.toFixed(4)
}

function formatRange(range?: { low?: number; high?: number }) {
  if (!range) return '--'
  return `${formatPrice(range.low)} - ${formatPrice(range.high)}`
}

function formatTime(value?: string | null) {
  if (!value) return '未扫描'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', { hour12: false })
}

export default function DecisionCenterPage() {
  const [items, setItems] = useState<any[]>([])
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null)
  const [detail, setDetail] = useState<any | null>(null)
  const [events, setEvents] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [lastScanAt, setLastScanAt] = useState<string | null>(null)

  const selectedItem = useMemo(() => detail || items.find((item) => item.symbol === selectedSymbol) || null, [detail, items, selectedSymbol])
  const buyCount = useMemo(() => items.filter((item) => item.action === 'buy').length, [items])
  const riskCount = useMemo(() => items.filter((item) => item.action === 'sell' || item.action === 'reduce').length, [items])

  const loadLiveBoard = async (preferredSymbol?: string | null) => {
    const [liveRes, eventRes] = await Promise.all([
      getLiveDecisions(24),
      getRecentDecisionEvents(20),
    ])
    const nextItems = liveRes.items || []
    setItems(nextItems)
    setEvents(eventRes.items || [])
    setLastScanAt(liveRes.last_scan_at || eventRes.last_scan_at || null)

    const nextSymbol = preferredSymbol || selectedSymbol || nextItems[0]?.symbol || null
    if (nextSymbol) {
      setSelectedSymbol(nextSymbol)
    } else {
      setSelectedSymbol(null)
      setDetail(null)
    }
  }

  const loadDetail = async (symbol: string) => {
    try {
      const detailRes = await getDecisionDetail(symbol)
      setDetail(detailRes)
    } catch {
      setDetail(null)
    }
  }

  useEffect(() => {
    const init = async () => {
      setLoading(true)
      try {
        await loadLiveBoard()
      } catch (e: any) {
        message.error(e?.response?.data?.detail || '加载交易决策中心失败')
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [])

  useEffect(() => {
    if (!selectedSymbol) return
    loadDetail(selectedSymbol)
  }, [selectedSymbol])

  useEffect(() => {
    const es = new EventSource('/decisions/stream')

    es.onmessage = async (event) => {
      try {
        const payload = JSON.parse(event.data)
        setEvents((prev) => {
          if (prev.some((item) => item.id === payload.id)) return prev
          return [payload, ...prev].slice(0, 30)
        })
        await loadLiveBoard(payload.symbol || selectedSymbol)
      } catch {
        // ignore malformed events
      }
    }

    return () => {
      es.close()
    }
  }, [selectedSymbol])

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      const scanRes = await scanDecisions()
      setItems(scanRes.items || [])
      setLastScanAt(scanRes.last_scan_at || null)
      if (selectedSymbol) {
        await loadDetail(selectedSymbol)
      } else if (scanRes.items?.[0]?.symbol) {
        setSelectedSymbol(scanRes.items[0].symbol)
      }
      if (scanRes.events?.length) {
        setEvents((prev) => [...scanRes.events, ...prev].slice(0, 30))
      }
      message.success('交易决策已刷新')
    } catch (e: any) {
      message.error(e?.response?.data?.detail || '刷新交易决策失败')
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div className="decision-center">
      <div className="decision-shell">
        <Card className="decision-hero" bordered={false}>
          <div className="decision-hero-grid">
            <div>
              <span className="decision-eyebrow">
                <ThunderboltOutlined />
                Trading Decision Center
              </span>
              <h1 className="decision-title">盘中决策与次日计划，一屏完成。</h1>
              <p className="decision-subtitle">
                基于已导入 ETF 历史数据、当前行情和量能结构，实时输出买入/观察/减仓/卖出建议，并同步生成轻量的次日交易剧本。
              </p>
            </div>
            <div className="decision-hero-stats">
              <div className="decision-mini-stat">
                <div className="decision-mini-stat-label">跟踪 ETF</div>
                <div className="decision-mini-stat-value">{items.length}</div>
              </div>
              <div className="decision-mini-stat">
                <div className="decision-mini-stat-label">可执行买点</div>
                <div className="decision-mini-stat-value">{buyCount}</div>
              </div>
              <div className="decision-mini-stat">
                <div className="decision-mini-stat-label">风险提示</div>
                <div className="decision-mini-stat-value">{riskCount}</div>
              </div>
            </div>
          </div>
          <div style={{ marginTop: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <Typography.Text type="secondary">最后扫描：{formatTime(lastScanAt)}</Typography.Text>
            <Button type="primary" icon={<ReloadOutlined />} loading={refreshing} onClick={handleRefresh}>
              立即刷新决策
            </Button>
          </div>
        </Card>

        <Row gutter={[16, 16]}>
          <Col xs={24} xl={7}>
            <Card className="decision-panel" title="机会排序" loading={loading}>
              {items.length === 0 ? (
                <div className="decision-empty">
                  <Empty description="暂无可用决策，请先导入 ETF 历史数据" />
                </div>
              ) : (
                <div className="decision-rank-list">
                  {items.map((item, index) => (
                    <div
                      key={item.symbol}
                      className={`decision-rank-item ${selectedSymbol === item.symbol ? 'is-active' : ''}`}
                      onClick={() => setSelectedSymbol(item.symbol)}
                    >
                      <div className="decision-rank-head">
                        <div>
                          <div className="decision-rank-name">{index + 1}. {item.symbol} {item.name}</div>
                          <div className="decision-rank-meta">周期 {item.timeframe} · 价格 {formatPrice(item.current_price)}</div>
                        </div>
                        <span className={actionClass[item.action] || actionClass.watch}>{item.action_label}</span>
                      </div>
                      <div style={{ marginTop: 14 }}>
                        <Progress percent={item.confidence} size="small" strokeColor="#1f6feb" trailColor="rgba(25,35,49,0.08)" showInfo={false} />
                      </div>
                      <div className="decision-rank-head" style={{ marginTop: 12 }}>
                        <span className="decision-rank-meta">综合分 {item.score}</span>
                        <Tag color={item.change_pct >= 0 ? 'green' : 'red'}>{formatPct(item.change_pct)}</Tag>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </Col>

          <Col xs={24} xl={11}>
            <Card className="decision-panel" title="盘中决策详情" loading={loading && !selectedItem}>
              {selectedItem ? (
                <>
                  <Space size="middle" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
                    <div>
                      <Typography.Title level={3} style={{ margin: 0 }}>
                        {selectedItem.symbol} {selectedItem.name}
                      </Typography.Title>
                      <Typography.Text type="secondary">
                        扫描周期 {selectedItem.timeframe} · 趋势 {selectedItem.trend_bias} · 风险 {selectedItem.risk_level}
                      </Typography.Text>
                    </div>
                    <span className={actionClass[selectedItem.action] || actionClass.watch}>{selectedItem.action_label}</span>
                    <Tag color="blue">置信度 {selectedItem.confidence}</Tag>
                  </Space>

                  <div className="decision-score-grid">
                    {Object.entries(selectedItem.score_breakdown || {}).map(([key, value]) => (
                      <div key={key} className="decision-score-tile">
                        <div className="decision-score-title">{scoreLabels[key] || key}</div>
                        <div className="decision-score-value">{String(value)}</div>
                      </div>
                    ))}
                  </div>

                  <div className="decision-zone-grid">
                    <div className="decision-zone-card">
                      <div className="decision-zone-label">买入区</div>
                      <div className="decision-zone-value">{formatRange(selectedItem.buy_zone)}</div>
                    </div>
                    <div className="decision-zone-card">
                      <div className="decision-zone-label">卖出区</div>
                      <div className="decision-zone-value">{formatRange(selectedItem.sell_zone)}</div>
                    </div>
                    <div className="decision-zone-card">
                      <div className="decision-zone-label">止损位</div>
                      <div className="decision-zone-value">{formatPrice(selectedItem.stop_loss)}</div>
                    </div>
                    <div className="decision-zone-card">
                      <div className="decision-zone-label">止盈位</div>
                      <div className="decision-zone-value">{formatPrice(selectedItem.take_profit)}</div>
                    </div>
                  </div>

                  <div className="decision-tag-list">
                    {(selectedItem.reason_tags || []).map((tag: string) => (
                      <span key={tag} className="decision-tag">{tag}</span>
                    ))}
                  </div>

                  <div className="decision-summary">
                    <div><strong>当前建议：</strong>{selectedItem.summary}</div>
                    <div style={{ marginTop: 8 }}><strong>计划失效：</strong>{selectedItem.invalid_condition}</div>
                  </div>
                </>
              ) : (
                <div className="decision-empty">
                  <Empty description="请选择左侧 ETF 查看详情" />
                </div>
              )}
            </Card>
          </Col>

          <Col xs={24} xl={6}>
            <Card className="decision-panel" title="动作变化流" loading={loading && events.length === 0}>
              {events.length === 0 ? (
                <div className="decision-empty">
                  <Empty description="当前还没有动作变化事件" />
                </div>
              ) : (
                <div className="decision-event-list">
                  {events.map((event) => (
                    <div key={event.id} className="decision-event-item">
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                        <div className="decision-event-title">{event.headline}</div>
                        <span className={actionClass[event.action] || actionClass.watch}>{event.action_label}</span>
                      </div>
                      <div className="decision-event-meta">
                        {event.symbol} · 价格 {formatPrice(event.price)} · 置信度 {event.confidence}
                      </div>
                      <div className="decision-event-meta">{event.summary}</div>
                      <div className="decision-event-meta">更新时间 {formatTime(event.scanned_at)}</div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </Col>
        </Row>

        <Card className="decision-panel" title="次日交易计划" loading={loading && !selectedItem}>
          {selectedItem ? (
            <div className="decision-plan-grid">
              <div className="decision-plan-card">
                <div className="decision-plan-title">低吸剧本 · {selectedItem.plan?.bias || '中性'}</div>
                <div className="decision-plan-line">{selectedItem.plan?.low_buy}</div>
              </div>
              <div className="decision-plan-card">
                <div className="decision-plan-title">突破剧本</div>
                <div className="decision-plan-line">{selectedItem.plan?.breakout_buy}</div>
              </div>
              <div className="decision-plan-card">
                <div className="decision-plan-title">止盈/减仓剧本</div>
                <div className="decision-plan-line">{selectedItem.plan?.reduce_plan}</div>
              </div>
              <div className="decision-plan-card">
                <div className="decision-plan-title">防守与不参与条件</div>
                <div className="decision-plan-line">{selectedItem.plan?.no_trade}</div>
              </div>
            </div>
          ) : (
            <div className="decision-empty">
              <Empty description="选择 ETF 后可查看对应的次日交易计划" />
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
