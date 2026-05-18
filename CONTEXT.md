# VESC App PoC Context

This context defines the shared language for the VESC-based board app. The app centers on live board state, ride recording, ride history, and safety-sensitive Refloat tuning.

## Language

**Board**:
A saved rideable device that can be connected over BLE and may expose one motor controller through CAN.
_Avoid_: Device, controller, scooter

**Live State**:
The current app-visible snapshot of board connection, GPS, scan, recording, and recent telemetry state.
_Avoid_: UI state, cached status

**Telemetry Sample**:
A single decoded board data point captured from the connected board.
_Avoid_: Packet, frame, event

**GPS Fix**:
A single phone location sample used for live map position or ride recording.
_Avoid_: Location event, GPS point

**Ride Recording**:
A persisted ride capture that combines board telemetry with precise GPS fixes while a board is connected.
_Avoid_: Session recording, raw recording

**Ride History**:
The persisted list of past ride recordings and their derived samples, routes, markers, and summaries.
_Avoid_: Playback, logs

**Tune Snapshot**:
A read-only view of the board's current Refloat tuning configuration decoded from the board's schema and binary config.
_Avoid_: Tune cache, settings dump

**Alert Rule**:
A user-defined telemetry threshold that can trigger board-riding feedback during a live connection.
_Avoid_: Alarm, notification

## Relationships

- A **Board** produces **Telemetry Samples** while connected.
- A **GPS Fix** may be associated with live map state, but only precise fixes captured during connected recording contribute to a **Ride Recording**.
- A **Ride Recording** becomes part of **Ride History**.
- A **Tune Snapshot** belongs to the currently connected **Board** and is read-only.
- An **Alert Rule** evaluates against live **Telemetry Samples**.

## Example Dialogue

> **Dev:** "If GPS is active but no board is connected, should that create a Ride Recording?"
> **Domain expert:** "No. Standalone GPS can update the live map, but a Ride Recording requires board telemetry from a connected Board."

## Flagged Ambiguities

- "device" may mean the phone BLE peripheral, the saved app board, or the motor controller; resolved term: use **Board** for the saved rideable device.
- "session" may mean a BLE connection, raw debug capture, or persisted ride; resolved term: use **Ride Recording** for persisted ride capture and avoid using "session" without a qualifier.
