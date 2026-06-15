import type { BoardTransport } from 'vesc-ble'

/** Human-readable label for a Board Transport, including the undetected case. */
export function formatBoardTransport(transport: BoardTransport | null): string {
  if (transport == null) return 'Not detected'
  if (transport === 'direct') return 'Direct'
  return `CAN id ${transport}`
}

/** Default selection from confirmed candidates: the first valid one, or null when empty. */
export function pickDefaultTransport(candidates: BoardTransport[]): BoardTransport | null {
  return candidates[0] ?? null
}

export function requiresTransportDetection(transport: BoardTransport | null): boolean {
  return transport == null
}
