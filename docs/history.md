# Ride History

Ride History is the persisted view of board riding after live operation ends or moves out of the current live window. It combines board telemetry, telemetry-associated precise GPS fixes, history markers, and derived summaries.

## Ownership

Native owns durable history truth.

- JS asks native for summaries and ranges.
- Native persists board telemetry with telemetry-associated GPS fixes, minute buckets, and markers in SQLite.
- JS renders selected history state and sends user intents such as selecting or deleting a ride.

Main files:

- Native repository: `modules/vesc-ble/android/src/main/java/expo/modules/vescble/telemetry/TelemetryRepository.kt`
- Native DAO: `modules/vesc-ble/android/src/main/java/expo/modules/vescble/telemetry/TelemetryDao.kt`
- Native tables: `modules/vesc-ble/android/src/main/java/expo/modules/vescble/telemetry/TelemetryEntities.kt`
- JS store: `src/store/historyStore.ts`
- Session grouping: `src/history/sessions.ts`
- Map rendering: `src/screens/center/CenterMap.tsx`

## Persisted Data

`telemetry_frames` stores board telemetry samples and any precise GPS fix attached to those telemetry samples. Frames are delta encoded with periodic keyframes. Queries reconstruct full samples from nearest keyframe before requested range.

`telemetry_minute_buckets` stores minute-level summaries used by history lists. Buckets include sample counts, GPS counts, distance, speed, fault count, and battery/current summaries.

`telemetry_markers` stores ride boundaries and abnormal events. Current marker types include:

- `connected`: board became ready or recording was enabled.
- `app_stop`: recording or board session stopped intentionally.
- `disconnected`: board session stopped after disconnect.
- `gap`: long persistence gap, currently more than `90_000ms`.
- `error`: explicit board/session error.

## Recording Rules

A Ride Recording should represent board telemetry captured while a Board is connected, plus precise GPS fixes captured alongside that telemetry.

Standalone GPS may update live map state but should not create a Ride Recording.

## History Loading

`historyStore.loadInitial()` loads:

- summary from `getTelemetrySummary()`
- latest minute buckets from `getTelemetryHistory({ limit: 100 })`
- grouped sessions from `groupHistorySessions(blocks)`

`historyStore.selectSession(session)` loads:

- board samples from `getHistoryRange({ fromMs, toMs, deviceId, limit: 10000 })`
- GPS samples derived from telemetry samples in the same range
- markers from same range

Selected history is rendered from `sessionSamples`, `sessionGpsSamples`, and `sessionMarkers`.

## Session Grouping

`groupHistorySessions(...)` groups minute buckets oldest-first.

Session breaks happen when:

- device id changes
- gap between adjacent buckets is more than `10 minutes`
- bucket `boundaryBefore` is one of `disconnected`, `app_stop`, or `error`

Important limitation: grouping only sees `boundaryBefore` attached near bucket start. A marker inside a minute bucket does not necessarily split a session.

## Map Rendering

History route comes from `sessionGpsSamples`.

- Route line: all selected GPS samples as one `LineString`.
- Start pin: first GPS sample, green.
- End pin: last GPS sample, error color.
- Seek pin: current playback sample, yellow GPS marker color.
- Marker pins: each `sessionMarker` is mapped to nearest GPS sample by timestamp.

Current marker rendering paints every non-error marker yellow. This means `connected` and `app_stop` can look like important trail points even when they are only lifecycle markers.

## Known Edge Case

Previously observed Android history entry from `2026-05-06` before standalone history GPS was removed:

- Selected range: `13:31:17` to `13:35:27`.
- GPS rows existed only from `13:31:17` to `13:33:36`.
- standalone history GPS had `276` precise rows and no duplicate `(location_timestamp_ms, latitude_e7, longitude_e7)` rows.
- Markers in range were `gap`, `connected`, `app_stop`, `connected`, `connected`.

User-visible symptom: apparent double trail and four yellow points.

Cause: yellow points were marker pins, not duplicate GPS points. Quick stop/start or reconnect markers stayed in one selected session, and `CenterMap` painted non-error markers yellow. Standalone history GPS has since been removed from Ride History; routes now come from telemetry-associated GPS only.

## Investigation Checklist

When history map looks wrong:

1. Pull `telemetry.db`, `telemetry.db-wal`, and `telemetry.db-shm` from device.
2. Check selected range in `telemetry_minute_buckets`.
3. Check `telemetry_markers` inside selected range.
4. Compare telemetry sample range against telemetry-associated GPS range.
5. Verify whether pins are route endpoints, seek pin, or marker pins.

## Improvement Candidates

- Render only actionable marker types (`gap`, `error`) on history map.
- Style lifecycle markers (`connected`, `app_stop`) differently or hide them by default.
- Split history sessions using markers inside buckets, not only `boundaryBefore`.
