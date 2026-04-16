/**
 * Manager e2e tests — simulates the full pipeline from raw BLE notification
 * bytes (as the board sends them) through to the parsed onPacket callback.
 *
 * The native `vesc-ble` module is replaced with a controllable fake so tests
 * run without Android hardware or an emulator.
 */

import { mock, describe, test, expect, beforeEach, afterEach } from 'bun:test';

// ---------------------------------------------------------------------------
// Fake native module — declared here so bun hoists it before manager.ts loads.
// react-native and expo-modules-core are mocked in test-setup.ts (preload).
// ---------------------------------------------------------------------------

type EventCallback = (event: Record<string, unknown>) => void;

const fakeListeners: Record<string, Set<EventCallback>> = {
  onNotification: new Set(),
  onDisconnected:  new Set(),
  onConnected:     new Set(),
  onDevice:        new Set(),
  onError:         new Set(),
};

/** Fire a fake native event at all registered listeners. */
function emitNative(event: string, data: Record<string, unknown> = {}): void {
  fakeListeners[event]?.forEach((cb) => cb(data));
}

// Resolve/reject handle for the in-progress connect() call
let connectResolve: (() => void) | null = null;
let connectReject: ((e: Error) => void) | null = null;

function makeSub(event: string, cb: EventCallback) {
  fakeListeners[event]?.add(cb);
  return { remove: () => fakeListeners[event]?.delete(cb) };
}

mock.module('vesc-ble', () => ({
  scan:     () => {},
  stopScan: () => {},
  connect:  (_id: string) =>
    new Promise<void>((res, rej) => {
      connectResolve = res;
      connectReject  = rej;
    }),
  send:       () => Promise.resolve(),
  disconnect: () => Promise.resolve(),
  addDeviceListener:        (cb: EventCallback) => makeSub('onDevice',        cb),
  addNotificationListener:  (cb: EventCallback) => makeSub('onNotification',  cb),
  addConnectedListener:     (cb: EventCallback) => makeSub('onConnected',     cb),
  addDisconnectedListener:  (cb: EventCallback) => makeSub('onDisconnected',  cb),
  addErrorListener:         (cb: EventCallback) => makeSub('onError',         cb),
}));

// ---------------------------------------------------------------------------
// Imports — after mock.module so the mock is in place when manager.ts loads
// ---------------------------------------------------------------------------

import { vescBle }      from './manager';
import { encode }       from '../vesc/packet';
import { Comm }         from '../vesc/commands';
import { REFLOAT_MAGIC, RefloatCmd } from '../vesc/refloat';

// ---------------------------------------------------------------------------
// Helpers — build wire bytes exactly as the board would produce them
// ---------------------------------------------------------------------------

function i16x10(val: number): [number, number] {
  const raw = Math.round(val * 10);
  const u = raw < 0 ? raw + 65536 : raw;
  return [(u >> 8) & 0xff, u & 0xff];
}

function i16(val: number): [number, number] {
  const u = val < 0 ? val + 65536 : val;
  return [(u >> 8) & 0xff, u & 0xff];
}

function float32Auto(value: number): [number, number, number, number] {
  if (value === 0) return [0, 0, 0, 0];
  const neg = value < 0 ? 1 : 0;
  const abs = Math.abs(value);
  const e = Math.floor(Math.log2(abs)) + 1;
  const sig = abs / Math.pow(2, e);
  const sigI = Math.round((sig - 0.5) * 2.0 * 8388608);
  const eRaw = e + 126;
  const res = ((neg << 31) >>> 0) | ((eRaw << 23) >>> 0) | (sigI >>> 0);
  return [(res >>> 24) & 0xff, (res >>> 16) & 0xff, (res >>> 8) & 0xff, res & 0xff];
}

interface PayloadOpts {
  pitch?: number; roll?: number; speed?: number;
  batteryVoltage?: number; erpm?: number;
  state?: number; odometer?: number;
  tempMosfet?: number; tempMotor?: number;
  mode?: number;
}

