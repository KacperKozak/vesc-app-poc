# Native Profile Stats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a profile screen backed by native all-time and calendar-month riding stats.

**Architecture:** Android native owns telemetry aggregation and exposes three bridge endpoints: total stats, month stats, and available months. Minute buckets store board-only distance, speed, and battery energy so JS can render profile stats without reading SQLite directly. JavaScript owns formatting, loading state, month navigation, and presentation.

**Tech Stack:** Expo Modules Kotlin, Room, JUnit4, TypeScript, React Native, Expo Router, `phosphor-react-native`, `bun`.

---

## File Structure

- Modify `modules/vesc-ble/android/src/main/java/expo/modules/vescble/telemetry/TelemetryEntities.kt`
  - Add `battery_used_wh_milli` and `battery_regen_wh_milli` columns to `TelemetryMinuteBucketEntity`.
- Modify `modules/vesc-ble/android/src/main/java/expo/modules/vescble/telemetry/TelemetryBucketBuilder.kt`
  - Integrate battery Wh from board voltage/current sample intervals inside each minute bucket.
- Modify `modules/vesc-ble/android/src/main/java/expo/modules/vescble/telemetry/TelemetryDao.kt`
  - Merge energy columns when buckets are upserted.
  - Add all-bucket query used by profile aggregation.
- Modify `modules/vesc-ble/android/src/main/java/expo/modules/vescble/telemetry/TelemetryDatabase.kt`
  - Bump Room version to 6.
  - Add migration from 5 to 6 with new non-null energy columns defaulting to 0.
- Create `modules/vesc-ble/android/src/main/java/expo/modules/vescble/telemetry/ProfileStatsRepository.kt`
  - Build sessions from buckets and markers.
  - Aggregate total and monthly profile stats.
  - List distinct session months.
- Modify `modules/vesc-ble/android/src/main/java/expo/modules/vescble/VescBleModule.kt`
  - Expose `getTotalProfileStats`, `getMonthlyProfileStats`, and `getProfileStatMonths`.
- Modify `modules/vesc-ble/ios/VescBleModule.swift`
  - Add empty stub responses for the same profile endpoints to match existing iOS telemetry-history stubs.
- Modify `modules/vesc-ble/src/index.ts`
  - Add bridge types and wrapper functions.
- Create `src/profile/profileStats.ts`
  - Format distances, durations, speeds, energy, and month labels.
  - Provide month navigation helpers.
- Modify `src/app/profile.tsx`
  - Replace placeholder with all-time stats and selected calendar-month stats.
- Modify `modules/vesc-ble/android/src/test/java/expo/modules/vescble/telemetry/TelemetryBucketBuilderTest.kt`
  - Add energy integration tests.
- Create `modules/vesc-ble/android/src/test/java/expo/modules/vescble/telemetry/ProfileStatsRepositoryTest.kt`
  - Cover native aggregation rules.
- Create `src/profile/profileStats.test.ts`
  - Cover JS formatting and month navigation helpers.

---

### Task 1: Add Bucket Energy Storage

**Files:**
- Modify: `modules/vesc-ble/android/src/main/java/expo/modules/vescble/telemetry/TelemetryEntities.kt`
- Modify: `modules/vesc-ble/android/src/main/java/expo/modules/vescble/telemetry/TelemetryBucketBuilder.kt`
- Modify: `modules/vesc-ble/android/src/main/java/expo/modules/vescble/telemetry/TelemetryDao.kt`
- Modify: `modules/vesc-ble/android/src/main/java/expo/modules/vescble/telemetry/TelemetryDatabase.kt`
- Test: `modules/vesc-ble/android/src/test/java/expo/modules/vescble/telemetry/TelemetryBucketBuilderTest.kt`

- [ ] **Step 1: Write failing bucket energy test**

Append this test to `TelemetryBucketBuilderTest`:

```kotlin
@Test
fun integratesBatteryUsedAndRegenInsideMinuteBucket() {
  val bucket = buildTelemetryBuckets(
    telemetryPoints = listOf(
      BucketTelemetryPoint(
        capturedAtMs = 0L,
        deviceId = "board-1",
        deviceName = "ADV2",
        speedCentiKmh = 0,
        batteryVoltageMv = 50_000,
        motorCurrentMa = 0,
        batteryCurrentMa = 10_000,
        dutyPermille = 0,
        hasFault = false,
        odometerCm = 0L,
      ),
      BucketTelemetryPoint(
        capturedAtMs = 3_600L,
        deviceId = "board-1",
        deviceName = "ADV2",
        speedCentiKmh = 0,
        batteryVoltageMv = 50_000,
        motorCurrentMa = 0,
        batteryCurrentMa = -5_000,
        dutyPermille = 0,
        hasFault = false,
        odometerCm = 10L,
      ),
      BucketTelemetryPoint(
        capturedAtMs = 7_200L,
        deviceId = "board-1",
        deviceName = "ADV2",
        speedCentiKmh = 0,
        batteryVoltageMv = 50_000,
        motorCurrentMa = 0,
        batteryCurrentMa = 0,
        dutyPermille = 0,
        hasFault = false,
        odometerCm = 20L,
      ),
    ),
    locationPoints = emptyList(),
  ).single()

  assertEquals(500L, bucket.batteryUsedWhMilli)
  assertEquals(250L, bucket.batteryRegenWhMilli)
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
bun run test:android --tests expo.modules.vescble.telemetry.TelemetryBucketBuilderTest
```

