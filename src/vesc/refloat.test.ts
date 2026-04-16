import { describe, expect, test } from 'bun:test';
import { parseGetAllData, buildGetAllData, REFLOAT_MAGIC, RefloatCmd } from './refloat';
import { Comm } from './commands';
import { encode } from './packet';
import { Reassembler } from './reassembler';

// ---------------------------------------------------------------------------
// Encoding helpers — mirror the C firmware's buffer_append_* functions
// so tests produce the exact same bytes the board would send.
// ---------------------------------------------------------------------------

/** Encode a signed value as big-endian int16, scaled by 10 (firmware convention). */
function i16x10(val: number): [number, number] {
  const raw = Math.round(val * 10);
  const u = raw < 0 ? raw + 65536 : raw;
  return [(u >> 8) & 0xff, u & 0xff];
}

/** Encode a signed value as raw big-endian int16 (no scaling). */
function i16(val: number): [number, number] {
  const u = val < 0 ? val + 65536 : val;
  return [(u >> 8) & 0xff, u & 0xff];
}

/**
 * Encode a float as VESC float32_auto (big-endian).
 * Mirrors buffer_append_float32_auto() in lukash/refloat src/conf/buffer.c.
 */
function float32Auto(value: number): [number, number, number, number] {
  if (value === 0) return [0, 0, 0, 0];
  const neg = value < 0 ? 1 : 0;
  const abs = Math.abs(value);
  // e = floor(log2(abs)) + 1 so that sig = abs / 2^e ∈ [0.5, 1)
  const e = Math.floor(Math.log2(abs)) + 1;
  const sig = abs / Math.pow(2, e);
  const sigI = Math.round((sig - 0.5) * 2.0 * 8388608);
  const eRaw = e + 126;
  // >>>0 converts to unsigned 32-bit (required when sign bit is set)
  const res = ((neg << 31) >>> 0) | ((eRaw << 23) >>> 0) | (sigI >>> 0);
  return [(res >>> 24) & 0xff, (res >>> 16) & 0xff, (res >>> 8) & 0xff, res & 0xff];
}

// ---------------------------------------------------------------------------
// Payload builder — constructs the exact 42-byte wire format for mode-2.
// Fields match cmd_send_all_data() in lukash/refloat src/main.c.
// ---------------------------------------------------------------------------

interface PayloadOpts {
  balanceCurrent?: number; // A
  balancePitch?: number;   // deg
  roll?: number;           // deg
  state?: number;          // raw byte: bits[3:0]=state_compat, bits[7:4]=sat_compat
  switchState?: number;
  adc1?: number;           // 0..1 fraction
  adc2?: number;           // 0..1 fraction
  pitch?: number;          // deg
  batteryVoltage?: number; // V
  erpm?: number;
  speed?: number;          // km/h (board stores as m/s, we convert)
  motorCurrent?: number;   // A
  batteryCurrent?: number; // A
  dutyCycle?: number;      // -1..1
  odometer?: number;       // absolute metres (float32_auto)
  tempMosfet?: number;     // °C
  tempMotor?: number;      // °C
  mode?: number;
}

function buildPayload(opts: PayloadOpts = {}): Uint8Array {
  const {
    balanceCurrent = 0, balancePitch = 0, roll = 0,
    state = 1, switchState = 0, adc1 = 0, adc2 = 0,
    pitch = 0, batteryVoltage = 50, erpm = 0, speed = 0,
    motorCurrent = 0, batteryCurrent = 0, dutyCycle = 0,
    odometer = 0, tempMosfet = 25, tempMotor = 30,
    mode = 2,
  } = opts;

  const b = new Uint8Array(42);

  // Header
  b[0] = 0x24;  // COMM_CUSTOM_APP_DATA
  b[1] = 101;   // REFLOAT_MAGIC
  b[2] = 10;    // GET_ALLDATA
  b[3] = mode;

  // [4-5] balance_current  ×10
  [b[4], b[5]] = i16x10(balanceCurrent);
  // [6-7] balance_pitch  ×10
  [b[6], b[7]] = i16x10(balancePitch);
  // [8-9] roll  ×10
  [b[8], b[9]] = i16x10(roll);

  b[10] = state;
  b[11] = switchState;
  b[12] = Math.round(adc1 * 50);   // adc ×50
  b[13] = Math.round(adc2 * 50);

  // [14-19] setpoints: all (x−128)/5 encoded → store 0 as 128
  b[14] = 128; b[15] = 128; b[16] = 128;
  b[17] = 128; b[18] = 128; b[19] = 128;

  // [20-21] pitch  ×10
  [b[20], b[21]] = i16x10(pitch);

  b[22] = 128; // booster current = 0 (x−128)

  // [23-24] battery_voltage  ×10
  [b[23], b[24]] = i16x10(batteryVoltage);
  // [25-26] erpm (raw int16)
  [b[25], b[26]] = i16(erpm);
  // [27-28] speed: board stores km/h converted to m/s ×10
  [b[27], b[28]] = i16x10(speed / 3.6);
  // [29-30] motor_current  ×10
  [b[29], b[30]] = i16x10(motorCurrent);
  // [31-32] battery_current  ×10
  [b[31], b[32]] = i16x10(batteryCurrent);

  b[33] = Math.round(dutyCycle * 100) + 128; // duty (x−128)/100
  b[34] = 222; // foc_id unavailable

  // [35-38] odometer (float32_auto, mode ≥ 2)
  [b[35], b[36], b[37], b[38]] = float32Auto(odometer);
  b[39] = Math.round(tempMosfet * 2); // temp ×2
  b[40] = Math.round(tempMotor  * 2);
  b[41] = 0; // reserved

  return b;
}

