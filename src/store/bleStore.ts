import { create } from 'zustand'
import type { EventSubscription } from 'expo-modules-core'
import {
  scan as nativeScan,
  stopScan as nativeStopScan,
  startLocationUpdates as nativeStartLocationUpdates,
  setTelemetryRecordingEnabled as nativeSetTelemetryRecordingEnabled,
  startAutoConnect as nativeStartAutoConnect,
  stopAutoConnect as nativeStopAutoConnect,
  getSessionState as nativeGetSessionState,
  startSession,
  stopSession,
  listRecordings as nativeListRecordings,
  deleteRecording as nativeDeleteRecording,
  exportRecording as nativeExportRecording,
  addDeviceListener,
  addErrorListener,
  addSessionStateListener,
  addTelemetryListener,
  addLocationListener,
  addStopRequestedListener,
  type RecordingInfo,
  type SessionMode,
  type SessionStateEvent,
  type LocationEvent,
  type TelemetryEvent,
} from 'vesc-ble'
import { shouldStopNativeSessionOnDisconnect } from './monitoring'

export interface ScannedDevice {
  id: string
  name: string
  rssi: number
}

export type { RecordingInfo }
export type { SessionMode }

export type BleStatus = 'idle' | 'scanning' | 'connecting' | 'connected' | 'reconnecting' | 'error'

interface BleState {
  status: BleStatus
  sessionMode: SessionMode | null
  gpsStatus: 'idle' | 'active'
  nativeStateReady: boolean
  devices: ScannedDevice[]
  connectedId: string | null
  error: string | undefined
  recentTelemetry: TelemetryEvent[]
  recentLocations: LocationEvent[]
  telemetryRecordingEnabled: boolean
  recordDebugSession: boolean
  recordings: RecordingInfo[]
}

interface BleActions {
  startScan: () => void
  stopScan: () => void
  connect: (id: string, name?: string) => Promise<void>
  replayRecording: (recording: RecordingInfo) => Promise<void>
  disconnect: () => Promise<void>
  setRecordDebugSession: (enabled: boolean) => void
  loadRecordings: () => Promise<void>
  deleteRecording: (recording: RecordingInfo) => Promise<void>
  exportRecording: (recording: RecordingInfo) => Promise<string>
  syncNativeState: () => void
  clearRecentTelemetry: () => void
  startTelemetryRecording: () => void
  stopTelemetryRecording: () => void
  startGpsTracking: (context?: { deviceId?: string | null; deviceName?: string | null }) => void
}

type BleStore = BleState & BleActions
type BleSet = {
  (partial: Partial<BleStore> | ((state: BleStore) => Partial<BleStore>), replace?: false): void
}

// ---------------------------------------------------------------------------
// Native session subscriptions
// ---------------------------------------------------------------------------

let telemetrySub: EventSubscription | null = null
let sessionSub: EventSubscription | null = null
let scanSub: EventSubscription | null = null
let scanErrorSub: EventSubscription | null = null
let stopRequestedSub: EventSubscription | null = null
const DEFAULT_BOARD_NAME = 'VESC Board'
const MAC_ADDRESS_RE = /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i
const RECENT_WINDOW_MS = 10 * 60 * 1000

function removeSessionSubscriptions(): void {
  telemetrySub?.remove()
  telemetrySub = null
  sessionSub?.remove()
  sessionSub = null
}

function friendlyDeviceName(id: string, name?: string): string {
  const candidate = name?.trim()
  if (candidate && !MAC_ADDRESS_RE.test(candidate)) return candidate
  return DEFAULT_BOARD_NAME
}

function scannedDeviceName(id: string, name?: string): string {
  const candidate = name?.trim()
  if (candidate && !MAC_ADDRESS_RE.test(candidate)) return candidate
  return `Unknown ${id.slice(-5)}`
}

function telemetryKey(telemetry: TelemetryEvent): number {
  return telemetry.lastPacketAt
}

function locationKey(location: LocationEvent): number {
  return location.timestamp
}

function appendByTimestamp<T>(items: T[], item: T, key: (value: T) => number): T[] {
  const itemKey = key(item)
  if (items.some((existing) => key(existing) === itemKey)) return items
  const oldest = itemKey - RECENT_WINDOW_MS
  return [...items, item].filter((value) => key(value) >= oldest).sort((a, b) => key(a) - key(b))
}

