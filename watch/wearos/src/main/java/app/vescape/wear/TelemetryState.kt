package app.vescape.wear

import androidx.compose.runtime.mutableStateOf

/** MessageClient path the phone pushes telemetry on. Must match the phone-side WatchTelemetryPusher. */
const val TELEMETRY_PATH = "/telemetry"

/**
 * Latest wrist-visible telemetry. Slice 1 carries a single value (speed); the compact Watch Frame
 * with more fields arrives in slice 2. The MessageClient listener writes it, Compose reads it.
 */
object TelemetryState {
    val speed = mutableStateOf<Double?>(null)
}
