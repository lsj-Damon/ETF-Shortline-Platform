import { Button, Card, Col, Descriptions, Form, Input, InputNumber, message, Row, Select, Space, Table } from 'antd'
import { useEffect, useState } from 'react'
import { getEtfList } from '../api/etf'
import { createStrategy, deleteStrategy, getStrategyDetail, getStrategyList, updateStrategy } from '../api/strategy'

const fieldOptions = [
  { value: 'close', label: '收盘价' },
  { value: 'ma5', label: 'MA5' },
  { value: 'ma10', label: 'MA10' },
  { value: 'ma20', label: 'MA20' },
  { value: 'ema5', label: 'EMA5' },
  { value: 'ema10', label: 'EMA10' },
  { value: 'volume', label: '成交量' },
  { value: 'volume_ma20', label: '成交量MA20' },
  { value: 'rsi14', label: 'RSI14' },
]

const opOptions = [
  { value: 'gt', label: '大于' },
  { value: 'lt', label: '小于' },
  { value: 'cross_above', label: '上穿' },
  { value: 'cross_below', label: '下穿' },
]

export default function StrategyPage() {
  const [form] = Form.useForm()
  const [etfs, setEtfs] = useState<any[]>([])
  const [list, setList] = useState<any[]>([])
  const [editingId, setEditingId] = useState<number | null>(null)
  const [detail, setDetail] = useState<any | null>(null)

  const load = async () => {
    const [etfList, strategyList] = await Promise.all([getEtfList(), getStrategyList()])
    setEtfs(etfList)
    setList(strategyList)
  }

  useEffect(() => {
    load()
  }, [])

  const submit = async (values: any) => {
    try {
      if (editingId) {
        await updateStrategy(editingId, values)
        message.success('策略更新成功')
      } else {
        await createStrategy(values)
        message.success('策略创建成功')
      }
      form.resetFields()
      setEditingId(null)
      load()
    } catch (e: any) {
      message.error(e?.response?.data?.detail || '策略保存失败')
    }
  }

  const editItem = async (id: number) => {
    const data = await getStrategyDetail(id)
    setEditingId(id)
    setDetail(data)
    form.setFieldsValue(data)
  }

  const showDetail = async (id: number) => {
    const data = await getStrategyDetail(id)
    setDetail(data)
  }

  const remove = async (id: number) => {
    await deleteStrategy(id)
    message.success('策略已删除')
    load()
  }

  return (
    <Row gutter={16}>
      <Col span={10}>
        <Card title="新建策略">
          <Form form={form} layout="vertical" onFinish={submit} initialValues={{ timeframe: '5m', entry_rules: [{}], exit_rules: [{}], stop_loss_pct: 0.008, take_profit_pct: 0.015, max_hold_bars: 12 }}>
            <Form.Item name="name" label="策略名称" rules={[{ required: true }]}><Input /></Form.Item>
            <Form.Item name="symbol" label="ETF" rules={[{ required: true }]}>
              <Select showSearch options={etfs.map((item) => ({ value: item.symbol, label: `${item.symbol} ${item.name}` }))} />
            </Form.Item>
            <Form.Item name="timeframe" label="周期"><Select options={[{ value: '5m', label: '5分钟' }, { value: '15m', label: '15分钟' }, { value: 'daily', label: '日线' }]} /></Form.Item>
            <Card size="small" title="买入规则">
              <Form.List name="entry_rules">
                {(fields, { add, remove }) => (
                  <Space direction="vertical" style={{ width: '100%' }}>
                    {fields.map((field) => (
                      <Space key={field.key} align="baseline">
                        <Form.Item name={[field.name, 'field']} rules={[{ required: true }]}><Select style={{ width: 120 }} options={fieldOptions} /></Form.Item>
                        <Form.Item name={[field.name, 'op']} rules={[{ required: true }]}><Select style={{ width: 100 }} options={opOptions} /></Form.Item>
                        <Form.Item name={[field.name, 'value']} rules={[{ required: true }]}><Input placeholder="如 ma20 或 1.5" /></Form.Item>
                        <Button onClick={() => remove(field.name)}>删</Button>
                      </Space>
                    ))}
                    <Button onClick={() => add()}>新增买入规则</Button>
                  </Space>
                )}
              </Form.List>
            </Card>
            <Card size="small" title="卖出规则" style={{ marginTop: 16 }}>
              <Form.List name="exit_rules">
                {(fields, { add, remove }) => (
                  <Space direction="vertical" style={{ width: '100%' }}>
                    {fields.map((field) => (
                      <Space key={field.key} align="baseline">
                        <Form.Item name={[field.name, 'field']} rules={[{ required: true }]}><Select style={{ width: 120 }} options={fieldOptions} /></Form.Item>
                        <Form.Item name={[field.name, 'op']} rules={[{ required: true }]}><Select style={{ width: 100 }} options={opOptions} /></Form.Item>
                        <Form.Item name={[field.name, 'value']} rules={[{ required: true }]}><Input placeholder="如 ma10 或 70" /></Form.Item>
                        <Button onClick={() => remove(field.name)}>删</Button>
                      </Space>
                    ))}
                    <Button onClick={() => add()}>新增卖出规则</Button>
                  </Space>
                )}
              </Form.List>
            </Card>
            <Row gutter={12} style={{ marginTop: 16 }}>
              <Col span={8}><Form.Item name="stop_loss_pct" label="止损比例"><InputNumber min={0} step={0.001} style={{ width: '100%' }} /></Form.Item></Col>
              <Col span={8}><Form.Item name="take_profit_pct" label="止盈比例"><InputNumber min={0} step={0.001} style={{ width: '100%' }} /></Form.Item></Col>
              <Col span={8}><Form.Item name="max_hold_bars" label="最大持仓 bars"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
            </Row>
            <Space.Compact block>
              <Button type="primary" htmlType="submit" style={{ width: '100%' }}>{editingId ? '更新策略' : '保存策略'}</Button>
              {editingId ? <Button onClick={() => { form.resetFields(); setEditingId(null) }}>取消编辑</Button> : null}
            </Space.Compact>
          </Form>
        </Card>
      </Col>
      <Col span={14}>
        <Card title="策略列表" style={{ marginBottom: 16 }}>
          <Table rowKey="id" dataSource={list} pagination={{ pageSize: 8 }} columns={[
            { title: '名称', dataIndex: 'name' },
            { title: 'ETF', dataIndex: 'symbol' },
            { title: '周期', dataIndex: 'timeframe' },
            { title: '止损', dataIndex: 'stop_loss_pct' },
            { title: '止盈', dataIndex: 'take_profit_pct' },
            { title: '操作', render: (_, row) => <Space><Button size="small" onClick={() => showDetail(row.id)}>详情</Button><Button size="small" onClick={() => editItem(row.id)}>编辑</Button><Button danger size="small" onClick={() => remove(row.id)}>删除</Button></Space> },
          ]} />
        </Card>
        <Card title="策略详情">
          {detail ? (
            <Descriptions column={1} size="small">
              <Descriptions.Item label="名称">{detail.name}</Descriptions.Item>
              <Descriptions.Item label="ETF">{detail.symbol}</Descriptions.Item>
              <Descriptions.Item label="周期">{detail.timeframe}</Descriptions.Item>
              <Descriptions.Item label="买入规则">{JSON.stringify(detail.entry_rules)}</Descriptions.Item>
              <Descriptions.Item label="卖出规则">{JSON.stringify(detail.exit_rules)}</Descriptions.Item>
              <Descriptions.Item label="止损比例">{detail.stop_loss_pct}</Descriptions.Item>
              <Descriptions.Item label="止盈比例">{detail.take_profit_pct}</Descriptions.Item>
              <Descriptions.Item label="最大持仓">{detail.max_hold_bars}</Descriptions.Item>
            </Descriptions>
          ) : '请选择一个策略查看详情'}
        </Card>
      </Col>
    </Row>
  )
}
