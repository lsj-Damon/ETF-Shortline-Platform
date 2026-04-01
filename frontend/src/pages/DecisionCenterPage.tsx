import { Button, Card, Col, Empty, Progress, Row, Segmented, Space, Tag, Typography, message } from 'antd'
import { ReloadOutlined, ThunderboltOutlined } from '@ant-design/icons'
import { useEffect, useMemo, useRef, useState } from 'react'
import { getDecisionChart, getDecisionDetail, getLatestPlans, getLiveDecisions, getRecentDecisionEvents, scanDecisions } from '../api/decision'
import KlineChart from '../components/KlineChart'
import './DecisionCenterPage.css'

const CHART_POLL_MS = 25000

type BoardPayload = {
  items: any[]
  events: any[]
  plans: any[]
  lastScanAt: string | null
}

type PanelPayload = {
  detail: any
  chart: any
}

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

function panelCacheKey(symbol: string, timeframe: string) {
  return `${timeframe}:${symbol}`
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

  const boardCacheRef = useRef<Map<string, BoardPayload>>(new Map())
  const detailCacheRef = useRef<Map<string, any>>(new Map())
  const chartCacheRef = useRef<Map<string, any>>(new Map())
  const boardRequestRef = useRef<Map<string, Promise<BoardPayload>>>(new Map())
  const panelRequestRef = useRef<Map<string, Promise<PanelPayload>>>(new Map())
  const boardRequestSeqRef = useRef(0)
  const panelRequestSeqRef = useRef(0)
  const selectedSymbolRef = useRef<string | null>(null)
  const timeframeRef = useRef(currentTimeframe)

  const selectedItem = useMemo(() => {
    if (detail && detail.symbol === selectedSymbol && detail.timeframe === currentTimeframe) {
      return detail
    }
    return items.find((item) => item.symbol === selectedSymbol) || null
  }, [currentTimeframe, detail, items, selectedSymbol])
  const activeChart = useMemo(() => {
    if (decisionChart && decisionChart.symbol === selectedSymbol && decisionChart.timeframe === currentTimeframe) {
      return decisionChart
    }
    return null
  }, [currentTimeframe, decisionChart, selectedSymbol])
  const buyCount = useMemo(() => items.filter((item) => item.action === 'buy').length, [items])
  const planCount = useMemo(() => plans.length, [plans])
  const highConvictionCount = useMemo(() => items.filter((item) => item.confidence >= 75).length, [items])

  useEffect(() => {
    selectedSymbolRef.current = selectedSymbol
  }, [selectedSymbol])

  useEffect(() => {
    timeframeRef.current = currentTimeframe
  }, [currentTimeframe])

  const updateSelectedSymbol = (nextSymbol: string | null) => {
    selectedSymbolRef.current = nextSymbol
    setSelectedSymbol(nextSymbol)
  }

  const applyBoardPayload = (payload: BoardPayload, preferredSymbol?: string | null) => {
    const nextItems = payload.items || []
    setItems(nextItems)
    setEvents(payload.events || [])
    setPlans(payload.plans || [])
    setLastScanAt(payload.lastScanAt || null)

    const preferred = preferredSymbol && nextItems.some((item: any) => item.symbol === preferredSymbol) ? preferredSymbol : null
    const current = selectedSymbolRef.current && nextItems.some((item: any) => item.symbol === selectedSymbolRef.current) ? selectedSymbolRef.current : null
    const nextSymbol = preferred || current || nextItems[0]?.symbol || null

    if (nextSymbol) {
      if (selectedSymbolRef.current !== nextSymbol) {
        updateSelectedSymbol(nextSymbol)
      }
      return
    }

    updateSelectedSymbol(null)
    setDetail(null)
    setDecisionChart(null)
  }

  const fetchBoard = (timeframe: string, force = false): Promise<BoardPayload> => {
    if (!force) {
      const inFlight = boardRequestRef.current.get(timeframe)
      if (inFlight) return inFlight
    }

    const request = Promise.all([
      getLiveDecisions(24, timeframe),
      getRecentDecisionEvents(20, timeframe),
      getLatestPlans(8, timeframe),
    ]).then(([liveRes, eventRes, planRes]) => ({
      items: liveRes.items || [],
      events: eventRes.items || [],
      plans: planRes.items || [],
      lastScanAt: liveRes.last_scan_at || eventRes.last_scan_at || planRes.last_scan_at || null,
    }))

    boardRequestRef.current.set(timeframe, request)
    request.finally(() => {
      if (boardRequestRef.current.get(timeframe) === request) {
        boardRequestRef.current.delete(timeframe)
      }
    })
    return request
  }

  const fetchPanel = (symbol: string, timeframe: string, force = false): Promise<PanelPayload> => {
    const key = panelCacheKey(symbol, timeframe)
    if (!force) {
      const inFlight = panelRequestRef.current.get(key)
      if (inFlight) return inFlight
    }

    const request = Promise.all([
      getDecisionDetail(symbol, timeframe),
      getDecisionChart(symbol, timeframe),
    ]).then(([detailRes, chartRes]) => ({
      detail: detailRes,
      chart: chartRes,
    }))

    panelRequestRef.current.set(key, request)
    request.finally(() => {
      if (panelRequestRef.current.get(key) === request) {
        panelRequestRef.current.delete(key)
      }
    })
    return request
  }

  const loadLiveBoard = async (
    preferredSymbol?: string | null,
    timeframeArg = currentTimeframe,
    options?: { force?: boolean },
  ) => {
    const force = Boolean(options?.force)
    const cached = !force ? boardCacheRef.current.get(timeframeArg) : null
    if (cached && timeframeRef.current === timeframeArg) {
      applyBoardPayload(cached, preferredSymbol)
    }

    const seq = ++boardRequestSeqRef.current
    const payload = await fetchBoard(timeframeArg, force)
    boardCacheRef.current.set(timeframeArg, payload)

    if (timeframeRef.current !== timeframeArg || seq !== boardRequestSeqRef.current) {
      return payload
    }

    applyBoardPayload(payload, preferredSymbol)
    return payload
  }

  const loadDetailPanel = async (
    symbol: string,
    timeframeArg = currentTimeframe,
    silent = false,
    force = false,
  ) => {
    const key = panelCacheKey(symbol, timeframeArg)
    const cachedDetail = !force ? detailCacheRef.current.get(key) : null
    const cachedChart = !force ? chartCacheRef.current.get(key) : null

    if (cachedDetail) setDetail(cachedDetail)
    if (cachedChart) setDecisionChart(cachedChart)

    const shouldShowLoading = !silent && !(cachedDetail || cachedChart)
    if (!silent && !cachedDetail) setDetail(null)
    if (!silent && !cachedChart) setDecisionChart(null)
    if (shouldShowLoading) setChartLoading(true)

    const seq = ++panelRequestSeqRef.current
    try {
      const payload = await fetchPanel(symbol, timeframeArg, force)
      detailCacheRef.current.set(key, payload.detail)
      chartCacheRef.current.set(key, payload.chart)

      if (selectedSymbolRef.current !== symbol || timeframeRef.current !== timeframeArg || seq !== panelRequestSeqRef.current) {
        return payload
      }

      setDetail(payload.detail)
      setDecisionChart(payload.chart)
      return payload
    } catch {
      if (!silent && !cachedDetail && !cachedChart && seq === panelRequestSeqRef.current) {
        setDetail(null)
        setDecisionChart(null)
      }
      return null
    } finally {
      if (shouldShowLoading && seq === panelRequestSeqRef.current) {
        setChartLoading(false)
      }
    }
  }

  useEffect(() => {
    const init = async () => {
      const hasCachedBoard = boardCacheRef.current.has(currentTimeframe)
      setLoading(!hasCachedBoard)
      try {
        await loadLiveBoard(undefined, currentTimeframe)
      } catch (e: any) {
        message.error(e?.response?.data?.detail || '加载交易决策中心失败')
      } finally {
        setLoading(false)
      }
    }
    void init()
  }, [currentTimeframe])

  useEffect(() => {
    if (!selectedSymbol) return
    void loadDetailPanel(selectedSymbol, currentTimeframe)
  }, [selectedSymbol, currentTimeframe])

  useEffect(() => {
    if (!selectedSymbol) return
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
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
          const next = [payload, ...prev].slice(0, 30)
          const cachedBoard = boardCacheRef.current.get(currentTimeframe)
          if (cachedBoard) {
            boardCacheRef.current.set(currentTimeframe, { ...cachedBoard, events: next })
          }
          return next
        })

        await loadLiveBoard(payload.symbol || selectedSymbolRef.current, currentTimeframe, { force: true })
        if (selectedSymbolRef.current && payload.symbol === selectedSymbolRef.current) {
          void loadDetailPanel(selectedSymbolRef.current, currentTimeframe, true, true)
        }
      } catch {
        // ignore malformed events
      }
    }

    return () => {
      es.close()
    }
  }, [currentTimeframe])

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      const preferredSymbol = selectedSymbolRef.current
      await scanDecisions(currentTimeframe)
      await loadLiveBoard(preferredSymbol, currentTimeframe, { force: true })
      if (preferredSymbol) {
        await loadDetailPanel(preferredSymbol, currentTimeframe, true, true)
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
                      onClick={() => updateSelectedSymbol(item.symbol)}
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
                        {activeChart?.meta?.last_bar_ts && <Tag color="blue">最新 K 线 {formatTime(activeChart.meta.last_bar_ts)}</Tag>}
                        {activeChart?.meta?.scanned_at && <Tag>决策扫描 {formatTime(activeChart.meta.scanned_at)}</Tag>}
                      </Space>
                    </div>
                    <KlineChart chart={activeChart} hideCard title="" height={420} />
                    {!activeChart?.meta?.has_candidates && (activeChart?.bars?.length || 0) > 0 && (
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
                    <div key={`${plan.timeframe}-${plan.symbol}`} className="decision-plan-queue-item" onClick={() => updateSelectedSymbol(plan.symbol)}>
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
