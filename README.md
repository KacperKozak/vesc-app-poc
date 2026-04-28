# VESC PoC

Mobile telemetry proof of concept for VESC-based boards over BLE.

The app scans for nearby VESC BLE devices, connects over the Nordic UART
Service, discovers the motor controller on CAN, and polls Refloat telemetry for
live riding, electrical, and thermal values.

## Supported Hardware

- Floatwheel ADV2
- Thor 301 controller

Current development targets Android. iOS has a native module stub only.

## Stack

- Expo SDK 54
- React Native 0.81
- Expo Router
- TypeScript
- Zustand
- NativeWind
- Bun
- Custom Expo native module for BLE: `modules/vesc-ble`

## How It Works

```text
Phone
  -> BLE / Nordic UART Service
  -> VESC BLE bridge
  -> CAN bus
  -> VESC motor controller
```

On connect, the app:

1. Enables BLE notifications.
2. Sends `COMM_FW_VERSION` to verify the notification path.
3. Sends `COMM_PING_CAN` to discover the motor controller CAN ID.
4. Polls Refloat `COMMAND_GET_ALLDATA` every 500 ms.
5. Parses responses into telemetry shown on the device screen.

## Features

- BLE scan and connect flow
- Android foreground service while connected
- CAN forwarding for controller commands
- Refloat `GET_ALLDATA` parsing
- Live speed, pitch, roll, voltage, current, duty cycle, temperature, fault, and
  distance telemetry
- Virtual board simulator for development without hardware

## Project Layout

```text
app/                         Expo Router screens
app/index.tsx                BLE scan screen
app/device/[id].tsx          Telemetry screen
src/ble/manager.ts           BLE scan/connect/send/disconnect wrapper
src/store/bleStore.ts        Zustand BLE state and polling
src/vesc/                    VESC packet, command, CRC, and parser code
src/simulator/virtualBoard.ts Virtual telemetry source
modules/vesc-ble/            Custom Expo native BLE module
docs/                        Protocol and architecture notes
```

## Development

Install dependencies:

```bash
bun install
```

Start Expo:

```bash
bun run start
```

Run on Android:

```bash
bun run android
```

Run tests:

```bash
bun test
```

Type-check:

```bash
bun run ts
```

## Documentation

- [Architecture](docs/architecture.md)
- [VESC protocol](docs/vesc-protocol.md)
- [Refloat GET_ALLDATA layout](docs/refloat-alldata.md)
- [Android BLE notes](docs/ble-android.md)