Expected: FAIL because `batteryUsedWhMilli` and `batteryRegenWhMilli` do not exist.

- [ ] **Step 3: Add energy columns to bucket entity**

In `TelemetryEntities.kt`, add fields after `maxBatteryCurrentAbsMa`:

```kotlin
@ColumnInfo(name = "battery_used_wh_milli")
val batteryUsedWhMilli: Long,
@ColumnInfo(name = "battery_regen_wh_milli")
val batteryRegenWhMilli: Long,
```

- [ ] **Step 4: Integrate energy in bucket builder**

In `TelemetryBucketBuilder.kt`, add helper constant near `TELEMETRY_BUCKET_SIZE_MS`:

```kotlin
private const val MAX_ENERGY_SAMPLE_GAP_MS = 5_000L
```

Inside `MutableBucket`, add fields:

```kotlin
private var lastEnergySample: BucketTelemetryPoint? = null
private var batteryUsedWhMilli = 0L
private var batteryRegenWhMilli = 0L
```

At the end of `fun add(point: BucketTelemetryPoint)`, after odometer handling, add:

```kotlin
lastEnergySample?.let { previous ->
  val dtMs = point.capturedAtMs - previous.capturedAtMs
  if (dtMs > 0L && dtMs <= MAX_ENERGY_SAMPLE_GAP_MS) {
    val voltageV = previous.batteryVoltageMv / 1000.0
    val currentA = previous.batteryCurrentMa / 1000.0
    val wh = voltageV * currentA * dtMs / 3_600_000.0
    val whMilli = kotlin.math.round(kotlin.math.abs(wh) * 1000.0).toLong()
    if (wh > 0.0) {
      batteryUsedWhMilli += whMilli
    } else if (wh < 0.0) {
      batteryRegenWhMilli += whMilli
    }
  }
}
lastEnergySample = point
```

In `toEntity()`, pass:

```kotlin
batteryUsedWhMilli = batteryUsedWhMilli,
batteryRegenWhMilli = batteryRegenWhMilli,
```

- [ ] **Step 5: Merge energy in DAO**

In `TelemetryDao.kt`, inside `TelemetryMinuteBucketEntity.merge`, add:

```kotlin
batteryUsedWhMilli = batteryUsedWhMilli + next.batteryUsedWhMilli,
batteryRegenWhMilli = batteryRegenWhMilli + next.batteryRegenWhMilli,
```

- [ ] **Step 6: Add Room migration**

In `TelemetryDatabase.kt`:

Change:

```kotlin
version = 5,
```

to:

```kotlin
version = 6,
```

Add migration after `MIGRATION_4_5`:

```kotlin
private val MIGRATION_5_6 = object : Migration(5, 6) {
  override fun migrate(db: SupportSQLiteDatabase) {
    db.execSQL("ALTER TABLE telemetry_minute_buckets ADD COLUMN battery_used_wh_milli INTEGER NOT NULL DEFAULT 0")
    db.execSQL("ALTER TABLE telemetry_minute_buckets ADD COLUMN battery_regen_wh_milli INTEGER NOT NULL DEFAULT 0")
  }
}
```

Update `.addMigrations(...)`:

```kotlin
.addMigrations(MIGRATION_3_4, MIGRATION_4_5, MIGRATION_5_6)
```

- [ ] **Step 7: Update existing bucket test expectations**

In `combinesBoardAndGpsPointsForSameDeviceMinute`, add:

```kotlin
assertEquals(129L, buckets.batteryUsedWhMilli)
assertEquals(0L, buckets.batteryRegenWhMilli)
```

The expected value uses the first sample power for 5 seconds: `77.5V * 1.2A * 5s / 3600 = 0.129Wh`, rounded to 129 Wh-milli.

- [ ] **Step 8: Run native bucket tests**

Run:

```bash
bun run test:android --tests expo.modules.vescble.telemetry.TelemetryBucketBuilderTest
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add modules/vesc-ble/android/src/main/java/expo/modules/vescble/telemetry/TelemetryEntities.kt \
  modules/vesc-ble/android/src/main/java/expo/modules/vescble/telemetry/TelemetryBucketBuilder.kt \
  modules/vesc-ble/android/src/main/java/expo/modules/vescble/telemetry/TelemetryDao.kt \
  modules/vesc-ble/android/src/main/java/expo/modules/vescble/telemetry/TelemetryDatabase.kt \
  modules/vesc-ble/android/src/test/java/expo/modules/vescble/telemetry/TelemetryBucketBuilderTest.kt
git commit -m "Add battery energy to telemetry buckets"
```

---

### Task 2: Add Native Profile Stats Aggregator

**Files:**
- Modify: `modules/vesc-ble/android/src/main/java/expo/modules/vescble/telemetry/TelemetryDao.kt`
- Create: `modules/vesc-ble/android/src/main/java/expo/modules/vescble/telemetry/ProfileStatsRepository.kt`
- Test: `modules/vesc-ble/android/src/test/java/expo/modules/vescble/telemetry/ProfileStatsRepositoryTest.kt`

- [ ] **Step 1: Add all-bucket DAO query**

In `TelemetryDao.kt`, add:

```kotlin
@Query("SELECT * FROM telemetry_minute_buckets ORDER BY bucket_start_ms ASC")
suspend fun getAllHistoryBucketsAsc(): List<TelemetryMinuteBucketEntity>
```

