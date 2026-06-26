package app.vescape.wear

import androidx.compose.runtime.mutableStateOf

/** MessageClient path the phone pushes Watch Frames on. Must match the phone-side WatchTelemetryPusher. */
const val TELEMETRY_PATH = "/telemetry"

/**
 * Latest wrist-visible [WatchFrame] decoded from the phone push. The MessageClient listener writes it,
 * Compose reads it. Null until the first frame arrives.
 */
object TelemetryState {
    val frame = mutableStateOf<WatchFrame?>(null)
}
