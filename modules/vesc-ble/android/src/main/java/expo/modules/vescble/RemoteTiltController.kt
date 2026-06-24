package expo.modules.vescble

import expo.modules.vescble.runtime.Cancellable
import expo.modules.vescble.runtime.Scheduler

private const val REMOTE_TILT_REPEAT_MS = 40L

/**
 * Streams Floaty's temporary remote-tilt input (0..255 slider, 128 neutral) to
 * the board. Refloat drops the remote input after ~1s of silence, so the current
 * value is repeated while the slider is held. Requires `inputtilt_remote_type`
 * to be set to UART in the board config.
 *
 * The repeat loop is the sole sender: rapid slider updates only mutate the
 * pending value and coalesce to the latest one, instead of flooding the
 * serialized GATT write queue with stale packets (which lagged the board the
 * longer the slider was dragged).
 *
 * @param transport supplies the active transport only while a tilt stream is
 *   allowed (board connected with a loaded config); `null` otherwise.
 * @param send writes a framed payload to the board, returning whether it was sent.
 */
internal class RemoteTiltController(
    private val scheduler: Scheduler,
    private val transport: () -> BoardTransport?,
    private val send: (ByteArray) -> Boolean,
) {
    private var pendingValue: Int? = null
    private var repeat: Cancellable? = null

    fun set(value: Int): Boolean {
        val transport = transport() ?: return false

        val clamped = value.coerceIn(0, 255)
        val alreadyStreaming = pendingValue != null
        pendingValue = clamped
        if (alreadyStreaming) return true

        // First press: send once immediately, then let the loop drive the stream.
        val sent = send(buildRemoteTiltCommand(transport, clamped))
        scheduleRepeat()
        return sent
    }

    fun stop(): Boolean {
        val wasActive = pendingValue != null
        pendingValue = null
        repeat?.cancel()
        repeat = null

        // Snap to neutral so the board releases tilt immediately instead of
        // waiting for its ~1s remote-input timeout.
        transport()?.let { send(buildRemoteTiltCommand(it, REMOTE_TILT_CENTER)) }
        return wasActive
    }

    private fun scheduleRepeat() {
        repeat = scheduler.postDelayed(REMOTE_TILT_REPEAT_MS) {
            val value = pendingValue ?: return@postDelayed
            val transport = transport()
            if (transport == null) {
                pendingValue = null
                repeat = null
                return@postDelayed
            }
            send(buildRemoteTiltCommand(transport, value))
            scheduleRepeat()
        }
    }
}
