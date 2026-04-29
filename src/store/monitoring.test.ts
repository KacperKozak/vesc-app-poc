import { describe, expect, test } from 'bun:test'

import {
  shouldResumeGpsMonitoringAfterDisconnect,
  shouldStopNativeSessionOnDisconnect,
} from './monitoring'

describe('shouldResumeGpsMonitoringAfterDisconnect', () => {
  test('resumes GPS monitoring after a BLE board disconnect', () => {
    expect(shouldResumeGpsMonitoringAfterDisconnect('ble')).toBe(true)
  })

  test('does not restart GPS after replay or idle disconnects', () => {
    expect(shouldResumeGpsMonitoringAfterDisconnect('replay')).toBe(false)
    expect(shouldResumeGpsMonitoringAfterDisconnect('gps')).toBe(false)
    expect(shouldResumeGpsMonitoringAfterDisconnect(null)).toBe(false)
  })
})

describe('shouldStopNativeSessionOnDisconnect', () => {
  test('stops board-backed native sessions', () => {
    expect(shouldStopNativeSessionOnDisconnect('ble')).toBe(true)
    expect(shouldStopNativeSessionOnDisconnect('replay')).toBe(true)
  })

  test('does not stop GPS-only monitoring or idle state', () => {
    expect(shouldStopNativeSessionOnDisconnect('gps')).toBe(false)
    expect(shouldStopNativeSessionOnDisconnect(null)).toBe(false)
  })
})
