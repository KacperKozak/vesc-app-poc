package expo.modules.vescble

import android.annotation.SuppressLint
import android.app.Notification
import android.app.Service
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.BluetoothStatusCodes
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.content.Intent
import android.location.Location
import android.location.LocationManager
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import expo.modules.vescble.telemetry.AlertRuleEntity
import expo.modules.vescble.telemetry.AppDataRepository
import expo.modules.vescble.telemetry.TelemetryCapture
import expo.modules.vescble.telemetry.TelemetryLocationCapture
import expo.modules.vescble.telemetry.TelemetryRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import java.util.UUID
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.roundToInt

internal const val VESC_SESSION_TAG = "VescSession"
private const val CHANNEL_ID = "vesc_monitoring_v4"
private const val NOTIFICATION_ID = 1001
private const val ACTION_START_SESSION = "expo.modules.vescble.ACTION_START_SESSION"
private const val ACTION_STOP_SESSION = "expo.modules.vescble.ACTION_STOP_SESSION"
private const val ACTION_EXIT_FROM_NOTIFICATION = "expo.modules.vescble.ACTION_EXIT_FROM_NOTIFICATION"
private const val ACTION_START_GPS_MONITORING = "expo.modules.vescble.ACTION_START_GPS_MONITORING"
private const val ACTION_STOP_GPS_MONITORING = "expo.modules.vescble.ACTION_STOP_GPS_MONITORING"

private const val MAX_RECORDING_ACCURACY_M = 20.0
private const val DEFAULT_LIVE_HISTORY_LIMIT_MINUTES = 5
private const val MIN_LIVE_HISTORY_LIMIT_MINUTES = 1
private const val MAX_LIVE_HISTORY_LIMIT_MINUTES = 50
private const val TELEMETRY_STALE_MS = 2_500L
private const val BOARD_READY_TIMEOUT_MS = 4_000L

private val NUS_SERVICE_UUID = UUID.fromString("6e400001-b5a3-f393-e0a9-e50e24dcca9e")
private val NUS_TX_UUID = UUID.fromString("6e400002-b5a3-f393-e0a9-e50e24dcca9e")
private val NUS_RX_UUID = UUID.fromString("6e400003-b5a3-f393-e0a9-e50e24dcca9e")
private val CCCD_UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")

data class SessionConfig(
    val appBoardId: String?,
    val deviceId: String?,
    val deviceName: String,
    val canId: Int?,
    val pollIntervalMs: Long,
    val recordingEnabled: Boolean,
    val telemetryRecordingEnabled: Boolean,
    val autoReconnect: Boolean = false,
)

@SuppressLint("MissingPermission")
class VescForegroundService : Service() {
    companion object {
        var emitEvent: ((String, Map<String, Any?>) -> Unit)? = null

        private var instance: VescForegroundService? = null
        private var appInForeground = true
        private var pendingStart: PendingStart? = null
        private var pendingStop: PendingStop? = null
        private var pendingGpsStart = false
        private var requestedTelemetryRecordingEnabled = false
        private var requestedLiveHistoryLimitMinutes = DEFAULT_LIVE_HISTORY_LIMIT_MINUTES
        private val appDataScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

        fun startBoardSession(
            context: Context,
            boardConfig: SessionConfig,
            onSuccess: () -> Unit,
            onError: (String, String) -> Unit,
        ) {
            pendingStart = PendingStart(boardConfig, onSuccess, onError)
            val intent = Intent(context, VescForegroundService::class.java).apply {
                action = ACTION_START_SESSION
            }
            context.startForegroundService(intent)
            instance?.consumePendingStart()
        }

        fun stopBoardSession(context: Context, onSuccess: () -> Unit = {}) {
            pendingStop = PendingStop(onSuccess)
            val intent = Intent(context, VescForegroundService::class.java).apply {
                action = ACTION_STOP_SESSION
            }
            context.startService(intent)
            instance?.consumePendingStop()
        }

        fun startGpsMonitoring(context: Context) {
            pendingGpsStart = true
            val intent = Intent(context, VescForegroundService::class.java).apply {
                action = ACTION_START_GPS_MONITORING
            }
            context.startForegroundService(intent)
            instance?.consumePendingGpsStart()
        }

        fun stopGpsMonitoring(context: Context) {
            pendingGpsStart = false
            val intent = Intent(context, VescForegroundService::class.java).apply {
                action = ACTION_STOP_GPS_MONITORING
            }
            context.startService(intent)
            instance?.stopGpsMonitoring()
        }

        fun setTelemetryRecordingEnabled(context: Context, enabled: Boolean) {
            requestedTelemetryRecordingEnabled = enabled
            instance?.setTelemetryRecordingEnabled(enabled)
            if (!enabled) TelemetryRepository.get(context.applicationContext).flushBlocking()
        }

        fun setLiveHistoryLimit(limit: Number?) {
            val minutes = (limit?.toInt() ?: DEFAULT_LIVE_HISTORY_LIMIT_MINUTES)
                .coerceIn(MIN_LIVE_HISTORY_LIMIT_MINUTES, MAX_LIVE_HISTORY_LIMIT_MINUTES)
            requestedLiveHistoryLimitMinutes = minutes
            instance?.setLiveHistoryLimitMinutes(minutes)
        }

        @Volatile private var alertRules: List<AlertRuleEntity> = emptyList()

        fun reloadAlertRules(context: Context) {
            appDataScope.launch {
                instance?.loadAlertRules(context.applicationContext)
            }
        }

        fun previewAlertSound(context: Context, soundType: String) {
            instance?.alertFeedback?.playTone(soundType, null) ?: VescAlertFeedback.preview(soundType)
        }

        fun currentLiveState(context: Context): Map<String, Any?> =
            instance?.liveStateMap(includeRecent = true)
                ?: idleState(AppDataRepository.get(context.applicationContext))

        fun setAppInForeground(active: Boolean) {
            if (appInForeground == active) return
            appInForeground = active
            instance?.showNotification()
        }

        private fun idleState(repository: AppDataRepository): Map<String, Any?> {
            val settings = kotlinx.coroutines.runBlocking { repository.getSettingsEntity() }
            return mapOf(
                "board" to mapOf(
                    "phase" to "idle",
                    "selectedBoardId" to settings.selectedBoardId,
                    "connectedBoardId" to null,
                    "bleId" to null,
                    "name" to null,
                    "connectionSeq" to 0L,
                    "lastTelemetryAt" to null,
                    "recentTelemetry" to emptyList<Map<String, Any?>>(),
                    "error" to null,
                    "autoConnect" to settings.autoConnect,
                ),
                "gps" to mapOf(
                    "phase" to "idle",
                    "latestFix" to null,
                    "recentLocations" to emptyList<Map<String, Any?>>(),
                    "error" to null,
                ),
                "scan" to mapOf(
                    "phase" to "idle",
                    "devices" to emptyList<Map<String, Any?>>(),
                    "error" to null,
                ),
                "recording" to mapOf(
                    "enabled" to false,
                    "activeBoardId" to null,
                    "startedAt" to null,
                ),
            )
        }
    }

