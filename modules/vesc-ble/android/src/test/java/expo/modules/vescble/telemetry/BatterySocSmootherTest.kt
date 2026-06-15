package expo.modules.vescble.telemetry

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class BatterySocSmootherTest {

    @Test
    fun `single sample returns itself`() {
        val s = BatterySocSmoother(windowMs = 10_000L)
        assertEquals(54.0, s.smooth(54.0, 0L), 0.001)
    }

    @Test
    fun `averages samples within window`() {
        val s = BatterySocSmoother(windowMs = 10_000L)
        s.smooth(50.0, 0L)
        s.smooth(60.0, 1_000L)
        // (50 + 60 + 55) / 3
        assertEquals(55.0, s.smooth(55.0, 2_000L), 0.001)
    }

    @Test
    fun `drops samples older than the window`() {
        val s = BatterySocSmoother(windowMs = 5_000L)
        s.smooth(0.0, 0L) // expires
        s.smooth(100.0, 6_000L)
        // 0.0 is older than 5s before 7_000 -> only 100 and 50 remain
        assertEquals(75.0, s.smooth(50.0, 7_000L), 0.001)
    }

    @Test
    fun `damps oscillation so it stays below a threshold near the resting level`() {
        // Pack resting ~54%, alert threshold 55. Responsive % swings 50..60 with load.
        // Smoothed value must stay below 55 (no flap above the 58% re-arm point).
        val s = BatterySocSmoother(windowMs = 10_000L)
        val swing = listOf(54.0, 60.0, 50.0, 58.0, 51.0, 59.0, 52.0, 57.0, 53.0, 56.0)
        var t = 0L
        var max = Double.MIN_VALUE
        for (p in swing) {
            val avg = s.smooth(p, t)
            max = maxOf(max, avg)
            t += 500L
        }
        assertTrue("smoothed value flapped above re-arm threshold: $max", max < 58.0)
    }
}
