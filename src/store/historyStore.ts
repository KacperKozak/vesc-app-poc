import { create } from 'zustand'
import {
  getTelemetryHistory,
  getHistoryRange,
  getTelemetrySummary,
  clearTelemetryHistory,
  type HistoryGpsSample,
  type HistoryMarker,
  type TelemetryHistoryBlock,
  type TelemetrySample,
  type TelemetrySummary,
} from 'vesc-ble'

interface HistoryState {
  blocks: TelemetryHistoryBlock[]
  selectedBlock: TelemetryHistoryBlock | null
  samples: TelemetrySample[]
  gpsSamples: HistoryGpsSample[]
  markers: HistoryMarker[]
  summary: TelemetrySummary | null
  loading: boolean
  loadingSamples: boolean
  error: string | undefined
  hasMore: boolean
}

interface HistoryActions {
  loadInitial: () => Promise<void>
  loadMore: () => Promise<void>
  selectBlock: (block: TelemetryHistoryBlock | null) => Promise<void>
  refreshSummary: () => Promise<void>
  clearHistory: () => Promise<void>
}

const PAGE_SIZE = 100

export const useHistoryStore = create<HistoryState & HistoryActions>((set, get) => ({
  blocks: [],
  selectedBlock: null,
  samples: [],
  gpsSamples: [],
  markers: [],
  summary: null,
  loading: false,
  loadingSamples: false,
  error: undefined,
  hasMore: true,

  async loadInitial() {
    set({ loading: true, error: undefined })
    try {
      const [summary, blocks] = await Promise.all([
        getTelemetrySummary(),
        getTelemetryHistory({ limit: PAGE_SIZE }),
      ])
      set({
        summary,
        blocks,
        selectedBlock: null,
        samples: [],
        gpsSamples: [],
        markers: [],
        hasMore: blocks.length === PAGE_SIZE,
      })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    } finally {
      set({ loading: false })
    }
  },

  async loadMore() {
    const { blocks, hasMore, loading } = get()
    if (loading || !hasMore || blocks.length === 0) return
    set({ loading: true, error: undefined })
    try {
      const cursorBeforeMs = Math.min(...blocks.map((b) => b.bucketStartMs)) - 1
      const next = await getTelemetryHistory({ limit: PAGE_SIZE, cursorBeforeMs })
      const ids = new Set(blocks.map((b) => b.id))
      set({
        blocks: [...blocks, ...next.filter((b) => !ids.has(b.id))],
        hasMore: next.length === PAGE_SIZE,
      })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    } finally {
      set({ loading: false })
    }
  },

  async selectBlock(block) {
    if (!block) {
      set({ selectedBlock: null, samples: [], gpsSamples: [], markers: [], loadingSamples: false })
      return
    }
    set({
      selectedBlock: block,
      samples: [],
      gpsSamples: [],
      markers: [],
      loadingSamples: true,
      error: undefined,
    })
    try {
      const range = await getHistoryRange({
        fromMs: block.startAtMs,
        toMs: block.endAtMs,
        ...(block.deviceId ? { deviceId: block.deviceId } : {}),
        limit: 500,
      })
      set({ samples: range.boardSamples, gpsSamples: range.gpsSamples, markers: range.markers })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    } finally {
      set({ loadingSamples: false })
    }
  },

  async refreshSummary() {
    try {
      const summary = await getTelemetrySummary()
      set({ summary })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    }
  },

  async clearHistory() {
    set({ loading: true, error: undefined })
    try {
      await clearTelemetryHistory()
      set({
        blocks: [],
        selectedBlock: null,
        samples: [],
        gpsSamples: [],
        markers: [],
        summary: await getTelemetrySummary(),
        hasMore: false,
      })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    } finally {
      set({ loading: false })
    }
  },
}))

export type {
  HistoryGpsSample,
  HistoryMarker,
  TelemetryHistoryBlock,
  TelemetrySample,
  TelemetrySummary,
}