// ---------------------------------------------------------------------------
// buildGetAllData — request builder
// ---------------------------------------------------------------------------

describe('buildGetAllData', () => {
  test('produces correct wire bytes', () => {
    const cmd = buildGetAllData(115, 2);
    expect(cmd).toEqual(new Uint8Array([
      Comm.FORWARD_CAN, 115, Comm.CUSTOM_APP_DATA, REFLOAT_MAGIC, RefloatCmd.GET_ALLDATA, 2,
    ]));
  });

  test('defaults to mode 2', () => {
    const cmd = buildGetAllData(0);
    expect(cmd[5]).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// parseGetAllData — normal mode-2
// ---------------------------------------------------------------------------

describe('parseGetAllData — normal mode-2', () => {
  test('pitch round-trip', () => {
    const v = parseGetAllData(buildPayload({ pitch: 3.5 }));
    expect(v.hasFault).toBe(false);
    expect(v.pitch).toBeCloseTo(3.5, 1);
  });

  test('roll round-trip', () => {
    expect(parseGetAllData(buildPayload({ roll: -12.3 })).roll).toBeCloseTo(-12.3, 1);
  });

  test('speed round-trip (positive, km/h)', () => {
    // int16×10 resolution = 0.1 m/s → ~0.36 km/h; use a round m/s value
    expect(parseGetAllData(buildPayload({ speed: 18.0 })).speed).toBeCloseTo(18.0, 0);
  });

  test('speed round-trip (reverse)', () => {
    expect(parseGetAllData(buildPayload({ speed: -9.0 })).speed).toBeCloseTo(-9.0, 0);
  });

  test('speed = 0', () => {
    expect(parseGetAllData(buildPayload({ speed: 0 })).speed).toBe(0);
  });

  test('battery voltage', () => {
    expect(parseGetAllData(buildPayload({ batteryVoltage: 63.4 })).batteryVoltage)
      .toBeCloseTo(63.4, 1);
  });

  test('erpm', () => {
    expect(parseGetAllData(buildPayload({ erpm: 2500 })).erpm).toBe(2500);
    expect(parseGetAllData(buildPayload({ erpm: -800 })).erpm).toBe(-800);
  });

  test('duty cycle', () => {
    expect(parseGetAllData(buildPayload({ dutyCycle: 0.42 })).dutyCycle).toBeCloseTo(0.42, 2);
    expect(parseGetAllData(buildPayload({ dutyCycle: -0.3 })).dutyCycle).toBeCloseTo(-0.3, 2);
    expect(parseGetAllData(buildPayload({ dutyCycle: 0 })).dutyCycle).toBeCloseTo(0, 2);
  });

  test('footpad ADCs', () => {
    const v = parseGetAllData(buildPayload({ adc1: 0.8, adc2: 0.2 }));
    expect(v.adc1).toBeCloseTo(0.8, 1);
    expect(v.adc2).toBeCloseTo(0.2, 1);
  });

  test('state nibbles', () => {
    // state_compat=1 (RUNNING), sat_compat=3 in upper nibble
    const v = parseGetAllData(buildPayload({ state: 0x31 }));
    expect(v.state & 0xf).toBe(1);
    expect((v.state >> 4) & 0xf).toBe(3);
  });

  test('motor current and battery current', () => {
    const v = parseGetAllData(buildPayload({ motorCurrent: 15.5, batteryCurrent: -3.2 }));
    expect(v.motorCurrent).toBeCloseTo(15.5, 1);
    expect(v.batteryCurrent).toBeCloseTo(-3.2, 1);
  });

  test('odometer via float32_auto', () => {
    expect(parseGetAllData(buildPayload({ odometer: 1000.0 })).odometer).toBeCloseTo(1000, 0);
    expect(parseGetAllData(buildPayload({ odometer: 0 })).odometer).toBe(0);
    expect(parseGetAllData(buildPayload({ odometer: 50000 })).odometer).toBeCloseTo(50000, 0);
  });

  test('temperatures', () => {
    const v = parseGetAllData(buildPayload({ tempMosfet: 42.5, tempMotor: 60.0 }));
    expect(v.tempMosfet).toBeCloseTo(42.5, 1);
    expect(v.tempMotor).toBeCloseTo(60.0, 1);
  });
});

// ---------------------------------------------------------------------------
// parseGetAllData — fault path
// ---------------------------------------------------------------------------

describe('parseGetAllData — fault response', () => {
  function faultPayload(faultCode: number): Uint8Array {
    // [CUSTOM_APP_DATA, MAGIC, GET_ALLDATA, FAULT_MARKER=69, faultCode]
    return new Uint8Array([0x24, 101, 10, 69, faultCode]);
  }

  test('hasFault=true, faultCode extracted', () => {
    const v = parseGetAllData(faultPayload(4)); // ABS_OVER_CURRENT
    expect(v.hasFault).toBe(true);
    expect(v.faultCode).toBe(4);
  });

  test('all telemetry fields zeroed', () => {
    const v = parseGetAllData(faultPayload(1));
    expect(v.pitch).toBe(0);
    expect(v.speed).toBe(0);
    expect(v.batteryVoltage).toBe(0);
    expect(v.erpm).toBe(0);
    expect(v.odometer).toBeNull();
    expect(v.tempMosfet).toBeNull();
  });

  test('faultCode=0 still sets hasFault=true', () => {
    const v = parseGetAllData(faultPayload(0));
    expect(v.hasFault).toBe(true);
    expect(v.faultCode).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// parseGetAllData — header validation
// ---------------------------------------------------------------------------

describe('parseGetAllData — header errors', () => {
  test('throws if CUSTOM_APP_DATA byte is wrong', () => {
    const p = buildPayload(); p[0] = 0x00;
    expect(() => parseGetAllData(p)).toThrow();
  });

  test('throws if magic byte is wrong', () => {
    const p = buildPayload(); p[1] = 0xff;
    expect(() => parseGetAllData(p)).toThrow();
  });

  test('throws if command byte is wrong', () => {
    const p = buildPayload(); p[2] = 0x00;
    expect(() => parseGetAllData(p)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Full BLE pipeline — framed + chunked delivery through the reassembler
// Simulates exactly what the board sends over BLE notifications.
// ---------------------------------------------------------------------------

describe('BLE pipeline — encode → chunk → reassemble → parse', () => {
  test('full packet in one notification', () => {
    const payload = buildPayload({ pitch: 5.0, speed: 18.0 });
    const framed  = encode(payload);

    const r = new Reassembler();
    const pkts = r.feed(framed);

    expect(pkts.length).toBe(1);
    const v = parseGetAllData(pkts[0]!);
    expect(v.pitch).toBeCloseTo(5.0, 1);
    expect(v.speed).toBeCloseTo(18.0, 0);
  });

  test('packet split across two chunks', () => {
    const payload = buildPayload({ pitch: 2.5, batteryVoltage: 58.2 });
    const framed  = encode(payload);
    const split   = Math.floor(framed.length / 2);

    const r = new Reassembler();
    expect(r.feed(framed.slice(0, split)).length).toBe(0); // incomplete

    const pkts = r.feed(framed.slice(split));
    expect(pkts.length).toBe(1);
    expect(parseGetAllData(pkts[0]!).batteryVoltage).toBeCloseTo(58.2, 1);
  });

  test('packet split into 20-byte MTU chunks (classic BLE minimum)', () => {
    const payload = buildPayload({ pitch: 7.3, speed: 22.5, odometer: 5000 });
    const framed  = encode(payload);

    const r = new Reassembler();
    let pkts: Uint8Array[] = [];
    for (let i = 0; i < framed.length; i += 20) {
      pkts = pkts.concat(r.feed(framed.slice(i, i + 20)));
    }

    expect(pkts.length).toBe(1);
    const v = parseGetAllData(pkts[0]!);
    expect(v.pitch).toBeCloseTo(7.3, 1);
    expect(v.speed).toBeCloseTo(22.5, 0);
    expect(v.odometer).toBeCloseTo(5000, 0);
  });

  test('two back-to-back packets in one notification', () => {
    const p1 = buildPayload({ pitch: 1.0, speed:  5.0 });
    const p2 = buildPayload({ pitch: 2.0, speed: 10.0 });
    const combined = new Uint8Array([...encode(p1), ...encode(p2)]);

    const r = new Reassembler();
    const pkts = r.feed(combined);

    expect(pkts.length).toBe(2);
    expect(parseGetAllData(pkts[0]!).pitch).toBeCloseTo(1.0, 1);
    expect(parseGetAllData(pkts[1]!).pitch).toBeCloseTo(2.0, 1);
  });

  test('reconnect clears stale partial frame', () => {
    const framed = encode(buildPayload({ speed: 10 }));

    const r = new Reassembler();
    r.feed(framed.slice(0, 5)); // stale partial — no output

    r.reset(); // simulate reconnect

    const pkts = r.feed(framed);
    expect(pkts.length).toBe(1);
  });

  test('garbage bytes before a valid frame are skipped', () => {
    const framed = encode(buildPayload({ pitch: 3.0 }));
    const withGarbage = new Uint8Array([0xde, 0xad, 0xbe, 0xef, ...framed]);

    const r = new Reassembler();
    const pkts = r.feed(withGarbage);

    expect(pkts.length).toBe(1);
    expect(parseGetAllData(pkts[0]!).pitch).toBeCloseTo(3.0, 1);
  });
});
