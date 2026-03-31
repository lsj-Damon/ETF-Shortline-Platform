import { useEffect, useRef, useState } from 'react'

export interface Alert {
  id: string
  strategy_id: number
  strategy_name: string
  symbol: string
  signal: 'buy' | 'sell'
  price: number
  ts: string
  scanned_at: string
}

export function useAlerts() {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [unread, setUnread] = useState(0)
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => {
    const es = new EventSource('/alerts/stream')
    esRef.current = es

    es.onmessage = (event) => {
      try {
        const alert: Alert = JSON.parse(event.data)
        setAlerts((prev) => {
          // deduplicate by id
          if (prev.some((a) => a.id === alert.id)) return prev
          return [alert, ...prev].slice(0, 100)
        })
        setUnread((n) => n + 1)
      } catch {
        // ignore malformed events
      }
    }

    es.onerror = () => {
      // EventSource will auto-reconnect; nothing extra needed
    }

    return () => {
      es.close()
    }
  }, [])

  const clearUnread = () => setUnread(0)

  return { alerts, unread, clearUnread }
}
