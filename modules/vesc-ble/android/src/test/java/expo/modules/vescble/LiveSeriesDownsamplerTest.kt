package expo.modules.vescble

import expo.modules.vescble.telemetry.LiveSeriesDownsampler
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class LiveSeriesDownsamplerTest {

    private data class Row(val ts: Long, val v: Double?)

    private fun run(rows: List<Row>, buckets: Int): DoubleArray =
        LiveSeriesDownsampler.downsampleMinMax(rows, buckets, { it.ts }, { it.v })

    private fun values(out: DoubleArray): List<Double> = (1 until out.size step 2).map { out[it] }

    @Test
    fun `empty input yields empty array`() {
        assertEquals(0, run(emptyList(), 8).size)
    }

    @Test
    fun `preserves bucket peaks and troughs while reducing point count`() {
        val rows = (0 until 40).map { Row(it.toLong(), 0.0) }.toMutableList()
        rows[10] = Row(10, 100.0)
        rows[25] = Row(25, -50.0)

        val out = run(rows, 4)
        val vals = values(out)

        assertTrue("decimated below input", out.size / 2 < rows.size)
        assertEquals(100.0, vals.max(), 0.0)
        assertEquals(-50.0, vals.min(), 0.0)
    }

    @Test
    fun `emits points in chronological order`() {
        val ramp = listOf(0, 1, 2, 3, 4, 5, 4, 3, 2, 1).mapIndexed { i, v -> Row(i.toLong(), v.toDouble()) }
        val out = run(ramp, 2)
        for (i in 2 until out.size step 2) {
            assertTrue("timestamps non-decreasing", out[i] >= out[i - 2])
        }
    }

    @Test
    fun `skips null and non-finite values`() {
        val rows = (0 until 30).map {
            Row(it.toLong(), if (it == 5) null else if (it == 6) Double.NaN else it.toDouble())
        }
        val vals = values(run(rows, 3))
        assertTrue(vals.none { it.isNaN() })
        assertEquals(29.0, vals.max(), 0.0)
    }

    @Test
    fun `degenerate single-timestamp window collapses to min and max`() {
        val rows = listOf(Row(1000, 3.0), Row(1000, 9.0), Row(1000, 1.0))
        val vals = values(run(rows, 8))
        assertEquals(1.0, vals.min(), 0.0)
        assertEquals(9.0, vals.max(), 0.0)
    }
}