- [ ] **Step 2: Create failing aggregator tests**

Create `ProfileStatsRepositoryTest.kt`:

```kotlin
package expo.modules.vescble.telemetry

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ProfileStatsRepositoryTest {
  @Test
  fun returnsEmptyStatsForNoBuckets() {
    val result = computeProfileStatsForBuckets(emptyList(), emptyList(), month = null)

    assertNull(result["distanceM"])
    assertEquals(0, result["rideCount"])
    assertEquals(0L, result["rideTimeMs"])
    assertEquals(0.0, result["topSpeedKmh"])
    assertEquals(0.0, result["avgSpeedKmh"])
    assertNull(result["longestRideM"])
    assertNull(result["batteryUsedWh"])
    assertNull(result["batteryRegenWh"])
  }

  @Test
  fun aggregatesTotalStatsFromBoardBucketsOnly() {
    val buckets = listOf(
      bucket(start = 1_715_731_200_000L, end = 1_715_731_260_000L, distanceCm = 12_000L, maxSpeed = 2_500, avgSpeed = 1_000, used = 1_500L, regen = 100L),
      bucket(start = 1_715_731_260_001L, end = 1_715_731_320_000L, distanceCm = 8_000L, maxSpeed = 3_500, avgSpeed = 2_000, used = 2_500L, regen = 300L),
    )

    val result = computeProfileStatsForBuckets(buckets, emptyList(), month = null)

    assertEquals(200.0, result["distanceM"])
    assertEquals(1, result["rideCount"])
    assertEquals(120_000L, result["rideTimeMs"])
    assertEquals(35.0, result["topSpeedKmh"])
    assertEquals(6.0, result["avgSpeedKmh"])
    assertEquals(200.0, result["longestRideM"])
    assertEquals(4.0, result["batteryUsedWh"])
    assertEquals(0.4, result["batteryRegenWh"])
  }

  @Test
  fun splitsSessionsByGapAndFiltersByCalendarMonth() {
    val may = ProfileStatsMonth(year = 2024, month = 5)
    val buckets = listOf(
      bucket(start = 1_715_731_200_000L, end = 1_715_731_260_000L, distanceCm = 10_000L),
      bucket(start = 1_715_732_000_000L, end = 1_715_732_060_000L, distanceCm = 5_000L),
      bucket(start = 1_718_323_200_000L, end = 1_718_323_260_000L, distanceCm = 9_000L),
    )

    val mayStats = computeProfileStatsForBuckets(buckets, emptyList(), month = may)
    val months = computeProfileStatMonthsForBuckets(buckets, emptyList())

    assertEquals(2, mayStats["rideCount"])
    assertEquals(150.0, mayStats["distanceM"])
    assertEquals(listOf(ProfileStatsMonth(2024, 6), ProfileStatsMonth(2024, 5)), months)
  }

  private fun bucket(
    start: Long,
    end: Long,
    distanceCm: Long?,
    maxSpeed: Int = 1_000,
    avgSpeed: Int = 1_000,
    used: Long = 0L,
    regen: Long = 0L,
  ) = TelemetryMinuteBucketEntity(
    bucketStartMs = start - (start % TELEMETRY_BUCKET_SIZE_MS),
    deviceId = "board-1",
    deviceName = "ADV2",
    sampleCount = 1,
    firstSampleAtMs = start,
    lastSampleAtMs = end,
    sumAbsSpeedCentiKmh = avgSpeed.toLong(),
    maxAbsSpeedCentiKmh = maxSpeed,
    minBatteryVoltageMv = 50_000,
    maxMotorCurrentAbsMa = 0,
    maxBatteryCurrentAbsMa = 0,
    batteryUsedWhMilli = used,
    batteryRegenWhMilli = regen,
    maxDutyAbsPermille = 0,
    faultCount = 0,
    firstOdometerCm = 0L,
    lastOdometerCm = distanceCm,
    gpsPointCount = 0,
    preciseGpsPointCount = 0,
    gpsDistanceCm = 999_999L,
    maxGpsSpeedCentiMps = 9_999,
  )
}
```

- [ ] **Step 3: Run aggregator tests to verify failure**

Run:

```bash
bun run test:android --tests expo.modules.vescble.telemetry.ProfileStatsRepositoryTest
```

Expected: FAIL because `ProfileStatsRepository.kt`, `ProfileStatsMonth`, `computeProfileStatsForBuckets`, and `computeProfileStatMonthsForBuckets` do not exist.

- [ ] **Step 4: Implement profile stats repository**

Create `ProfileStatsRepository.kt`:

