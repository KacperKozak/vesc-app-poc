package expo.modules.vescble.telemetry

/**
 * Smooths IR-compensated battery SoC for alert evaluation.
 *
 * The compensated % is intentionally responsive for display (ADR 0011) and swings several
 * percent with load. When the pack sits near an alert threshold those swings cross the
 * fire/re-arm boundaries repeatedly, flapping the hysteresis. Alerts therefore compare a
 * moving average over a short window instead of the instantaneous value. Display keeps the
 * raw value.
 */
class BatterySocSmoother(private val windowMs: Long = 10_000L) {
    private data class Sample(val tMs: Long, val percent: Double)

    private val samples = ArrayDeque<Sample>()

    fun reset() {
        samples.clear()
    }

    /** Adds a sample and returns the average SoC over the trailing window. */
    fun smooth(percent: Double, nowMs: Long): Double {
        samples.addLast(Sample(nowMs, percent))
        while (samples.size > 1 && nowMs - samples.first().tMs > windowMs) {
            samples.removeFirst()
        }
        return samples.sumOf { it.percent } / samples.size
    }
}
