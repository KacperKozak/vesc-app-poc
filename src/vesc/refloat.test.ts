import { describe, expect, test } from 'bun:test';
import { parseGetAllData, buildGetAllData, REFLOAT_MAGIC, RefloatCmd } from './refloat';
import { Comm } from './commands';
import { encode } from './packet';
import { Reassembler } from './reassembler';
import { buildRefloatPayload } from './__tests__/helpers';

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
    const v = parseGetAllData(buildRefloatPayload({ pitch: 3.5 }));
    expect(v.hasFault).toBe(false);
    expect(v.pitch).toBeCloseTo(3.5, 1);
  });

  test('roll round-trip', () => {
    expect(parseGetAllData(buildRefloatPayload({ roll: -12.3 })).roll).toBeCloseTo(-12.3, 1);
  });

  test('speed round-trip (positive, km/h)', () => {
    // int16×10 resolution = 0.1 m/s → ~0.36 km/h; use a round m/s value
    expect(parseGetAllData(buildRefloatPayload({ speed: 18.0 })).speed).toBeCloseTo(18.0, 0);
  });

  test('speed round-trip (reverse)', () => {
    expect(parseGetAllData(buildRefloatPayload({ speed: -9.0 })).speed).toBeCloseTo(-9.0, 0);
  });

  test('speed = 0', () => {
    expect(parseGetAllData(buildRefloatPayload({ speed: 0 })).speed).toBe(0);
  });

  test('battery voltage', () => {
    expect(parseGetAllData(buildRefloatPayload({ batteryVoltage: 63.4 })).batteryVoltage)
      .toBeCloseTo(63.4, 1);
  });

  test('erpm', () => {
    expect(parseGetAllData(buildRefloatPayload({ erpm: 2500 })).erpm).toBe(2500);
    expect(parseGetAllData(buildRefloatPayload({ erpm: -800 })).erpm).toBe(-800);
  });

  test('duty cycle', () => {
    expect(parseGetAllData(buildRefloatPayload({ dutyCycle: 0.42 })).dutyCycle).toBeCloseTo(0.42, 2);
    expect(parseGetAllData(buildRefloatPayload({ dutyCycle: -0.3 })).dutyCycle).toBeCloseTo(-0.3, 2);
    expect(parseGetAllData(buildRefloatPayload({ dutyCycle: 0 })).dutyCycle).toBeCloseTo(0, 2);
  });

  test('footpad ADCs', () => {
    const v = parseGetAllData(buildRefloatPayload({ adc1: 0.8, adc2: 0.2 }));
    expect(v.adc1).toBeCloseTo(0.8, 1);
    expect(v.adc2).toBeCloseTo(0.2, 1);
  });

  test('state nibbles', () => {
    // state_compat=1 (RUNNING), sat_compat=3 in upper nibble
    const v = parseGetAllData(buildRefloatPayload({ state: 0x31 }));
    expect(v.state & 0xf).toBe(1);
    expect((v.state >> 4) & 0xf).toBe(3);
  });

  test('motor current and battery current', () => {
    const v = parseGetAllData(buildRefloatPayload({ motorCurrent: 15.5, batteryCurrent: -3.2 }));
    expect(v.motorCurrent).toBeCloseTo(15.5, 1);
    expect(v.batteryCurrent).toBeCloseTo(-3.2, 1);
  });

  test('odometer via float32_auto', () => {
    expect(parseGetAllData(buildRefloatPayload({ odometer: 1000.0 })).odometer).toBeCloseTo(1000, 0);
    expect(parseGetAllData(buildRefloatPayload({ odometer: 0 })).odometer).toBe(0);
    expect(parseGetAllData(buildRefloatPayload({ odometer: 50000 })).odometer).toBeCloseTo(50000, 0);
  });

  test('temperatures', () => {
    const v = parseGetAllData(buildRefloatPayload({ tempMosfet: 42.5, tempMotor: 60.0 }));
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
    const p = buildRefloatPayload(); p[0] = 0x00;
    expect(() => parseGetAllData(p)).toThrow();
  });

  test('throws if magic byte is wrong', () => {
    const p = buildRefloatPayload(); p[1] = 0xff;
    expect(() => parseGetAllData(p)).toThrow();
  });

  test('throws if command byte is wrong', () => {
    const p = buildRefloatPayload(); p[2] = 0x00;
    expect(() => parseGetAllData(p)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Full BLE pipeline — framed + chunked delivery through the reassembler
// ---------------------------------------------------------------------------

describe('BLE pipeline — encode → chunk → reassemble → parse', () => {
  test('full packet in one notification', () => {
    const payload = buildRefloatPayload({ pitch: 5.0, speed: 18.0 });
    const framed  = encode(payload);

    const r = new Reassembler();
    const pkts = r.feed(framed);

    expect(pkts.length).toBe(1);
    const v = parseGetAllData(pkts[0]!);
    expect(v.pitch).toBeCloseTo(5.0, 1);
    expect(v.speed).toBeCloseTo(18.0, 0);
  });

  test('packet split across two chunks', () => {
    const payload = buildRefloatPayload({ pitch: 2.5, batteryVoltage: 58.2 });
    const framed  = encode(payload);
    const split   = Math.floor(framed.length / 2);

    const r = new Reassembler();
    expect(r.feed(framed.slice(0, split)).length).toBe(0); // incomplete

    const pkts = r.feed(framed.slice(split));
    expect(pkts.length).toBe(1);
    expect(parseGetAllData(pkts[0]!).batteryVoltage).toBeCloseTo(58.2, 1);
  });

  test('packet split into 20-byte MTU chunks (classic BLE minimum)', () => {
    const payload = buildRefloatPayload({ pitch: 7.3, speed: 22.5, odometer: 5000 });
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
    const p1 = buildRefloatPayload({ pitch: 1.0, speed:  5.0 });
    const p2 = buildRefloatPayload({ pitch: 2.0, speed: 10.0 });
    const combined = new Uint8Array([...encode(p1), ...encode(p2)]);

    const r = new Reassembler();
    const pkts = r.feed(combined);

    expect(pkts.length).toBe(2);
    expect(parseGetAllData(pkts[0]!).pitch).toBeCloseTo(1.0, 1);
    expect(parseGetAllData(pkts[1]!).pitch).toBeCloseTo(2.0, 1);
  });

  test('reconnect clears stale partial frame', () => {
    const framed = encode(buildRefloatPayload({ speed: 10 }));

    const r = new Reassembler();
    r.feed(framed.slice(0, 5)); // stale partial — no output

    r.reset(); // simulate reconnect

    const pkts = r.feed(framed);
    expect(pkts.length).toBe(1);
  });

  test('garbage bytes before a valid frame are skipped', () => {
    const framed = encode(buildRefloatPayload({ pitch: 3.0 }));
    const withGarbage = new Uint8Array([0xde, 0xad, 0xbe, 0xef, ...framed]);

    const r = new Reassembler();
    const pkts = r.feed(withGarbage);

    expect(pkts.length).toBe(1);
    expect(parseGetAllData(pkts[0]!).pitch).toBeCloseTo(3.0, 1);
  });
});