function isBoardMode(mode: SessionMode | null | undefined): boolean {
  return mode === 'ble' || mode === 'replay'
}

function boardStatusFromSession(session: SessionStateEvent): BleStatus {
  if (session.boardStatus) return session.boardStatus
  if (!isBoardMode(session.mode)) return 'idle'
  return session.status as BleStatus
}

function boardConnectedIdFromSession(
  session: SessionStateEvent,
  fallbackDeviceId: string,
): string | null {
  if (!isBoardMode(session.mode)) return null
  return session.deviceId ?? fallbackDeviceId
}

function installSessionSubscriptions(
  set: BleSet,
  fallbackMode: SessionMode,
  fallbackDeviceId: string,
): void {
  removeSessionSubscriptions()
  telemetrySub = addTelemetryListener((telemetry) => {
    const current = useBleStore.getState()
    const recentTelemetry = appendByTimestamp(current.recentTelemetry, telemetry, telemetryKey)
    const recentLocations = telemetry.location
      ? appendByTimestamp(current.recentLocations, telemetry.location, locationKey)
      : current.recentLocations
    set({
      recentTelemetry,
      recentLocations,
    })
  })
  sessionSub = addSessionStateListener((session) => {
    const boardStatus = boardStatusFromSession(session)
    set((s) => {
      const hasRecentTelemetry = session.recentTelemetry != null
      const hasRecentLocations = session.recentLocations != null
      const shouldClearTelemetry = boardStatus === 'idle' || boardStatus === 'connecting'

      return {
        status: boardStatus,
        sessionMode: session.mode ?? fallbackMode,
        gpsStatus: session.gpsStatus ?? 'idle',
        nativeStateReady: true,
        connectedId: boardConnectedIdFromSession(session, fallbackDeviceId),
        error: session.error ?? undefined,
        telemetryRecordingEnabled: session.telemetryRecordingEnabled ?? false,
        recentTelemetry: hasRecentTelemetry
          ? session.recentTelemetry!
          : shouldClearTelemetry
            ? []
            : s.recentTelemetry,
        recentLocations: hasRecentLocations ? session.recentLocations! : s.recentLocations,
      }
    })
  })
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useBleStore = create<BleState & BleActions>((set, get) => ({
  // ---- state ----
  status: 'idle',
  sessionMode: null,
  gpsStatus: 'idle',
  nativeStateReady: false,
  devices: [],
  connectedId: null,
  error: undefined,
  recentTelemetry: [],
  recentLocations: [],
  telemetryRecordingEnabled: false,
  recordDebugSession: false,
  recordings: [],

  // ---- actions ----

  startScan() {
    const currentStatus = get().status
    if (
      currentStatus === 'connecting' ||
      currentStatus === 'connected' ||
      currentStatus === 'reconnecting'
    ) {
      return
    }

    set({ status: 'scanning', devices: [], error: undefined })

    scanSub?.remove()
    scanErrorSub?.remove()
    scanErrorSub = addErrorListener((event) => {
      set({ status: 'error', error: event.message })
    })
    scanSub = addDeviceListener((device) => {
      const name = scannedDeviceName(device.id, device.name)
      const rssi = device.rssi ?? -99

      set((state) => {
        const existing = state.devices.findIndex((d) => d.id === device.id)
        if (existing !== -1) {
          const updated = [...state.devices]
          updated[existing] = { id: device.id, name, rssi }
          return { devices: updated }
        }
        return {
          devices: [...state.devices, { id: device.id, name, rssi }],
        }
      })
    })
    try {
      nativeScan()
    } catch (err) {
      scanSub?.remove()
      scanSub = null
      scanErrorSub?.remove()
      scanErrorSub = null
      set({
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      })
    }
  },

  stopScan() {
    try {
      nativeStopScan()
    } catch {
      // Native scan may already be stopped after permission or lifecycle changes.
    }
    scanSub?.remove()
    scanSub = null
    scanErrorSub?.remove()
    scanErrorSub = null
    set((state) => ({
      status: state.status === 'scanning' ? 'idle' : state.status,
    }))
  },

  async connect(id: string, name?: string) {
    get().stopScan()
    set({ connectedId: null, error: undefined, recentTelemetry: [] })

    installSessionSubscriptions(set, 'ble', id)
    stopRequestedSub?.remove()
    stopRequestedSub = addStopRequestedListener(() => {
      removeSessionSubscriptions()
      void get().loadRecordings()
      get().syncNativeState()
    })

    const device = get().devices.find((d) => d.id === id)
    const deviceName = friendlyDeviceName(id, name ?? device?.name)

    try {
      await nativeStartAutoConnect({
        mode: 'ble',
        deviceId: id,
        deviceName,
        pollIntervalMs: 500,
        recordingEnabled: get().recordDebugSession,
        telemetryRecordingEnabled: get().telemetryRecordingEnabled,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      set({ status: 'error', sessionMode: 'ble', error: msg })
    }
  },

  async replayRecording(recording: RecordingInfo) {
    const { stopScan } = get()
    stopScan()
    set({ connectedId: null, error: undefined, recentTelemetry: [] })

    installSessionSubscriptions(set, 'replay', recording.path)

    try {
      await startSession({
        mode: 'replay',
        deviceName: recording.deviceName,
        recordingPath: recording.path,
        pollIntervalMs: 500,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      set({ status: 'error', sessionMode: 'replay', error: msg })
    }
  },

  async disconnect() {
    const sessionMode = get().sessionMode
    const shouldStopNativeSession = shouldStopNativeSessionOnDisconnect(sessionMode)

    // Remove subscriptions BEFORE the native call so intermediate session-state
    // events emitted during teardown don't flicker status through multiple values.
    removeSessionSubscriptions()
    stopRequestedSub?.remove()
    stopRequestedSub = null

    try {
      if (shouldStopNativeSession) {
        if (sessionMode === 'ble') {
          await nativeStopAutoConnect()
        } else {
          await stopSession()
        }
      }
    } catch {
      // Treat native "already stopped" style failures as a completed local teardown.
    } finally {
      await get().loadRecordings()
      get().syncNativeState()
    }
  },

  setRecordDebugSession(enabled: boolean) {
    set({ recordDebugSession: enabled })
  },

  async loadRecordings() {
    const recordings = await nativeListRecordings()
    set({ recordings })
  },

  async deleteRecording(recording: RecordingInfo) {
    await nativeDeleteRecording(recording.path)
    await get().loadRecordings()
  },

  async exportRecording(recording: RecordingInfo) {
    return nativeExportRecording(recording.path)
  },

  syncNativeState() {
    const session = nativeGetSessionState()
    const boardStatus = boardStatusFromSession(session)
    if (session.mode && boardStatus !== 'idle') {
      installSessionSubscriptions(set, session.mode, session.deviceId ?? '')
    } else {
      removeSessionSubscriptions()
    }
    set({
      status: boardStatus,
      sessionMode: session.mode,
      gpsStatus: session.gpsStatus ?? 'idle',
      connectedId: boardConnectedIdFromSession(session, ''),
      error: session.error ?? undefined,
      telemetryRecordingEnabled: session.telemetryRecordingEnabled ?? false,
      recentTelemetry: session.recentTelemetry ?? [],
      recentLocations: session.recentLocations ?? [],
      nativeStateReady: true,
    })
  },

  clearRecentTelemetry() {
    set({ recentTelemetry: [] })
  },

  startTelemetryRecording() {
    nativeSetTelemetryRecordingEnabled(true)
  },

  stopTelemetryRecording() {
    nativeSetTelemetryRecordingEnabled(false)
  },

  // Updates the device context used by the native GPS session (for record tagging).
  // GPS is always running — this just tells native which board to attribute locations to.
  startGpsTracking(context) {
    nativeStartLocationUpdates({
      deviceId: context?.deviceId ?? null,
      deviceName: context?.deviceName ?? null,
    })
  },
}))

// GPS listener is always active for the lifetime of the store — no start/stop.
// The native layer starts GPS automatically with every BLE session (beginSession)
// and auto-resumes standalone GPS monitoring after disconnect (consumePendingStop).
addLocationListener((location) => {
  useBleStore.setState((s) => ({
    recentLocations: appendByTimestamp(s.recentLocations, location, locationKey),
  }))
})
