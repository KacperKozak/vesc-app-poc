package expo.modules.vescble.telemetry

import org.junit.Assert.assertTrue
import org.junit.Assert.assertNull
import org.junit.Test
import java.lang.reflect.Proxy
import androidx.sqlite.db.SupportSQLiteDatabase

class BoardBatteryConfigTest {
  @Test
  fun rejectsInvalidBatteryConfig() {
    assertNull(encodeBatteryConfig(mapOf("mode" to "manual", "minVoltage" to 84, "maxVoltage" to 60)))
    assertNull(encodeBatteryConfig(mapOf("mode" to "preset", "cellPresetId" to "", "seriesCount" to 20, "parallelCount" to 2)))
  }

  @Test
  fun migrationResetsExistingBoardBatteryConfigOnly() {
    val sql = mutableListOf<String>()
    val db = Proxy.newProxyInstance(
      SupportSQLiteDatabase::class.java.classLoader,
      arrayOf(SupportSQLiteDatabase::class.java),
    ) { _, method, args ->
      if (method.name == "execSQL") {
        sql += args?.firstOrNull() as String
        null
      } else {
        throw UnsupportedOperationException(method.name)
      }
    } as SupportSQLiteDatabase
    TelemetryDatabase.MIGRATION_18_19.migrate(db)

    assertTrue(sql.any { it.contains("CREATE TABLE IF NOT EXISTS boards_new") })
    assertTrue(sql.any { it.contains("battery_config_json TEXT") })
    assertTrue(sql.any { it.contains("SELECT id, name, description, ble_id, is_starred, created_at, NULL") })
    assertTrue(sql.any { it == "DROP TABLE boards" })
    assertTrue(sql.any { it == "ALTER TABLE boards_new RENAME TO boards" })
    assertTrue(sql.any { it == "CREATE INDEX IF NOT EXISTS index_boards_created_at ON boards(created_at)" })
    assertTrue(sql.any { it == "CREATE INDEX IF NOT EXISTS index_boards_is_starred ON boards(is_starred)" })
  }
}
