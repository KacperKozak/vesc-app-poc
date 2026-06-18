package expo.modules.vescble.telemetry

/**
 * Median-windowed Battery SoC Estimate (ADR-0016).
 *
 * IR compensation (ADR-0011) leaves residual sag transients that drop the percentage a few
 * points for a few seconds, making the displayed % jump and flapping battery alerts. This holds
 * a trailing window of percentages and returns their median — rejecting brief spikes harder than
 * a mean while lagging the real trend less. Display and alert evaluation both read the median so
 * they never diverge; raw voltage stays the untouched Telemetry Sample.
 *
 * A [windowMs] of 0 disables smoothing: every call returns the latest percentage unchanged.
 */
class SocMedianWindow(@Volatile var windowMs: Long = 20_000L) {
    private data class Sample(val tMs: Long, val percent: Double)

    private val samples = ArrayDeque<Sample>()

    fun reset() {
        samples.clear()
    }

    /** Adds a sample and returns the median SoC over the trailing window. */
    fun median(percent: Double, nowMs: Long): Double {
        if (windowMs <= 0L) {
            samples.clear()
            return percent
        }
        samples.addLast(Sample(nowMs, percent))
        while (samples.size > 1 && nowMs - samples.first().tMs > windowMs) {
            samples.removeFirst()
        }
        val sorted = samples.map { it.percent }.sorted()
        val mid = sorted.size / 2
        return if (sorted.size % 2 == 1) sorted[mid] else (sorted[mid - 1] + sorted[mid]) / 2.0
    }
}
