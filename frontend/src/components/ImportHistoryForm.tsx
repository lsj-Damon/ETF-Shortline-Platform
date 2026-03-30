import { Button, Card, DatePicker, Form, Select } from 'antd'
import dayjs from 'dayjs'

interface Props {
  symbol?: string
  sources: { code: string; name: string }[]
  onSubmit: (payload: any) => Promise<void>
}

export default function ImportHistoryForm({ symbol, sources, onSubmit }: Props) {
  const [form] = Form.useForm()

  return (
    <Card title="导入历史数据">
      <Form
        layout="vertical"
        form={form}
        initialValues={{
          symbol,
          timeframe: 'daily',
          source: sources[0]?.code ?? 'akshare',
          range: [dayjs().subtract(90, 'day'), dayjs()],
        }}
        onFinish={async (values) => {
          const [start, end] = values.range
          await onSubmit({
            symbol: values.symbol,
            timeframe: values.timeframe,
            source: values.source,
            start_date: start.format('YYYY-MM-DD'),
            end_date: end.format('YYYY-MM-DD'),
          })
        }}
      >
        <Form.Item name="symbol" label="ETF 代码" rules={[{ required: true }]}>
          <Select showSearch options={symbol ? [{ value: symbol, label: symbol }] : []} placeholder="选择或输入 ETF" />
        </Form.Item>
        <Form.Item name="timeframe" label="周期">
          <Select options={[{ value: 'daily', label: '日线' }, { value: '5m', label: '5分钟' }, { value: '15m', label: '15分钟' }]} />
        </Form.Item>
        <Form.Item name="source" label="数据源">
          <Select options={sources.map((item) => ({ value: item.code, label: item.name }))} />
        </Form.Item>
        <Form.Item name="range" label="时间范围" rules={[{ required: true }]}>
          <DatePicker.RangePicker style={{ width: '100%' }} />
        </Form.Item>
        <Button type="primary" htmlType="submit" block>
          开始导入
        </Button>
      </Form>
    </Card>
  )
}
