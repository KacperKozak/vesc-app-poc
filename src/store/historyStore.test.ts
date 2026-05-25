import { beforeEach, expect, mock, test } from 'bun:test'

import type {
  HistoryGpsSample,
  HistoryMarker,
  TelemetryMinuteBucket,
  TelemetrySample,
  TelemetrySummary,
} from 'vesc-ble'

const actualVescBle = await import('../../modules/vesc-ble/src/index')

const summary: TelemetrySummary = {
  sampleCount: 0,
  gpsPointCount: 0,
  firstAtMs: null,
  lastAtMs: null,
  droppedPendingSamples: 0,
}

const getTelemetryHistory = mock(async () => [] as TelemetryMinuteBucket[])
type HistoryRangeResult = {
  boardSamples: TelemetrySample[]
  gpsSamples: HistoryGpsSample[]
  markers: HistoryMarker[]
}

const getHistoryRange = mock(
  async (): Promise<HistoryRangeResult> => ({
    boardSamples: [],
    gpsSamples: [],
    markers: [],
  }),
)
const getTelemetrySummary = mock(async () => summary)
const clearTelemetryHistory = mock(async () => {})
const deleteTelemetryRange = mock(async () => 0)
const getSettings = mock(async () => ({
  liveHistoryLimit: 5,
  autoConnect: true,
  autoRecording: true,
  selectedBoardId: null,
  lastGpsLatitude: null,
  lastGpsLongitude: null,
  movingSpeedThresholdKmh: 3,
}))
const updateSetting = mock(async () => {})

const vescBleMock = {
  ...actualVescBle,
  getTelemetryHistory,
  getHistoryRange,
  getTelemetrySummary,
  clearTelemetryHistory,
  deleteTelemetryRange,
  getSettings,
  updateSetting,
}

mock.module('vesc-ble', () => vescBleMock)
mock.module('../../modules/vesc-ble/src/index', () => vescBleMock)

function block(overrides: Partial<TelemetryMinuteBucket>): TelemetryMinuteBucket {
  const startAtMs = overrides.startAtMs ?? 0
  const endAtMs = overrides.endAtMs ?? startAtMs + 60_000
  return {
    id: overrides.id ?? `b-${startAtMs}`,
    startAtMs,
    endAtMs,
    bucketStartMs: overrides.bucketStartMs ?? startAtMs,
    deviceId: overrides.deviceId ?? 'dev-a',
    deviceName: overrides.deviceName ?? 'Board A',
    sampleCount: overrides.sampleCount ?? 10,
    gpsPointCount: overrides.gpsPointCount ?? 5,
    preciseGpsPointCount: overrides.preciseGpsPointCount ?? 4,
    maxAbsSpeedKmh: overrides.maxAbsSpeedKmh ?? 20,
    maxGpsSpeedKmh: overrides.maxGpsSpeedKmh ?? 18,
    avgSpeedKmh: overrides.avgSpeedKmh ?? 15,
    avgSpeedSampleCount: overrides.avgSpeedSampleCount ?? 10,
    minBatteryVoltage: overrides.minBatteryVoltage ?? 52,
    maxMotorCurrent: overrides.maxMotorCurrent ?? 10,
    maxBatteryCurrent: overrides.maxBatteryCurrent ?? 8,
    maxDuty: overrides.maxDuty ?? 0.5,
    faultCount: overrides.faultCount ?? 0,
    distanceDeltaM: overrides.distanceDeltaM !== undefined ? overrides.distanceDeltaM : 100,
    gpsDistanceM: overrides.gpsDistanceM !== undefined ? overrides.gpsDistanceM : 120,
    maxTempMosfet: overrides.maxTempMosfet ?? null,
    maxTempMotor: overrides.maxTempMotor ?? null,
    firstLatitude: overrides.firstLatitude ?? null,
    firstLongitude: overrides.firstLongitude ?? null,
    boundaryBefore: overrides.boundaryBefore ?? 'none',
    boundaryMessage: overrides.boundaryMessage ?? null,
    gapBeforeMs: overrides.gapBeforeMs ?? null,
    batteryUsedWh: overrides.batteryUsedWh ?? 0,
    batteryRegenWh: overrides.batteryRegenWh ?? 0,
  }
}

