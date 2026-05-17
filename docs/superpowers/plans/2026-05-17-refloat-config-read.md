# Refloat Config Read Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a read-only Refloat custom config snapshot API and show grouped Tune values without adding any board-mutating command path.

**Architecture:** Android native owns BLE transport and session validation. Pure Kotlin protocol, XML schema, and binary decoder units are tested before service integration. JS receives a typed read-only snapshot and renders values; iOS rejects explicitly as unsupported.

**Tech Stack:** Expo Modules, Kotlin/JUnit, Android foreground service, TypeScript, React Native, Expo Router, `bun`.

---

## File Structure

- Create: `modules/vesc-ble/android/src/main/java/expo/modules/vescble/RefloatConfigModels.kt`
  - Owns snapshot maps, field definitions, typed errors, and allowlist groups.
- Create: `modules/vesc-ble/android/src/main/java/expo/modules/vescble/RefloatConfigProtocol.kt`
  - Owns request builders and response parsers for VESC custom config XML/config reads.
- Create: `modules/vesc-ble/android/src/main/java/expo/modules/vescble/RefloatConfigSchema.kt`
  - Parses returned XML into ordered field schema entries.
- Create: `modules/vesc-ble/android/src/main/java/expo/modules/vescble/RefloatConfigDecoder.kt`
  - Decodes binary config bytes by XML-derived schema and allowlist.
- Modify: `modules/vesc-ble/android/src/main/java/expo/modules/vescble/VescProtocol.kt`
  - Add command constants `COMM_GET_CUSTOM_CONFIG_XML = 92` and `COMM_GET_CUSTOM_CONFIG = 93`.
- Modify: `modules/vesc-ble/android/src/main/java/expo/modules/vescble/VescForegroundService.kt`
  - Add serialized read-only config request mode, poll gating, response routing, and companion API.
- Modify: `modules/vesc-ble/android/src/main/java/expo/modules/vescble/VescBleModule.kt`
  - Expose `getRefloatConfigSnapshot`.
- Modify: `modules/vesc-ble/src/index.ts`
  - Add TypeScript snapshot types and exported function.
- Modify: `modules/vesc-ble/ios/VescBleModule.swift`
  - Add unsupported `getRefloatConfigSnapshot` implementation.
- Modify: `src/app/tune.tsx`
  - Render read-only grouped snapshot values with refresh/error states.
- Test: `modules/vesc-ble/android/src/test/java/expo/modules/vescble/RefloatConfigProtocolTest.kt`
- Test: `modules/vesc-ble/android/src/test/java/expo/modules/vescble/RefloatConfigSchemaTest.kt`
- Test: `modules/vesc-ble/android/src/test/java/expo/modules/vescble/RefloatConfigDecoderTest.kt`
- Test: `modules/vesc-ble/android/src/test/java/expo/modules/vescble/RefloatConfigModelsTest.kt`

## Task 1: Protocol Builders And Parsers

**Files:**
- Modify: `modules/vesc-ble/android/src/main/java/expo/modules/vescble/VescProtocol.kt`
- Create: `modules/vesc-ble/android/src/main/java/expo/modules/vescble/RefloatConfigProtocol.kt`
- Test: `modules/vesc-ble/android/src/test/java/expo/modules/vescble/RefloatConfigProtocolTest.kt`

- [ ] **Step 1: Add failing protocol tests**

Create `RefloatConfigProtocolTest.kt`:

```kotlin
package expo.modules.vescble

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
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

    val parsed = RefloatConfigProtocol.parseCustomConfigXmlResponse(payload)

    assertEquals(0, parsed?.confInd)
    assertEquals(10, parsed?.totalLength)
    assertEquals(4, parsed?.offset)
    assertArrayEquals("test".encodeToByteArray(), parsed?.chunk)
  }

  @Test
  fun ignoresWrongXmlCommandResponse() {
    val payload = byteArrayOf(COMM_GET_CUSTOM_CONFIG.toByte(), 0)

    assertNull(RefloatConfigProtocol.parseCustomConfigXmlResponse(payload))
  }

  @Test
  fun parsesCustomConfigResponse() {
    val payload = byteArrayOf(COMM_GET_CUSTOM_CONFIG.toByte(), 0, 1, 2, 3, 4)

    val parsed = RefloatConfigProtocol.parseCustomConfigResponse(payload)

    assertEquals(0, parsed?.confInd)
    assertArrayEquals(byteArrayOf(1, 2, 3, 4), parsed?.config)
  }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
bun run test:android --tests expo.modules.vescble.RefloatConfigProtocolTest
```

Expected: FAIL because `COMM_GET_CUSTOM_CONFIG_XML`, `COMM_GET_CUSTOM_CONFIG`, and `RefloatConfigProtocol` do not exist.

- [ ] **Step 3: Implement protocol helpers**

In `VescProtocol.kt`, add constants near existing command ids:

```kotlin
internal const val COMM_GET_CUSTOM_CONFIG_XML = 92
internal const val COMM_GET_CUSTOM_CONFIG = 93
```

Create `RefloatConfigProtocol.kt`:

```kotlin
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
        if (totalLength < 0 || offset < 0) return null
        if (offset > totalLength) return null
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
```

- [ ] **Step 4: Run protocol tests**

Run:

```bash
bun run test:android --tests expo.modules.vescble.RefloatConfigProtocolTest
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add modules/vesc-ble/android/src/main/java/expo/modules/vescble/VescProtocol.kt \
  modules/vesc-ble/android/src/main/java/expo/modules/vescble/RefloatConfigProtocol.kt \
  modules/vesc-ble/android/src/test/java/expo/modules/vescble/RefloatConfigProtocolTest.kt
git commit -m "Add Refloat config protocol helpers"
```

## Task 2: Models And Allowlist