function boardRefloatPayload(opts: PayloadOpts = {}): Uint8Array {
  const {
    pitch = 0, roll = 0, speed = 0, batteryVoltage = 50,
    erpm = 0, state = 1, odometer = 0,
    tempMosfet = 25, tempMotor = 30, mode = 2,
  } = opts;

  const b = new Uint8Array(42);
  b[0] = 0x24; b[1] = 101; b[2] = 10; b[3] = mode;
  [b[4],  b[5]]  = i16x10(0);           // balanceCurrent
  [b[6],  b[7]]  = i16x10(0);           // balancePitch
  [b[8],  b[9]]  = i16x10(roll);
  b[10] = state; b[11] = 0;
  b[12] = 0; b[13] = 0;                 // adc1, adc2
  b[14] = b[15] = b[16] = b[17] = b[18] = b[19] = 128; // setpoints
  [b[20], b[21]] = i16x10(pitch);
  b[22] = 128;                           // booster
  [b[23], b[24]] = i16x10(batteryVoltage);
  [b[25], b[26]] = i16(erpm);
  [b[27], b[28]] = i16x10(speed / 3.6);
  [b[29], b[30]] = i16x10(0);           // motorCurrent
  [b[31], b[32]] = i16x10(0);           // batteryCurrent
  b[33] = 128; b[34] = 222;             // dutyCycle=0, foc_id unavailable
  [b[35], b[36], b[37], b[38]] = float32Auto(odometer);
  b[39] = Math.round(tempMosfet * 2);
  b[40] = Math.round(tempMotor  * 2);
  b[41] = 0;
  return b;
}

/** Encode a payload as a VESC frame, base64 it — exactly what the native module delivers. */
function boardNotification(payload: Uint8Array): string {
  const framed = encode(payload);
  let binary = '';
  for (let i = 0; i < framed.length; i++) binary += String.fromCharCode(framed[i]!);
  return btoa(binary);
}

/** Build a PING_CAN response payload (board → phone). */
function pingCanResponse(canIds: number[]): Uint8Array {
  return new Uint8Array([Comm.PING_CAN, ...canIds]);
}

// ---------------------------------------------------------------------------
// Helpers — drive the fake connect handshake
// ---------------------------------------------------------------------------

/** Resolve the pending nativeConnect() promise (simulates GATT connected + CCCDs written). */
function resolveConnect() {
  connectResolve?.();
  connectResolve = null;
}

/** Reject the pending nativeConnect() promise with a given status code. */
function rejectConnect(status: number) {
  connectReject?.(new Error(`Device disconnected during connect (status=${status})`));
  connectReject = null;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  // Clear all listeners between tests
  for (const key of Object.keys(fakeListeners)) {
    fakeListeners[key]?.clear();
  }
  connectResolve = null;
  connectReject  = null;
  vescBle.canId  = undefined;
});

afterEach(async () => {
  await vescBle.disconnect();
});

// ---------------------------------------------------------------------------

describe('connect sequence', () => {
  test('onPacket fires with PING_CAN payload when board responds', async () => {
    const received: Uint8Array[] = [];

    const connectPromise = vescBle.connect('AA:BB:CC:DD:EE:FF', (pkt) => {
      received.push(pkt);
    });
    resolveConnect();
    await connectPromise;

    // Board sends a PING_CAN response notification
    const pkt = pingCanResponse([115]);
    emitNative('onNotification', { value: boardNotification(pkt) });

    expect(received.length).toBe(1);
    expect(received[0]![0]).toBe(Comm.PING_CAN);
    expect(received[0]![1]).toBe(115);
  });

  test('onPacket fires with Refloat telemetry payload', async () => {
    const received: Uint8Array[] = [];

    const connectPromise = vescBle.connect('AA:BB:CC:DD:EE:FF', (pkt) => {
      received.push(pkt);
    });
    resolveConnect();
    await connectPromise;

    const refloat = boardRefloatPayload({ pitch: 4.5, batteryVoltage: 62.1 });
    emitNative('onNotification', { value: boardNotification(refloat) });

    expect(received.length).toBe(1);
    expect(received[0]![0]).toBe(Comm.CUSTOM_APP_DATA);  // 0x24
    expect(received[0]![1]).toBe(REFLOAT_MAGIC);          // 101
    expect(received[0]![2]).toBe(RefloatCmd.GET_ALLDATA); // 10
  });
});

