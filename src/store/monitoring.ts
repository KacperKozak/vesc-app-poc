import type { SessionMode } from 'vesc-ble'

export function shouldStopNativeSessionOnDisconnect(sessionMode: SessionMode | null): boolean {
  return sessionMode === 'ble' || sessionMode === 'replay'
}
