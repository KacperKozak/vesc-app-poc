package expo.modules.vescble.telemetry

import kotlin.math.abs

internal const val DEFAULT_MOVING_SPEED_THRESHOLD_CENTI_KMH = 300
internal const val METRIC_AVG_SPEED = "avg_speed"
internal const val EXCLUSION_REASON_LOW_SPEED = "low_speed"

internal data class SanitizedSample(
  val index: Int,
  val capturedAtMs: Long,
  val deviceId: String?,
  val excludedFromAvgSpeed: Boolean,
)

internal data class SanitizationResult(
  val samples: List<SanitizedSample>,
  val exclusions: List<MetricExclusionEntity>,
)

internal fun sanitizeTelemetrySamples(
  samples: List<BucketTelemetryPoint>,
  movingSpeedThresholdCentiKmh: Int = DEFAULT_MOVING_SPEED_THRESHOLD_CENTI_KMH,
): SanitizationResult {
  val threshold = movingSpeedThresholdCentiKmh.coerceAtLeast(0)
  val sanitized = mutableListOf<SanitizedSample>()
  val exclusions = mutableListOf<MetricExclusionEntity>()

  for ((index, point) in samples.withIndex()) {
    val absSpeed = abs(point.speedCentiKmh)
    val excludedFromAvgSpeed = absSpeed < threshold

    sanitized.add(
      SanitizedSample(
        index = index,
        capturedAtMs = point.capturedAtMs,
        deviceId = point.deviceId,
        excludedFromAvgSpeed = excludedFromAvgSpeed,
      ),
    )

    if (excludedFromAvgSpeed) {
      exclusions.add(
        MetricExclusionEntity(
          capturedAtMs = point.capturedAtMs,
          deviceId = point.deviceId ?: UNKNOWN_TELEMETRY_DEVICE_ID,
          metric = METRIC_AVG_SPEED,
          reason = EXCLUSION_REASON_LOW_SPEED,
        ),
      )
    }
  }

  return SanitizationResult(samples = sanitized, exclusions = exclusions)
}
