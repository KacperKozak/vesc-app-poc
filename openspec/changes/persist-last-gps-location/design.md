## Context

The map component (`CenterMap.tsx`) initializes with `liveLocations.at(-1)` — the most recent GPS fix from the live buffer. When no fix exists (cold start), a `Camera` `defaultSettings` prop provides a fallback coordinate (`[17.0385, 51.1079]` — Wrocław). However, due to a race in `@rnmapbox/maps`, the underlying MapView renders its internal default at `[0, 0]` (null island — Gulf of Guinea, off the coast of Africa) before the Camera component processes its props. The user sees Africa for 1–3 seconds before the map jumps to the correct location.

Settings are persisted through `AppSettings` — a strongly-typed Room entity on Android (`AppDataRepository.kt` → `app_settings` table) and a JSON dict in UserDefaults on iOS (`VescBleModule.swift`). The JS layer reads/writes through `getSettings()`/`updateSetting()` exposed by the `vesc-ble` native module.

## Goals / Non-Goals

**Goals:**
- Map centers near the user's actual location on cold start, before GPS lock.
- Coordinate persists across app restarts.
- Minimal write overhead — avoid hammering storage on every GPS tick.

**Non-Goals:**
- Persisting zoom level, bearing, or pitch — GPS accuracy determines zoom dynamically.
- Background location tracking — only persist during active GPS sessions.
- Persisting full location history — only the single most recent coordinate.

## Decisions

### 1. Store coordinates in `AppSettings` (not a separate store)

**Choice:** Add `lastGpsLatitude: Double?` and `lastGpsLongitude: Double?` to the existing `AppSettings` entity.

**Why:** The settings infrastructure already handles native persistence, JS bridging, and zustand hydration. No new storage layer needed. Two nullable floats are trivial additions.

**Alternative considered:** Dedicated MMKV/AsyncStorage key. Rejected — adds a new storage dependency and read path for two numbers.

### 2. Write on session end, not during

**Choice:** Persist the latest coordinate only at two lifecycle points:
1. When `stopLocationUpdates()` is called (explicit GPS stop).
2. When AppState transitions to `"background"` while GPS is active.

**Why:** GPS fires every 1–2 seconds. Even a 30-second throttle produces ~120 writes per hour-long ride — unnecessary for a cold-start fallback. Writing at session boundaries yields 1–2 writes total, with zero overhead during active use.

**Where:** JS side — hook into `stopLocationUpdates` cleanup in `bleStore.ts` and add an AppState listener that writes the latest coordinate when backgrounding.

**Alternative considered:** 30-second throttle in JS. Rejected — still too many writes for a value that only matters on next cold start. Session-boundary writes are simpler and sufficient.

### 3. Map reads persisted coordinate via settingsStore

**Choice:** `CenterMap.tsx` reads `lastGpsLatitude`/`lastGpsLongitude` from `useSettingsStore` and uses them as fallback when `gpsFix` is null.

**Why:** Settings are loaded early in the app lifecycle (`settingsStore.load()` on mount). No additional async fetch needed.

**Fallback chain:** `gpsFix` → persisted coordinate → hardcoded Wrocław.

### 4. Android Room migration (v6 → v7)

**Choice:** Add migration adding two nullable REAL columns to `app_settings` table.

**Why:** Room requires explicit migrations for schema changes. Nullable columns with ALTER TABLE ADD COLUMN are safe — no data loss, no default needed.

### 5. iOS — just add to defaults dict

**Choice:** Add new keys to `defaultSettings` dictionary with `NSNull()` defaults.

**Why:** iOS uses flexible `[String: Any]` storage via UserDefaults JSON. New keys are handled automatically by the merge-with-defaults pattern in `loadSettings()`.

### 6. Map fade-in to prevent null-island flash

**Choice:** Render the map container with `opacity: 0` until `settingsStore.loaded` is true. Then animate opacity to 1 using `Animated.timing` (~200ms). This ensures the camera's `defaultSettings` (with persisted or hardcoded fallback) are applied before the map becomes visible.

**Why:** Even with a persisted coordinate, `@rnmapbox/maps` may render a frame at `[0, 0]` before Camera processes props. Hiding the map until settings load guarantees the user never sees null island. Settings load is fast (native read), so the delay is imperceptible.

**Alternative considered:** `onMapIdle` or `onCameraChanged` callback to detect when camera is positioned. Rejected — those events fire asynchronously and unreliably on first render. `settingsStore.loaded` is a simpler, deterministic gate since it guarantees the fallback coordinate is available before the map mounts.

## Risks / Trade-offs

- **Stale coordinate after travel** → Acceptable. Even a day-old coordinate is better than null island. Gets overwritten at end of next GPS session.
- **First-ever launch has no persisted coordinate** → Falls back to hardcoded coordinate as today. No regression.
- **Room migration failure** → Standard ALTER TABLE ADD COLUMN is safe. If it fails, Room throws on DB open — same risk as any schema migration. Fallback strategy not needed for nullable columns.
