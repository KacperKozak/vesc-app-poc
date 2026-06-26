package expo.modules.vescble

import android.content.Context
import com.google.android.gms.tasks.Tasks
import com.google.android.gms.wearable.Wearable
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import org.json.JSONObject

private const val WATCH_TELEMETRY_PATH = "/telemetry"

/**
 * Phone -> Wear OS Mirror push (ADR-0019). Fire-and-forget [com.google.android.gms.wearable.MessageClient]
 * send of the current speed to every connected node. Lives native (in vesc-ble, beside the telemetry
 * truth) so it keeps pushing while JS is backgrounded mid-ride.
 *
 * Slice 1 tracer: naive per-cold-path-emit JSON `{"speed": x}`. The dedicated watch tick and the
 * compact Watch Frame contract arrive in slice 2.
 */
internal class WatchTelemetryPusher(
    private val context: Context,
    private val scope: CoroutineScope,
) {
    private val messageClient by lazy { Wearable.getMessageClient(context) }
    private val nodeClient by lazy { Wearable.getNodeClient(context) }

    fun pushSpeed(speed: Double) {
        val payload = JSONObject().put("speed", speed).toString().toByteArray(Charsets.UTF_8)
        scope.launch {
            val nodes = runCatching { Tasks.await(nodeClient.connectedNodes) }.getOrNull() ?: return@launch
            for (node in nodes) {
                messageClient.sendMessage(node.id, WATCH_TELEMETRY_PATH, payload)
            }
        }
    }
}
