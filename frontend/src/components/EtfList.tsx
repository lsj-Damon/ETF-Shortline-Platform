import { Input, List } from 'antd'
import { useMemo, useState } from 'react'
import { EtfItem } from '../api/etf'

interface Props {
  items: EtfItem[]
  currentSymbol: string
  onSelect: (symbol: string) => void
}

export default function EtfList({ items, currentSymbol, onSelect }: Props) {
  const [keyword, setKeyword] = useState('')

  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase()
    if (!q) return items
    return items.filter((item) => item.symbol.includes(q) || item.name.toLowerCase().includes(q))
  }, [items, keyword])

  return (
    <div>
      <Input.Search placeholder="搜索 ETF 代码/名称" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
      <List
        style={{ marginTop: 12, maxHeight: 640, overflow: 'auto', background: '#fff' }}
        bordered
        dataSource={filtered}
        renderItem={(item) => (
          <List.Item
            style={{ cursor: 'pointer', background: item.symbol === currentSymbol ? '#e6f4ff' : undefined }}
            onClick={() => onSelect(item.symbol)}
          >
            <div>
              <div><strong>{item.symbol}</strong></div>
              <div>{item.name}</div>
            </div>
          </List.Item>
        )}
      />
    </div>
  )
}
