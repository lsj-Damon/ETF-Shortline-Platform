import { create } from 'zustand'
import { EtfItem } from '../api/etf'

interface EtfState {
  etfList: EtfItem[]
  currentSymbol: string
  bars: any[]
  quote: any | null
  loading: boolean
  setEtfList: (list: EtfItem[]) => void
  setCurrentSymbol: (symbol: string) => void
  setBars: (bars: any[]) => void
  setQuote: (quote: any) => void
  setLoading: (loading: boolean) => void
}

export const useEtfStore = create<EtfState>((set) => ({
  etfList: [],
  currentSymbol: '',
  bars: [],
  quote: null,
  loading: false,
  setEtfList: (list) => set({ etfList: list }),
  setCurrentSymbol: (symbol) => set({ currentSymbol: symbol }),
  setBars: (bars) => set({ bars }),
  setQuote: (quote) => set({ quote }),
  setLoading: (loading) => set({ loading }),
}))