function sample(overrides: Partial<TelemetrySample>): TelemetrySample {
  return {
    id: overrides.id ?? 1,
    capturedAtMs: overrides.capturedAtMs ?? 0,
    deviceId: overrides.deviceId ?? 'dev-a',
    deviceName: overrides.deviceName ?? 'Board A',
    speedKmh: overrides.speedKmh ?? 0,
    batteryVoltage: overrides.batteryVoltage ?? 50,
    motorCurrent: overrides.motorCurrent ?? 0,
    batteryCurrent: overrides.batteryCurrent ?? 0,
    dutyCycle: overrides.dutyCycle ?? 0,
    pitch: overrides.pitch ?? 0,
    roll: overrides.roll ?? 0,
    balancePitch: overrides.balancePitch ?? 0,
    balanceCurrent: overrides.balanceCurrent ?? 0,
    erpm: overrides.erpm ?? 0,
    state: overrides.state ?? 0,
    switchState: overrides.switchState ?? 0,
    adc1: overrides.adc1 ?? 0,
    adc2: overrides.adc2 ?? 0,
    odometer: overrides.odometer ?? null,
    tempMosfet: overrides.tempMosfet ?? null,
    tempMotor: overrides.tempMotor ?? null,
    hasFault: overrides.hasFault ?? false,
    faultCode: overrides.faultCode ?? 0,
    latitude: overrides.latitude ?? null,
    longitude: overrides.longitude ?? null,
  }
}

beforeEach(async () => {
  getTelemetryHistory.mockClear()
  getHistoryRange.mockClear()
  getTelemetrySummary.mockClear()
  clearTelemetryHistory.mockClear()
  deleteTelemetryRange.mockClear()
  getSettings.mockClear()
  updateSetting.mockClear()
  const { useHistoryStore } = await import('./historyStore')
  useHistoryStore.setState({
    blocks: [],
    sessions: [],
    liveBlocks: [],
    selectedBlock: null,
    selectedSession: null,
    samples: [],
    gpsSamples: [],
    sessionSamples: [],
    sessionGpsSamples: [],
    sessionMarkers: [],
    liveSamples: [],
    liveGpsSamples: [],
    markers: [],
    summary: null,
    loading: false,
    loadingSamples: false,
    loadingSession: false,
    sessionTruncated: false,
    error: undefined,
    hasMore: true,
  })
})

test('removes selected session from history and selects next ride', async () => {
  const newest = block({
    id: 'newest',
    startAtMs: 3_000_000,
    endAtMs: 3_060_000,
  })
  const selected = block({
    id: 'selected',
    startAtMs: 2_000_000,
    endAtMs: 2_060_000,
  })
  const oldest = block({
    id: 'oldest',
    startAtMs: 1_000_000,
    endAtMs: 1_060_000,
  })
  getTelemetryHistory.mockResolvedValueOnce([newest, selected, oldest])

  const { useHistoryStore } = await import('./historyStore')

  await useHistoryStore.getState().loadInitial()
  await useHistoryStore.getState().selectSession(useHistoryStore.getState().sessions[1])
  await (useHistoryStore.getState() as any).removeSelectedSession()

  expect(deleteTelemetryRange).toHaveBeenCalledWith({
    fromMs: selected.startAtMs,
    toMs: selected.endAtMs,
    deviceId: selected.deviceId,
  })
  expect(useHistoryStore.getState().blocks.map((b) => b.id)).toEqual(['newest', 'oldest'])
  expect(useHistoryStore.getState().sessions.map((s) => s.id)).toHaveLength(2)
  expect(useHistoryStore.getState().selectedSession?.blockIds).toEqual(['oldest'])
  expect(useHistoryStore.getState().sessionSamples).toEqual([])
  expect(useHistoryStore.getState().sessionGpsSamples).toEqual([])
  expect(useHistoryStore.getState().sessionMarkers).toEqual([])
})