**Files:**
- Create: `modules/vesc-ble/android/src/main/java/expo/modules/vescble/RefloatConfigModels.kt`
- Test: `modules/vesc-ble/android/src/test/java/expo/modules/vescble/RefloatConfigModelsTest.kt`

- [ ] **Step 1: Add failing model tests**

Create `RefloatConfigModelsTest.kt`:

```kotlin
package expo.modules.vescble

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class RefloatConfigModelsTest {
  @Test
  fun allowlistContainsScreenshotGeneralFields() {
    val ids = REFLOAT_TUNE_GROUPS.flatMap { it.fields }.map { it.id }.toSet()

    assertTrue(ids.contains("kp"))
    assertTrue(ids.contains("kp2"))
    assertTrue(ids.contains("kp_brake"))
    assertTrue(ids.contains("kp2_brake"))
    assertTrue(ids.contains("ki"))
    assertTrue(ids.contains("ki_limit"))
    assertTrue(ids.contains("mahony_kp"))
    assertTrue(ids.contains("mahony_kp_roll"))
  }

  @Test
  fun snapshotMapUsesReadOnlyFields() {
    val snapshot = RefloatConfigSnapshot(
      capturedAt = 10L,
      boardId = "board-1",
      canId = 7,
      schemaHash = "schema",
      rawConfigHash = "raw",
      rawConfigLength = 4,
      groups = listOf(
        RefloatConfigGroup(
          id = "general",
          title = "General",
          fields = listOf(
            RefloatConfigField(
              id = "kp",
              label = "Angle P",
              value = 26.0,
              unit = null,
              min = 0.0,
              max = 100.0,
            ),
          ),
        ),
      ),
      missingFieldIds = emptyList(),
    )

    val field = ((snapshot.toMap()["groups"] as List<*>).first() as Map<*, *>)["fields"] as List<*>
    assertEquals(true, (field.first() as Map<*, *>)["readOnly"])
  }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
bun run test:android --tests expo.modules.vescble.RefloatConfigModelsTest
```

Expected: FAIL because model types do not exist.

- [ ] **Step 3: Implement models**

Create `RefloatConfigModels.kt`:

```kotlin
package expo.modules.vescble

internal data class RefloatTuneFieldDefinition(
    val id: String,
    val label: String,
    val unitFallback: String? = null,
)

internal data class RefloatTuneGroupDefinition(
    val id: String,
    val title: String,
    val fields: List<RefloatTuneFieldDefinition>,
)

internal data class RefloatConfigField(
    val id: String,
    val label: String,
    val value: Any,
    val unit: String?,
    val min: Double?,
    val max: Double?,
) {
    fun toMap(): Map<String, Any?> = mapOf(
        "id" to id,
        "label" to label,
        "value" to value,
        "unit" to unit,
        "min" to min,
        "max" to max,
        "readOnly" to true,
    )
}

internal data class RefloatConfigGroup(
    val id: String,
    val title: String,
    val fields: List<RefloatConfigField>,
) {
    fun toMap(): Map<String, Any?> = mapOf(
        "id" to id,
        "title" to title,
        "fields" to fields.map { it.toMap() },
    )
}

internal data class RefloatConfigSnapshot(
    val capturedAt: Long,
    val boardId: String?,
    val canId: Int,
    val schemaHash: String,
    val rawConfigHash: String,
    val rawConfigLength: Int,
    val groups: List<RefloatConfigGroup>,
    val missingFieldIds: List<String>,
) {
    fun toMap(): Map<String, Any?> = mapOf(
        "capturedAt" to capturedAt,
        "boardId" to boardId,
        "canId" to canId,
        "schemaHash" to schemaHash,
        "rawConfigHash" to rawConfigHash,
        "rawConfigLength" to rawConfigLength,
        "groups" to groups.map { it.toMap() },
        "missingFieldIds" to missingFieldIds,
    )
}

internal enum class RefloatConfigErrorCode {
    BOARD_NOT_CONNECTED,
    CAN_ID_UNAVAILABLE,
    GATT_NOT_WRITABLE,
    CONFIG_REQUEST_IN_FLIGHT,
    CONFIG_SCHEMA_TIMEOUT,
    CONFIG_READ_TIMEOUT,
    UNEXPECTED_CONFIG_RESPONSE,
    UNSUPPORTED_SCHEMA,
    CONFIG_DECODE_FAILED,
    UNSUPPORTED_PLATFORM,
}

internal val REFLOAT_TUNE_GROUPS = listOf(
    RefloatTuneGroupDefinition(
        id = "general",
        title = "General",
        fields = listOf(
            RefloatTuneFieldDefinition("kp", "Angle P"),
            RefloatTuneFieldDefinition("kp2", "Rate P"),
            RefloatTuneFieldDefinition("kp_brake", "Angle P (Braking)", "x"),
            RefloatTuneFieldDefinition("kp2_brake", "Rate P (Braking)", "x"),
            RefloatTuneFieldDefinition("ki", "Angle I"),
            RefloatTuneFieldDefinition("ki_limit", "I Term Limit", "A"),
            RefloatTuneFieldDefinition("mahony_kp", "Pitch KP"),
            RefloatTuneFieldDefinition("mahony_kp_roll", "Roll KP"),
        ),
    ),
    RefloatTuneGroupDefinition(
        id = "atr",
        title = "ATR",
        fields = listOf(
            RefloatTuneFieldDefinition("atr_strength_up", "ATR Uphill Strength"),
            RefloatTuneFieldDefinition("atr_strength_down", "ATR Downhill Strength"),
            RefloatTuneFieldDefinition("atr_threshold_up", "Threshold Angle Up", "deg"),
            RefloatTuneFieldDefinition("atr_threshold_down", "Threshold Angle Down", "deg"),
            RefloatTuneFieldDefinition("atr_speed_boost", "Speed Boost", "%"),
            RefloatTuneFieldDefinition("atr_angle_limit", "Tiltback Angle Limit", "deg"),
            RefloatTuneFieldDefinition("atr_speed", "Max Tiltback Speed", "deg/s"),
            RefloatTuneFieldDefinition("atr_release_speed", "Max Tiltback Release Speed", "deg/s"),
            RefloatTuneFieldDefinition("atr_response_boost", "Tiltback Response Boost", "x"),
            RefloatTuneFieldDefinition("atr_transition_boost", "Tiltback Transition Boost", "x"),
            RefloatTuneFieldDefinition("atr_filter", "Current Filter", "Hz"),
            RefloatTuneFieldDefinition("atr_amps_accel_ratio", "Amps to Acceleration Ratio"),
            RefloatTuneFieldDefinition("atr_amps_decel_ratio", "Amps to Deceleration Ratio"),
        ),
    ),
    RefloatTuneGroupDefinition(
        id = "turn_tiltback",
        title = "Turn tiltback",
        fields = listOf(
            RefloatTuneFieldDefinition("turntilt_strength", "Strength"),
            RefloatTuneFieldDefinition("turntilt_angle_limit", "Tiltback Angle Limit", "deg"),
            RefloatTuneFieldDefinition("turntilt_start_angle", "Turn Aggregate Threshold", "deg"),
            RefloatTuneFieldDefinition("turntilt_start_erpm", "ERPM Threshold", "ERPM"),
            RefloatTuneFieldDefinition("turntilt_speed", "Max Tiltback Speed", "deg/s"),
            RefloatTuneFieldDefinition("turntilt_speed_boost", "Speed Boost %", "%"),
            RefloatTuneFieldDefinition("turntilt_boost_erpm", "Speed Boost Max ERPM", "ERPM"),
            RefloatTuneFieldDefinition("turntilt_target", "Turn Aggregate Target", "deg"),
        ),
    ),
    RefloatTuneGroupDefinition(
        id = "torque_tiltback",
        title = "Torque tiltback",
        fields = listOf(
            RefloatTuneFieldDefinition("torquetilt_strength", "Strength", "deg/A"),
            RefloatTuneFieldDefinition("torquetilt_strength_regen", "Strength (Regen)", "deg/A"),
            RefloatTuneFieldDefinition("torquetilt_start_current", "Start Current Threshold", "A"),
            RefloatTuneFieldDefinition("torquetilt_angle_limit", "Tiltback Angle Limit", "deg"),
            RefloatTuneFieldDefinition("torquetilt_speed", "Max Tiltback Speed", "deg/s"),
            RefloatTuneFieldDefinition("torquetilt_release_speed", "Max Tiltback Release Speed", "deg/s"),
        ),
    ),
    RefloatTuneGroupDefinition(
        id = "brake",
        title = "Brake",
        fields = listOf(
            RefloatTuneFieldDefinition("braketilt_strength", "Brake Tilt Strength"),
            RefloatTuneFieldDefinition("braketilt_lingering", "Brake Tilt Lingering"),
        ),
    ),
    RefloatTuneGroupDefinition(
        id = "tiltback",
        title = "Tiltback",
        fields = listOf(
            RefloatTuneFieldDefinition("tiltback_constant", "Constant Tiltback", "deg"),
            RefloatTuneFieldDefinition("tiltback_variable", "Variable Tiltback Rate", "deg/1000 ERPM"),
            RefloatTuneFieldDefinition("tiltback_variable_target", "Variable Tiltback Target", "deg"),
        ),
    ),
)
```

