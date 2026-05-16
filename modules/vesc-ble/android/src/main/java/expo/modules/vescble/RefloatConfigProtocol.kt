package expo.modules.vescble

import java.nio.ByteBuffer
import java.nio.ByteOrder

internal data class RefloatConfigXmlChunk(
  val confInd: Int,
  val totalLength: Int,
  val offset: Int,
  val chunk: ByteArray,
)

internal data class RefloatConfigBytes(
  val confInd: Int,
  val config: ByteArray,
)

internal object RefloatConfigProtocol {
  fun buildGetCustomConfigXml(
    canId: Int,
    confInd: Int,
    length: Int,
    offset: Int,
  ): ByteArray {
    require(canId in 0..255) { "canId must fit uint8" }
    require(confInd in 0..255) { "confInd must fit uint8" }
    require(length >= 0) { "length must be non-negative" }
    require(offset >= 0) { "offset must be non-negative" }
    return ByteBuffer.allocate(12)
      .order(ByteOrder.BIG_ENDIAN)
      .put(COMM_FORWARD_CAN.toByte())
      .put(canId.toByte())
      .put(COMM_GET_CUSTOM_CONFIG_XML.toByte())
      .put(confInd.toByte())
      .putInt(length)
      .putInt(offset)
      .array()
  }

  fun buildGetCustomConfig(canId: Int, confInd: Int): ByteArray {
    require(canId in 0..255) { "canId must fit uint8" }
    require(confInd in 0..255) { "confInd must fit uint8" }
    return byteArrayOf(
      COMM_FORWARD_CAN.toByte(),
      canId.toByte(),
      COMM_GET_CUSTOM_CONFIG.toByte(),
      confInd.toByte(),
    )
  }

  fun parseCustomConfigXmlResponse(payload: ByteArray): RefloatConfigXmlChunk? {
    if (payload.size < 10) return null
    if ((payload[0].toInt() and 0xff) != COMM_GET_CUSTOM_CONFIG_XML) return null
    val view = ByteBuffer.wrap(payload).order(ByteOrder.BIG_ENDIAN)
    view.position(1)
    val confInd = view.get().toInt() and 0xff
    val totalLength = view.int
    val offset = view.int
    if (totalLength < 0 || offset < 0 || offset > totalLength) return null
    val chunk = payload.copyOfRange(10, payload.size)
    if (offset + chunk.size > totalLength) return null
    return RefloatConfigXmlChunk(confInd, totalLength, offset, chunk)
  }

  fun parseCustomConfigResponse(payload: ByteArray): RefloatConfigBytes? {
    if (payload.size < 2) return null
    if ((payload[0].toInt() and 0xff) != COMM_GET_CUSTOM_CONFIG) return null
    val confInd = payload[1].toInt() and 0xff
    return RefloatConfigBytes(confInd, payload.copyOfRange(2, payload.size))
  }
}
