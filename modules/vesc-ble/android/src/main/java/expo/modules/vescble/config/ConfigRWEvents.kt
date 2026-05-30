package expo.modules.vescble.config

import expo.modules.vescble.RefloatConfigErrorCode

internal sealed class ConfigRWEvent {
    data class StartRead(
        val opId: String,
        val canId: Int?,
        val directConnection: Boolean,
        val wasPolling: Boolean,
        val appBoardId: String?,
        val fwVersion: String?,
    ) : ConfigRWEvent()

    data class StartWrite(
        val opId: String,
        val canId: Int?,
        val directConnection: Boolean,
        val wasPolling: Boolean,
        val profileFields: Map<String, Any>,
        val appBoardId: String?,
        val fwVersion: String?,
    ) : ConfigRWEvent()

    data class XmlPayloadReceived(val payload: ByteArray) : ConfigRWEvent()

    data class ConfigBytesPayloadReceived(
        val payload: ByteArray,
        val capturedAtMs: Long,
    ) : ConfigRWEvent()

    data class SetConfigResponseReceived(val payload: ByteArray) : ConfigRWEvent()

    data class Timeout(val code: RefloatConfigErrorCode) : ConfigRWEvent()

    data class GattWriteFailed(val message: String) : ConfigRWEvent()

    data class SessionTerminated(val reason: String) : ConfigRWEvent()
}