- [ ] **Step 4: Run model tests**

Run:

```bash
bun run test:android --tests expo.modules.vescble.RefloatConfigModelsTest
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add modules/vesc-ble/android/src/main/java/expo/modules/vescble/RefloatConfigModels.kt \
  modules/vesc-ble/android/src/test/java/expo/modules/vescble/RefloatConfigModelsTest.kt
git commit -m "Add Refloat config snapshot models"
```

## Task 3: XML Schema Parser

**Files:**
- Create: `modules/vesc-ble/android/src/main/java/expo/modules/vescble/RefloatConfigSchema.kt`
- Test: `modules/vesc-ble/android/src/test/java/expo/modules/vescble/RefloatConfigSchemaTest.kt`

- [ ] **Step 1: Add failing schema parser tests**

Create `RefloatConfigSchemaTest.kt`:

```kotlin
package expo.modules.vescble

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class RefloatConfigSchemaTest {
  @Test
  fun parsesParamsFromVescStyleXml() {
    val xml = """
      <CustomConfiguration>
        <params>
          <param name="kp" type="float" min="0" max="100" unit="" label="Angle P" />
          <param name="kp2" type="float" min="0" max="5" unit="" label="Rate P" />
          <param name="quickstop_enabled" type="bool" label="Quickstop" />
        </params>
      </CustomConfiguration>
    """.trimIndent()

    val schema = RefloatConfigSchemaParser.parse(xml.encodeToByteArray())

    assertEquals("kp", schema.fields[0].id)
    assertEquals(RefloatConfigValueType.FLOAT32, schema.fields[0].type)
    assertEquals(0.0, schema.fields[0].min)
    assertEquals(100.0, schema.fields[0].max)
    assertEquals("Angle P", schema.fields[0].label)
    assertEquals(RefloatConfigValueType.BOOL, schema.fields[2].type)
    assertTrue(schema.hash.isNotBlank())
  }

  @Test(expected = RefloatConfigSchemaException::class)
  fun rejectsMissingFieldNames() {
    val xml = """<CustomConfiguration><params><param type="float" /></params></CustomConfiguration>"""

    RefloatConfigSchemaParser.parse(xml.encodeToByteArray())
  }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
bun run test:android --tests expo.modules.vescble.RefloatConfigSchemaTest
```

Expected: FAIL because schema parser does not exist.

- [ ] **Step 3: Implement schema parser**

Create `RefloatConfigSchema.kt`:

