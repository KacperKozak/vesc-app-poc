# VESC PoC

Mobile telemetry proof of concept for VESC-based boards over BLE.

The app scans for nearby VESC BLE devices, starts an Android native session,
connects over the Nordic UART Service, discovers the motor controller on CAN,
and polls Refloat telemetry for live riding, electrical, and thermal values.

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
React Native UI
  -> vesc-ble JS session API
  -> Android foreground service
  -> BLE / Nordic UART Service
  -> VESC BLE bridge
  -> CAN bus
  -> VESC motor controller
```

The Android foreground service owns the long-running board session. React
Native starts/stops the session and renders state, but Android owns connection,
polling, packet parsing needed for notifications, and notification updates.

On real-board connect, the native service:

1. Enables BLE notifications.
2. Sends `COMM_FW_VERSION` to verify the notification path.
3. Sends `COMM_PING_CAN` to discover the motor controller CAN ID.
4. Polls Refloat `COMMAND_GET_ALLDATA` every 500 ms.
5. Reassembles VESC frames from BLE chunks.
6. Parses Refloat telemetry.
7. Updates the persistent Android notification directly.
8. Emits session state and telemetry events to React Native.

This avoids depending on JS timers or the React Native bridge for background
notification updates.

## Session API

The native module exposes a service-like API to JS:

```ts
startSession({
  mode: 'ble',
  deviceId,
  deviceName,
  pollIntervalMs: 500,
  recordingEnabled: false,
})

startSession({
  mode: 'replay',
  deviceName: 'Recorded Session',
  recordingPath,
  pollIntervalMs: 500,
})

stopSession()
getSessionState()
addSessionStateListener((state) => {})
addTelemetryListener((telemetry) => {})
listRecordings()
deleteRecording(path)
exportRecording(path)
```

`mode: 'ble'` connects to real hardware. When `recordingEnabled` is true, the
native service writes low-level session state plus BLE TX/RX chunks as JSON
Lines. `mode: 'replay'` loops a saved recording through the same native packet
reassembler, parser, notification formatter, and JS telemetry events as the
real BLE backend.

## Features

- BLE scan and connect flow
- Android foreground-service-owned BLE session while connected
- CAN forwarding for controller commands
- Refloat `GET_ALLDATA` parsing
- Background notification updates from native telemetry
- Live speed, pitch, roll, voltage, current, duty cycle, temperature, fault, and
  distance telemetry
- JSONL BLE session recording, export, deletion, and replay for debugging
  without hardware

## Project Layout

```text
app/                         Expo Router screens
app/index.tsx                BLE scan screen
app/device/[id].tsx          Telemetry screen
src/ble/usePermissions.ts    Bluetooth permission helper
src/store/bleStore.ts        Zustand state that mirrors native session events
src/vesc/                    VESC packet, command, CRC, and parser code
modules/vesc-ble/            Custom Expo native BLE/session module
modules/vesc-ble/android/.../VescBleModule.kt
                             Expo module bridge: scan and session API
modules/vesc-ble/android/.../VescForegroundService.kt
                             Native BLE/replay session owner
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

Compile only the Android native BLE module:

```bash
cd android
./gradlew :vesc-ble:compileDebugKotlin
```

Build the full Android debug app:

```bash
cd android
./gradlew assembleDebug
```

## Agent Skills

Project-local skills under `.claude/skills/` chain into a plan-to-PR pipeline. Each runs as a slash command.

- `/to-prd` — Turn current conversation context into a PRD issue. Publishes `[PRD][Area] Title` to GitHub Issues with `ready-for-agent` + matching `area:*` label.
- `/to-issues` — Break a PRD or plan into vertical-slice implementation issues. Titles use `[Area] N - Verb phrase`. Auto-fills `## Related` cross-refs across siblings after publish.
- `/to-code` — Implement one issue end-to-end. Reads repo + domain docs, follows existing conventions, runs focused tests, reports. No git ops unless asked.
- `/to-pr` — Same as `/to-code` plus branch/PR lifecycle. Creates feature branch off `dev`, opens PR with linked issue list, appends `Closes #N` + implementation notes on later runs.
- `/grill-me` — Interview-style stress test for a plan or design. Walks the decision tree one question at a time, recommends an answer, resolves dependencies before code is written. Use before `/to-prd` or `/to-issues` when scope is fuzzy.
- `/grill-with-docs` — Same as `/grill-me` but checks each answer against `CONTEXT.md`, ADRs under `docs/adr/`, and the domain glossary. Updates docs inline as decisions crystallise.

Typical flow:

```text
/grill-me          # optional: sharpen idea
/to-prd            # idea -> PRD issue
/to-issues <prd>   # PRD -> N implementation issues
/to-code <id>      # implement one issue locally
/to-pr <id>        # implement + push + open/update feature PR
```

`/to-pr` reuses `/to-code` verify gate — tests run once. PR base is `dev` (`main` reserved for production releases).

## Documentation

- [Architecture](docs/architecture.md)
- [VESC protocol](docs/vescProtocol.md)
- [Refloat GET_ALLDATA layout](docs/refloatAlldata.md)
- [Android BLE notes](docs/bleAndroid.md)
