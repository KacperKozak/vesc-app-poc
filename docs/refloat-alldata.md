# Refloat COMMAND_GET_ALLDATA

→ [index](./index.md) | [vesc-protocol](./vesc-protocol.md)

Source: [`lukash/refloat`](https://github.com/lukash/refloat) `src/main.c` → `cmd_send_all_data()`

## Request

```
[FORWARD_CAN=0x22] [canId] [CUSTOM_APP_DATA=0x24] [magic=101] [GET_ALLDATA=10] [mode]
```

Modes: `1` = RT data only, `2` += odometer + temps, `3` += energy counters, `4` += charging.
We use mode 2.

## Response payload layout (mode = 2, normal — no fault)

Outer VESC frame is stripped by the time the payload reaches the JS handler.

| Offset | Size | Encoding | Field |
|--------|------|----------|-------|
| 0 | 1 | — | `0x24` (CUSTOM_APP_DATA cmd byte) |
| 1 | 1 | — | `101` (Refloat magic) |
| 2 | 1 | — | `10` (GET_ALLDATA) |
| 3 | 1 | uint8 | mode (=2), **or `69`** if fault active |
| 4–5 | 2 | int16 ÷ 10 | balance_current (A) |
| 6–7 | 2 | int16 ÷ 10 | balance_pitch (°) |
| 8–9 | 2 | int16 ÷ 10 | roll (°) |
| 10 | 1 | uint8 | state: `bits[3:0]` = state_compat, `bits[7:4]` = sat_compat |
| 11 | 1 | uint8 | switch state (footpad + handtest + beep flags) |
| 12 | 1 | uint8 ÷ 50 | adc1 (~0..1) |
| 13 | 1 | uint8 ÷ 50 | adc2 (~0..1) |
| 14 | 1 | (x−128) ÷ 5 | setpoint (°) |
| 15 | 1 | (x−128) ÷ 5 | atr.setpoint |
| 16 | 1 | (x−128) ÷ 5 | brake_tilt.setpoint |
| 17 | 1 | (x−128) ÷ 5 | torque_tilt.setpoint |
| 18 | 1 | (x−128) ÷ 5 | turn_tilt.setpoint |
| 19 | 1 | (x−128) ÷ 5 | remote.setpoint |
| 20–21 | 2 | int16 ÷ 10 | pitch (°) |
| 22 | 1 | (x−128) | booster current (A) |
| 23–24 | 2 | int16 ÷ 10 | battery_voltage (V) |
| 25–26 | 2 | int16 | erpm |
| 27–28 | 2 | int16 ÷ 10 | speed in m/s → multiply × 3.6 for km/h |
| 29–30 | 2 | int16 ÷ 10 | motor_current (A) |
| 31–32 | 2 | int16 ÷ 10 | battery_current (A) |
| 33 | 1 | (x−128) ÷ 100 | duty_cycle (−1..1) |
| 34 | 1 | uint8 ÷ 3 | foc_id (A); `222` = unavailable |
| 35–38 | 4 | float32_auto | odometer absolute (metres) — **mode ≥ 2** |
| 39 | 1 | uint8 ÷ 2 | mosfet_temp (°C) — mode ≥ 2 |
| 40 | 1 | uint8 ÷ 2 | motor_temp (°C) — mode ≥ 2 |
| 41 | 1 | — | reserved (0) — mode ≥ 2 |

## Fault response

When `payload[3] == 69` (FAULT_MODE_MARKER):
```
[0x24] [101] [10] [69] [mc_fault_code]
```
All telemetry fields are zero/null. `hasFault = true`, `faultCode` = the fault byte.

## float32_auto encoding

VESC custom 4-byte float (not IEEE 754). Decoding:

```typescript
function getFloat32Auto(view: DataView, offset: number): number {
  const res  = view.getUint32(offset, false);
  const eRaw = (res >>> 23) & 0xFF;
  const sigI = res & 0x7FFFFF;
  const neg  = (res >>> 31) !== 0;
  if (eRaw === 0 && sigI === 0) return 0.0;
  const sig = sigI / (8388608.0 * 2.0) + 0.5;
  return (neg ? -1 : 1) * sig * 2 ** (eRaw - 126);
}
```

Source: `buffer_get_float32_auto()` in `lukash/refloat/src/conf/buffer.c`.

## state_compat values (lower nibble of byte 10)

| Value | Name |
|-------|------|
| 0 | STARTUP |
| 1 | RUNNING |
| 2 | TILTBACK |
| 3 | WHEELSLIP |
| 4 | UPSIDEDOWN |
| 5 | FLYWHEEL |
| 6 | FAULT_PITCH |
| 7 | FAULT_ROLL |
| 8 | FAULT_SW_HALF |
| 9 | FAULT_SW_FULL |
| 11 | FAULT_STARTUP |
| 12 | FAULT_REVERSE |
| 13 | FAULT_QUICKSTOP |
| 14 | CHARGING |
| 15 | DISABLED |
