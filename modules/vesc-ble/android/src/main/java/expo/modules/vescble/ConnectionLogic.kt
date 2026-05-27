package expo.modules.vescble

internal const val BOARD_READY_TIMEOUT_BASE = 4_000L
internal const val BOARD_READY_TIMEOUT_MAX = 15_000L
internal const val CAN_PING_TIMEOUT = 2_000L

internal fun boardReadyTimeoutMs(attempt: Int): Long {
    val ms = BOARD_READY_TIMEOUT_BASE + (attempt * 2_000L)
    return ms.coerceAtMost(BOARD_READY_TIMEOUT_MAX)
}

internal fun isPollingCapable(canId: Int?, directConnection: Boolean): Boolean =
    canId != null || directConnection

internal fun shouldCanPingFallback(
    canId: Int?,
    directConnection: Boolean,
    boardStatus: BoardPhase,
): Boolean =
    canId == null && !directConnection && boardStatus == BoardPhase.WaitingForTelemetry

internal fun shouldSetDirectOnReady(canId: Int?, directConnection: Boolean): Boolean =
    !isPollingCapable(canId, directConnection)

internal fun shouldStartPollingOnReady(
    canId: Int?,
    directConnection: Boolean,
    pollRunnable: Any?,
): Boolean =
    pollRunnable == null && isPollingCapable(canId, directConnection)
