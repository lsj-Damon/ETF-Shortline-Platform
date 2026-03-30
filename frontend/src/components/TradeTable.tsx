import { Table, Tag } from 'antd'

const EXIT_REASON_LABELS: Record<string, string> = {
  signal: '信号',
  stop_loss: '止损',
  take_profit: '止盈',
  max_hold: '超期',
  end_of_data: '数据结束',
}

export default function TradeTable({ items, onSelect, selectedTrade }: { items: any[]; onSelect?: (trade: any) => void; selectedTrade?: any }) {
  return (
    <Table
      rowKey={(row) => row.id ?? `${row.entry_time}-${row.exit_time}`}
      dataSource={items}
      size="small"
      pagination={{ pageSize: 10 }}
      onRow={(record) => ({
        onClick: () => onSelect?.(record),
        style: {
          cursor: onSelect ? 'pointer' : 'default',
          background: selectedTrade && selectedTrade.entry_time === record.entry_time && selectedTrade.exit_time === record.exit_time ? '#e6f4ff' : undefined,
        },
      })}
      columns={[
        { title: '买入时间', dataIndex: 'entry_time', width: 160 },
        { title: '买入价', dataIndex: 'entry_price', width: 80, render: (v: any) => v != null ? Number(v).toFixed(4) : '-' },
        { title: '卖出时间', dataIndex: 'exit_time', width: 160 },
        { title: '卖出价', dataIndex: 'exit_price', width: 80, render: (v: any) => v != null ? Number(v).toFixed(4) : '-' },
        {
          title: '收益', dataIndex: 'pnl', width: 90,
          render: (v: any) => {
            if (v == null) return '-'
            const n = Number(v)
            return <span style={{ color: n >= 0 ? '#cf1322' : '#389e0d' }}>{n >= 0 ? '+' : ''}{n.toFixed(2)}</span>
          },
        },
        {
          title: '收益率', dataIndex: 'pnl_pct', width: 90,
          render: (v: any) => {
            if (v == null) return '-'
            const n = Number(v)
            return <span style={{ color: n >= 0 ? '#cf1322' : '#389e0d' }}>{n >= 0 ? '+' : ''}{(n * 100).toFixed(2)}%</span>
          },
        },
        { title: '持仓 bars', dataIndex: 'hold_bars', width: 80 },
        {
          title: '退出原因', dataIndex: 'exit_reason', width: 90,
          render: (v: string) => {
            const label = EXIT_REASON_LABELS[v] ?? v
            const color = v === 'stop_loss' ? 'red' : v === 'take_profit' ? 'green' : v === 'signal' ? 'blue' : 'default'
            return <Tag color={color}>{label}</Tag>
          },
        },
      ]}
    />
  )
}