```kotlin
package expo.modules.vescble

import java.io.ByteArrayInputStream
import java.security.MessageDigest
import javax.xml.parsers.DocumentBuilderFactory

internal enum class RefloatConfigValueType(val byteSize: Int) {
    FLOAT32(4),
    INT32(4),
    UINT32(4),
    INT16(2),
    UINT16(2),
    INT8(1),
    UINT8(1),
    BOOL(1),
}

internal data class RefloatConfigSchemaField(
    val id: String,
    val type: RefloatConfigValueType,
    val label: String,
    val unit: String?,
    val min: Double?,
    val max: Double?,
    val offset: Int,
)

internal data class RefloatConfigSchema(
    val hash: String,
    val fields: List<RefloatConfigSchemaField>,
)

internal class RefloatConfigSchemaException(message: String) : Exception(message)

internal object RefloatConfigSchemaParser {
    fun parse(xmlBytes: ByteArray): RefloatConfigSchema {
        val factory = DocumentBuilderFactory.newInstance().apply {
            isNamespaceAware = false
            isIgnoringComments = true
            setFeature("http://apache.org/xml/features/disallow-doctype-decl", true)
            setFeature("http://xml.org/sax/features/external-general-entities", false)
            setFeature("http://xml.org/sax/features/external-parameter-entities", false)
        }
        val doc = factory.newDocumentBuilder().parse(ByteArrayInputStream(xmlBytes))
        val nodes = doc.getElementsByTagName("param")
        if (nodes.length == 0) throw RefloatConfigSchemaException("UNSUPPORTED_SCHEMA: no param nodes")

        var offset = 0
        val fields = mutableListOf<RefloatConfigSchemaField>()
        for (i in 0 until nodes.length) {
            val node = nodes.item(i)
            val attrs = node.attributes
            val id = attr(attrs, "name") ?: attr(attrs, "id")
                ?: throw RefloatConfigSchemaException("UNSUPPORTED_SCHEMA: param missing name")
            val type = parseType(attr(attrs, "type") ?: "float")
            val field = RefloatConfigSchemaField(
                id = id,
                type = type,
                label = attr(attrs, "label") ?: id,
                unit = attr(attrs, "unit")?.ifBlank { null },
                min = attr(attrs, "min")?.toDoubleOrNull(),
                max = attr(attrs, "max")?.toDoubleOrNull(),
                offset = offset,
            )
            fields.add(field)
            offset += type.byteSize
        }
        return RefloatConfigSchema(hash = sha256(xmlBytes), fields = fields)
    }

    private fun attr(attrs: org.w3c.dom.NamedNodeMap, name: String): String? =
        attrs.getNamedItem(name)?.nodeValue

    private fun parseType(raw: String): RefloatConfigValueType = when (raw.lowercase()) {
        "float", "float32", "f32" -> RefloatConfigValueType.FLOAT32
        "int", "int32", "i32" -> RefloatConfigValueType.INT32
        "uint", "uint32", "u32" -> RefloatConfigValueType.UINT32
        "int16", "i16" -> RefloatConfigValueType.INT16
        "uint16", "u16" -> RefloatConfigValueType.UINT16
        "int8", "i8" -> RefloatConfigValueType.INT8
        "uint8", "u8" -> RefloatConfigValueType.UINT8
        "bool", "boolean" -> RefloatConfigValueType.BOOL
        else -> throw RefloatConfigSchemaException("UNSUPPORTED_SCHEMA: unknown type $raw")
    }

    private fun sha256(bytes: ByteArray): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(bytes)
        return digest.joinToString("") { "%02x".format(it) }
    }
}
```

- [ ] **Step 4: Run schema tests**

Run:

```bash
bun run test:android --tests expo.modules.vescble.RefloatConfigSchemaTest
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add modules/vesc-ble/android/src/main/java/expo/modules/vescble/RefloatConfigSchema.kt \
  modules/vesc-ble/android/src/test/java/expo/modules/vescble/RefloatConfigSchemaTest.kt
git commit -m "Parse Refloat config XML schema"
```

## Task 4: Binary Decoder

**Files:**
- Create: `modules/vesc-ble/android/src/main/java/expo/modules/vescble/RefloatConfigDecoder.kt`
- Test: `modules/vesc-ble/android/src/test/java/expo/modules/vescble/RefloatConfigDecoderTest.kt`

- [ ] **Step 1: Add failing decoder tests**

Create `RefloatConfigDecoderTest.kt`:

```kotlin
package expo.modules.vescble

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.nio.ByteBuffer
import java.nio.ByteOrder

class RefloatConfigDecoderTest {
  @Test
  fun decodesAllowlistedValuesIntoGroups() {
    val schema = RefloatConfigSchema(
      hash = "schema-hash",
      fields = listOf(
        RefloatConfigSchemaField("kp", RefloatConfigValueType.FLOAT32, "Angle P", null, 0.0, 100.0, 0),
        RefloatConfigSchemaField("kp2", RefloatConfigValueType.FLOAT32, "Rate P", null, 0.0, 5.0, 4),
        RefloatConfigSchemaField("unused", RefloatConfigValueType.INT32, "Unused", null, null, null, 8),
      ),
    )
    val bytes = ByteBuffer.allocate(12)
      .order(ByteOrder.BIG_ENDIAN)
      .putFloat(26.0f)
      .putFloat(0.9f)
      .putInt(123)
      .array()

    val snapshot = RefloatConfigDecoder.decode(
      schema = schema,
      rawConfig = bytes,
      boardId = "board-1",
      canId = 7,
      capturedAt = 100L,
    )

    assertEquals("schema-hash", snapshot.schemaHash)
    assertEquals(12, snapshot.rawConfigLength)
    assertEquals(26.0, snapshot.groups.first().fields[0].value as Double, 0.001)
    assertEquals(0.9, snapshot.groups.first().fields[1].value as Double, 0.001)
    assertTrue(snapshot.rawConfigHash.isNotBlank())
  }

  @Test(expected = RefloatConfigDecodeException::class)
  fun rejectsTruncatedConfig() {
    val schema = RefloatConfigSchema(
      hash = "schema-hash",
      fields = listOf(
        RefloatConfigSchemaField("kp", RefloatConfigValueType.FLOAT32, "Angle P", null, 0.0, 100.0, 0),
      ),
    )

    RefloatConfigDecoder.decode(schema, byteArrayOf(1, 2), null, 7, 100L)
  }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
bun run test:android --tests expo.modules.vescble.RefloatConfigDecoderTest
```

