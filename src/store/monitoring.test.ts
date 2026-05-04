import { describe, expect, test } from 'bun:test'

import { shouldStopNativeSessionOnDisconnect } from './monitoring'

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
