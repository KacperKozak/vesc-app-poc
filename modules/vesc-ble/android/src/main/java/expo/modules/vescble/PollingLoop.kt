package expo.modules.vescble

import expo.modules.vescble.runtime.BoardSession
import expo.modules.vescble.runtime.Cancellable
import expo.modules.vescble.runtime.Scheduler
import expo.modules.vescble.runtime.postDelayedForSession
import kotlin.math.max

internal class PollingLoop(
    private val scheduler: Scheduler,
    private val isCurrentSession: (BoardSession) -> Boolean,
    private val sendPayloadWithRetry: (ByteArray, BoardSession) -> Boolean,
    private val nowMs: () -> Long = { System.currentTimeMillis() },
) {
    private var pollHandle: Cancellable? = null
    private var safetyHandle: Cancellable? = null
    private var lastPollAt = 0L
    private var tick = 0L
    private var active = false
    private var current: Active? = null

    private data class Active(
        val session: BoardSession,
        val payload: ByteArray,
        val bmsPayload: ByteArray?,
        val floorMs: Long,
    )

    val isActive: Boolean
        get() = active

    fun start(
        sessionConfig: SessionConfig,
        session: BoardSession,
        transport: BoardTransport,
    ) {
        val pollPayload = pollPayload(transport)
        // BMS is polled only when the probe proved one present (`hasBms == true`). The probe
        // is authoritative: unknown (legacy `null`) or proven-absent (`false`) → never poll.
        val bmsPayload = if (sessionConfig.hasBms == true) bmsPayload(transport) else null
        stop()
        tick = 0L
        current = Active(session, pollPayload, bmsPayload, max(0L, sessionConfig.pollIntervalMs))
        active = true
        sendNow()
    }

    fun stop() {
        active = false
        pollHandle?.cancel()
        pollHandle = null
        cancelSafety()
        current = null
    }

    /**
     * Called when a telemetry response for the active session arrives. Schedules the next poll
     * response-paced: as soon as the previous response lands, respecting [SessionConfig.pollIntervalMs]
     * as a minimum spacing floor. This self-clocks to the real link rate instead of firing on a fixed
     * timer that can outrun the board and pile up requests.
     */
    fun onResponse() {
        val ctx = current ?: return
        if (!active) return
        cancelSafety()
        val elapsed = nowMs() - lastPollAt
        val delay = max(0L, ctx.floorMs - elapsed)
        pollHandle?.cancel()
        pollHandle = scheduler.postDelayedForSession(ctx.session, delay, isCurrentSession) { sendNow() }
    }

    fun updateLatency(now: Long): Int? {
        if (lastPollAt <= 0) return null
        return max(0, now - lastPollAt).toInt()
    }

    private fun sendNow() {
        val ctx = current ?: return
        lastPollAt = nowMs()
        sendPayloadWithRetry(ctx.payload, ctx.session)
        // BMS values change slowly; poll them at 1/BMS_POLL_STRIDE of the telemetry rate
        // to avoid crowding the BLE link with large cell-voltage replies.
        if (ctx.bmsPayload != null && tick % BMS_POLL_STRIDE == 0L) {
            sendPayloadWithRetry(ctx.bmsPayload, ctx.session)
        }
        tick++
        armSafety(ctx)
    }

    private fun armSafety(ctx: Active) {
        cancelSafety()
        val timeout = max(ctx.floorMs * 4, SAFETY_MIN_MS)
        safetyHandle = scheduler.postDelayedForSession(ctx.session, timeout, isCurrentSession) {
            safetyHandle = null
            // No response within the safety window: assume the request or reply was dropped and re-poll
            // so the loop recovers instead of stalling until the stale watchdog tears the session down.
            sendNow()
        }
    }

    private fun cancelSafety() {
        safetyHandle?.cancel()
        safetyHandle = null
    }

    private fun pollPayload(transport: BoardTransport): ByteArray =
        transport.frame(
            byteArrayOf(
                COMM_CUSTOM_APP_DATA.toByte(),
                REFLOAT_MAGIC.toByte(),
                REFLOAT_GET_ALLDATA.toByte(),
                2,
            ),
        )

    private fun bmsPayload(transport: BoardTransport): ByteArray =
        transport.frame(byteArrayOf(COMM_BMS_GET_VALUES.toByte()))

    private companion object {
        const val SAFETY_MIN_MS = 1_000L
        const val BMS_POLL_STRIDE = 8L
    }
}