Expected: FAIL because decoder does not exist.

- [ ] **Step 3: Implement decoder**

Create `RefloatConfigDecoder.kt`:

```kotlin
package expo.modules.vescble

import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.security.MessageDigest

internal class RefloatConfigDecodeException(message: String) : Exception(message)

internal object RefloatConfigDecoder {
    fun decode(
        schema: RefloatConfigSchema,
        rawConfig: ByteArray,
        boardId: String?,
        canId: Int,
        capturedAt: Long,
    ): RefloatConfigSnapshot {
        val byId = schema.fields.associateBy { it.id }
        val requiredLength = schema.fields.maxOfOrNull { it.offset + it.type.byteSize } ?: 0
        if (rawConfig.size < requiredLength) {
            throw RefloatConfigDecodeException("CONFIG_DECODE_FAILED: config length ${rawConfig.size} < $requiredLength")
        }

        val missing = mutableListOf<String>()
        val groups = REFLOAT_TUNE_GROUPS.mapNotNull { groupDef ->
            val fields = groupDef.fields.mapNotNull { fieldDef ->
                val schemaField = byId[fieldDef.id] ?: run {
                    missing.add(fieldDef.id)
                    return@mapNotNull null
                }
                RefloatConfigField(
                    id = fieldDef.id,
                    label = schemaField.label.ifBlank { fieldDef.label },
                    value = readValue(rawConfig, schemaField),
                    unit = schemaField.unit ?: fieldDef.unitFallback,
                    min = schemaField.min,
                    max = schemaField.max,
                )
            }
            if (fields.isEmpty()) null else RefloatConfigGroup(groupDef.id, groupDef.title, fields)
        }

        return RefloatConfigSnapshot(
            capturedAt = capturedAt,
            boardId = boardId,
            canId = canId,
            schemaHash = schema.hash,
            rawConfigHash = sha256(rawConfig),
            rawConfigLength = rawConfig.size,
            groups = groups,
            missingFieldIds = missing,
        )
    }

    private fun readValue(bytes: ByteArray, field: RefloatConfigSchemaField): Any {
        val view = ByteBuffer.wrap(bytes).order(ByteOrder.BIG_ENDIAN)
        view.position(field.offset)
        return when (field.type) {
            RefloatConfigValueType.FLOAT32 -> view.float.toDouble()
            RefloatConfigValueType.INT32 -> view.int.toDouble()
            RefloatConfigValueType.UINT32 -> (view.int.toLong() and 0xffffffffL).toDouble()
            RefloatConfigValueType.INT16 -> view.short.toDouble()
            RefloatConfigValueType.UINT16 -> (view.short.toInt() and 0xffff).toDouble()
            RefloatConfigValueType.INT8 -> view.get().toDouble()
            RefloatConfigValueType.UINT8 -> (view.get().toInt() and 0xff).toDouble()
            RefloatConfigValueType.BOOL -> view.get().toInt() != 0
        }
    }

    private fun sha256(bytes: ByteArray): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(bytes)
        return digest.joinToString("") { "%02x".format(it) }
    }
}
```

- [ ] **Step 4: Run decoder tests**

Run:

```bash
bun run test:android --tests expo.modules.vescble.RefloatConfigDecoderTest
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add modules/vesc-ble/android/src/main/java/expo/modules/vescble/RefloatConfigDecoder.kt \
  modules/vesc-ble/android/src/test/java/expo/modules/vescble/RefloatConfigDecoderTest.kt
git commit -m "Decode read-only Refloat config snapshots"
```

## Task 5: Native Service Read Queue

**Files:**
- Modify: `modules/vesc-ble/android/src/main/java/expo/modules/vescble/VescForegroundService.kt`
- Modify: `modules/vesc-ble/android/src/main/java/expo/modules/vescble/VescBleModule.kt`

- [ ] **Step 1: Add service API types and companion method**

In `VescForegroundService.kt`, add near `PendingStop` definitions or private service state definitions:

```kotlin
private data class PendingConfigRead(
    val onSuccess: (Map<String, Any?>) -> Unit,
    val onError: (String, String) -> Unit,
)

private data class ActiveConfigRead(
    val pending: PendingConfigRead,
    val previousPolling: Boolean,
    val xmlBytes: ByteArray,
    val expectedXmlLength: Int?,
    val nextXmlOffset: Int,
)
```

In companion object, add:

```kotlin
private var pendingConfigRead: PendingConfigRead? = null

fun getRefloatConfigSnapshot(
    context: Context,
    onSuccess: (Map<String, Any?>) -> Unit,
    onError: (String, String) -> Unit,
) {
    pendingConfigRead = PendingConfigRead(onSuccess, onError)
    instance?.consumePendingConfigRead()
        ?: onError(
            RefloatConfigErrorCode.BOARD_NOT_CONNECTED.name,
            "Board must be connected before reading Refloat config",
        )
}
```

- [ ] **Step 2: Add service state and validation**

Inside `VescForegroundService` class state, add:

```kotlin
private var activeConfigRead: ActiveConfigRead? = null
private var configTimeoutRunnable: Runnable? = null
private val configChunkLength = 384
private val configTimeoutMs = 4_000L
```

Add methods:

