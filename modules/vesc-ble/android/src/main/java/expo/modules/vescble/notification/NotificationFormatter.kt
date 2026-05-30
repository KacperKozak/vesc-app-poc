package expo.modules.vescble.notification

import expo.modules.vescble.LocationSnapshot
import expo.modules.vescble.RefloatTelemetry
import kotlin.math.abs

internal object NotificationFormatter {
    fun formatNotificationText(values: RefloatTelemetry): String {
        if (values.hasFault) return "Fault ${values.faultCode}"
        val dutyPercent = if (abs(values.dutyCycle) <= 0.01) 0.0 else values.dutyCycle * 100.0
        return String.format(
            "%.1f km/h | %.0f%% duty | %.1fV",
            abs(values.speed),
            dutyPercent,
            values.batteryVoltage,
        )
    }

    fun formatBatteryVoltageChipText(values: RefloatTelemetry): String =
        if (values.hasFault) "FAULT" else String.format("%.1fV", values.batteryVoltage)

    fun formatGpsNotificationText(location: LocationSnapshot): String {
        val speedKmh = (location.speedMps ?: 0.0) * 3.6
        return String.format("GPS %.1f km/h", abs(speedKmh))
    }
}
