package expo.modules.vescble

import android.os.Handler
import android.os.Looper

data class RateTestStep(
    val intervalMs: Long,
    val pollsSent: Int,
    val responsesReceived: Int,
    val successRate: Double,
    val avgLatencyMs: Double?,
)

data class RateTestResult(
    val steps: List<RateTestStep>,
    val recommendedIntervalMs: Long,
    val maxStableRate: Int,
)

internal class RateProbe(
    private val sendPayload: (ByteArray) -> Boolean,
    private val buildPollPayload: () -> ByteArray,
) {
    private val handler = Handler(Looper.getMainLooper())
    private var active = false
    private var onProgress: ((RateTestStep) -> Unit)? = null
    private var onComplete: ((RateTestResult) -> Unit)? = null

    private var pollsSent = 0
    private var responsesReceived = 0
    private var pollLatencies = mutableListOf<Long>()
    private var lastPollAt = 0L
    private var stepTimer: Runnable? = null
    private var stepEndTimer: Runnable? = null
    private var currentIntervalMs = 0L
    private var acceptingResponses = false

    private val stepDurationMs = 4000L
    private val drainMs = 600L

    // Adaptive state
    private var fastestStable = 0L
    private var lastUnstable = 0L
    private var adaptiveDone = false

    val isActive: Boolean get() = active

    fun start(
        onProgress: (RateTestStep) -> Unit,
        onComplete: (RateTestResult) -> Unit,
    ) {
        if (active) return
        active = true
        this.onProgress = onProgress
        this.onComplete = onComplete
        fastestStable = 0L
        lastUnstable = Long.MAX_VALUE
        adaptiveDone = false
        handler.post { runStep(5L) } // start at 5ms
    }

    fun stop() {
        active = false
        acceptingResponses = false
        cancelStep()
        cancelStepEnd()
        onProgress = null
        onComplete = null
    }

    fun onResponse(telemetry: RefloatTelemetry) {
        if (!active || !acceptingResponses) return
        val now = System.currentTimeMillis()
        responsesReceived++
        if (lastPollAt > 0) {
            pollLatencies.add(now - lastPollAt)
        }
    }

    private fun runStep(intervalMs: Long) {
        if (!active) return
        currentIntervalMs = intervalMs
        pollsSent = 0
        responsesReceived = 0
        pollLatencies.clear()
        acceptingResponses = true

        cancelStepEnd()
        stepEndTimer = Runnable {
            if (active) completeStep()
        }
        handler.postDelayed(stepEndTimer!!, stepDurationMs)

        schedulePolls()
    }

    private fun schedulePolls() {
        if (!active) return
        sendPayload(buildPollPayload())
        lastPollAt = System.currentTimeMillis()
        pollsSent++
        stepTimer = Runnable { schedulePolls() }
        handler.postDelayed(stepTimer!!, currentIntervalMs)
    }

    private fun completeStep() {
        cancelStep()
        cancelStepEnd()
        acceptingResponses = false

        val successRate = if (pollsSent == 0) 0.0 else responsesReceived.toDouble() / pollsSent.toDouble()
        val avgLatency = if (pollLatencies.isNotEmpty()) pollLatencies.average() else null
        val step = RateTestStep(
            intervalMs = currentIntervalMs,
            pollsSent = pollsSent,
            responsesReceived = responsesReceived,
            successRate = successRate,
            avgLatencyMs = avgLatency,
        )
        onProgress?.invoke(step)

        if (adaptiveDone) {
            finish()
            return
        }

        val stable = successRate >= 0.99

        if (stable) {
            fastestStable = currentIntervalMs
            // Try half the interval
            val next = maxOf(currentIntervalMs / 2, 1L)
            if (next < currentIntervalMs) {
                scheduleNextAdaptive(next)
            } else {
                // Can't go lower — we're at the minimum
                adaptiveDone = true
                scheduleNextAdaptive(currentIntervalMs)
            }
        } else {
            lastUnstable = minOf(lastUnstable, currentIntervalMs)
            // Unstable — narrow between fastestStable and current
            if (fastestStable > 0 && lastUnstable - fastestStable <= 2) {
                adaptiveDone = true
                scheduleNextAdaptive(fastestStable)
            } else {
                val next = (fastestStable + lastUnstable) / 2
                if (next > fastestStable && next < lastUnstable) {
                    scheduleNextAdaptive(next)
                } else {
                    adaptiveDone = true
                    scheduleNextAdaptive(fastestStable)
                }
            }
        }
    }

    private fun scheduleNextAdaptive(nextMs: Long) {
        handler.postDelayed({
            if (adaptiveDone) {
                finish()
            } else {
                runStep(nextMs)
            }
        }, drainMs)
    }

    private fun finish() {
        active = false
        cancelStep()
        cancelStepEnd()
        onComplete?.invoke(RateTestResult(emptyList(), 0, 0))
    }

    private fun cancelStep() {
        stepTimer?.let { handler.removeCallbacks(it) }
        stepTimer = null
    }

    private fun cancelStepEnd() {
        stepEndTimer?.let { handler.removeCallbacks(it) }
        stepEndTimer = null
    }

    companion object {
        fun computeResult(steps: List<RateTestStep>): RateTestResult {
            val stableSteps = steps.filter { it.successRate >= 0.99 }
            val recommended = if (stableSteps.isNotEmpty()) {
                stableSteps.minByOrNull { it.intervalMs }?.intervalMs ?: 500L
            } else {
                val okSteps = steps.filter { it.successRate >= 0.90 }
                okSteps.minByOrNull { it.intervalMs }?.intervalMs ?: 500L
            }
            val maxStableRate = if (recommended > 0) (1000.0 / recommended).toInt() else 0
            return RateTestResult(
                steps = steps.sortedBy { it.intervalMs },
                recommendedIntervalMs = recommended,
                maxStableRate = maxStableRate,
            )
        }
    }
}