```kotlin
private fun consumePendingConfigRead() {
    val pending = pendingConfigRead ?: return
    pendingConfigRead = null
    if (activeConfigRead != null) {
        pending.onError(
            RefloatConfigErrorCode.CONFIG_REQUEST_IN_FLIGHT.name,
            "Refloat config read already in flight",
        )
        return
    }
    val session = boardConfig
    if (session == null || boardStatus != BoardPhase.Connected) {
        pending.onError(
            RefloatConfigErrorCode.BOARD_NOT_CONNECTED.name,
            "Board must be connected before reading Refloat config",
        )
        return
    }
    val id = canId
    if (id == null) {
        pending.onError(
            RefloatConfigErrorCode.CAN_ID_UNAVAILABLE.name,
            "Cannot read Refloat config before CAN id discovery",
        )
        return
    }
    val wasPolling = pollRunnable != null
    stopPolling()
    activeConfigRead = ActiveConfigRead(
        pending = pending,
        previousPolling = wasPolling,
        xmlBytes = ByteArray(0),
        expectedXmlLength = null,
        nextXmlOffset = 0,
    )
    sendNextConfigXmlChunk(id)
}
```

- [ ] **Step 3: Add request send/timeout helpers**

Add methods:

```kotlin
private fun sendNextConfigXmlChunk(id: Int) {
    val active = activeConfigRead ?: return
    val offset = active.nextXmlOffset
    val remaining = active.expectedXmlLength?.let { it - offset }
    val length = remaining?.coerceAtMost(configChunkLength) ?: configChunkLength
    armConfigTimeout(RefloatConfigErrorCode.CONFIG_SCHEMA_TIMEOUT)
    val sent = sendPayload(RefloatConfigProtocol.buildGetCustomConfigXml(id, confInd = 0, length = length, offset = offset))
    if (!sent) failConfigRead(RefloatConfigErrorCode.GATT_NOT_WRITABLE, "Board GATT is not writable")
}

private fun sendConfigBytesRequest(id: Int) {
    armConfigTimeout(RefloatConfigErrorCode.CONFIG_READ_TIMEOUT)
    val sent = sendPayload(RefloatConfigProtocol.buildGetCustomConfig(id, confInd = 0))
    if (!sent) failConfigRead(RefloatConfigErrorCode.GATT_NOT_WRITABLE, "Board GATT is not writable")
}

private fun armConfigTimeout(code: RefloatConfigErrorCode) {
    configTimeoutRunnable?.let { mainHandler.removeCallbacks(it) }
    configTimeoutRunnable = Runnable {
        failConfigRead(code, "Timed out reading Refloat config")
    }
    mainHandler.postDelayed(configTimeoutRunnable!!, configTimeoutMs)
}

private fun clearConfigTimeout() {
    configTimeoutRunnable?.let { mainHandler.removeCallbacks(it) }
    configTimeoutRunnable = null
}
```

- [ ] **Step 4: Add response routing without touching telemetry parsing**

In `handlePayload(payload: ByteArray)`, add cases before `COMM_CUSTOM_APP_DATA`:

```kotlin
COMM_GET_CUSTOM_CONFIG_XML -> handleConfigXmlPayload(payload)
COMM_GET_CUSTOM_CONFIG -> handleConfigBytesPayload(payload)
```

Add methods:

```kotlin
private fun handleConfigXmlPayload(payload: ByteArray) {
    val active = activeConfigRead ?: return
    val parsed = RefloatConfigProtocol.parseCustomConfigXmlResponse(payload)
        ?: return failConfigRead(
            RefloatConfigErrorCode.UNEXPECTED_CONFIG_RESPONSE,
            "Unexpected Refloat config XML response",
        )
    if (parsed.confInd != 0) {
        return failConfigRead(
            RefloatConfigErrorCode.UNEXPECTED_CONFIG_RESPONSE,
            "Unexpected Refloat config XML index ${parsed.confInd}",
        )
    }
    clearConfigTimeout()
    val merged = ByteArray(active.xmlBytes.size + parsed.chunk.size)
    active.xmlBytes.copyInto(merged)
    parsed.chunk.copyInto(merged, active.xmlBytes.size)
    val nextOffset = parsed.offset + parsed.chunk.size
    activeConfigRead = active.copy(
        xmlBytes = merged,
        expectedXmlLength = parsed.totalLength,
        nextXmlOffset = nextOffset,
    )
    val id = canId ?: return failConfigRead(
        RefloatConfigErrorCode.CAN_ID_UNAVAILABLE,
        "CAN id unavailable during Refloat config read",
    )
    if (nextOffset >= parsed.totalLength) {
        sendConfigBytesRequest(id)
    } else {
        sendNextConfigXmlChunk(id)
    }
}

private fun handleConfigBytesPayload(payload: ByteArray) {
    val active = activeConfigRead ?: return
    val parsed = RefloatConfigProtocol.parseCustomConfigResponse(payload)
        ?: return failConfigRead(
            RefloatConfigErrorCode.UNEXPECTED_CONFIG_RESPONSE,
            "Unexpected Refloat config response",
        )
    if (parsed.confInd != 0) {
        return failConfigRead(
            RefloatConfigErrorCode.UNEXPECTED_CONFIG_RESPONSE,
            "Unexpected Refloat config index ${parsed.confInd}",
        )
    }
    clearConfigTimeout()
    try {
        val schema = RefloatConfigSchemaParser.parse(active.xmlBytes)
        val snapshot = RefloatConfigDecoder.decode(
            schema = schema,
            rawConfig = parsed.config,
            boardId = boardConfig?.appBoardId,
            canId = canId ?: 0,
            capturedAt = System.currentTimeMillis(),
        )
        completeConfigRead(snapshot.toMap())
    } catch (e: RefloatConfigSchemaException) {
        failConfigRead(RefloatConfigErrorCode.UNSUPPORTED_SCHEMA, e.message ?: "Unsupported Refloat config schema")
    } catch (e: RefloatConfigDecodeException) {
        failConfigRead(RefloatConfigErrorCode.CONFIG_DECODE_FAILED, e.message ?: "Failed to decode Refloat config")
    }
}
```