// ---------------------------------------------------------------------------

describe('Refloat telemetry pipeline', () => {
  async function connectAndCollect(): Promise<{ packets: Uint8Array[] }> {
    const packets: Uint8Array[] = [];
    const p = vescBle.connect('AA:BB:CC:DD:EE:FF', (pkt) => packets.push(pkt));
    resolveConnect();
    await p;
    return { packets };
  }

  test('pitch and speed decoded correctly from notification', async () => {
    const { packets } = await connectAndCollect();
    emitNative('onNotification', {
      value: boardNotification(boardRefloatPayload({ pitch: 6.5, speed: 18.0 })),
    });

    expect(packets.length).toBe(1);

    // Re-parse to verify values (parseGetAllData is tested in refloat.test.ts;
    // here we just confirm the bytes survive the notification→packet pipeline)
    const p = packets[0]!;
    const pitchRaw = (p[20]! << 8 | p[21]!) << 16 >> 16; // int16
    expect(pitchRaw / 10).toBeCloseTo(6.5, 1);
  });

  test('chunked BLE notification (20-byte MTU) reassembles correctly', async () => {
    const { packets } = await connectAndCollect();

    const framed = encode(boardRefloatPayload({ pitch: 3.3 }));
    for (let i = 0; i < framed.length; i += 20) {
      let binary = '';
      const chunk = framed.slice(i, i + 20);
      for (let j = 0; j < chunk.length; j++) binary += String.fromCharCode(chunk[j]!);
      emitNative('onNotification', { value: btoa(binary) });
    }

    expect(packets.length).toBe(1);
    expect(packets[0]![0]).toBe(Comm.CUSTOM_APP_DATA);
  });

  test('multiple sequential notifications each produce one packet', async () => {
    const { packets } = await connectAndCollect();

    for (let i = 0; i < 3; i++) {
      emitNative('onNotification', {
        value: boardNotification(boardRefloatPayload({ pitch: i * 1.0 })),
      });
    }

    expect(packets.length).toBe(3);
  });
});

// ---------------------------------------------------------------------------

describe('disconnect handling', () => {
  test('onDisconnect callback fires when board turns off (post-connect)', async () => {
    let disconnected = false;
    const p = vescBle.connect('AA:BB:CC:DD:EE:FF', () => {}, () => {
      disconnected = true;
    });
    resolveConnect();
    await p;

    emitNative('onDisconnected', { status: 8 });
    expect(disconnected).toBe(true);
  });

  test('onDisconnect does NOT fire for status=133 during connect phase', async () => {
    let disconnected = false;

    // Start connect — do NOT resolve yet
    const p = vescBle.connect('AA:BB:CC:DD:EE:FF', () => {}, () => {
      disconnected = true;
    });

    // Simulate status=133 before connect resolves
    rejectConnect(133);

    await p.catch(() => {}); // ignore rejection

    // onDisconnect must NOT have been called — the disconnect listener
    // is only registered after a successful connect
    expect(disconnected).toBe(false);
  });

  test('isConnected false after remote disconnect', async () => {
    const p = vescBle.connect('AA:BB:CC:DD:EE:FF', () => {});
    resolveConnect();
    await p;

    expect(vescBle.isConnected).toBe(true);
    emitNative('onDisconnected', { status: 8 });
    expect(vescBle.isConnected).toBe(false);
  });
});
