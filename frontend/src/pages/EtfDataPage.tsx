import { Button, Card, Col, message, Row, Space, Table, Typography } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import { getDataSources, getEtfBars, getEtfList, getEtfQuote, importEtfHistory } from '../api/etf'
import BarsSummaryCard from '../components/BarsSummaryCard'
import EtfList from '../components/EtfList'
import ImportHistoryForm from '../components/ImportHistoryForm'
import QuoteCard from '../components/QuoteCard'
import { useEtfStore } from '../store/etfStore'

export default function EtfDataPage() {
  const { etfList, currentSymbol, bars, quote, setEtfList, setCurrentSymbol, setBars, setQuote } = useEtfStore()
  const [sources, setSources] = useState<any[]>([])
  const [timeframe, setTimeframe] = useState('daily')
  const [loading, setLoading] = useState(false)
  const currentItem = useMemo(() => etfList.find((item) => item.symbol === currentSymbol), [etfList, currentSymbol])

  useEffect(() => {
    const init = async () => {
      setLoading(true)
      try {
        const [list, sourceList] = await Promise.all([getEtfList(), getDataSources()])
        setEtfList(list)
        setSources(sourceList)
        if (list.length > 0 && !currentSymbol) {
          setCurrentSymbol(list[0].symbol)
        }
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [])

  useEffect(() => {
    if (!currentSymbol) return
    const loadDetail = async () => {
      try {
        const [barsData, quoteData] = await Promise.all([getEtfBars(currentSymbol, timeframe), getEtfQuote(currentSymbol)])
        setBars(barsData.items || [])
        setQuote(quoteData)
      } catch {
        message.error('加载 ETF 数据失败')
      }
    }
    loadDetail()
  }, [currentSymbol, timeframe])

  const handleImport = async (payload: any) => {
    try {
      setLoading(true)
      await importEtfHistory(payload)
      const barsData = await getEtfBars(payload.symbol, payload.timeframe)
      setCurrentSymbol(payload.symbol)
      setBars(barsData.items || [])
      setTimeframe(payload.timeframe)
      message.success('历史数据导入成功')
    } catch (e: any) {
      message.error(e?.message || '导入失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Row gutter={16}>
      <Col span={6}>
        <Card title="ETF 列表" loading={loading}>
          <EtfList items={etfList} currentSymbol={currentSymbol} onSelect={setCurrentSymbol} />
        </Card>
      </Col>
      <Col span={18}>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Card>
            <Typography.Title level={4} style={{ margin: 0 }}>ETF 数据中心</Typography.Title>
            <Typography.Text type="secondary">
              当前选择：{currentItem ? `${currentItem.symbol} ${currentItem.name}` : '未选择'}
            </Typography.Text>
          </Card>
          <Row gutter={16}>
            <Col span={10}>
              <ImportHistoryForm symbol={currentSymbol} sources={sources} onSubmit={handleImport} />
            </Col>
            <Col span={7}>
              <QuoteCard quote={quote} />
            </Col>
            <Col span={7}>
              <BarsSummaryCard bars={bars} timeframe={timeframe} />
            </Col>
          </Row>
          <Card title="K线数据预览" extra={<Button onClick={() => currentSymbol && getEtfQuote(currentSymbol).then(setQuote)}>刷新行情</Button>}>
            <Table
              size="small"
              rowKey={(row) => `${row.ts}`}
              dataSource={bars}
              pagination={{ pageSize: 10 }}
              columns={[
                { title: '时间', dataIndex: 'ts' },
                { title: '开盘', dataIndex: 'open' },
                { title: '最高', dataIndex: 'high' },
                { title: '最低', dataIndex: 'low' },
                { title: '收盘', dataIndex: 'close' },
                { title: '成交量', dataIndex: 'volume' },
              ]}
            />
          </Card>
        </Space>
      </Col>
    </Row>
  )
}
