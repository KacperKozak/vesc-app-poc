## ADDED Requirements

### Requirement: Persist last known GPS coordinate
The system SHALL persist the most recent GPS coordinate (latitude and longitude) to durable storage whenever GPS is actively providing fixes.

#### Scenario: Coordinate saved on GPS stop
- **WHEN** `stopLocationUpdates()` is called
- **AND** at least one precise GPS fix was received during the session
- **THEN** the system SHALL persist the most recent precise coordinate (latitude, longitude) to `AppSettings`

#### Scenario: Coordinate saved on app background
- **WHEN** the app transitions to background state while GPS is active
- **AND** at least one precise GPS fix was received during the session
- **THEN** the system SHALL persist the most recent precise coordinate to `AppSettings`

#### Scenario: No persist without precise fix
- **WHEN** GPS stops or app backgrounds
- **AND** no precise fix was received during the session
- **THEN** the system SHALL NOT update the persisted coordinate

### Requirement: Map uses persisted coordinate as fallback on cold start
The system SHALL use the persisted GPS coordinate as the map's initial center when no live GPS fix is available.

#### Scenario: App launches with persisted coordinate and no GPS fix yet
- **WHEN** the map initializes and no live GPS fix exists
- **AND** a persisted coordinate exists in `AppSettings`
- **THEN** the map SHALL center on the persisted coordinate

#### Scenario: App launches with no persisted coordinate and no GPS fix
- **WHEN** the map initializes and no live GPS fix exists
- **AND** no persisted coordinate exists in `AppSettings`
- **THEN** the map SHALL center on the hardcoded fallback coordinate

#### Scenario: Live GPS fix takes precedence
- **WHEN** the map has a live GPS fix available
- **THEN** the map SHALL use the live GPS coordinate regardless of any persisted value

### Requirement: Map fades in after camera is positioned
The map SHALL remain invisible until the initial camera position is determined, then fade in smoothly. This prevents the user from seeing the Mapbox default `[0, 0]` (null island).

#### Scenario: Map hidden until settings loaded
- **WHEN** the map component mounts
- **AND** settings have not yet loaded
- **THEN** the map SHALL render with opacity 0

#### Scenario: Map fades in after settings loaded
- **WHEN** settings finish loading (persisted coordinate or defaults available)
- **THEN** the map SHALL animate from opacity 0 to opacity 1 over ~200ms

#### Scenario: No visible flash of null island
- **WHEN** the app launches cold
- **THEN** the user SHALL NOT see the map centered at `[0, 0]` at any point

### Requirement: AppSettings schema includes GPS coordinate fields
The `AppSettings` interface SHALL include `lastGpsLatitude` and `lastGpsLongitude` as nullable number fields.

#### Scenario: Settings loaded with persisted coordinate
- **WHEN** `getSettings()` is called and a coordinate was previously persisted
- **THEN** the returned `AppSettings` SHALL contain numeric `lastGpsLatitude` and `lastGpsLongitude` values

#### Scenario: Settings loaded with no prior coordinate
- **WHEN** `getSettings()` is called and no coordinate was previously persisted
- **THEN** the returned `AppSettings` SHALL contain `null` for both `lastGpsLatitude` and `lastGpsLongitude`

#### Scenario: Coordinate updated via updateSetting
- **WHEN** `updateSetting("lastGpsLatitude", value)` or `updateSetting("lastGpsLongitude", value)` is called
- **THEN** the value SHALL be durably persisted and available on next `getSettings()` call
