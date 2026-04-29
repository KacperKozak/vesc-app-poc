export type LivePointSource = 'board' | 'gps'

export interface LiveDataBucket {
  bucketStartMs: number
  boardCount: number
  gpsCount: number
}

const MINUTE_MS = 60_000
const WINDOW_MINUTES = 10

export function minuteBucketStart(valueMs: number): number {
  return valueMs - (valueMs % MINUTE_MS)
}

export function recordLivePoint(
  buckets: LiveDataBucket[],
  source: LivePointSource,
  receivedAtMs: number,
  nowMs: number = receivedAtMs,
): LiveDataBucket[] {
  const bucketStartMs = minuteBucketStart(receivedAtMs)
  const currentBucketStartMs = minuteBucketStart(nowMs)
  const oldestBucketStartMs = currentBucketStartMs - (WINDOW_MINUTES - 1) * MINUTE_MS
  const byStart = new Map<number, LiveDataBucket>()

  for (const bucket of buckets) {
    if (
      bucket.bucketStartMs >= oldestBucketStartMs &&
      bucket.bucketStartMs <= currentBucketStartMs
    ) {
      byStart.set(bucket.bucketStartMs, bucket)
    }
  }

  if (bucketStartMs >= oldestBucketStartMs && bucketStartMs <= currentBucketStartMs) {
    const existing = byStart.get(bucketStartMs) ?? {
      bucketStartMs,
      boardCount: 0,
      gpsCount: 0,
    }
    byStart.set(bucketStartMs, {
      ...existing,
      boardCount: existing.boardCount + (source === 'board' ? 1 : 0),
      gpsCount: existing.gpsCount + (source === 'gps' ? 1 : 0),
    })
  }

  return Array.from(byStart.values()).sort((a, b) => a.bucketStartMs - b.bucketStartMs)
}
