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
      if (id.isNullOrBlank()) throw RefloatConfigSchemaException("UNSUPPORTED_SCHEMA: param missing name")
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
