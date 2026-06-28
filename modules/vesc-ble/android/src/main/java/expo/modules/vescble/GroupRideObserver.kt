package expo.modules.vescble

import android.os.Handler
import android.util.Log
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * Group Ride **observe** client: a native WebSocket to the relay server that lives in the
 * foreground service and surfaces ride-lifecycle events to JS. Observing sends NOTHING — it
 * only receives the active-ride [snapshot] on connect, then `ride-created` / `ride-updated` /
 * `ride-ended` deltas (global fan-out). Location leaves the device only when creating/joining
 * (later slices), never while observing.
 *
 * Wire protocol: vescape-server `docs/group-ride/PROTOCOL.md`. All state is touched on the
 * main thread ([handler]); OkHttp callbacks hop back onto it before mutating anything.
 */
internal class GroupRideObserver(
    private val handler: Handler,
    private val emit: (String, Map<String, Any?>) -> Unit,
) {
    private val client = OkHttpClient.Builder()
        .pingInterval(PING_INTERVAL_SECONDS, TimeUnit.SECONDS)
        .build()

    private var webSocket: WebSocket? = null
    private var serverUrl: String? = null
    private var reconnectAttempt = 0
    private var stopped = true
    private val reconnectRunnable = Runnable { connect() }

    /** True while the observe connection should be kept alive (drives service idle checks). */
    val active: Boolean get() = !stopped

    fun start(url: String) {
        if (!stopped && url == serverUrl) return
        stopped = false
        serverUrl = url
        reconnectAttempt = 0
        connect()
    }

    fun stop() {
        stopped = true
        handler.removeCallbacks(reconnectRunnable)
        webSocket?.close(NORMAL_CLOSURE, "client stop")
        webSocket = null
        emitConnection("idle")
    }

    /**
     * Create a Group Ride over the live observe socket: bind this connection's Rider with
     * `hello`, then send `create` carrying the creator's location and optional name. This is
     * the only location egress while observing. The server fans the result back as
     * `ride-created`, so there is no local optimistic insert here. No-op when not connected.
     */
    fun create(riderId: String, riderName: String, name: String?, lat: Double, lng: Double) {
        handler.post {
            val ws = webSocket
            if (stopped || ws == null) {
                Log.w(TAG, "create ignored: observe socket not connected")
                return@post
            }
            ws.send(
                JSONObject()
                    .put("type", "hello")
                    .put("riderId", riderId)
                    .put("name", riderName)
                    .toString(),
            )
            val create = JSONObject()
                .put("type", "create")
                .put("location", JSONObject().put("lat", lat).put("lng", lng))
            if (!name.isNullOrBlank()) create.put("name", name)
            ws.send(create.toString())
        }
    }

    private fun connect() {
        val url = serverUrl ?: return
        if (stopped) return
        emitConnection("connecting")
        val request = Request.Builder().url(url).build()
        webSocket = client.newWebSocket(request, listener)
    }

    private val listener = object : WebSocketListener() {
        override fun onOpen(ws: WebSocket, response: Response) {
            handler.post {
                if (stopped) return@post
                reconnectAttempt = 0
                emitConnection("connected")
            }
        }

        override fun onMessage(ws: WebSocket, text: String) {
            handler.post { if (!stopped) handleMessage(text) }
        }

        override fun onClosing(ws: WebSocket, code: Int, reason: String) {
            ws.close(NORMAL_CLOSURE, null)
        }

        override fun onClosed(ws: WebSocket, code: Int, reason: String) {
            handler.post { scheduleReconnect() }
        }

        override fun onFailure(ws: WebSocket, t: Throwable, response: Response?) {
            Log.w(TAG, "Group Ride observe WS failure: ${t.message}")
            handler.post { scheduleReconnect() }
        }
    }

    private fun scheduleReconnect() {
        webSocket = null
        if (stopped) return
        emitConnection("disconnected")
        val delay = RECONNECT_DELAYS_MS[reconnectAttempt.coerceAtMost(RECONNECT_DELAYS_MS.lastIndex)]
        reconnectAttempt++
        handler.postDelayed(reconnectRunnable, delay)
    }

    private fun handleMessage(text: String) {
        val json = try {
            JSONObject(text)
        } catch (e: Exception) {
            Log.w(TAG, "Discarding malformed Group Ride frame: ${e.message}")
            return
        }
        when (json.optString("type")) {
            "snapshot" -> {
                val ridesJson = json.optJSONArray("rides")
                val rides = mutableListOf<Map<String, Any?>>()
                if (ridesJson != null) {
                    for (i in 0 until ridesJson.length()) {
                        rideSummary(ridesJson.optJSONObject(i))?.let(rides::add)
                    }
                }
                emit("onGroupRideSnapshot", mapOf("rides" to rides))
            }
            "ride-created" -> rideSummary(json.optJSONObject("ride"))?.let {
                emit("onGroupRideCreated", mapOf("ride" to it))
            }
            "ride-updated" -> rideSummary(json.optJSONObject("ride"))?.let {
                emit("onGroupRideUpdated", mapOf("ride" to it))
            }
            "ride-ended" -> {
                val rideId = json.optString("rideId")
                if (rideId.isNotEmpty()) emit("onGroupRideEnded", mapOf("rideId" to rideId))
            }
            // roster / joined / error are join-scoped — ignored while observing.
        }
    }

    /** Decode the `RideSummary` shape shared by `snapshot` and `ride-created`. */
    private fun rideSummary(obj: JSONObject?): Map<String, Any?>? {
        obj ?: return null
        val id = obj.optString("id")
        if (id.isEmpty()) return null
        val location = obj.optJSONObject("location") ?: return null
        val creator = obj.optJSONObject("creator") ?: return null
        return mapOf(
            "id" to id,
            "name" to obj.optString("name"),
            "createdAt" to obj.optLong("createdAt"),
            "riderCount" to obj.optInt("riderCount"),
            "location" to mapOf(
                "lat" to location.optDouble("lat"),
                "lng" to location.optDouble("lng"),
            ),
            "creator" to mapOf(
                "id" to creator.optString("id"),
                "name" to creator.optString("name"),
            ),
        )
    }

    private fun emitConnection(state: String) {
        emit("onGroupRideConnection", mapOf("state" to state))
    }

    companion object {
        private const val TAG = "GroupRideObserver"
        private const val NORMAL_CLOSURE = 1000
        private const val PING_INTERVAL_SECONDS = 20L
        private val RECONNECT_DELAYS_MS = longArrayOf(1_000, 2_000, 5_000, 10_000, 30_000)
    }
}