```kotlin
package expo.modules.vescble.telemetry

import android.content.Context
import java.time.Instant
import java.time.ZoneId

private const val PROFILE_SESSION_GAP_MS = 10 * 60_000L
private val PROFILE_BREAK_BOUNDARIES = setOf("disconnected", "app_stop", "error")

data class ProfileStatsMonth(val year: Int, val month: Int)

class ProfileStatsRepository private constructor(context: Context) {
  private val dao = TelemetryDatabase.get(context).telemetryDao()

  suspend fun getTotalProfileStats(): Map<String, Any?> {
    val buckets = dao.getAllHistoryBucketsAsc()
    val markers = markersForBuckets(buckets)
    return computeProfileStatsForBuckets(buckets, markers, month = null)
  }

  suspend fun getMonthlyProfileStats(options: Map<String, Any?>): Map<String, Any?> {
    val year = (options["year"] as? Number)?.toInt()
      ?: throw IllegalArgumentException("year is required")
    val month = (options["month"] as? Number)?.toInt()
      ?: throw IllegalArgumentException("month is required")
    require(month in 1..12) { "month must be 1-12" }

    val buckets = dao.getAllHistoryBucketsAsc()
    val markers = markersForBuckets(buckets)
    return computeProfileStatsForBuckets(buckets, markers, ProfileStatsMonth(year, month))
  }

  suspend fun getProfileStatMonths(): List<Map<String, Any?>> {
    val buckets = dao.getAllHistoryBucketsAsc()
    val markers = markersForBuckets(buckets)
    return computeProfileStatMonthsForBuckets(buckets, markers).map {
      mapOf("year" to it.year, "month" to it.month)
    }
  }

  private suspend fun markersForBuckets(buckets: List<TelemetryMinuteBucketEntity>): List<TelemetryMarkerEntity> {
    if (buckets.isEmpty()) return emptyList()
    val fromMs = buckets.minOf { it.firstSampleAtMs } - PROFILE_SESSION_GAP_MS
    val toMs = buckets.maxOf { it.lastSampleAtMs } + TELEMETRY_BUCKET_SIZE_MS
    return dao.getMarkers(fromMs, toMs, deviceId = null)
  }

  companion object {
    @Volatile
    private var instance: ProfileStatsRepository? = null

    fun get(context: Context): ProfileStatsRepository {
      return instance ?: synchronized(this) {
        instance ?: ProfileStatsRepository(context.applicationContext).also { instance = it }
      }
    }
  }
}

internal fun computeProfileStatsForBuckets(
  buckets: List<TelemetryMinuteBucketEntity>,
  markers: List<TelemetryMarkerEntity>,
  month: ProfileStatsMonth?,
  zoneId: ZoneId = ZoneId.systemDefault(),
): Map<String, Any?> {
  val sessions = groupProfileSessions(buckets, markers)
  val included = sessions.filter { session ->
    month == null || profileMonth(session.startAtMs, zoneId) == month
  }

  val distanceSessions = included.mapNotNull { it.distanceM }
  val totalDistanceM = distanceSessions.takeIf { it.isNotEmpty() }?.sum()
  val totalDurationMs = included.sumOf { it.endAtMs - it.startAtMs }
  val usedWh = included.sumOf { it.batteryUsedWh }
  val regenWh = included.sumOf { it.batteryRegenWh }
  val weightedSamples = included.sumOf { it.sampleCount }
  val weightedAvg = if (weightedSamples > 0) {
    included.sumOf { it.avgSpeedKmh * it.sampleCount } / weightedSamples
  } else {
    0.0
  }
  val distanceAvg = if (totalDistanceM != null && totalDurationMs > 0L) {
    totalDistanceM / (totalDurationMs / 3_600_000.0)
  } else {
    weightedAvg
  }

  return mapOf(
    "distanceM" to totalDistanceM,
    "rideCount" to included.size,
    "rideTimeMs" to totalDurationMs,
    "topSpeedKmh" to (included.maxOfOrNull { it.topSpeedKmh } ?: 0.0),
    "avgSpeedKmh" to distanceAvg,
    "longestRideM" to distanceSessions.maxOrNull(),
    "batteryUsedWh" to usedWh.takeIf { it > 0.0 },
    "batteryRegenWh" to regenWh.takeIf { it > 0.0 },
  )
}

internal fun computeProfileStatMonthsForBuckets(
  buckets: List<TelemetryMinuteBucketEntity>,
  markers: List<TelemetryMarkerEntity>,
  zoneId: ZoneId = ZoneId.systemDefault(),
): List<ProfileStatsMonth> {
  return groupProfileSessions(buckets, markers)
    .map { profileMonth(it.startAtMs, zoneId) }
    .distinct()
    .sortedWith(compareByDescending<ProfileStatsMonth> { it.year }.thenByDescending { it.month })
}

private data class ProfileSessionAggregate(
  val deviceId: String,
  var startAtMs: Long,
  var endAtMs: Long,
  var sampleCount: Int,
  var distanceM: Double?,
  var topSpeedKmh: Double,
  var avgSpeedKmh: Double,
  var batteryUsedWh: Double,
  var batteryRegenWh: Double,
)

private fun groupProfileSessions(
  buckets: List<TelemetryMinuteBucketEntity>,
  markers: List<TelemetryMarkerEntity>,
): List<ProfileSessionAggregate> {
  val sessions = mutableListOf<ProfileSessionAggregate>()
  var current: ProfileSessionAggregate? = null
  var previous: TelemetryMinuteBucketEntity? = null

  for (bucket in buckets.sortedBy { it.firstSampleAtMs }) {
    if (bucket.sampleCount <= 0) continue
    val boundary = markers.lastOrNull {
      it.occurredAtMs >= bucket.firstSampleAtMs - 5_000L &&
        it.occurredAtMs <= bucket.firstSampleAtMs + 1_000L &&
        (it.deviceId == null || it.deviceId == bucket.deviceId.ifBlank { null })
    }?.type
    val breakSession = current == null ||
      current.deviceId != bucket.deviceId ||
      (previous != null && bucket.firstSampleAtMs - previous.lastSampleAtMs > PROFILE_SESSION_GAP_MS) ||
      (boundary != null && PROFILE_BREAK_BOUNDARIES.contains(boundary))

    if (breakSession) {
      current?.let { sessions.add(it) }
      current = ProfileSessionAggregate(
        deviceId = bucket.deviceId,
        startAtMs = bucket.firstSampleAtMs,
        endAtMs = bucket.lastSampleAtMs,
        sampleCount = 0,
        distanceM = null,
        topSpeedKmh = 0.0,
        avgSpeedKmh = 0.0,
        batteryUsedWh = 0.0,
        batteryRegenWh = 0.0,
      )
    }

    mergeProfileBucket(current, bucket)
    previous = bucket
  }

  current?.let { sessions.add(it) }
  return sessions
}

private fun mergeProfileBucket(session: ProfileSessionAggregate, bucket: TelemetryMinuteBucketEntity) {
  session.startAtMs = minOf(session.startAtMs, bucket.firstSampleAtMs)
  session.endAtMs = maxOf(session.endAtMs, bucket.lastSampleAtMs)
  val previousSamples = session.sampleCount
  val nextSamples = previousSamples + bucket.sampleCount
  val bucketAvg = bucket.sumAbsSpeedCentiKmh.toDouble() / bucket.sampleCount / 100.0
  session.avgSpeedKmh = if (nextSamples > 0) {
    ((session.avgSpeedKmh * previousSamples) + (bucketAvg * bucket.sampleCount)) / nextSamples
  } else {
    0.0
  }
  session.sampleCount = nextSamples
  session.topSpeedKmh = maxOf(session.topSpeedKmh, bucket.maxAbsSpeedCentiKmh / 100.0)
  val distance = distanceDeltaM(bucket)
  if (distance != null) {
    session.distanceM = (session.distanceM ?: 0.0) + distance
  }
  session.batteryUsedWh += bucket.batteryUsedWhMilli / 1000.0
  session.batteryRegenWh += bucket.batteryRegenWhMilli / 1000.0
}

private fun distanceDeltaM(bucket: TelemetryMinuteBucketEntity): Double? {
  val first = bucket.firstOdometerCm ?: return null
  val last = bucket.lastOdometerCm ?: return null
  val delta = last - first
  return delta.takeIf { it >= 0L }?.let { it / 100.0 }
}

private fun profileMonth(atMs: Long, zoneId: ZoneId): ProfileStatsMonth {
  val date = Instant.ofEpochMilli(atMs).atZone(zoneId)
  return ProfileStatsMonth(year = date.year, month = date.monthValue)
}
```

