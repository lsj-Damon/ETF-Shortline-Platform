import { Card, Descriptions } from 'antd'

export default function BarsSummaryCard({ bars, timeframe }: { bars: any[]; timeframe: string }) {
  const first = bars[0]
  const last = bars[bars.length - 1]

  return (
    <Card title="数据摘要">
      <Descriptions column={1} size="small">
        <Descriptions.Item label="周期">{timeframe}</Descriptions.Item>
        <Descriptions.Item label="条数">{bars.length}</Descriptions.Item>
        <Descriptions.Item label="开始时间">{first?.ts ?? '-'}</Descriptions.Item>
        <Descriptions.Item label="结束时间">{last?.ts ?? '-'}</Descriptions.Item>
      </Descriptions>
    </Card>
  )
}
