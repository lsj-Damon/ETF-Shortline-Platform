import { Button, Card, Col, Empty, Progress, Row, Segmented, Space, Tag, Typography, message } from 'antd'
import { ReloadOutlined, ThunderboltOutlined } from '@ant-design/icons'
import { useEffect, useMemo, useState } from 'react'
import { getDecisionChart, getDecisionDetail, getLatestPlans, getLiveDecisions, getRecentDecisionEvents, scanDecisions } from '../api/decision'
import KlineChart from '../components/KlineChart'
import './DecisionCenterPage.css'

const CHART_POLL_MS = 25000

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

const timeframeOptions = [
  { label: '5分钟', value: '5m' },
  { label: '15分钟', value: '15m' },
  { label: '日线', value: 'daily' },
]

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
  const [plans, setPlans] = useState<any[]>([])
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null)
  const [detail, setDetail] = useState<any | null>(null)
  const [decisionChart, setDecisionChart] = useState<any | null>(null)
  const [events, setEvents] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [chartLoading, setChartLoading] = useState(false)
  const [lastScanAt, setLastScanAt] = useState<string | null>(null)
  const [currentTimeframe, setCurrentTimeframe] = useState<string>('5m')

  const selectedItem = useMemo(() => detail || items.find((item) => item.symbol === selectedSymbol) || null, [detail, items, selectedSymbol])
  const buyCount = useMemo(() => items.filter((item) => item.action === 'buy').length, [items])
  const planCount = useMemo(() => plans.length, [plans])
  const highConvictionCount = useMemo(() => items.filter((item) => item.confidence >= 75).length, [items])

  const loadLiveBoard = async (preferredSymbol?: string | null, timeframeArg = currentTimeframe) => {
    const [liveRes, eventRes, planRes] = await Promise.all([
      getLiveDecisions(24, timeframeArg),
      getRecentDecisionEvents(20, timeframeArg),
      getLatestPlans(8, timeframeArg),
    ])
    const nextItems = liveRes.items || []
    setItems(nextItems)
    setEvents(eventRes.items || [])
    setPlans(planRes.items || [])
    setLastScanAt(liveRes.last_scan_at || eventRes.last_scan_at || planRes.last_scan_at || null)

    const preferred = preferredSymbol && nextItems.some((item: any) => item.symbol === preferredSymbol) ? preferredSymbol : null
    const current = selectedSymbol && nextItems.some((item: any) => item.symbol === selectedSymbol) ? selectedSymbol : null
    const nextSymbol = preferred || current || nextItems[0]?.symbol || null

    if (nextSymbol) {
      setSelectedSymbol(nextSymbol)
    } else {
      setSelectedSymbol(null)
      setDetail(null)
      setDecisionChart(null)
    }
  }

  const loadDetailPanel = async (symbol: string, timeframeArg = currentTimeframe, silent = false) => {
    if (!silent) setChartLoading(true)
    try {
      const [detailRes, chartRes] = await Promise.all([
        getDecisionDetail(symbol, timeframeArg),
        getDecisionChart(symbol, timeframeArg),
      ])
      setDetail(detailRes)
      setDecisionChart(chartRes)
    } catch {
      if (!silent) {
        setDetail(null)
        setDecisionChart(null)
      }
    } finally {
      if (!silent) setChartLoading(false)
    }
  }

  useEffect(() => {
    const init = async () => {
      setLoading(true)
      try {
        await loadLiveBoard(undefined, currentTimeframe)
      } catch (e: any) {
        message.error(e?.response?.data?.detail || '加载交易决策中心失败')
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [currentTimeframe])

  useEffect(() => {
    if (!selectedSymbol) return
    void loadDetailPanel(selectedSymbol, currentTimeframe)
  }, [selectedSymbol, currentTimeframe])

  useEffect(() => {
    if (!selectedSymbol) return
    const timer = window.setInterval(() => {
      void loadDetailPanel(selectedSymbol, currentTimeframe, true)
    }, CHART_POLL_MS)
    return () => window.clearInterval(timer)
  }, [selectedSymbol, currentTimeframe])

  useEffect(() => {
    const es = new EventSource(`/decisions/stream?timeframe=${currentTimeframe}`)

    es.onmessage = async (event) => {
      try {
        const payload = JSON.parse(event.data)
        if (payload.timeframe !== currentTimeframe) return
        setEvents((prev) => {
          if (prev.some((item) => item.id === payload.id)) return prev
          return [payload, ...prev].slice(0, 30)
        })
        await loadLiveBoard(payload.symbol || selectedSymbol, currentTimeframe)
        if (selectedSymbol && payload.symbol === selectedSymbol) {
          await loadDetailPanel(selectedSymbol, currentTimeframe, true)
        }
      } catch {
        // ignore malformed events
      }
    }

    return () => {
      es.close()
    }
  }, [currentTimeframe, selectedSymbol])

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      const preferredSymbol = selectedSymbol
      await scanDecisions(currentTimeframe)
      await loadLiveBoard(preferredSymbol, currentTimeframe)
      if (preferredSymbol) {
        await loadDetailPanel(preferredSymbol, currentTimeframe, true)
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
                Trading Decision Center Phase 2
              </span>
              <h1 className="decision-title">盘中双周期决策 + 次日交易剧本，同屏联动。</h1>
              <p className="decision-subtitle">
                现在可以在 5m、15m、日线之间切换查看不同节奏的决策结论，同时浏览增强版次日计划清单，快速锁定重点盯盘 ETF。
              </p>
            </div>
            <div className="decision-hero-stats">
              <div className="decision-mini-stat">
                <div className="decision-mini-stat-label">当前周期跟踪</div>
                <div className="decision-mini-stat-value">{items.length}</div>
              </div>
              <div className="decision-mini-stat">
                <div className="decision-mini-stat-label">高置信机会</div>
                <div className="decision-mini-stat-value">{highConvictionCount}</div>
              </div>
              <div className="decision-mini-stat">
                <div className="decision-mini-stat-label">次日计划数</div>
                <div className="decision-mini-stat-value">{planCount}</div>
              </div>
            </div>
          </div>
          <div className="decision-toolbar">
            <div className="decision-toolbar-left">
              <Segmented options={timeframeOptions} value={currentTimeframe} onChange={(value) => setCurrentTimeframe(String(value))} />
              <Typography.Text type="secondary">最后扫描：{formatTime(lastScanAt)}</Typography.Text>
            </div>
            <div className="decision-toolbar-right">
              <Tag color="green">可执行买点 {buyCount}</Tag>
              <Button type="primary" icon={<ReloadOutlined />} loading={refreshing} onClick={handleRefresh}>
                立即刷新决策
              </Button>
            </div>
          </div>
        </Card>

        <Row gutter={[16, 16]}>
          <Col xs={24} xl={7}>
            <Card className="decision-panel" title={`机会排序 · ${currentTimeframe}`} loading={loading}>
              {items.length === 0 ? (
                <div className="decision-empty">
                  <Empty description="当前周期暂无可用决策，请先导入对应 ETF 历史数据" />
                </div>
              ) : (
                <div className="decision-rank-list">
                  {items.map((item, index) => (
                    <div
                      key={`${item.timeframe}-${item.symbol}`}
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

          <Col xs={24} xl={10}>
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
                      <div className="decision-zone-label">突破触发价</div>
                      <div className="decision-zone-value">{formatPrice(selectedItem.breakout_trigger)}</div>
                    </div>
                    <div className="decision-zone-card">
                      <div className="decision-zone-label">止损位</div>
                      <div className="decision-zone-value">{formatPrice(selectedItem.stop_loss)}</div>
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

                  <div className="decision-chart-section">
                    <div className="decision-chart-header">
                      <div>
                        <div className="decision-chart-title">实时 K 线与候选买卖点</div>
                        <div className="decision-chart-subtitle">候选点由当前决策模型实时推导，优先显示当前最值得关注的支撑、突破、兑现与防守位置。</div>
                      </div>
                      <Space size={[8, 8]} wrap>
                        {chartLoading && <Tag color="processing">图表更新中</Tag>}
                        {decisionChart?.meta?.last_bar_ts && <Tag color="blue">最新 K 线 {formatTime(decisionChart.meta.last_bar_ts)}</Tag>}
                        {decisionChart?.meta?.scanned_at && <Tag>决策扫描 {formatTime(decisionChart.meta.scanned_at)}</Tag>}
                      </Space>
                    </div>
                    <KlineChart chart={decisionChart} hideCard title="" height={420} />
                    {!decisionChart?.meta?.has_candidates && (decisionChart?.bars?.length || 0) > 0 && (
                      <div className="decision-chart-note">当前模型下暂无高质量候选买卖点，图中仍保留关键价位辅助线供判断。</div>
                    )}
                  </div>
                </>
              ) : (
                <div className="decision-empty">
                  <Empty description="请选择左侧 ETF 查看详情" />
                </div>
              )}
            </Card>
          </Col>

          <Col xs={24} xl={7}>
            <Card className="decision-panel" title="动作变化流" loading={loading && events.length === 0}>
              {events.length === 0 ? (
                <div className="decision-empty">
                  <Empty description="当前周期还没有动作变化事件" />
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
                        {event.symbol} · {event.timeframe} · 价格 {formatPrice(event.price)} · 置信度 {event.confidence}
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

        <Row gutter={[16, 16]}>
          <Col xs={24} xl={14}>
            <Card className="decision-panel" title="次日交易计划剧本" loading={loading && !selectedItem}>
              {selectedItem ? (
                <>
                  <div className="decision-plan-banner">
                    <div>
                      <Typography.Title level={4} style={{ margin: 0 }}>{selectedItem.symbol} {selectedItem.name}</Typography.Title>
                      <Typography.Text type="secondary">{selectedItem.plan?.focus}</Typography.Text>
                    </div>
                    <Tag color={selectedItem.plan?.bias === '偏多' ? 'green' : selectedItem.plan?.bias === '偏空' ? 'red' : 'gold'}>
                      {selectedItem.plan?.bias || '中性'}
                    </Tag>
                  </div>

                  <div className="decision-level-grid">
                    <div className="decision-level-chip">支撑位 {formatPrice(selectedItem.plan?.key_levels?.support)}</div>
                    <div className="decision-level-chip">压力位 {formatPrice(selectedItem.plan?.key_levels?.resistance)}</div>
                    <div className="decision-level-chip">突破价 {formatPrice(selectedItem.plan?.key_levels?.breakout_trigger)}</div>
                    <div className="decision-level-chip">止盈位 {formatPrice(selectedItem.plan?.key_levels?.take_profit)}</div>
                  </div>

                  <div className="decision-plan-grid">
                    {(selectedItem.plan?.scenarios || []).map((scenario: any) => (
                      <div key={scenario.key} className="decision-plan-card">
                        <div className="decision-plan-title">{scenario.title}</div>
                        <div className="decision-plan-line"><strong>触发：</strong>{scenario.trigger}</div>
                        <div className="decision-plan-line"><strong>执行：</strong>{scenario.execution}</div>
                        <div className="decision-plan-line"><strong>失效：</strong>{scenario.invalid}</div>
                      </div>
                    ))}
                  </div>

                  <div className="decision-summary" style={{ marginTop: 18 }}>
                    <strong>风险提示：</strong>{selectedItem.plan?.risk_note}
                  </div>
                </>
              ) : (
                <div className="decision-empty">
                  <Empty description="选择 ETF 后可查看增强版次日计划" />
                </div>
              )}
            </Card>
          </Col>

          <Col xs={24} xl={10}>
            <Card className="decision-panel" title={`次日计划清单 · ${currentTimeframe}`} loading={loading && plans.length === 0}>
              {plans.length === 0 ? (
                <div className="decision-empty">
                  <Empty description="当前周期暂无计划清单" />
                </div>
              ) : (
                <div className="decision-plan-queue">
                  {plans.map((plan) => (
                    <div key={`${plan.timeframe}-${plan.symbol}`} className="decision-plan-queue-item" onClick={() => setSelectedSymbol(plan.symbol)}>
                      <div className="decision-rank-head">
                        <div>
                          <div className="decision-rank-name">{plan.symbol} {plan.name}</div>
                          <div className="decision-rank-meta">{plan.timeframe} · 置信度 {plan.confidence}</div>
                        </div>
                        <span className={actionClass[plan.action] || actionClass.watch}>{plan.action_label}</span>
                      </div>
                      <div className="decision-plan-line" style={{ marginTop: 10 }}><strong>主线：</strong>{plan.focus}</div>
                      <div className="decision-plan-line"><strong>低吸：</strong>{plan.scenarios?.[0]?.trigger || '--'}</div>
                      <div className="decision-plan-line"><strong>突破：</strong>{plan.scenarios?.[1]?.trigger || '--'}</div>
                      <div className="decision-plan-line"><strong>风控：</strong>{plan.risk_note}</div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </Col>
        </Row>
      </div>
    </div>
  )
}
