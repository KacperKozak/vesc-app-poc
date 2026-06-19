package expo.modules.vescble.telemetry

/**
 * Time-bucketed min/max decimation of a single metric extracted from telemetry
 * rows. Native owns the live window in memory; this hands the UI a render-ready
 * series (~2×bucketCount points) instead of streaming every raw sample across
 * the JS bridge. Each bucket keeps its min and max sample so peaks and troughs
 * survive, emitted in chronological order.
 *
 * Output is a flat `[ts0, v0, ts1, v1, ...]` array — the most compact shape for
 * the bridge (timestamps are ms and fit exactly in a Double below 2^53).
 */
object LiveSeriesDownsampler {
    fun <T> downsampleMinMax(
        rows: List<T>,
        bucketCount: Int,
        timestamp: (T) -> Long,
        value: (T) -> Double?,
    ): DoubleArray {
        if (rows.isEmpty() || bucketCount <= 0) return EMPTY

        val firstTs = timestamp(rows.first())
        val lastTs = timestamp(rows.last())
        val span = lastTs - firstTs

        val out = ArrayList<Double>(minOf(rows.size, bucketCount * 2) * 2)

        // Degenerate window (single timestamp): collapse to one min + one max point.
        if (span <= 0L) {
            var minTs = 0L
            var minV = Double.NaN
            var maxTs = 0L
            var maxV = Double.NaN
            var has = false
            for (row in rows) {
                val v = value(row) ?: continue
                if (!v.isFinite()) continue
                val ts = timestamp(row)
                if (!has || v < minV) { minV = v; minTs = ts }
                if (!has || v > maxV) { maxV = v; maxTs = ts }
                has = true
            }
            if (has) flush(out, minTs, minV, maxTs, maxV)
            return out.toDoubleArray()
        }

        val bucketWidth = span.toDouble() / bucketCount
        var bucketIndex = -1
        var minTs = 0L
        var minV = Double.NaN
        var maxTs = 0L
        var maxV = Double.NaN
        var bucketHasData = false

        for (row in rows) {
            val v = value(row) ?: continue
            if (!v.isFinite()) continue
            val ts = timestamp(row)
            val bucket = minOf(((ts - firstTs) / bucketWidth).toInt(), bucketCount - 1)

            if (bucket != bucketIndex) {
                if (bucketHasData) flush(out, minTs, minV, maxTs, maxV)
                bucketHasData = false
                bucketIndex = bucket
            }

            if (!bucketHasData || v < minV) { minV = v; minTs = ts }
            if (!bucketHasData || v > maxV) { maxV = v; maxTs = ts }
            bucketHasData = true
        }

        if (bucketHasData) flush(out, minTs, minV, maxTs, maxV)
        return out.toDoubleArray()
    }

    private fun flush(out: ArrayList<Double>, minTs: Long, minV: Double, maxTs: Long, maxV: Double) {
        when {
            // Same sample (flat bucket): one point.
            minTs == maxTs && minV == maxV -> { out.add(minTs.toDouble()); out.add(minV) }
            // Distinct extremes: emit both in chronological order (min first on ties).
            minTs <= maxTs -> { out.add(minTs.toDouble()); out.add(minV); out.add(maxTs.toDouble()); out.add(maxV) }
            else -> { out.add(maxTs.toDouble()); out.add(maxV); out.add(minTs.toDouble()); out.add(minV) }
        }
    }

    private val EMPTY = DoubleArray(0)
}