- [ ] **Step 5: Run aggregator tests**

Run:

```bash
bun run test:android --tests expo.modules.vescble.telemetry.ProfileStatsRepositoryTest
```

Expected: PASS.

- [ ] **Step 6: Run full Android unit tests**

Run:

```bash
bun run test:android
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add modules/vesc-ble/android/src/main/java/expo/modules/vescble/telemetry/TelemetryDao.kt \
  modules/vesc-ble/android/src/main/java/expo/modules/vescble/telemetry/ProfileStatsRepository.kt \
  modules/vesc-ble/android/src/test/java/expo/modules/vescble/telemetry/ProfileStatsRepositoryTest.kt
git commit -m "Add native profile stats aggregation"
```

---

### Task 3: Expose Profile Stats Bridge

**Files:**
- Modify: `modules/vesc-ble/android/src/main/java/expo/modules/vescble/VescBleModule.kt`
- Modify: `modules/vesc-ble/ios/VescBleModule.swift`
- Modify: `modules/vesc-ble/src/index.ts`

- [ ] **Step 1: Add Android module endpoints**

In `VescBleModule.kt`, add import if missing:

```kotlin
import expo.modules.vescble.telemetry.ProfileStatsRepository
```

Inside `ModuleDefinition`, after `getTelemetrySummary`, add:

```kotlin
AsyncFunction("getTotalProfileStats") {
  runBlocking { ProfileStatsRepository.get(context.applicationContext).getTotalProfileStats() }
}
AsyncFunction("getMonthlyProfileStats") Coroutine { options: Map<String, Any?> ->
  ProfileStatsRepository.get(context.applicationContext).getMonthlyProfileStats(options)
}
AsyncFunction("getProfileStatMonths") {
  runBlocking { ProfileStatsRepository.get(context.applicationContext).getProfileStatMonths() }
}
```

- [ ] **Step 2: Add iOS stub endpoints**

In `modules/vesc-ble/ios/VescBleModule.swift`, after `getTelemetrySummary`, add:

```swift
AsyncFunction("getTotalProfileStats") { (promise: Promise) in
  promise.resolve(Self.emptyProfileStats())
}

AsyncFunction("getMonthlyProfileStats") { (_: [String: Any], promise: Promise) in
  promise.resolve(Self.emptyProfileStats())
}

AsyncFunction("getProfileStatMonths") { (promise: Promise) in
  promise.resolve([] as [Any])
}
```

Near existing private helpers, add:

```swift
private static func emptyProfileStats() -> [String: Any?] {
  [
    "distanceM": nil,
    "rideCount": 0,
    "rideTimeMs": 0,
    "topSpeedKmh": 0,
    "avgSpeedKmh": 0,
    "longestRideM": nil,
    "batteryUsedWh": nil,
    "batteryRegenWh": nil,
  ]
}
```

