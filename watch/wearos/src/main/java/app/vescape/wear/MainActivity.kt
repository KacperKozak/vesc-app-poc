package app.vescape.wear

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import com.google.android.gms.wearable.MessageClient
import com.google.android.gms.wearable.Wearable
import org.json.JSONObject

/**
 * Wear OS Mirror entry point. Renders the single live value pushed from the phone over
 * [MessageClient] on [TELEMETRY_PATH] while the screen is on. Reception only runs while the
 * activity is resumed — the background-survivable transport lives on the phone side.
 */
class MainActivity : ComponentActivity() {
    private val messageClient by lazy { Wearable.getMessageClient(this) }

    private val listener = MessageClient.OnMessageReceivedListener { event ->
        if (event.path != TELEMETRY_PATH) return@OnMessageReceivedListener
        runCatching {
            val json = JSONObject(String(event.data, Charsets.UTF_8))
            TelemetryState.speed.value = json.getDouble("speed")
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { MirrorScreen() }
    }

    override fun onResume() {
        super.onResume()
        messageClient.addListener(listener)
    }

    override fun onPause() {
        super.onPause()
        messageClient.removeListener(listener)
    }
}
