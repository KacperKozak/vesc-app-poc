import { expect, test } from 'bun:test'

import { minuteBucketStart, recordLivePoint } from './liveMonitor'

test('minuteBucketStart floors timestamps to minute start', () => {
  expect(minuteBucketStart(123_456)).toBe(120_000)
})

test('recordLivePoint counts board and gps events in minute buckets', () => {
  let buckets = recordLivePoint([], 'board', 120_500, 121_000)
  buckets = recordLivePoint(buckets, 'gps', 121_500, 122_000)
  buckets = recordLivePoint(buckets, 'board', 181_000, 181_000)

  expect(buckets).toEqual([
    { bucketStartMs: 120_000, boardCount: 1, gpsCount: 1 },
    { bucketStartMs: 180_000, boardCount: 1, gpsCount: 0 },
  ])
})

test('recordLivePoint keeps only the current 10 minute window', () => {
  const buckets = recordLivePoint(
    [
      { bucketStartMs: 0, boardCount: 10, gpsCount: 0 },
      { bucketStartMs: 60_000, boardCount: 1, gpsCount: 0 },
    ],
    'gps',
    600_000,
    600_000,
  )

  expect(buckets).toEqual([
    { bucketStartMs: 60_000, boardCount: 1, gpsCount: 0 },
    { bucketStartMs: 600_000, boardCount: 0, gpsCount: 1 },
  ])
})
