import { requireNativeModule, EventEmitter, type EventSubscription } from 'expo-modules-core';

// ---------------------------------------------------------------------------
// Event payloads
// ---------------------------------------------------------------------------

export interface DeviceFoundEvent {
  id: string;
  name: string;
  rssi: number;
  serviceUUIDs: string[];
}

export interface NotificationEvent {
  /** Base64-encoded raw bytes from the NUS RX characteristic */
  value: string;
}

export interface ConnectedEvent {
  mtu: number;
}

export interface DisconnectedEvent {
  status: number;
}

export interface ErrorEvent {
  message: string;
}

// ---------------------------------------------------------------------------
// Typed emitter
// ---------------------------------------------------------------------------

type VescBleEvents = {
  onDevice:          (event: DeviceFoundEvent)   => void;
  onNotification:    (event: NotificationEvent)  => void;
  onConnected:       (event: ConnectedEvent)     => void;
  onDisconnected:    (event: DisconnectedEvent)  => void;
  onError:           (event: ErrorEvent)         => void;
  onStopRequested:   (event: Record<never, never>) => void;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const native = requireNativeModule<any>('VescBle');
const emitter = new EventEmitter<VescBleEvents>(native);

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

/** Start BLE scan — emits onDevice events for every advertisement received. */
export function scan(): void {
  native.scan();
}

/** Stop ongoing BLE scan. */
export function stopScan(): void {
  native.stopScan();
}

/**
 * Connect to a device by MAC address (Android) / UUID (iOS).
 * Resolves after MTU negotiation, GATT discovery, and CCCD write are complete.
 */
export async function connect(deviceId: string): Promise<void> {
  return native.connect(deviceId);
}

/**
 * Write a single chunk (base64-encoded) to the NUS TX characteristic
 * using write-without-response.
 */
export async function send(base64: string): Promise<void> {
  return native.send(base64);
}

/** Disconnect from the current device and clean up. */
export async function disconnect(): Promise<void> {
  return native.disconnect();
}

/**
 * Start an Android foreground service that keeps the process alive while
 * backgrounded. Shows a persistent notification (required by Android).
 * No-op on other platforms.
 */
export function startForegroundService(): void {
  native.startForegroundService();
}

/** Stop the Android foreground service started by startForegroundService. */
export function stopForegroundService(): void {
  native.stopForegroundService();
}

/**
 * Listen for the user tapping "Disconnect" in the foreground service
 * notification. Fires on Android only.
 */
export function addStopRequestedListener(
  cb: () => void,
): EventSubscription {
  return emitter.addListener('onStopRequested', cb);
}

// ---------------------------------------------------------------------------
// Event listeners
// ---------------------------------------------------------------------------

export function addDeviceListener(
  cb: (event: DeviceFoundEvent) => void,
): EventSubscription {
  return emitter.addListener('onDevice', cb);
}

export function addNotificationListener(
  cb: (event: NotificationEvent) => void,
): EventSubscription {
  return emitter.addListener('onNotification', cb);
}

export function addConnectedListener(
  cb: (event: ConnectedEvent) => void,
): EventSubscription {
  return emitter.addListener('onConnected', cb);
}

export function addDisconnectedListener(
  cb: (event: DisconnectedEvent) => void,
): EventSubscription {
  return emitter.addListener('onDisconnected', cb);
}

export function addErrorListener(
  cb: (event: ErrorEvent) => void,
): EventSubscription {
  return emitter.addListener('onError', cb);
}