- [ ] **Step 5: Add completion/failure cleanup**

Add:

```kotlin
private fun completeConfigRead(snapshot: Map<String, Any?>) {
    val active = activeConfigRead ?: return
    activeConfigRead = null
    clearConfigTimeout()
    if (active.previousPolling && boardConfig != null && canId != null) startPolling()
    active.pending.onSuccess(snapshot)
}

private fun failConfigRead(code: RefloatConfigErrorCode, message: String) {
    val active = activeConfigRead ?: return
    activeConfigRead = null
    clearConfigTimeout()
    if (active.previousPolling && boardConfig != null && canId != null) startPolling()
    active.pending.onError(code.name, message)
}
```

Also call `failConfigRead(BOARD_NOT_CONNECTED, "Board session stopped during Refloat config read")` from `stopCurrentBoardSession` before clearing board state if `activeConfigRead != null`.

- [ ] **Step 6: Expose module async function**

In `VescBleModule.kt`, add inside module definition:

```kotlin
AsyncFunction("getRefloatConfigSnapshot") { promise: Promise ->
  VescForegroundService.getRefloatConfigSnapshot(
    context = context.applicationContext,
    onSuccess = { snapshot -> promise.resolve(snapshot) },
    onError = { code, message -> promise.reject(code, message, null) },
  )
}
```

- [ ] **Step 7: Run Android tests**

Run:

```bash
bun run test:android --tests expo.modules.vescble.RefloatConfigProtocolTest --tests expo.modules.vescble.RefloatConfigSchemaTest --tests expo.modules.vescble.RefloatConfigDecoderTest --tests expo.modules.vescble.RefloatConfigModelsTest
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add modules/vesc-ble/android/src/main/java/expo/modules/vescble/VescForegroundService.kt \
  modules/vesc-ble/android/src/main/java/expo/modules/vescble/VescBleModule.kt
git commit -m "Expose read-only Refloat config snapshot"
```

## Task 6: TypeScript And iOS API Surface

**Files:**
- Modify: `modules/vesc-ble/src/index.ts`
- Modify: `modules/vesc-ble/ios/VescBleModule.swift`

- [ ] **Step 1: Add TypeScript types and export**

In `modules/vesc-ble/src/index.ts`, after `TelemetrySummary`, add:

```ts
export interface RefloatConfigField {
  id: string
  label: string
  value: number | boolean | string
  unit: string | null
  min: number | null
  max: number | null
  readOnly: true
}

export interface RefloatConfigGroup {
  id: string
  title: string
  fields: RefloatConfigField[]
}

export interface RefloatConfigSnapshot {
  capturedAt: number
  boardId: string | null
  canId: number
  schemaHash: string
  rawConfigHash: string
  rawConfigLength: number
  groups: RefloatConfigGroup[]
  missingFieldIds: string[]
}
```

In `VescBleNativeModule`, add:

```ts
getRefloatConfigSnapshot(): Promise<RefloatConfigSnapshot>
```

After `getTelemetrySummary`, add:

```ts
export async function getRefloatConfigSnapshot(): Promise<RefloatConfigSnapshot> {
  return native.getRefloatConfigSnapshot()
}
```

- [ ] **Step 2: Add iOS unsupported function**

In `modules/vesc-ble/ios/VescBleModule.swift`, near telemetry history functions, add:

```swift
AsyncFunction("getRefloatConfigSnapshot") { (promise: Promise) in
  promise.reject(
    "UNSUPPORTED_PLATFORM",
    "Refloat config reading is Android-only until iOS BLE transport is implemented"
  )
}
```

- [ ] **Step 3: Run TypeScript check**

Run:

```bash
bun run ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add modules/vesc-ble/src/index.ts modules/vesc-ble/ios/VescBleModule.swift
git commit -m "Add Refloat config JS API"
```

## Task 7: Read-Only Tune Screen

**Files:**
- Modify: `src/app/tune.tsx`

- [ ] **Step 1: Replace placeholder with read-only snapshot screen**

Replace `src/app/tune.tsx` with:

