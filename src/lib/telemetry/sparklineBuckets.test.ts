import { describe, expect, it } from 'bun:test'

import { bucketMean, createBuckets, pushBucketSample } from './sparklineBuckets'

const WINDOW = 60_000

describe('sparklineBuckets', () => {
  it('places a sample in the newest bucket at creation time', () => {
    const b = createBuckets(6, WINDOW, 1_000_000)
    pushBucketSample(b, 1_000_000, 42)
    expect(bucketMean(b, b.count - 1)).toBe(42)
    expect(bucketMean(b, 0)).toBeNaN()
  })

  it('uses the running mean as the line value, keeping min/max for peaks', () => {
    const b = createBuckets(6, WINDOW, 1_000_000)
    const t = 1_000_000
    pushBucketSample(b, t, 10)
    pushBucketSample(b, t + 1, 30)
    pushBucketSample(b, t + 2, 20)
    const i = b.count - 1
    expect(bucketMean(b, i)).toBe(20) // (10 + 30 + 20) / 3
    expect(b.min[i]).toBe(10)
    expect(b.max[i]).toBe(30)
  })

  it('slides the window forward as time advances, dropping oldest', () => {
    const b = createBuckets(6, WINDOW, 1_000_000)
    const bucketMs = b.bucketMs
    pushBucketSample(b, 1_000_000, 1) // lands in last bucket
    pushBucketSample(b, 1_000_000 + bucketMs * 2, 2)
    expect(bucketMean(b, b.count - 1)).toBe(2)
    // The original sample shifted left by two slots.
    expect(bucketMean(b, b.count - 3)).toBe(1)
  })

  it('resets when a sample jumps past the whole window', () => {
    const b = createBuckets(6, WINDOW, 1_000_000)
    pushBucketSample(b, 1_000_000, 1)
    pushBucketSample(b, 1_000_000 + WINDOW * 5, 9)
    expect(bucketMean(b, b.count - 1)).toBe(9)
    const filled = b.n.map((_, i) => bucketMean(b, i)).filter((v) => !Number.isNaN(v))
    expect(filled).toEqual([9])
  })

  it('ignores samples older than the window and non-finite values', () => {
    const b = createBuckets(6, WINDOW, 1_000_000)
    pushBucketSample(b, 1_000_000, 5)
    pushBucketSample(b, 1_000_000 - WINDOW * 2, 99) // too old
    pushBucketSample(b, 1_000_000, Number.NaN) // non-finite
    const filled = b.n.map((_, i) => bucketMean(b, i)).filter((v) => !Number.isNaN(v))
    expect(filled).toEqual([5])
  })

  it('tracks the real latest sample time in headTs for continuous scroll', () => {
    const b = createBuckets(6, WINDOW, 1_000_000)
    pushBucketSample(b, 1_000_000, 1)
    pushBucketSample(b, 1_000_500, 2) // same bucket, later time
    expect(b.headTs).toBe(1_000_500)
    const headBucketStart = b.startMs + b.bucketMs * (b.count - 1)
    expect(b.headTs).toBeGreaterThan(headBucketStart)
  })

  it('keeps a stable bucket count', () => {
    const b = createBuckets(32, WINDOW, 0)
    expect(b.sum).toHaveLength(32)
    expect(b.n).toHaveLength(32)
    expect(b.min).toHaveLength(32)
    expect(b.max).toHaveLength(32)
  })
})
