# VESC PoC — Documentation

**Target device**: Floatwheel ADV2 (VESC-based onewheel)
**Stack**: Expo SDK 54 · React Native 0.81.5 · New Architecture · Android · Bun

## Documents

- [architecture.md](./architecture.md) — hardware topology, BLE profile, protocol stack
- [ble-android.md](./ble-android.md) — BLE connection problems & fixes (custom native module)
- [vesc-protocol.md](./vesc-protocol.md) — VESC packet framing, CAN forwarding, Refloat commands
- [refloat-alldata.md](./refloat-alldata.md) — Refloat `COMMAND_GET_ALLDATA` binary layout

## Status

| Area | State |
|------|-------|
| BLE scan & connect | ✅ |
| BLE notifications (Android 13+) | ✅ fixed — see [ble-android.md](./ble-android.md) |
| CAN forwarding to motor controller | ✅ fixed — see [vesc-protocol.md](./vesc-protocol.md) |
| Refloat GET_ALLDATA telemetry | ✅ |
| iOS | stub only |
