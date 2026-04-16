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

function emitNative(event: string, data: Record<string, unknown> = {}): void {
  fakeListeners[event]?.forEach((cb) => cb(data));
}

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

// Imports must come after mock.module so the mock is in place when manager.ts loads
// eslint-disable-next-line import/first
import { vescBle }      from './manager';
// eslint-disable-next-line import/first
import { encode }       from '../vesc/packet';
// eslint-disable-next-line import/first
import { Comm }         from '../vesc/commands';
// eslint-disable-next-line import/first
import { REFLOAT_MAGIC, RefloatCmd } from '../vesc/refloat';
// eslint-disable-next-line import/first
import { buildRefloatPayload } from '../vesc/__tests__/helpers';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function boardNotification(payload: Uint8Array): string {
  const framed = encode(payload);
  let binary = '';
  for (let i = 0; i < framed.length; i++) binary += String.fromCharCode(framed[i]!);
  return btoa(binary);
}

function pingCanResponse(canIds: number[]): Uint8Array {
  return new Uint8Array([Comm.PING_CAN, ...canIds]);
}

function resolveConnect() {
  connectResolve?.();
  connectResolve = null;
}

function rejectConnect(status: number) {
  connectReject?.(new Error(`Device disconnected during connect (status=${status})`));
  connectReject = null;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
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

    const refloat = buildRefloatPayload({ pitch: 4.5, batteryVoltage: 62.1 });
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
      value: boardNotification(buildRefloatPayload({ pitch: 6.5, speed: 18.0 })),
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

    const framed = encode(buildRefloatPayload({ pitch: 3.3 }));
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
        value: boardNotification(buildRefloatPayload({ pitch: i * 1.0 })),
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
