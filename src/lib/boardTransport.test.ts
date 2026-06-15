import { describe, expect, it } from 'bun:test'

import { formatBoardTransport, pickDefaultTransport } from './boardTransport'

describe('formatBoardTransport', () => {
  it('labels an undetected transport', () => {
    expect(formatBoardTransport(null)).toBe('Not detected')
  })

  it('labels a direct transport', () => {
    expect(formatBoardTransport('direct')).toBe('Direct')
  })

  it('labels a CAN-forwarded transport with its id', () => {
    expect(formatBoardTransport(0)).toBe('CAN id 0')
    expect(formatBoardTransport(36)).toBe('CAN id 36')
  })
})

describe('pickDefaultTransport', () => {
  it('returns null when there are no candidates', () => {
    expect(pickDefaultTransport([])).toBeNull()
  })

  it('picks the first candidate in probe order', () => {
    expect(pickDefaultTransport(['direct', 36])).toBe('direct')
    expect(pickDefaultTransport([36, 'direct'])).toBe(36)
  })
})