    private data class PendingStart(
        val boardConfig: SessionConfig,
        val onSuccess: () -> Unit,
        val onError: (String, String) -> Unit,
    )

    private data class PendingStop(val onSuccess: () -> Unit)

    private val mainHandler = Handler(Looper.getMainLooper())
    private val packetReassembler = VescPacketReassembler()
    private val rttHistory = ArrayDeque<Long>()
    private val notificationController by lazy {
        VescNotificationController(
            service = this,
            serviceClass = VescForegroundService::class.java,
            channelId = CHANNEL_ID,
            notificationId = NOTIFICATION_ID,
            stopAction = ACTION_EXIT_FROM_NOTIFICATION,
        )
    }
    private val alertEngine = VescAlertEngine()
    private val alertFeedback by lazy { VescAlertFeedback(this, mainHandler) }
    private val gpsMonitor by lazy {
        VescGpsMonitor(
            context = this,
            looper = Looper.getMainLooper(),
            onLocation = ::onLocationUpdated,
        )
    }

    private var boardConfig: SessionConfig? = null
    private var boardStatus: String = "idle"
    private var boardError: String? = null
    private var telemetry: RefloatTelemetry? = null
    private var canId: Int? = null
    private var gatt: BluetoothGatt? = null
    private var txChar: BluetoothGattCharacteristic? = null
    private var pendingCccdWrites = 0
    private var cccdTimeout: Runnable? = null
    private var connectTimeout: Runnable? = null
    private var boardReadyTimeout: Runnable? = null
    private var pendingConnect: PendingStart? = null
    private var pollRunnable: Runnable? = null
    private var telemetryStaleRunnable: Runnable? = null
    private var lastPollAt = 0L
    private var lastTelemetryAt = 0L
    private var diagWriteCount = 0
    private var intentionalDisconnect = false
    private var connectAttempt = 0
    private var recorder: VescSessionRecorder? = null
    private var telemetryStore: TelemetryRepository? = null
    private var gpsError: String? = null
    private var latestLocation: LocationSnapshot? = null
    private var isStoppingService = false
    private var autoReconnectRunnable: Runnable? = null
    private var reconnectScanCallback: ScanCallback? = null
    private var autoReconnectAttempt = 0
    private var generation = 0L
    private var liveHistoryLimitMinutes = requestedLiveHistoryLimitMinutes
    private val recentTelemetry = ArrayDeque<Map<String, Any?>>()
    private val recentLocations = ArrayDeque<Map<String, Any?>>()
    private val bluetoothAdapter: BluetoothAdapter
        get() = (getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager).adapter

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        instance = this
        notificationController.createChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START_SESSION -> consumePendingStart()
            ACTION_STOP_SESSION -> consumePendingStop()
            ACTION_EXIT_FROM_NOTIFICATION -> exitFromNotification()
            ACTION_START_GPS_MONITORING -> consumePendingGpsStart()
            ACTION_STOP_GPS_MONITORING -> stopGpsMonitoring()
            else -> if (boardConfig == null && !gpsMonitor.active) stopSelf()
        }
        return if (isStoppingService) START_NOT_STICKY else START_STICKY
    }

    override fun onDestroy() {
        if (!isStoppingService) {
            stopCurrentBoardSession(emitDisconnected = false)
        }
        stopLocationUpdates()
        instance = null
        stopForeground(STOP_FOREGROUND_REMOVE)
        super.onDestroy()
    }

    private fun consumePendingStart() {
        val start = pendingStart ?: return
        pendingStart = null
        beginSession(start)
    }

    private fun consumePendingStop() {
        val stop = pendingStop ?: return
        pendingStop = null
        if (boardConfig != null) {
            setStatus("disconnecting")
            stopCurrentBoardSession(
                emitDisconnected = true,
                updateNotification = !gpsMonitor.active,
            )
            stop.onSuccess()
            return
        }
        stop.onSuccess()
        if (!gpsMonitor.active) {
            isStoppingService = true
            stopSelf()
        }
    }

    private fun consumePendingGpsStart() {
        if (!pendingGpsStart) return
        pendingGpsStart = false
        startGpsMonitoring()
    }

    private fun exitFromNotification() {
        isStoppingService = true
        stopCurrentBoardSession(emitDisconnected = true)
        stopLocationUpdates()
        closeAppTask()
        stopSelf()
    }

    private fun startGpsMonitoring() {
        isStoppingService = false
        gpsError = null
        startLocationUpdates()
        emitState()
        if (boardConfig == null) {
            startForeground(NOTIFICATION_ID, buildNotification("Monitoring GPS"))
        } else {
            showNotification()
        }
    }

    private fun stopGpsMonitoring() {
        pendingGpsStart = false
        stopLocationUpdates()
        gpsError = null
        emitState()
        if (boardConfig == null) {
            isStoppingService = true
            stopSelf()
        }
    }

    private fun beginSession(start: PendingStart) {
        isStoppingService = false
        stopCurrentBoardSession(emitDisconnected = false, updateNotification = false)
        refreshLiveHistoryLimit()
        VescForegroundService.reloadAlertRules(applicationContext)
        boardConfig = start.boardConfig
        generation += 1
        canId = start.boardConfig.canId
        boardError = null
        telemetry = null
        recentTelemetry.clear()
        packetReassembler.reset()
        diagWriteCount = 0
        connectAttempt = 0
        autoReconnectAttempt = 0
        lastTelemetryAt = 0L
        if (start.boardConfig.recordingEnabled) {
            recorder = VescSessionRecorder(this, start.boardConfig).also { it.start() }
        }
        telemetryStore = if (start.boardConfig.telemetryRecordingEnabled || requestedTelemetryRecordingEnabled) {
            TelemetryRepository.get(applicationContext)
        } else {
            null
        }
        startLocationUpdates()
        setStatus("connecting")
        startForeground(NOTIFICATION_ID, buildNotification("Connecting..."))

        startBleSession(start)
    }

    private fun startBleSession(start: PendingStart) {
        val deviceId = start.boardConfig.deviceId
        if (deviceId.isNullOrBlank()) {
            failStart(start, "INVALID_DEVICE", "Board session requires deviceId")
            return
        }
        pendingConnect = start
        connectAttempt++
        cancelConnectTimeout()
        stopReconnectScan()
        val device = bluetoothAdapter.getRemoteDevice(deviceId)
        gatt = device.connectGatt(this, false, gattCallback, BluetoothDevice.TRANSPORT_LE)
        connectTimeout = Runnable {
            if (pendingConnect == start) {
                failStart(start, "CONNECT_TIMEOUT", "Timed out connecting to board")
            }
        }
        mainHandler.postDelayed(connectTimeout!!, 12_000)
        Log.d(VESC_SESSION_TAG, "connectGatt $deviceId attempt=$connectAttempt")
    }

    private val gattCallback = object : BluetoothGattCallback() {
        override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
            Log.d(VESC_SESSION_TAG, "onConnectionStateChange status=$status newState=$newState")
            recorder?.recordState("gatt:$newState", mapOf("status" to status))
            when (newState) {
                BluetoothProfile.STATE_CONNECTED -> {
                    setStatus("discovering")
                    gatt.requestMtu(517)
                }
                BluetoothProfile.STATE_DISCONNECTED -> {
                    val wasConnecting = pendingConnect
                    val wasIntentional = intentionalDisconnect
                    clearGatt(markIntentional = false)
                    cancelConnectTimeout()
                    stopPolling()
                    if (wasIntentional) {
                        intentionalDisconnect = false
                    } else if (wasConnecting != null) {
                        if (status == 133 && connectAttempt < 2) {
                            Log.w(VESC_SESSION_TAG, "status=133 during connect, retrying once")
                            mainHandler.postDelayed({ startBleSession(wasConnecting) }, 250)
                        } else if (wasConnecting.boardConfig.autoReconnect) {
                            scheduleAutoReconnect(wasConnecting.boardConfig, status, "connect failed")
                        } else {
                            failStart(wasConnecting, "DISCONNECTED", "Device disconnected during connect (status=$status)")
                        }
                    } else if (boardConfig?.autoReconnect == true) {
                        scheduleAutoReconnect(boardConfig!!, status, "board disconnected")
                    } else {
                        setError("Board disconnected")
                        finishRecording("error")
                    }
                }
            }
        }

        override fun onMtuChanged(gatt: BluetoothGatt, mtu: Int, status: Int) {
            Log.d(VESC_SESSION_TAG, "onMtuChanged mtu=$mtu status=$status")
            if (!gatt.discoverServices()) {
                failPendingConnect("DISCOVERY_FAILED", "Could not start service discovery")
            }
        }

        override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
            setStatus("subscribing")
            if (status != BluetoothGatt.GATT_SUCCESS) {
                failPendingConnect("DISCOVERY_FAILED", "Service discovery failed status=$status")
                return
            }
            val service = gatt.getService(NUS_SERVICE_UUID)
            val tx = service?.getCharacteristic(NUS_TX_UUID)
            val rx = service?.getCharacteristic(NUS_RX_UUID)
            if (service == null || tx == null || rx == null) {
                failPendingConnect("NO_CHAR", "NUS service/characteristics not found")
                return
            }
            txChar = tx
            gatt.setCharacteristicNotification(rx, true)
            gatt.setCharacteristicNotification(tx, true)

            val rxCccd = rx.getDescriptor(CCCD_UUID)
            if (rxCccd == null) {
                resolveBleConnect()
                return
            }
            pendingCccdWrites = 1
            if (tx.getDescriptor(CCCD_UUID) != null) pendingCccdWrites = 2
            writeCccd(gatt, rxCccd)

            cccdTimeout = Runnable {
                Log.w(VESC_SESSION_TAG, "CCCD ack timeout, resolving connect")
                resolveBleConnect()
            }
            mainHandler.postDelayed(cccdTimeout!!, 4000)
        }

        override fun onDescriptorWrite(gatt: BluetoothGatt, descriptor: BluetoothGattDescriptor, status: Int) {
            if (descriptor.uuid != CCCD_UUID) return
            pendingCccdWrites--
            if (pendingCccdWrites > 0) {
                val txCccd = gatt.getService(NUS_SERVICE_UUID)
                    ?.getCharacteristic(NUS_TX_UUID)
                    ?.getDescriptor(CCCD_UUID)
                if (txCccd != null) {
                    writeCccd(gatt, txCccd)
                    return
                }
            }
            resolveBleConnect()
        }

        override fun onCharacteristicChanged(
            gatt: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic,
            value: ByteArray,
        ) {
            if (characteristic.uuid == NUS_RX_UUID || characteristic.uuid == NUS_TX_UUID) {
                handleFrameChunk(value)
            }
        }
    }

    private fun resolveBleConnect() {
        cancelConnectTimeout()
        cancelCccdTimeout()
        val start = pendingConnect ?: return
        pendingConnect = null
        boardStatus = "waiting_for_telemetry"
        boardError = null
        emitState()
        showNotification("Discovering board...")
        start.onSuccess()
        mainHandler.postDelayed({ sendPayload(byteArrayOf(COMM_FW_VERSION.toByte())) }, 500)
        mainHandler.postDelayed({ sendPayload(byteArrayOf(COMM_PING_CAN.toByte())) }, 800)
        if (canId != null) startPolling()
        armBoardReadyTimeout(start.boardConfig)
    }

    private fun handleFrameChunk(chunk: ByteArray) {
        recorder?.recordChunk("rx", chunk)
        for (payload in packetReassembler.feed(chunk)) {
            handlePayload(payload)
        }
    }

    private fun handlePayload(payload: ByteArray) {
        if (payload.isEmpty()) return
        when (payload[0].toInt() and 0xff) {
            COMM_PING_CAN -> {
                if (payload.size > 1) {
                    canId = payload[1].toInt() and 0xff
                    emitState()
                    startPolling()
                }
            }
            COMM_CUSTOM_APP_DATA -> {
                val now = System.currentTimeMillis()
                val parsed = parseRefloatGetAllData(
                    payload = payload,
                    avgLatency = updateLatency(now),
                    packetAt = now,
                    location = latestLocation,
                ) ?: return
                markBoardReady()
                telemetry = parsed
                lastTelemetryAt = parsed.lastPacketAt
                armTelemetryStaleWatchdog()
                val firedAlerts = evaluateAlerts(parsed)
                val eventMap = if (firedAlerts.isNotEmpty())
                    parsed.toMap() + mapOf("firedAlerts" to firedAlerts, "generation" to generation)
                else
                    parsed.toMap() + mapOf("generation" to generation)
                appendRecentTelemetry(eventMap, parsed.lastPacketAt)
                showNotification(formatNotificationText(parsed))
                emitEvent("onTelemetry", eventMap)
                recordTelemetry(parsed)
            }
        }
    }

    private fun startPolling() {
        val session = boardConfig ?: return
        val id = canId ?: return
        stopPolling()
        armTelemetryStaleWatchdog()
        pollRunnable = object : Runnable {
            override fun run() {
                lastPollAt = System.currentTimeMillis()
                sendPayload(byteArrayOf(
                    COMM_FORWARD_CAN.toByte(),
                    id.toByte(),
                    COMM_CUSTOM_APP_DATA.toByte(),
                    REFLOAT_MAGIC.toByte(),
                    REFLOAT_GET_ALLDATA.toByte(),
                    2,
                ))
                mainHandler.postDelayed(this, session.pollIntervalMs)
            }
        }
        mainHandler.post(pollRunnable!!)
    }

    private fun stopPolling() {
        pollRunnable?.let { mainHandler.removeCallbacks(it) }
        pollRunnable = null
        telemetryStaleRunnable?.let { mainHandler.removeCallbacks(it) }
        telemetryStaleRunnable = null
    }

    private fun armBoardReadyTimeout(session: SessionConfig) {
        if (!session.autoReconnect) return
        cancelBoardReadyTimeout()
        boardReadyTimeout = Runnable {
            boardReadyTimeout = null
            if (
                (boardStatus == "connecting" || boardStatus == "waiting_for_telemetry") &&
                boardConfig?.autoReconnect == true &&
                telemetry == null
            ) {
                scheduleAutoReconnect(session, null, "board telemetry unavailable")
            }
        }
        mainHandler.postDelayed(boardReadyTimeout!!, BOARD_READY_TIMEOUT_MS)
    }

    private fun cancelBoardReadyTimeout() {
        boardReadyTimeout?.let { mainHandler.removeCallbacks(it) }
        boardReadyTimeout = null
    }

    private fun markBoardReady() {
        cancelBoardReadyTimeout()
        if (boardStatus == "connected") return
        autoReconnectAttempt = 0
        boardStatus = "connected"
        val autoRecording = try {
            kotlinx.coroutines.runBlocking {
                AppDataRepository.get(applicationContext).getSettingsEntity().autoRecording
            }
        } catch (_: Exception) {
            false
        }
        if (autoRecording && telemetryStore == null) {
            telemetryStore = TelemetryRepository.get(applicationContext)
        }
        boardError = null
        telemetryStore?.recordMarker("connected", boardConfig?.deviceId, boardConfig?.deviceName)
        emitState()
    }

    private fun armTelemetryStaleWatchdog() {
        val session = boardConfig ?: return
        if (!session.autoReconnect) return
        telemetryStaleRunnable?.let { mainHandler.removeCallbacks(it) }
        val armedAt = lastTelemetryAt
        telemetryStaleRunnable = Runnable {
            telemetryStaleRunnable = null
            val stillStale = lastTelemetryAt == armedAt ||
                System.currentTimeMillis() - lastTelemetryAt >= TELEMETRY_STALE_MS
            if (boardStatus == "connected" && boardConfig?.autoReconnect == true && stillStale) {
                boardStatus = "stale"
                emitState()
                scheduleAutoReconnect(session, null, "telemetry stale")
            }
        }
        mainHandler.postDelayed(telemetryStaleRunnable!!, TELEMETRY_STALE_MS)
    }

    private fun sendPayload(payload: ByteArray): Boolean {
        val framed = VescPacketCodec.encode(payload)
        return sendFramedChunk(framed)
    }

    private fun sendFramedChunk(bytes: ByteArray): Boolean {
        val g = gatt ?: return false
        val tx = txChar ?: return false
        val writeType = if (diagWriteCount < 3) {
            diagWriteCount++
            BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
        } else {
            BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE
        }
        val ok = g.writeCharacteristic(tx, bytes, writeType) == BluetoothStatusCodes.SUCCESS
        if (ok) recorder?.recordChunk("tx", bytes)
        return ok
    }

    private fun updateLatency(now: Long): Int? {
        if (lastPollAt <= 0) return null
        rttHistory.addLast(max(0, now - lastPollAt))
        while (rttHistory.size > 5) rttHistory.removeFirst()
        return rttHistory.average().roundToInt()
    }

    private fun stopCurrentBoardSession(emitDisconnected: Boolean, updateNotification: Boolean = true) {
        val stoppedConfig = boardConfig
        autoReconnectRunnable?.let { mainHandler.removeCallbacks(it) }
        autoReconnectRunnable = null
        stopReconnectScan()
        cancelCccdTimeout()
        cancelConnectTimeout()
        cancelBoardReadyTimeout()
        stopPolling()
        clearGatt(markIntentional = true)
        finishRecording(if (emitDisconnected) "disconnected" else "stopped")
        telemetryStore?.recordMarker(
            if (emitDisconnected) "disconnected" else "app_stop",
            stoppedConfig?.deviceId,
            stoppedConfig?.deviceName,
        )
        telemetryStore?.flushBlocking()
        telemetryStore = null
        pendingConnect = null
        canId = null
        telemetry = null
        recentTelemetry.clear()
        generation += 1
        boardError = null
        boardStatus = "idle"
        boardConfig = null
        if (updateNotification && !isStoppingService && stoppedConfig != null) showNotification()
        emitState()
    }

    private fun clearGatt(markIntentional: Boolean = true) {
        try {
            if (markIntentional && gatt != null) intentionalDisconnect = true
            gatt?.disconnect()
            gatt?.close()
        } catch (e: Exception) {
            Log.w(VESC_SESSION_TAG, "GATT cleanup failed: ${e.message}")
        }
        gatt = null
        txChar = null
    }

    private fun finishRecording(status: String) {
        recorder?.finish(status = status)
        recorder = null
    }

    private fun failPendingConnect(code: String, message: String) {
        pendingConnect?.let { failStart(it, code, message) }
    }

    private fun failStart(start: PendingStart, code: String, message: String) {
        if (start.boardConfig.autoReconnect) {
            scheduleAutoReconnect(start.boardConfig, null, message)
            start.onError(code, message)
            return
        }
        pendingConnect = null
        cancelConnectTimeout()
        cancelBoardReadyTimeout()
        cancelCccdTimeout()
        stopPolling()
        clearGatt(markIntentional = true)
        setError(message)
        showNotification(message)
        finishRecording("error")
        telemetryStore?.flushBlocking()
        telemetryStore = null
        start.onError(code, message)
    }

    private fun setStatus(next: String) {
        boardStatus = next
        recorder?.recordState(next)
        emitState()
    }

    private fun scheduleAutoReconnect(session: SessionConfig, gattStatus: Int?, reason: String) {
        if (!session.autoReconnect || isStoppingService) return
        pendingConnect = null
        cancelConnectTimeout()
        cancelBoardReadyTimeout()
        cancelCccdTimeout()
        stopPolling()
        clearGatt(markIntentional = false)
        lastTelemetryAt = 0L
        boardStatus = "reconnecting"
        boardError = reason
        autoReconnectAttempt += 1
        recorder?.recordState(
            "reconnecting",
            mapOf("attempt" to autoReconnectAttempt, "status" to gattStatus),
        )
        emitState()
        showNotification("Reconnecting...")

        autoReconnectRunnable?.let { mainHandler.removeCallbacks(it) }
        val delayMs = minOf(250L * autoReconnectAttempt, 2_000L)
        val retry = Runnable {
            autoReconnectRunnable = null
            if (boardConfig?.autoReconnect == true && boardStatus == "reconnecting") {
                startReconnectScan(session)
            }
        }
        autoReconnectRunnable = retry
        mainHandler.postDelayed(retry, delayMs)
    }

    private fun startReconnectScan(session: SessionConfig) {
        val targetId = session.deviceId
        if (targetId.isNullOrBlank()) {
            scheduleAutoReconnect(session, null, "missing reconnect target")
            return
        }
        stopReconnectScan()
        val scanner = bluetoothAdapter.bluetoothLeScanner
        if (scanner == null) {
            scheduleAutoReconnect(session, null, "BLE scanner unavailable")
            return
        }

        val callback = object : ScanCallback() {
            override fun onScanResult(callbackType: Int, result: ScanResult) {
                if (!result.device.address.equals(targetId, ignoreCase = true)) return
                stopReconnectScan()
                if (boardConfig?.autoReconnect == true && boardStatus == "reconnecting") {
                    connectAttempt = 0
                    boardStatus = "connecting"
                    boardError = null
                    emitState()
                    startBleSession(PendingStart(session, onSuccess = {}, onError = { _, _ -> }))
                }
            }

            override fun onScanFailed(errorCode: Int) {
                Log.w(VESC_SESSION_TAG, "Reconnect scan failed errorCode=$errorCode")
                stopReconnectScan()
                scheduleAutoReconnect(session, null, "reconnect scan failed ($errorCode)")
            }
        }

        reconnectScanCallback = callback
        try {
            scanner.startScan(
                null,
                ScanSettings.Builder()
                    .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
                    .setCallbackType(ScanSettings.CALLBACK_TYPE_ALL_MATCHES)
                    .build(),
                callback,
            )
            Log.d(VESC_SESSION_TAG, "Reconnect scan started for $targetId")
        } catch (e: Exception) {
            reconnectScanCallback = null
            Log.w(VESC_SESSION_TAG, "Reconnect scan start failed: ${e.message}")
            scheduleAutoReconnect(session, null, "reconnect scan start failed")
        }
    }

    private fun stopReconnectScan() {
        val callback = reconnectScanCallback ?: return
        reconnectScanCallback = null
        try {
            bluetoothAdapter.bluetoothLeScanner?.stopScan(callback)
        } catch (e: Exception) {
            Log.w(VESC_SESSION_TAG, "Reconnect scan stop failed: ${e.message}")
        }
    }

    private fun setError(message: String) {
        boardStatus = "error"
        boardError = message
        recorder?.recordState("error", mapOf("message" to message))
        telemetryStore?.recordMarker("error", boardConfig?.deviceId, boardConfig?.deviceName, message)
        emitEvent("onError", mapOf("message" to message))
        emitState()
    }

    private fun emitState() {
        emitEvent("onLiveState", liveStateMap())
    }

    private fun emitEvent(name: String, body: Map<String, Any?>) {
        emitEvent?.invoke(name, body)
    }

    private fun startLocationUpdates() {
        gpsError = gpsMonitor.start()
        if (gpsError != null) emitState()
    }

    private fun stopLocationUpdates() {
        gpsMonitor.stop()
    }

    private fun setTelemetryRecordingEnabled(enabled: Boolean) {
        val session = boardConfig
        if (enabled) {
            if (
                session == null ||
                boardStatus == "idle" ||
                boardStatus == "connecting" ||
                boardStatus == "discovering" ||
                boardStatus == "subscribing" ||
                boardStatus == "disconnecting" ||
                boardStatus == "error"
            ) {
                requestedTelemetryRecordingEnabled = false
                emitEvent("onError", mapOf("message" to "Recording requires a connected board"))
                emitState()
                return
            }
            if (telemetryStore == null) {
                telemetryStore = TelemetryRepository.get(applicationContext)
                telemetryStore?.recordMarker("connected", session.deviceId, session.deviceName, null)
            }
            emitState()
            return
        }

        telemetryStore?.recordMarker(
            "app_stop",
            session?.deviceId,
            session?.deviceName,
            "Recording stopped",
        )
        telemetryStore?.flushBlocking()
        telemetryStore = null
        emitState()
    }

    private fun onLocationUpdated(location: Location) {
        val speedMps = if (location.hasSpeed()) location.speed.toDouble() else null
        val bearingDeg = if (location.hasBearing()) location.bearing.toDouble() else null
        val accuracyM = if (location.hasAccuracy()) location.accuracy.toDouble() else null
        val altitudeM = if (location.hasAltitude()) location.altitude else null
        val precise = isRecordableGpsLocation(location, accuracyM)
        val capture = TelemetryLocationCapture(
            latitude = location.latitude,
            longitude = location.longitude,
            speedMps = speedMps,
            bearingDeg = bearingDeg,
            accuracyM = accuracyM,
            altitudeM = altitudeM,
            timestamp = location.time,
            precise = precise,
        )
        val saved = if (precise) {
            telemetryStore?.recordLocation(
                capture,
                deviceId = boardConfig?.deviceId,
                deviceName = boardConfig?.deviceName,
            ) ?: false
        } else {
            false
        }
        val snapshot = LocationSnapshot(
            latitude = location.latitude,
            longitude = location.longitude,
            speedMps = speedMps,
            bearingDeg = bearingDeg,
            accuracyM = accuracyM,
            altitudeM = altitudeM,
            timestamp = location.time,
            precise = precise,
            saved = saved,
        )
        latestLocation = snapshot
        appendRecentLocation(snapshot)
        emitEvent("onLocation", snapshot.toMap())
        if (boardConfig == null) showNotification(formatGpsNotificationText(snapshot))
        if (snapshot.precise) recorder?.recordLocation(snapshot)
    }

    private fun isRecordableGpsLocation(location: Location, accuracyM: Double?): Boolean =
        location.provider == LocationManager.GPS_PROVIDER &&
            accuracyM != null &&
            accuracyM <= MAX_RECORDING_ACCURACY_M

    private fun liveStateMap(includeRecent: Boolean = false): Map<String, Any?> {
        val settings = kotlinx.coroutines.runBlocking {
            AppDataRepository.get(applicationContext).getSettingsEntity()
        }
        setLiveHistoryLimitMinutes(settings.liveHistoryLimit)
        val now = System.currentTimeMillis()
        val phase = if (
            boardStatus == "connected" &&
            lastTelemetryAt > 0L &&
            now - lastTelemetryAt >= TELEMETRY_STALE_MS
        ) "stale" else boardStatus
        val recentTelemetryValue = if (includeRecent) recentTelemetry.toList() else emptyList()
        val recentLocationsValue = if (includeRecent) recentLocations.toList() else emptyList()

        return mapOf(
            "board" to mapOf(
                "phase" to phase,
                "selectedBoardId" to settings.selectedBoardId,
                "connectedBoardId" to boardConfig?.appBoardId,
                "bleId" to boardConfig?.deviceId,
                "name" to boardConfig?.deviceName,
                "connectionSeq" to generation,
                "lastTelemetryAt" to telemetry?.lastPacketAt,
                "recentTelemetry" to recentTelemetryValue,
                "error" to boardError,
                "autoConnect" to settings.autoConnect,
            ),
            "gps" to mapOf(
                "phase" to if (gpsMonitor.active) "active" else "idle",
                "latestFix" to latestLocation?.toMap(),
                "recentLocations" to recentLocationsValue,
                "error" to gpsError,
            ),
            "scan" to mapOf(
                "phase" to "idle",
                "devices" to emptyList<Map<String, Any?>>(),
                "error" to null,
            ),
            "recording" to mapOf(
                "enabled" to (telemetryStore != null),
                "activeBoardId" to if (telemetryStore != null) boardConfig?.appBoardId else null,
                "startedAt" to null,
            ),
        )
    }

    private suspend fun loadAlertRules(context: Context) {
        try {
            val rules = AppDataRepository.get(context).getEnabledAlertRuleEntities()
            alertRules = rules
            alertEngine.resetDebounce()
            Log.d(VESC_SESSION_TAG, "Loaded ${rules.size} alert rule(s)")
        } catch (e: Exception) {
            Log.w(VESC_SESSION_TAG, "Failed to load alert rules: ${e.message}")
            alertRules = emptyList()
        }
    }

    private fun evaluateAlerts(t: RefloatTelemetry): List<Map<String, Any?>> {
        val fired = alertEngine.evaluate(alertRules, t)
        if (fired.isNotEmpty()) {
            val first = fired.first()
            val rangeDepth = (first["rangeDepth"] as? Number)?.toDouble()
            alertFeedback.playTone(first["soundType"] as? String ?: "default", rangeDepth)
            alertFeedback.vibrate(rangeDepth)
        }
        return fired
    }

    private fun appendRecentTelemetry(point: Map<String, Any?>, packetAt: Long) {
        recentTelemetry.addLast(point)
        pruneRecent(recentTelemetry, packetAt)
    }

    private fun appendRecentLocation(location: LocationSnapshot) {
        val point = location.toMap()
        recentLocations.addLast(point)
        pruneRecent(recentLocations, location.timestamp)
    }

    private fun pruneRecent(points: ArrayDeque<Map<String, Any?>>, nowMs: Long) {
        val oldest = nowMs - recentWindowMs()
        while (points.isNotEmpty()) {
            val timestamp = (points.first()["lastPacketAt"] as? Number)?.toLong()
                ?: (points.first()["timestamp"] as? Number)?.toLong()
                ?: break
            if (timestamp >= oldest) break
            points.removeFirst()
        }
    }

    private fun recentWindowMs(): Long = liveHistoryLimitMinutes.toLong() * 60_000L

    private fun setLiveHistoryLimitMinutes(minutes: Int) {
        liveHistoryLimitMinutes = minutes.coerceIn(
            MIN_LIVE_HISTORY_LIMIT_MINUTES,
            MAX_LIVE_HISTORY_LIMIT_MINUTES,
        )
        pruneRecent(recentTelemetry, System.currentTimeMillis())
        pruneRecent(recentLocations, System.currentTimeMillis())
    }

    private fun refreshLiveHistoryLimit() {
        val settings = kotlinx.coroutines.runBlocking {
            AppDataRepository.get(applicationContext).getSettingsEntity()
        }
        setLiveHistoryLimitMinutes(settings.liveHistoryLimit)
    }

    private fun showNotification(text: String = "Monitoring board in background") {
        notificationController.show(text, boardConfig?.deviceName, appInForeground)
    }

    private fun buildNotification(text: String = "Monitoring board in background"): Notification {
        return notificationController.build(text, boardConfig?.deviceName, appInForeground)
    }

    private fun closeAppTask() {
        notificationController.closeAppTask()
    }

    private fun writeCccd(gatt: BluetoothGatt, descriptor: BluetoothGattDescriptor) {
        gatt.writeDescriptor(descriptor, BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE)
    }

    private fun cancelCccdTimeout() {
        cccdTimeout?.let { mainHandler.removeCallbacks(it) }
        cccdTimeout = null
    }

    private fun cancelConnectTimeout() {
        connectTimeout?.let { mainHandler.removeCallbacks(it) }
        connectTimeout = null
    }

    private fun formatNotificationText(values: RefloatTelemetry): String {
        if (values.hasFault) return "Fault ${values.faultCode}"
        return String.format(
            "%.1f km/h | %.0f%% duty | %.1fV",
            abs(values.speed),
            values.dutyCycle * 100.0,
            values.batteryVoltage,
        )
    }

    private fun formatGpsNotificationText(location: LocationSnapshot): String {
        val speedKmh = (location.speedMps ?: 0.0) * 3.6
        return String.format("GPS %.1f km/h", abs(speedKmh))
    }

    private fun recordTelemetry(values: RefloatTelemetry) {
        val session = boardConfig ?: return
        telemetryStore?.recordTelemetry(
            TelemetryCapture(
                capturedAtMs = values.lastPacketAt,
                elapsedRealtimeMs = SystemClock.elapsedRealtime(),
                deviceId = session.deviceId,
                deviceName = session.deviceName,
                canId = canId,
                hasFault = values.hasFault,
                faultCode = values.faultCode,
                pitch = values.pitch,
                roll = values.roll,
                balancePitch = values.balancePitch,
                balanceCurrent = values.balanceCurrent,
                speed = values.speed,
                batteryVoltage = values.batteryVoltage,
                motorCurrent = values.motorCurrent,
                batteryCurrent = values.batteryCurrent,
                erpm = values.erpm,
                dutyCycle = values.dutyCycle,
                state = values.state,
                switchState = values.switchState,
                adc1 = values.adc1,
                adc2 = values.adc2,
                odometer = values.odometer,
                tempMosfet = values.tempMosfet,
                tempMotor = values.tempMotor,
                avgLatency = values.avgLatency,
                location = values.location?.takeIf { it.precise }?.let {
                    TelemetryLocationCapture(
                        latitude = it.latitude,
                        longitude = it.longitude,
                        speedMps = it.speedMps,
                        bearingDeg = it.bearingDeg,
                        accuracyM = it.accuracyM,
                        altitudeM = it.altitudeM,
                        timestamp = it.timestamp,
                        precise = it.precise,
                    )
                },
            )
        )
    }
}
