package expo.modules.vescble.telemetry

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class BatterySocEstimatorTest {

    @Test
    fun `preset config estimates state of charge from per-cell curve`() {
        val config = mapOf<String, Any?>(
            "mode" to "preset",
            "cellPresetId" to "molicel:21700:p50b",
            "seriesCount" to 20,
            "parallelCount" to 2,
        )

        assertEquals(100.0, BatterySocEstimator.estimateBatteryPercent(84.0, config)!!, 0.0)
        assertEquals(0.0, BatterySocEstimator.estimateBatteryPercent(60.0, config)!!, 0.0)
        assertEquals(60.0, BatterySocEstimator.estimateBatteryPercent(76.0, config)!!, 5.0)
    }

    @Test
    fun `manual config estimates state of charge`() {
        val config = mapOf<String, Any?>(
            "mode" to "manual",
            "minVoltage" to 60.0,
            "maxVoltage" to 84.0,
        )

        assertEquals(100.0, BatterySocEstimator.estimateBatteryPercent(84.0, config)!!, 0.0)
        assertEquals(0.0, BatterySocEstimator.estimateBatteryPercent(60.0, config)!!, 0.0)
    }

    @Test
    fun `returns null for missing or unknown preset configs`() {
        assertNull(BatterySocEstimator.estimateBatteryPercent(72.0, null))
        assertNull(
            BatterySocEstimator.estimateBatteryPercent(
                72.0,
                mapOf(
                    "mode" to "preset",
                    "cellPresetId" to "missing",
                    "seriesCount" to 20,
                    "parallelCount" to 2,
                ),
            ),
        )
    }

    @Test
    fun `returns null for invalid manual config`() {
        assertNull(
            BatterySocEstimator.estimateBatteryPercent(
                72.0,
                mapOf("mode" to "manual", "minVoltage" to 84.0, "maxVoltage" to 60.0),
            ),
        )
    }

    @Test
    fun `clamps to 100 percent when voltage above max`() {
        val config = mapOf<String, Any?>(
            "mode" to "manual",
            "minVoltage" to 60.0,
            "maxVoltage" to 84.0,
        )

        assertEquals(100.0, BatterySocEstimator.estimateBatteryPercent(90.0, config)!!, 0.0)
    }

    @Test
    fun `clamps to 0 percent when voltage below min`() {
        val config = mapOf<String, Any?>(
            "mode" to "manual",
            "minVoltage" to 60.0,
            "maxVoltage" to 84.0,
        )

        assertEquals(0.0, BatterySocEstimator.estimateBatteryPercent(50.0, config)!!, 0.0)
    }

    @Test
    fun `returns null for empty config map`() {
        assertNull(BatterySocEstimator.estimateBatteryPercent(72.0, emptyMap()))
    }

    @Test
    fun `manual interpolation returns correct mid-range values`() {
        val config = mapOf<String, Any?>(
            "mode" to "manual",
            "minVoltage" to 50.0,
            "maxVoltage" to 100.0,
        )

        val mid = BatterySocEstimator.estimateBatteryPercent(75.0, config)
        assertNotNull(mid)
        assertTrue(mid!! > 0.0 && mid < 100.0)
    }

    @Test
    fun `preset behaves correctly at known voltages`() {
        val config = mapOf<String, Any?>(
            "mode" to "preset",
            "cellPresetId" to "molicel:21700:p50b",
            "seriesCount" to 20,
            "parallelCount" to 2,
        )

        assertEquals(100.0, BatterySocEstimator.estimateBatteryPercent(84.0, config)!!, 0.0)
        assertEquals(0.0, BatterySocEstimator.estimateBatteryPercent(60.0, config)!!, 0.0)
        assertNotNull(BatterySocEstimator.estimateBatteryPercent(76.0, config))
    }

    @Test
    fun `returns null for unknown cell preset`() {
        assertNull(BatterySocEstimator.getCellPreset("unknown:cell:id"))
    }
}
