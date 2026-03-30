import { create } from 'zustand'

interface AnalysisState {
  jobId: number | null
  result: any | null
  trades: any[]
  chart: any | null
  selectedTrade: any | null
  setAnalysis: (payload: { jobId: number; result: any; trades: any[]; chart: any }) => void
  setSelectedTrade: (trade: any | null) => void
}

export const useAnalysisStore = create<AnalysisState>((set) => ({
  jobId: null,
  result: null,
  trades: [],
  chart: null,
  selectedTrade: null,
  setAnalysis: (payload) => set({ ...payload }),
  setSelectedTrade: (trade) => set({ selectedTrade: trade }),
}))