- [ ] **Step 3: Add TypeScript bridge types**

In `modules/vesc-ble/src/index.ts`, after `TelemetrySummary`, add:

```ts
export interface ProfileStats {
  distanceM: number | null
  rideCount: number
  rideTimeMs: number
  topSpeedKmh: number
  avgSpeedKmh: number
  longestRideM: number | null
  batteryUsedWh: number | null
  batteryRegenWh: number | null
}

export interface ProfileStatsMonth {
  year: number
  month: number
}
```

In `VescBleNativeModule`, after `getTelemetrySummary(): Promise<TelemetrySummary>`, add:

```ts
getTotalProfileStats(): Promise<ProfileStats>
getMonthlyProfileStats(options: ProfileStatsMonth): Promise<ProfileStats>
getProfileStatMonths(): Promise<ProfileStatsMonth[]>
```

After `getTelemetrySummary()`, add wrappers:

```ts
export async function getTotalProfileStats(): Promise<ProfileStats> {
  return native.getTotalProfileStats()
}

export async function getMonthlyProfileStats(options: ProfileStatsMonth): Promise<ProfileStats> {
  return native.getMonthlyProfileStats(options)
}

export async function getProfileStatMonths(): Promise<ProfileStatsMonth[]> {
  return native.getProfileStatMonths()
}
```

- [ ] **Step 4: Run type check**

Run:

```bash
bun run ts
```

Expected: PASS.

- [ ] **Step 5: Run Android unit tests**

Run:

```bash
bun run test:android
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add modules/vesc-ble/android/src/main/java/expo/modules/vescble/VescBleModule.kt \
  modules/vesc-ble/ios/VescBleModule.swift \
  modules/vesc-ble/src/index.ts
git commit -m "Expose profile stats bridge"
```

---

### Task 4: Add Profile Formatting Helpers

**Files:**
- Create: `src/profile/profileStats.ts`
- Test: `src/profile/profileStats.test.ts`

- [ ] **Step 1: Write failing helper tests**

Create `src/profile/profileStats.test.ts`:

```ts
import { describe, expect, test } from 'bun:test'
import {
  formatDistance,
  formatDuration,
  formatEnergy,
  formatMonthLabel,
  getAdjacentMonths,
  type ProfileMonth,
} from './profileStats'

describe('profile stat formatting', () => {
  test('formats distance in meters and kilometers', () => {
    expect(formatDistance(null)).toBe('—')
    expect(formatDistance(800)).toBe('800 m')
    expect(formatDistance(12_345)).toBe('12.3 km')
  })

  test('formats ride duration compactly', () => {
    expect(formatDuration(0)).toBe('0 min')
    expect(formatDuration(45 * 60_000)).toBe('45 min')
    expect(formatDuration(2 * 60 * 60_000 + 15 * 60_000)).toBe('2h 15m')
  })

  test('formats energy', () => {
    expect(formatEnergy(null)).toBe('—')
    expect(formatEnergy(42.4)).toBe('42 Wh')
    expect(formatEnergy(1234)).toBe('1.2 kWh')
  })

  test('finds adjacent months from newest-first list', () => {
    const months: ProfileMonth[] = [
      { year: 2024, month: 6 },
      { year: 2024, month: 5 },
      { year: 2024, month: 3 },
    ]
    expect(getAdjacentMonths(months, { year: 2024, month: 5 })).toEqual({
      previous: { year: 2024, month: 3 },
      next: { year: 2024, month: 6 },
    })
  })

  test('formats month label', () => {
    expect(formatMonthLabel({ year: 2024, month: 5 }, 'en-US')).toBe('May 2024')
  })
})
```

- [ ] **Step 2: Run helper tests to verify failure**

Run:

```bash
bun test src/profile/profileStats.test.ts
```

Expected: FAIL because `src/profile/profileStats.ts` does not exist.

- [ ] **Step 3: Implement helpers**

Create `src/profile/profileStats.ts`:

```ts
import type { ProfileStatsMonth } from 'vesc-ble'

export type ProfileMonth = ProfileStatsMonth

export function sameMonth(a: ProfileMonth, b: ProfileMonth): boolean {
  return a.year === b.year && a.month === b.month
}

export function currentProfileMonth(date = new Date()): ProfileMonth {
  return { year: date.getFullYear(), month: date.getMonth() + 1 }
}

export function formatMonthLabel(month: ProfileMonth, locale?: string): string {
  return new Date(month.year, month.month - 1, 1).toLocaleDateString(locale, {
    month: 'long',
    year: 'numeric',
  })
}

export function getAdjacentMonths(months: ProfileMonth[], selected: ProfileMonth) {
  const index = months.findIndex((month) => sameMonth(month, selected))
  return {
    previous: index >= 0 ? (months[index + 1] ?? null) : null,
    next: index > 0 ? months[index - 1] : null,
  }
}

export function selectInitialMonth(months: ProfileMonth[], now = new Date()): ProfileMonth {
  const current = currentProfileMonth(now)
  return months.find((month) => sameMonth(month, current)) ?? months[0] ?? current
}

export function formatDistance(valueM: number | null): string {
  if (valueM == null) return '—'
  if (valueM < 1000) return `${Math.round(valueM)} m`
  return `${(valueM / 1000).toFixed(1)} km`
}

export function formatDuration(valueMs: number): string {
  const totalMinutes = Math.round(valueMs / 60_000)
  if (totalMinutes < 60) return `${totalMinutes} min`
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`
}

