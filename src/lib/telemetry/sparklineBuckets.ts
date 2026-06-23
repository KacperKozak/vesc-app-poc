/**
 * Incremental display-bucket aggregation for live sparklines.
 *
 * The live history buffer holds thousands of raw samples. Re-projecting and
 * re-pathing all of them on every publish pegs the JS thread. Instead we keep a
 * small, fixed-count set of evenly-spaced time buckets per metric and update
 * only the current bucket as samples arrive — O(1) per sample instead of O(N)
 * per publish.
 *
 * Buckets are evenly spaced across the window, so a chart's x-position is
 * implicit in the bucket index. The line value is each bucket's running
 * **mean** ({@link bucketMean}) — a settled aggregate, so the newest point
 * reads as history rather than the chaotic instantaneous reading. `min`/`max`
 * are kept for peak/alert use. Empty buckets have a zero sample count.
 */
export interface SparklineBuckets {
  count: number
  bucketMs: number
  /** Start time of the oldest bucket (index 0). */
  startMs: number
  /**
   * Real timestamp of the newest sample. Buckets advance only on slot
   * boundaries, but consumers use this as the line's right edge so the trace
   * scrolls continuously instead of stepping once per bucket width.
   */
  headTs: number
  /** Running sum and sample count per bucket; mean = sum / n (n = 0 → empty). */
  sum: number[]
  n: number[]
  min: number[]
  max: number[]
}

function zeros(count: number): number[] {
  return new Array(count).fill(0)
}

function nans(count: number): number[] {
  return new Array(count).fill(NaN)
}

/** Mean line value for bucket `i`, or NaN when the bucket holds no samples. */
export function bucketMean(b: SparklineBuckets, i: number): number {
  return b.n[i] > 0 ? b.sum[i] / b.n[i] : NaN
}

export function createBuckets(count: number, windowMs: number, nowMs: number): SparklineBuckets {
  const safeCount = Math.max(2, Math.floor(count))
  const bucketMs = windowMs / safeCount
  return {
    count: safeCount,
    bucketMs,
    // Anchor the newest bucket at `nowMs` so the first sample lands at the edge.
    startMs: nowMs - bucketMs * (safeCount - 1),
    headTs: nowMs,
    sum: zeros(safeCount),
    n: zeros(safeCount),
    min: nans(safeCount),
    max: nans(safeCount),
  }
}

/** Slide the window forward by `shift` buckets, dropping the oldest. */
function advance(b: SparklineBuckets, shift: number): void {
  if (shift >= b.count) {
    b.sum = zeros(b.count)
    b.n = zeros(b.count)
    b.min = nans(b.count)
    b.max = nans(b.count)
  } else {
    b.sum.splice(0, shift)
    b.n.splice(0, shift)
    b.min.splice(0, shift)
    b.max.splice(0, shift)
    for (let i = 0; i < shift; i += 1) {
      b.sum.push(0)
      b.n.push(0)
      b.min.push(NaN)
      b.max.push(NaN)
    }
  }
  b.startMs += b.bucketMs * shift
}

/**
 * Fold one sample into its bucket, sliding the window if the sample is newer
 * than the current head. Samples older than the window are ignored.
 */
export function pushBucketSample(b: SparklineBuckets, t: number, value: number): void {
  if (!Number.isFinite(value)) return
  let idx = Math.floor((t - b.startMs) / b.bucketMs)
  if (idx >= b.count) {
    advance(b, idx - (b.count - 1))
    idx = b.count - 1
  }
  if (idx < 0) return // older than the window — drop

  if (t > b.headTs) b.headTs = t
  b.sum[idx] += value
  b.n[idx] += 1
  b.min[idx] = Number.isNaN(b.min[idx]) ? value : Math.min(b.min[idx], value)
  b.max[idx] = Number.isNaN(b.max[idx]) ? value : Math.max(b.max[idx], value)
}
