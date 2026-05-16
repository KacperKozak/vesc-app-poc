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