test('selects ride immediately while loading its full route', async () => {
  const current = block({
    id: 'current',
    startAtMs: 2_000_000,
    endAtMs: 2_060_000,
  })
  const next = block({
    id: 'next',
    startAtMs: 1_000_000,
    endAtMs: 1_060_000,
    sampleCount: 12_500,
    gpsPointCount: 4,
    firstLatitude: 51,
    firstLongitude: 17,
  })
  const currentSample = sample({ id: 10, capturedAtMs: current.startAtMs })
  getTelemetryHistory.mockResolvedValueOnce([current, next])
  getHistoryRange.mockResolvedValueOnce({
    boardSamples: [currentSample],
    gpsSamples: [],
    markers: [],
  })

  const { useHistoryStore } = await import('./historyStore')

  await useHistoryStore.getState().loadInitial()
  await useHistoryStore.getState().selectSession(useHistoryStore.getState().sessions[0])

  let resolveNextRange: (value: HistoryRangeResult) => void = () => {}
  getHistoryRange.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveNextRange = resolve
      }),
  )

  const selectNext = useHistoryStore
    .getState()
    .selectSession(useHistoryStore.getState().sessions[1])

  expect(useHistoryStore.getState().loadingSession).toBe(true)
  expect(useHistoryStore.getState().selectedSession?.id).toBe(
    useHistoryStore.getState().sessions[1].id,
  )
  expect(useHistoryStore.getState().sessionSamples).toEqual([])
  expect(getHistoryRange).toHaveBeenLastCalledWith({
    fromMs: next.startAtMs,
    toMs: next.endAtMs,
    deviceId: next.deviceId,
    limit: next.sampleCount + 1,
  })

  resolveNextRange({
    boardSamples: Array.from({ length: next.sampleCount }, (_, index) =>
      sample({ id: index + 20, capturedAtMs: next.startAtMs + index }),
    ),
    gpsSamples: Array.from({ length: next.gpsPointCount }, (_, index) => ({
      id: index + 1,
      capturedAtMs: next.startAtMs + index,
      deviceId: next.deviceId,
      deviceName: next.deviceName,
      latitude: 51 + index * 0.001,
      longitude: 17 + index * 0.001,
      speedMps: null,
      bearingDeg: null,
      accuracyM: null,
      altitudeM: null,
      timestamp: next.startAtMs + index,
      distanceFromPreviousM: null,
      precise: true,
    })),
    markers: [],
  })
  await selectNext

  expect(useHistoryStore.getState().loadingSession).toBe(false)
  expect(useHistoryStore.getState().selectedSession?.id).toBe(
    useHistoryStore.getState().sessions[1].id,
  )
  expect(useHistoryStore.getState().sessionSamples).toHaveLength(next.sampleCount)
  expect(useHistoryStore.getState().sessionTruncated).toBe(false)
})

