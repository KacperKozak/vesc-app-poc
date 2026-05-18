## 1. Native: AppSettings Schema

- [ ] 1.1 Add `lastGpsLatitude` (nullable Double) and `lastGpsLongitude` (nullable Double) to `AppSettingsEntity` in `AppDataRepository.kt`
- [ ] 1.2 Add Room migration v6→v7: ALTER TABLE `app_settings` ADD COLUMN for both nullable REAL columns
- [ ] 1.3 Add `lastGpsLatitude`/`lastGpsLongitude` branches to `updateSetting()` and include them in `toMap()` on Android
- [ ] 1.4 Add `lastGpsLatitude`/`lastGpsLongitude` to iOS `defaultSettings` dict with `NSNull()` defaults in `VescBleModule.swift`

## 2. JS: AppSettings Interface

- [ ] 2.1 Add `lastGpsLatitude: number | null` and `lastGpsLongitude: number | null` to `AppSettings` interface in `modules/vesc-ble/src/index.ts`
- [ ] 2.2 Update `DEFAULTS` in `settingsStore.ts` with `lastGpsLatitude: null, lastGpsLongitude: null`

## 3. JS: GPS Persistence on Session End

- [ ] 3.1 In `bleStore.ts`, persist latest precise coordinate via `updateSetting()` when `stopLocationUpdates()` cleanup runs
- [ ] 3.2 Add AppState listener that persists latest precise coordinate when app backgrounds while GPS is active

## 4. JS: Map Fallback

- [ ] 4.1 In `CenterMap.tsx`, read `lastGpsLatitude`/`lastGpsLongitude` from `useSettingsStore` and use as fallback center when `gpsFix` is null (before hardcoded coordinate)
- [ ] 4.2 Update `MAP_DEFAULTS.fallbackCoordinate` usage to follow chain: live fix → persisted → hardcoded

## 5. JS: Map Fade-In

- [ ] 5.1 In `CenterMap.tsx`, render map container with `opacity: 0` initially
- [ ] 5.2 After `settingsStore.loaded` becomes true, animate opacity from 0 to 1 (~200ms) using `Animated.timing`

## 6. Verification

- [ ] 6.1 Build Android — verify Room migration runs clean
- [ ] 6.2 Test cold start: kill app, relaunch — map should fade in centered near last known location, no null-island flash