```tsx
import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { ArrowsClockwiseIcon, WarningCircleIcon } from 'phosphor-react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { getRefloatConfigSnapshot, type RefloatConfigSnapshot } from 'vesc-ble'

type LoadState =
  | { phase: 'loading'; snapshot: RefloatConfigSnapshot | null; error: string | null }
  | { phase: 'ready'; snapshot: RefloatConfigSnapshot; error: null }
  | { phase: 'error'; snapshot: RefloatConfigSnapshot | null; error: string }

function formatValue(value: number | boolean | string): string {
  if (typeof value === 'boolean') return value ? 'On' : 'Off'
  if (typeof value === 'string') return value
  if (!Number.isFinite(value)) return '-'
  if (Math.abs(value) >= 1000) return Math.round(value).toLocaleString()
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return 'Unable to read Refloat config.'
}

export default function TuneScreen() {
  const [state, setState] = useState<LoadState>({
    phase: 'loading',
    snapshot: null,
    error: null,
  })

  const load = useCallback(async () => {
    setState((current) => ({ phase: 'loading', snapshot: current.snapshot, error: null }))
    try {
      const snapshot = await getRefloatConfigSnapshot()
      setState({ phase: 'ready', snapshot, error: null })
    } catch (error) {
      setState((current) => ({
        phase: 'error',
        snapshot: current.snapshot,
        error: errorMessage(error),
      }))
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const snapshot = state.snapshot

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Tune</Text>
          <Text style={styles.subtitle}>Read-only Refloat config</Text>
        </View>
        <Pressable style={styles.iconButton} onPress={load} disabled={state.phase === 'loading'}>
          <ArrowsClockwiseIcon size={18} color="#e5e7eb" />
        </Pressable>
      </View>

      {state.phase === 'loading' && !snapshot ? (
        <View style={styles.centerState}>
          <ActivityIndicator color="#38bdf8" />
          <Text style={styles.stateText}>Reading board config...</Text>
        </View>
      ) : null}

      {state.phase === 'error' && !snapshot ? (
        <View style={styles.centerState}>
          <WarningCircleIcon size={28} color="#f87171" />
          <Text style={styles.errorText}>{state.error}</Text>
          <Pressable style={styles.retryButton} onPress={load}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : null}

      {snapshot ? (
        <ScrollView contentContainerStyle={styles.content}>
          {state.phase === 'error' ? (
            <View style={styles.errorBanner}>
              <WarningCircleIcon size={16} color="#fca5a5" />
              <Text style={styles.errorBannerText}>{state.error}</Text>
            </View>
          ) : null}

          <View style={styles.metaRow}>
            <Text style={styles.metaText}>CAN {snapshot.canId}</Text>
            <Text style={styles.metaText}>{snapshot.rawConfigLength} bytes</Text>
            {snapshot.missingFieldIds.length > 0 ? (
              <Text style={styles.metaText}>{snapshot.missingFieldIds.length} missing</Text>
            ) : null}
          </View>

          {snapshot.groups.map((group) => (
            <View key={group.id} style={styles.group}>
              <View style={styles.groupHeader}>
                <Text style={styles.groupTitle}>{group.title}</Text>
                <Text style={styles.groupCount}>{group.fields.length} values</Text>
              </View>
              {group.fields.map((field) => (
                <View key={field.id} style={styles.fieldRow}>
                  <Text style={styles.fieldLabel}>{field.label}</Text>
                  <View style={styles.valueBox}>
                    <Text style={styles.fieldValue}>{formatValue(field.value)}</Text>
                    {field.unit ? <Text style={styles.fieldUnit}>{field.unit}</Text> : null}
                  </View>
                </View>
              ))}
            </View>
          ))}
        </ScrollView>
      ) : null}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050505',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#1f2937',
  },
  title: {
    color: '#f9fafb',
    fontSize: 28,
    fontWeight: '700',
  },
  subtitle: {
    color: '#9ca3af',
    marginTop: 4,
    fontSize: 14,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1f2937',
  },
  content: {
    padding: 16,
    gap: 18,
    paddingBottom: 32,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
  },
  stateText: {
    color: '#9ca3af',
    fontSize: 15,
  },
  errorText: {
    color: '#fecaca',
    fontSize: 15,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#38bdf8',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryText: {
    color: '#020617',
    fontWeight: '700',
  },
  errorBanner: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    backgroundColor: '#3f1111',
    borderColor: '#7f1d1d',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
  },
  errorBannerText: {
    color: '#fecaca',
    flex: 1,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  metaText: {
    color: '#9ca3af',
    backgroundColor: '#111827',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 12,
  },
  group: {
    gap: 12,
  },
  groupHeader: {
    backgroundColor: '#18181b',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  groupTitle: {
    color: '#f4f4f5',
    fontSize: 20,
    fontWeight: '700',
  },
  groupCount: {
    color: '#a1a1aa',
    marginTop: 3,
    fontSize: 13,
  },
  fieldRow: {
    gap: 6,
  },
  fieldLabel: {
    color: '#f4f4f5',
    fontSize: 16,
  },
  valueBox: {
    minHeight: 54,
    borderRadius: 8,
    backgroundColor: '#242424',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fieldValue: {
    color: '#f5f5f5',
    fontSize: 18,
    fontWeight: '600',
  },
  fieldUnit: {
    color: '#d4d4d8',
    fontSize: 16,
    marginLeft: 12,
  },
})
```

- [ ] **Step 2: Run TypeScript**

Run:

```bash
bun run ts
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/tune.tsx
git commit -m "Show read-only Refloat tune values"
```

## Task 8: Final Verification

**Files:**
- Verify all changed files.

- [ ] **Step 1: Run Android unit tests**

Run:

```bash
bun run test:android
```

Expected: PASS.

- [ ] **Step 2: Run JS tests**

Run:

```bash
bun run test:bun
```

Expected: PASS.

- [ ] **Step 3: Run TypeScript**

Run:

```bash
bun run ts
```

Expected: PASS.

- [ ] **Step 4: Run lint**

Run:

```bash
bun run lint
```

Expected: PASS or existing unrelated warnings only. Investigate any new warning in touched files.

- [ ] **Step 5: Audit no write commands**

Run:

```bash
rg -n "COMM_SET_CUSTOM_CONFIG|CFG_SAVE|CFG_RESTORE|RT_TUNE|TUNE_OTHER|TUNE_TILT|setRefloat|writeRefloat|saveRefloat" modules/vesc-ble src
```

Expected: no new write-capable API or call sites. `COMM_SET_CUSTOM_CONFIG` may appear only in docs/specs, not implementation files.

- [ ] **Step 6: Commit final verification note if any fixes were needed**

If verification required fixes:

```bash
git add <fixed-files>
git commit -m "Fix Refloat config read verification issues"
```

If no fixes were needed, do not create an empty commit.

## Self-Review

Spec coverage:

- Read-only API: Task 5, Task 6.
- Serialized native request and telemetry poll gating: Task 5.
- XML schema fetch and parsing: Task 1, Task 3, Task 5.
- Config bytes fetch and decode: Task 1, Task 4, Task 5.
- Allowlisted fields: Task 2, Task 4.
- iOS unsupported error: Task 6.
- Minimal read-only Tune screen: Task 7.
- Tests and no write audit: Tasks 1-4, Task 8.

No write-capable native method is planned. No save UI is planned. All package/script commands use `bun`.
