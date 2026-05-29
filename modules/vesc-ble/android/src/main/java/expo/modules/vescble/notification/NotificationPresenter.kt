package expo.modules.vescble.notification

import android.app.Notification
import expo.modules.vescble.VescNotificationController

internal class NotificationPresenter(
    private val controller: VescNotificationController,
    private val deviceName: () -> String?,
    private val appInForeground: () -> Boolean,
) {
    fun show(text: String = DEFAULT_TEXT, shortCriticalText: String? = null) {
        controller.show(text, deviceName(), appInForeground(), shortCriticalText)
    }

    fun build(text: String = DEFAULT_TEXT): Notification {
        return controller.build(text, deviceName(), appInForeground(), null)
    }

    companion object {
        const val DEFAULT_TEXT = "Monitoring board in background"

        fun formatNotificationText(values: expo.modules.vescble.RefloatTelemetry): String =
            NotificationFormatter.formatNotificationText(values)

        fun formatBatteryVoltageChipText(values: expo.modules.vescble.RefloatTelemetry): String =
            NotificationFormatter.formatBatteryVoltageChipText(values)

        fun formatGpsNotificationText(location: expo.modules.vescble.LocationSnapshot): String =
            NotificationFormatter.formatGpsNotificationText(location)
    }
}
