import { Card, Descriptions } from 'antd'

export default function QuoteCard({ quote }: { quote: any | null }) {
  return (
    <Card title="实时行情">
      {quote ? (
        <Descriptions column={1} size="small">
          <Descriptions.Item label="代码">{quote.symbol}</Descriptions.Item>
          <Descriptions.Item label="最新价">{quote.price}</Descriptions.Item>
          <Descriptions.Item label="涨跌幅">{quote.change_pct}</Descriptions.Item>
          <Descriptions.Item label="成交量">{quote.volume}</Descriptions.Item>
          <Descriptions.Item label="时间">{quote.ts}</Descriptions.Item>
        </Descriptions>
      ) : (
        <div>暂无数据</div>
      )}
    </Card>
  )
}