export function formatSpeed(valueKmh: number): string {
  return `${Math.round(valueKmh)} km/h`
}

export function formatEnergy(valueWh: number | null): string {
  if (valueWh == null) return '—'
  if (valueWh < 1000) return `${Math.round(valueWh)} Wh`
  return `${(valueWh / 1000).toFixed(1)} kWh`
}
```

- [ ] **Step 4: Run helper tests**

Run:

```bash
bun test src/profile/profileStats.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run full Bun tests**

Run:

```bash
bun run test:bun
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/profile/profileStats.ts src/profile/profileStats.test.ts
git commit -m "Add profile stat formatting helpers"
```

---

### Task 5: Build Profile Screen UI

**Files:**
- Modify: `src/app/profile.tsx`

- [ ] **Step 1: Replace placeholder with loaded stats screen**

Replace `src/app/profile.tsx` with:

```tsx
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import {
  BatteryChargingIcon,
  BatteryPlusIcon,
  CaretDownIcon,
  CaretLeftIcon,
  CaretRightIcon,
  ClockIcon,
  GaugeIcon,
  LightningIcon,
  MapTrifoldIcon,
  PathIcon,
  RepeatIcon,
  TrophyIcon,
} from 'phosphor-react-native'
import {
  getMonthlyProfileStats,
  getProfileStatMonths,
  getTotalProfileStats,
  type ProfileStats,
  type ProfileStatsMonth,
} from 'vesc-ble'

import {
  formatDistance,
  formatDuration,
  formatEnergy,
  formatMonthLabel,
  formatSpeed,
  getAdjacentMonths,
  selectInitialMonth,
} from '@/profile/profileStats'
import type { Icon } from 'phosphor-react-native'

const EMPTY_STATS: ProfileStats = {
  distanceM: null,
  rideCount: 0,
  rideTimeMs: 0,
  topSpeedKmh: 0,
  avgSpeedKmh: 0,
  longestRideM: null,
  batteryUsedWh: null,
  batteryRegenWh: null,
}

interface StatItem {
  label: string
  value: string
  icon: Icon
  accent: string
}

export default function ProfileScreen() {
  const [totalStats, setTotalStats] = useState<ProfileStats | null>(null)
  const [monthlyStats, setMonthlyStats] = useState<ProfileStats | null>(null)
  const [months, setMonths] = useState<ProfileStatsMonth[]>([])
  const [selectedMonth, setSelectedMonth] = useState<ProfileStatsMonth | null>(null)
  const [loading, setLoading] = useState(true)
  const [monthLoading, setMonthLoading] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadInitial = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [nextTotal, nextMonths] = await Promise.all([
        getTotalProfileStats(),
        getProfileStatMonths(),
      ])
      const nextSelectedMonth = selectInitialMonth(nextMonths)
      const nextMonthStats = await getMonthlyProfileStats(nextSelectedMonth)
      setTotalStats(nextTotal)
      setMonths(nextMonths)
      setSelectedMonth(nextSelectedMonth)
      setMonthlyStats(nextMonthStats)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setTotalStats((current) => current ?? EMPTY_STATS)
      setMonthlyStats((current) => current ?? EMPTY_STATS)
      setSelectedMonth((current) => current ?? selectInitialMonth([]))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadInitial()
  }, [loadInitial])

  const loadMonth = useCallback(async (month: ProfileStatsMonth) => {
    setSelectedMonth(month)
    setMonthLoading(true)
    setError(null)
    try {
      setMonthlyStats(await getMonthlyProfileStats(month))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setMonthLoading(false)
    }
  }, [])

  const adjacentMonths = useMemo(
    () => (selectedMonth ? getAdjacentMonths(months, selectedMonth) : { previous: null, next: null }),
    [months, selectedMonth],
  )

  const total = totalStats ?? EMPTY_STATS
  const month = monthlyStats ?? EMPTY_STATS
  const monthLabel = selectedMonth ? formatMonthLabel(selectedMonth) : formatMonthLabel(selectInitialMonth([]))

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>All time</Text>
        <View style={styles.heroCard}>
          <View style={styles.heroIcon}>
            <MapTrifoldIcon size={24} color="#38bdf8" weight="duotone" />
          </View>
          <Text style={styles.heroLabel}>Total distance</Text>
          <Text style={styles.heroValue}>{formatDistance(total.distanceM)}</Text>
        </View>

        <StatsGrid items={statsFor(total)} />

        <View style={styles.monthHeader}>
          <Text style={styles.sectionTitle}>Calendar month</Text>
          {monthLoading ? <ActivityIndicator color="#38bdf8" size="small" /> : null}
        </View>

        <View style={styles.monthNav}>
          <Pressable
            style={[styles.navButton, !adjacentMonths.previous && styles.disabled]}
            disabled={!adjacentMonths.previous}
            onPress={() => adjacentMonths.previous && void loadMonth(adjacentMonths.previous)}
          >
            <CaretLeftIcon size={18} color="#f1f5f9" weight="bold" />
          </Pressable>
          <Pressable style={styles.monthPickerButton} onPress={() => setPickerOpen(true)}>
            <Text style={styles.monthPickerText}>{monthLabel}</Text>
            <CaretDownIcon size={16} color="#94a3b8" weight="bold" />
          </Pressable>
          <Pressable
            style={[styles.navButton, !adjacentMonths.next && styles.disabled]}
            disabled={!adjacentMonths.next}
            onPress={() => adjacentMonths.next && void loadMonth(adjacentMonths.next)}
          >
            <CaretRightIcon size={18} color="#f1f5f9" weight="bold" />
          </Pressable>
        </View>

        <StatsGrid items={statsFor(month)} />

        {loading ? (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator color="#38bdf8" />
          </View>
        ) : null}

        {error ? (
          <Pressable style={styles.errorBox} onPress={() => void loadInitial()}>
            <Text style={styles.errorTitle}>Could not load profile stats</Text>
            <Text style={styles.errorText}>{error}</Text>
            <Text style={styles.retryText}>Tap to retry</Text>
          </Pressable>
        ) : null}
      </ScrollView>

      <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setPickerOpen(false)}>
          <View style={styles.monthSheet}>
            {(months.length ? months : [selectInitialMonth([])]).map((item) => (
              <Pressable
                key={`${item.year}-${item.month}`}
                style={styles.monthOption}
                onPress={() => {
                  setPickerOpen(false)
                  void loadMonth(item)
                }}
              >
                <Text style={styles.monthOptionText}>{formatMonthLabel(item)}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  )
}

function statsFor(stats: ProfileStats): StatItem[] {
  return [
    { label: 'Rides', value: String(stats.rideCount), icon: PathIcon, accent: '#38bdf8' },
    { label: 'Ride time', value: formatDuration(stats.rideTimeMs), icon: ClockIcon, accent: '#a78bfa' },
    { label: 'Top speed', value: formatSpeed(stats.topSpeedKmh), icon: GaugeIcon, accent: '#f97316' },
    { label: 'Avg speed', value: formatSpeed(stats.avgSpeedKmh), icon: RepeatIcon, accent: '#14b8a6' },
    { label: 'Longest ride', value: formatDistance(stats.longestRideM), icon: TrophyIcon, accent: '#facc15' },
    { label: 'Battery used', value: formatEnergy(stats.batteryUsedWh), icon: BatteryChargingIcon, accent: '#60a5fa' },
    { label: 'Regen', value: formatEnergy(stats.batteryRegenWh), icon: BatteryPlusIcon, accent: '#4ade80' },
    { label: 'Distance', value: formatDistance(stats.distanceM), icon: LightningIcon, accent: '#22d3ee' },
  ]
}

function StatsGrid({ items }: { items: StatItem[] }) {
  return (
    <View style={styles.grid}>
      {items.map((item) => {
        const IconComponent = item.icon
        return (
          <View key={item.label} style={styles.statCard}>
            <View style={[styles.statIcon, { borderColor: item.accent }]}>
              <IconComponent size={16} color={item.accent} weight="duotone" />
            </View>
            <Text style={styles.statLabel}>{item.label}</Text>
            <Text style={styles.statValue}>{item.value}</Text>
          </View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  content: {
    padding: 16,
    gap: 12,
  },
  sectionTitle: {
    color: '#64748b',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginLeft: 4,
  },
  heroCard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 18,
    gap: 8,
  },
  heroIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  heroLabel: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '600',
  },
  heroValue: {
    color: '#f8fafc',
    fontSize: 36,
    fontWeight: '800',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statCard: {
    width: '48%',
    minHeight: 104,
    backgroundColor: '#1e293b',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 12,
    gap: 7,
  },
  statIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statLabel: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
  },
  statValue: {
    color: '#f1f5f9',
    fontSize: 18,
    fontWeight: '800',
  },
  monthHeader: {
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  navButton: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.35,
  },
  monthPickerButton: {
    flex: 1,
    height: 42,
    borderRadius: 10,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  monthPickerText: {
    color: '#f1f5f9',
    fontSize: 15,
    fontWeight: '700',
  },
  loadingOverlay: {
    padding: 20,
    alignItems: 'center',
  },
  errorBox: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#991b1b',
    backgroundColor: '#7f1d1d',
    padding: 14,
    gap: 4,
  },
  errorTitle: {
    color: '#fee2e2',
    fontSize: 14,
    fontWeight: '800',
  },
  errorText: {
    color: '#fecaca',
    fontSize: 12,
  },
  retryText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.72)',
    justifyContent: 'flex-end',
    padding: 16,
  },
  monthSheet: {
    backgroundColor: '#1e293b',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#334155',
    overflow: 'hidden',
  },
  monthOption: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  monthOptionText: {
    color: '#f1f5f9',
    fontSize: 15,
    fontWeight: '700',
  },
})
```

- [ ] **Step 2: Run TypeScript**

Run:

```bash
bun run ts
```

Expected: PASS.

- [ ] **Step 3: Run Bun tests**

Run:

```bash
bun run test:bun
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/profile.tsx
git commit -m "Build profile stats screen"
```

---

### Task 6: Final Verification

**Files:**
- No planned edits.

- [ ] **Step 1: Run full test suite**

Run:

```bash
bun run test
```

Expected: PASS for Bun tests and Android unit tests.

- [ ] **Step 2: Run TypeScript**

Run:

```bash
bun run ts
```

Expected: PASS.

- [ ] **Step 3: Inspect git status**

Run:

```bash
git status --short
```

Expected: clean working tree after previous task commits.
