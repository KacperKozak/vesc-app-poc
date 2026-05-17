package expo.modules.vescble

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class RefloatConfigProtocolTest {
  @Test
  fun buildsForwardedCustomConfigXmlRequest() {
    val payload = RefloatConfigProtocol.buildGetCustomConfigXml(canId = 7, confInd = 0, length = 384, offset = 768)

    assertArrayEquals(
      byteArrayOf(
        COMM_FORWARD_CAN.toByte(),
        7,
        COMM_GET_CUSTOM_CONFIG_XML.toByte(),
        0,
        0, 0, 1, 0x80.toByte(),
        0, 0, 3, 0,
      ),
      payload,
    )
  }

  @Test
  fun buildsForwardedCustomConfigRequest() {
    val payload = RefloatConfigProtocol.buildGetCustomConfig(canId = 7, confInd = 0)

    assertArrayEquals(
      byteArrayOf(
        COMM_FORWARD_CAN.toByte(),
        7,
        COMM_GET_CUSTOM_CONFIG.toByte(),
        0,
      ),
      payload,
    )
  }

  @Test
  fun parsesCustomConfigXmlResponse() {
    val payload = byteArrayOf(
      COMM_GET_CUSTOM_CONFIG_XML.toByte(),
      0,
      0, 0, 0, 10,
      0, 0, 0, 4,
      't'.code.toByte(),
      'e'.code.toByte(),
      's'.code.toByte(),
      't'.code.toByte(),
    )

    val parsed = RefloatConfigProtocol.parseCustomConfigXmlResponse(payload).success()

    assertEquals(0, parsed.confInd)
    assertEquals(10, parsed.totalLength)
    assertEquals(4, parsed.offset)
    assertArrayEquals("test".encodeToByteArray(), parsed.chunk)
  }

  @Test
  fun parsesForwardedCustomConfigXmlResponse() {
    val payload = byteArrayOf(
      COMM_FORWARD_CAN.toByte(),
      7,
      COMM_GET_CUSTOM_CONFIG_XML.toByte(),
      0,
      0, 0, 0, 10,
      0, 0, 0, 4,
      't'.code.toByte(),
      'e'.code.toByte(),
      's'.code.toByte(),
      't'.code.toByte(),
    )

    val parsed = RefloatConfigProtocol.parseCustomConfigXmlResponse(payload).success()

    assertEquals(0, parsed.confInd)
    assertEquals(10, parsed.totalLength)
    assertEquals(4, parsed.offset)
    assertArrayEquals("test".encodeToByteArray(), parsed.chunk)
  }

  @Test
  fun ignoresWrongXmlCommandResponse() {
    val payload = byteArrayOf(COMM_GET_CUSTOM_CONFIG.toByte(), 0)
    val failure = RefloatConfigProtocol.parseCustomConfigXmlResponse(payload).failure()
    assertEquals("Unexpected Refloat config command 93, expected 92", failure.message)
  }

  @Test
  fun parsesCustomConfigResponse() {
    val payload = byteArrayOf(COMM_GET_CUSTOM_CONFIG.toByte(), 0, 1, 2, 3, 4)
    val parsed = RefloatConfigProtocol.parseCustomConfigResponse(payload).success()
    assertEquals(0, parsed.confInd)
    assertArrayEquals(byteArrayOf(1, 2, 3, 4), parsed.config)
  }

  @Test
  fun parsesForwardedCustomConfigResponse() {
    val payload = byteArrayOf(COMM_FORWARD_CAN.toByte(), 7, COMM_GET_CUSTOM_CONFIG.toByte(), 0, 1, 2, 3, 4)
    val parsed = RefloatConfigProtocol.parseCustomConfigResponse(payload).success()
    assertEquals(0, parsed.confInd)
    assertArrayEquals(byteArrayOf(1, 2, 3, 4), parsed.config)
  }

  @Test
  fun rejectsShortForwardedXmlResponseWithSpecificMessage() {
    val failure = RefloatConfigProtocol
      .parseCustomConfigXmlResponse(byteArrayOf(COMM_FORWARD_CAN.toByte(), 7))
      .failure()

    assertEquals("Short forwarded Refloat config response", failure.message)
  }

  @Test
  fun rejectsXmlResponseWithWrongConfigIndex() {
    val payload = byteArrayOf(
      COMM_GET_CUSTOM_CONFIG_XML.toByte(),
      1,
      0, 0, 0, 10,
      0, 0, 0, 4,
      't'.code.toByte(),
      'e'.code.toByte(),
      's'.code.toByte(),
      't'.code.toByte(),
    )

    val failure = RefloatConfigProtocol.parseCustomConfigXmlResponse(payload).failure()

    assertEquals("Unexpected Refloat config XML index 1", failure.message)
  }

  @Test
  fun rejectsXmlChunkThatExceedsDeclaredLength() {
    val payload = byteArrayOf(
      COMM_GET_CUSTOM_CONFIG_XML.toByte(),
      0,
      0, 0, 0, 6,
      0, 0, 0, 4,
      't'.code.toByte(),
      'e'.code.toByte(),
      's'.code.toByte(),
    )

    val failure = RefloatConfigProtocol.parseCustomConfigXmlResponse(payload).failure()

    assertEquals("Refloat config XML chunk exceeds length: offset=4 chunk=3 length=6", failure.message)
  }

  @Test
  fun rejectsConfigResponseWithWrongConfigIndex() {
    val failure = RefloatConfigProtocol
      .parseCustomConfigResponse(byteArrayOf(COMM_GET_CUSTOM_CONFIG.toByte(), 1, 2, 3))
      .failure()

    assertEquals("Unexpected Refloat config index 1", failure.message)
  }

  private fun <T> RefloatConfigProtocolResult<T>.success(): T {
    assertTrue(this is RefloatConfigProtocolResult.Success)
    return (this as RefloatConfigProtocolResult.Success<T>).value
  }

  private fun <T> RefloatConfigProtocolResult<T>.failure(): RefloatConfigProtocolResult.Failure {
    assertTrue(this is RefloatConfigProtocolResult.Failure)
    return this as RefloatConfigProtocolResult.Failure
  }
}
