import { beforeEach, expect, mock, test } from 'bun:test'
import type { Board } from 'vesc-ble'

const actualVescBle = await import('../../modules/vesc-ble/src/index')

const getBoards = mock(async () => [] as Board[])
const getSettings = mock(async () => ({
  liveHistoryLimit: 5,
  autoConnect: true,
  autoRecording: false,
  selectedBoardId: null,
  lastGpsLatitude: null,
  lastGpsLongitude: null,
  movingSpeedThresholdKmh: 3,
  freeSpinMaxSpeedDeltaKmh: 10,
  freeSpinStationaryBoardCapKmh: 15,
}))
const setSelectedBoard = mock(() => {})
const upsertBoard = mock(async () => {})
const deleteBoard = mock(async () => {})

const vescBleMock = {
  ...actualVescBle,
  getBoards,
  getSettings,
  setSelectedBoard,
  upsertBoard,
  deleteBoard,
}

mock.module('vesc-ble', () => vescBleMock)
mock.module('../../modules/vesc-ble/src/index', () => vescBleMock)

beforeEach(async () => {
  getBoards.mockClear()
  getSettings.mockClear()
  setSelectedBoard.mockClear()
  upsertBoard.mockClear()
  deleteBoard.mockClear()
  const { useBoardStore } = await import('./boardStore')
  useBoardStore.setState({
    boards: [],
    activeBoardId: null,
    hasLoaded: false,
  })
})

test('new boards default to Molicel P50B 20S2P preset battery config', async () => {
  const { DEFAULT_BATTERY_CONFIG, useBoardStore } = await import('./boardStore')

  const board = useBoardStore.getState().addBoard({ name: 'ADV' })

  expect(board.batteryConfig).toEqual(DEFAULT_BATTERY_CONFIG)
  expect(upsertBoard).toHaveBeenCalledWith(
    expect.objectContaining({ batteryConfig: DEFAULT_BATTERY_CONFIG }),
  )
})

test('new boards can use manual battery config', async () => {
  const { useBoardStore } = await import('./boardStore')
  const batteryConfig = { mode: 'manual' as const, minVoltage: 60, maxVoltage: 84 }

  const board = useBoardStore.getState().addBoard({ name: 'ADV', batteryConfig })

  expect(board.batteryConfig).toEqual(batteryConfig)
  expect(upsertBoard).toHaveBeenCalledWith(expect.objectContaining({ batteryConfig }))
})
