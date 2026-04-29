package expo.modules.vescble.telemetry

import kotlin.math.abs

internal const val TELEMETRY_BUCKET_SIZE_MS = 60_000L
internal const val UNKNOWN_TELEMETRY_DEVICE_ID = ""
internal const val UNKNOWN_TELEMETRY_DEVICE_NAME = "VESC Board"

internal data class BucketTelemetryPoint(
  val capturedAtMs: Long,
  val deviceId: String?,
  val deviceName: String?,
  val speedCentiKmh: Int,
  val batteryVoltageMv: Int,
  val motorCurrentMa: Int,
  val batteryCurrentMa: Int,
  val dutyPermille: Int,
  val hasFault: Boolean,
  val odometerCm: Long?,
)

internal data class BucketLocationPoint(
  val capturedAtMs: Long,
  val deviceId: String?,
  val deviceName: String?,
  val precise: Boolean,
  val distanceFromPreviousCm: Long?,
  val gpsSpeedCentiMps: Int?,
)

internal fun buildTelemetryBuckets(
  telemetryPoints: List<BucketTelemetryPoint>,
  locationPoints: List<BucketLocationPoint>,
): Collection<TelemetryMinuteBucketEntity> {
  val buckets = linkedMapOf<Pair<Long, String>, MutableBucket>()
  for (point in telemetryPoints) {
    val bucketStart = point.capturedAtMs - (point.capturedAtMs % TELEMETRY_BUCKET_SIZE_MS)
    val deviceId = point.deviceId ?: UNKNOWN_TELEMETRY_DEVICE_ID
    val key = bucketStart to deviceId
    val bucket = buckets.getOrPut(key) {
      MutableBucket(bucketStart, deviceId, point.deviceName)
    }
    bucket.add(point)
  }
  for (point in locationPoints) {
    val bucketStart = point.capturedAtMs - (point.capturedAtMs % TELEMETRY_BUCKET_SIZE_MS)
    val deviceId = point.deviceId ?: UNKNOWN_TELEMETRY_DEVICE_ID
    val key = bucketStart to deviceId
    val bucket = buckets.getOrPut(key) {
      MutableBucket(bucketStart, deviceId, point.deviceName)
    }
    bucket.addLocation(point)
  }
  return buckets.values.map { it.toEntity() }
}

private class MutableBucket(
  private val bucketStartMs: Long,
  private val deviceId: String,
  private var deviceName: String?,
) {
  private var sampleCount = 0
  private var firstSampleAtMs = Long.MAX_VALUE
  private var lastSampleAtMs = Long.MIN_VALUE
  private var sumAbsSpeedCentiKmh = 0L
  private var maxAbsSpeedCentiKmh = 0
  private var minBatteryVoltageMv: Int? = null
  private var maxMotorCurrentAbsMa = 0
  private var maxBatteryCurrentAbsMa = 0
  private var maxDutyAbsPermille = 0
  private var faultCount = 0
  private var firstOdometerCm: Long? = null
  private var lastOdometerCm: Long? = null
  private var gpsPointCount = 0
  private var preciseGpsPointCount = 0
  private var gpsDistanceCm = 0L
  private var maxGpsSpeedCentiMps: Int? = null

  fun add(point: BucketTelemetryPoint) {
    sampleCount++
    if (point.deviceName != null) deviceName = point.deviceName
    firstSampleAtMs = minOf(firstSampleAtMs, point.capturedAtMs)
    lastSampleAtMs = maxOf(lastSampleAtMs, point.capturedAtMs)
    val absSpeed = abs(point.speedCentiKmh)
    sumAbsSpeedCentiKmh += absSpeed.toLong()
    maxAbsSpeedCentiKmh = maxOf(maxAbsSpeedCentiKmh, absSpeed)
    minBatteryVoltageMv = minBatteryVoltageMv?.let { minOf(it, point.batteryVoltageMv) }
      ?: point.batteryVoltageMv
    maxMotorCurrentAbsMa = maxOf(maxMotorCurrentAbsMa, abs(point.motorCurrentMa))
    maxBatteryCurrentAbsMa = maxOf(maxBatteryCurrentAbsMa, abs(point.batteryCurrentMa))
    maxDutyAbsPermille = maxOf(maxDutyAbsPermille, abs(point.dutyPermille))
    if (point.hasFault) faultCount++
    if (firstOdometerCm == null) firstOdometerCm = point.odometerCm
    if (point.odometerCm != null) lastOdometerCm = point.odometerCm
  }

  fun addLocation(point: BucketLocationPoint) {
    gpsPointCount++
    if (point.precise) preciseGpsPointCount++
    if (point.deviceName != null) deviceName = point.deviceName
    firstSampleAtMs = minOf(firstSampleAtMs, point.capturedAtMs)
    lastSampleAtMs = maxOf(lastSampleAtMs, point.capturedAtMs)
    gpsDistanceCm += point.distanceFromPreviousCm ?: 0L
    maxGpsSpeedCentiMps = when {
      maxGpsSpeedCentiMps == null -> point.gpsSpeedCentiMps
      point.gpsSpeedCentiMps == null -> maxGpsSpeedCentiMps
      else -> maxOf(maxGpsSpeedCentiMps ?: 0, point.gpsSpeedCentiMps)
    }
  }

  fun toEntity(): TelemetryMinuteBucketEntity = TelemetryMinuteBucketEntity(
    bucketStartMs = bucketStartMs,
    deviceId = deviceId,
    deviceName = deviceName,
    sampleCount = sampleCount,
    firstSampleAtMs = firstSampleAtMs,
    lastSampleAtMs = lastSampleAtMs,
    sumAbsSpeedCentiKmh = sumAbsSpeedCentiKmh,
    maxAbsSpeedCentiKmh = maxAbsSpeedCentiKmh,
    minBatteryVoltageMv = minBatteryVoltageMv,
    maxMotorCurrentAbsMa = maxMotorCurrentAbsMa,
    maxBatteryCurrentAbsMa = maxBatteryCurrentAbsMa,
    maxDutyAbsPermille = maxDutyAbsPermille,
    faultCount = faultCount,
    firstOdometerCm = firstOdometerCm,
    lastOdometerCm = lastOdometerCm,
    gpsPointCount = gpsPointCount,
    preciseGpsPointCount = preciseGpsPointCount,
    gpsDistanceCm = gpsDistanceCm,
    maxGpsSpeedCentiMps = maxGpsSpeedCentiMps,
  )
}
