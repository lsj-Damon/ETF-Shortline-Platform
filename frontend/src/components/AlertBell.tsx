import { Badge, Button, List, Popover, Tag, Typography } from 'antd'
import { BellOutlined } from '@ant-design/icons'
import { useAlerts, Alert } from '../hooks/useAlerts'

function SignalTag({ signal }: { signal: Alert['signal'] }) {
  return signal === 'buy'
    ? <Tag color="red">买入</Tag>
    : <Tag color="green">卖出</Tag>
}

function AlertList({ alerts }: { alerts: Alert[] }) {
  if (alerts.length === 0) {
    return <Typography.Text type="secondary" style={{ padding: 12, display: 'block' }}>暂无信号</Typography.Text>
  }
  return (
    <List
      size="small"
      style={{ width: 320, maxHeight: 400, overflowY: 'auto' }}
      dataSource={alerts.slice(0, 30)}
      renderItem={(a) => (
        <List.Item style={{ padding: '6px 12px' }}>
          <div style={{ width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600 }}>{a.strategy_name}</span>
              <SignalTag signal={a.signal} />
            </div>
            <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
              {a.symbol} &nbsp;·&nbsp; 价格 {a.price} &nbsp;·&nbsp; {a.ts}
            </div>
          </div>
        </List.Item>
      )}
    />
  )
}

export default function AlertBell() {
  const { alerts, unread, clearUnread } = useAlerts()

  return (
    <Popover
      trigger="click"
      placement="bottomRight"
      title={<span style={{ fontWeight: 600 }}>实时信号提醒</span>}
      content={<AlertList alerts={alerts} />}
      onOpenChange={(open) => { if (open) clearUnread() }}
    >
      <Badge count={unread} size="small" offset={[-2, 2]}>
        <Button
          type="text"
          icon={<BellOutlined style={{ fontSize: 18 }} />}
          style={{ color: unread > 0 ? '#cf1322' : undefined }}
        />
      </Badge>
    </Popover>
  )
}