test('loads a small GPS preview when selected ride has no bucket coordinate', async () => {
  const ride = block({
    id: 'ride',
    startAtMs: 1_000_000,
    endAtMs: 1_060_000,
    sampleCount: 500,
    gpsPointCount: 2,
    firstLatitude: null,
    firstLongitude: null,
  })
  const previewGps: HistoryGpsSample = {
    id: 1,
    capturedAtMs: ride.startAtMs,
    deviceId: ride.deviceId,
    deviceName: ride.deviceName,
    latitude: 51,
    longitude: 17,
    speedMps: null,
    bearingDeg: null,
    accuracyM: null,
    altitudeM: null,
    timestamp: ride.startAtMs,
    distanceFromPreviousM: null,
    precise: true,
  }
  let resolveFullRange: (value: HistoryRangeResult) => void = () => {}
  getHistoryRange.mockResolvedValueOnce({
    boardSamples: [],
    gpsSamples: [previewGps],
    markers: [],
  })
  getHistoryRange.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveFullRange = resolve
      }),
  )

  const { useHistoryStore } = await import('./historyStore')

  const select = useHistoryStore.getState().selectSession({
    deviceId: ride.deviceId,
    deviceName: ride.deviceName,
    boundaryBefore: ride.boundaryBefore,
    startAtMs: ride.startAtMs,
    endAtMs: ride.endAtMs,
    blockIds: [ride.id],
    blockCount: 1,
    sampleCount: ride.sampleCount,
    gpsPointCount: ride.gpsPointCount,
    preciseGpsPointCount: ride.preciseGpsPointCount,
    distanceM: ride.distanceDeltaM,
    maxSpeedKmh: ride.maxAbsSpeedKmh,
    avgSpeedKmh: ride.avgSpeedKmh,
    maxTempMosfet: ride.maxTempMosfet,
    maxTempMotor: ride.maxTempMotor,
    maxDuty: ride.maxDuty,
    batteryUsedWh: ride.batteryUsedWh,
    batteryRegenWh: ride.batteryRegenWh,
    firstLatitude: null,
    firstLongitude: null,
    centerLatitude: null,
    centerLongitude: null,
    faultCount: ride.faultCount,
    id: `${ride.deviceId}:${ride.startAtMs}:${ride.endAtMs}`,
  })
  await Promise.resolve()

  expect(getHistoryRange).toHaveBeenNthCalledWith(1, {
    fromMs: ride.startAtMs,
    toMs: ride.endAtMs,
    deviceId: ride.deviceId,
    limit: 240,
  })
  expect(useHistoryStore.getState().sessionGpsSamples).toEqual([previewGps])

  resolveFullRange({
    boardSamples: Array.from({ length: ride.sampleCount }, (_, index) =>
      sample({ id: index + 1, capturedAtMs: ride.startAtMs + index }),
    ),
    gpsSamples: [previewGps, { ...previewGps, id: 2, capturedAtMs: ride.startAtMs + 1 }],
    markers: [],
  })
  await select

  expect(useHistoryStore.getState().loadingSession).toBe(false)
  expect(useHistoryStore.getState().sessionTruncated).toBe(false)
})

test('loads older history pages and merges sessions', async () => {
  const newest = block({
    id: 'newest',
    startAtMs: 3_000_000,
    endAtMs: 3_060_000,
  })
  const oldestLoaded = block({
    id: 'oldest-loaded',
    startAtMs: 2_000_000,
    endAtMs: 2_060_000,
  })
  const older = block({
    id: 'older',
    startAtMs: 1_000_000,
    endAtMs: 1_060_000,
  })
  getTelemetryHistory.mockResolvedValueOnce([newest, oldestLoaded])
  getTelemetryHistory.mockResolvedValueOnce([older])

  const { useHistoryStore } = await import('./historyStore')

  await useHistoryStore.getState().loadInitial()
  useHistoryStore.setState({ hasMore: true })
  await useHistoryStore.getState().loadMore()

  expect((getTelemetryHistory.mock.calls as any[])[1][0]).toEqual({
    limit: 100,
    cursorBeforeMs: oldestLoaded.bucketStartMs - 1,
  })
  expect(useHistoryStore.getState().blocks.map((b) => b.id)).toEqual([
    'newest',
    'oldest-loaded',
    'older',
  ])
  expect(useHistoryStore.getState().sessions.map((s) => s.blockIds)).toEqual([
    ['newest'],
    ['oldest-loaded'],
    ['older'],
  ])
  expect(useHistoryStore.getState().hasMore).toBe(false)
})

test('keeps selected session addressable when older page expands it', async () => {
  const newest = block({
    id: 'newest',
    startAtMs: 3_000_000,
    endAtMs: 3_060_000,
  })
  const partial = block({
    id: 'partial',
    startAtMs: 2_000_000,
    endAtMs: 2_060_000,
  })
  const olderSameRide = block({
    id: 'older-same-ride',
    startAtMs: 1_960_000,
    endAtMs: 1_999_000,
  })
  getTelemetryHistory.mockResolvedValueOnce([newest, partial])
  getTelemetryHistory.mockResolvedValueOnce([olderSameRide])

  const { useHistoryStore } = await import('./historyStore')

  await useHistoryStore.getState().loadInitial()
  useHistoryStore.setState({
    hasMore: true,
    selectedSession: useHistoryStore.getState().sessions[1],
  })
  await useHistoryStore.getState().loadMore()

  expect(useHistoryStore.getState().sessions).toHaveLength(2)
  expect(useHistoryStore.getState().selectedSession?.startAtMs).toBe(1_960_000)
  expect(useHistoryStore.getState().selectedSession?.endAtMs).toBe(2_060_000)
})
