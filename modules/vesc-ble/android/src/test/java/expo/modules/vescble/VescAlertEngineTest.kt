package expo.modules.vescble

import expo.modules.vescble.telemetry.AlertRuleEntity
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class VescAlertEngineTest {
    private val engine = VescAlertEngine()

    private fun rule(
        id: String = "r1",
        controlId: String = "duty",
        threshold: Double = 70.0,
        thresholdMax: Double? = null,
        soundType: String = "default",
    ) = AlertRuleEntity(
        id = id,
        controlId = controlId,
        threshold = threshold,
        thresholdMax = thresholdMax,
        enabled = true,
        soundType = soundType,
        createdAt = 0L,
    )

    private fun telemetry(
        dutyCycle: Double = 0.0,
        speed: Double = 0.0,
        batteryVoltage: Double = 60.0,
        motorCurrent: Double = 0.0,
        tempMotor: Double? = null,
        tempMosfet: Double? = null,
        pitch: Double = 0.0,
        adc1: Double = 0.0,
        batteryCurrent: Double = 0.0,
    ) = RefloatTelemetry(
        hasFault = false,
        faultCode = 0,
        pitch = pitch,
        roll = 0.0,
        balancePitch = 0.0,
        balanceCurrent = 0.0,
        speed = speed,
        batteryVoltage = batteryVoltage,
        motorCurrent = motorCurrent,
        batteryCurrent = batteryCurrent,
        erpm = 0,
        dutyCycle = dutyCycle,
        state = 0,
        switchState = 0,
        adc1 = adc1,
        adc2 = 0.0,
        odometer = null,
        tempMosfet = tempMosfet,
        tempMotor = tempMotor,
        avgLatency = null,
        lastPacketAt = 0L,
        location = null,
    )

    // --- Basic firing ---

    @Test
    fun singleAlertFiresWhenAboveThreshold() {
        val fired = engine.evaluate(
            listOf(rule(threshold = 70.0)),
            telemetry(dutyCycle = 0.75),
        )
        assertEquals(1, fired.size)
        assertEquals("r1", fired[0].ruleId)
    }

    @Test
    fun singleAlertDoesNotFireBelowThreshold() {
        val fired = engine.evaluate(
            listOf(rule(threshold = 70.0)),
            telemetry(dutyCycle = 0.60),
        )
        assertTrue(fired.isEmpty())
    }

    @Test
    fun batteryAlertFiresBelowThreshold() {
        val fired = engine.evaluate(
            listOf(rule(id = "bat", controlId = "battery", threshold = 50.0)),
            telemetry(batteryVoltage = 45.0),
        )
        assertEquals(1, fired.size)
        assertEquals("bat", fired[0].ruleId)
    }

    @Test
    fun batteryAlertDoesNotFireAboveThreshold() {
        val fired = engine.evaluate(
            listOf(rule(id = "bat", controlId = "battery", threshold = 50.0)),
            telemetry(batteryVoltage = 55.0),
        )
        assertTrue(fired.isEmpty())
    }

    // --- Geiger rangeDepth ---

    @Test
    fun geigerRangeDepthCalculatedCorrectly() {
        val fired = engine.evaluate(
            listOf(rule(threshold = 70.0, thresholdMax = 80.0)),
            telemetry(dutyCycle = 0.75),
        )
        assertEquals(1, fired.size)
        assertEquals(0.5, fired[0].rangeDepth!!, 0.01)
    }

    @Test
    fun geigerRangeDepthClampedAtMax() {
        val fired = engine.evaluate(
            listOf(rule(threshold = 70.0, thresholdMax = 80.0)),
            telemetry(dutyCycle = 0.90),
        )
        assertEquals(1, fired.size)
        assertEquals(1.0, fired[0].rangeDepth!!, 0.01)
    }

    @Test
    fun simpleThresholdAlertHasNullRangeDepth() {
        val fired = engine.evaluate(
            listOf(rule(threshold = 60.0)),
            telemetry(dutyCycle = 0.66),
        )
        assertEquals(1, fired.size)
        assertNull(fired[0].rangeDepth)
    }

    // --- Priority ordering: user scenario ---
    // A: duty 70-80 (geiger), B: duty 85-90 (geiger), C: duty 60 (simple)

    @Test
    fun at66PercentOnlyCFires() {
        val rules = listOf(
            rule(id = "A", threshold = 70.0, thresholdMax = 80.0),
            rule(id = "B", threshold = 85.0, thresholdMax = 90.0),
            rule(id = "C", threshold = 60.0),
        )
        val fired = engine.evaluate(rules, telemetry(dutyCycle = 0.66))
        assertEquals(1, fired.size)
        assertEquals("C", fired[0].ruleId)
    }

    @Test
    fun at76PercentGeigerAWinsOverSimpleC() {
        val rules = listOf(
            rule(id = "C", threshold = 60.0),
            rule(id = "A", threshold = 70.0, thresholdMax = 80.0),
        )
        val fired = engine.evaluate(rules, telemetry(dutyCycle = 0.76))
        assertEquals(2, fired.size)
        assertEquals("A", fired[0].ruleId)
    }

    @Test
    fun at89PercentHigherThresholdGeigerBWinsOverA() {
        val rules = listOf(
            rule(id = "A", threshold = 70.0, thresholdMax = 80.0),
            rule(id = "B", threshold = 85.0, thresholdMax = 90.0),
            rule(id = "C", threshold = 60.0),
        )
        val fired = engine.evaluate(rules, telemetry(dutyCycle = 0.89))
        assertEquals(3, fired.size)
        assertEquals("B", fired[0].ruleId)
    }

    @Test
    fun priorityIndependentOfCreationOrder() {
        val rulesAFirst = listOf(
            rule(id = "A", threshold = 70.0, thresholdMax = 80.0),
            rule(id = "B", threshold = 85.0, thresholdMax = 90.0),
        )
        val rulesBFirst = listOf(
            rule(id = "B", threshold = 85.0, thresholdMax = 90.0),
            rule(id = "A", threshold = 70.0, thresholdMax = 80.0),
        )
        val t = telemetry(dutyCycle = 0.89)

        val firedA = engine.evaluate(rulesAFirst, t)
        engine.resetDebounce()
        val firedB = engine.evaluate(rulesBFirst, t)

        assertEquals("B", firedA[0].ruleId)
        assertEquals("B", firedB[0].ruleId)
    }

    // --- Battery (below direction) priority ---

    @Test
    fun batteryLowerThresholdWinsWhenBothFire() {
        val rules = listOf(
            rule(id = "high", controlId = "battery", threshold = 50.0, thresholdMax = 45.0),
            rule(id = "low", controlId = "battery", threshold = 42.0, thresholdMax = 38.0),
        )
        val fired = engine.evaluate(rules, telemetry(batteryVoltage = 40.0))
        assertEquals(2, fired.size)
        assertEquals("low", fired[0].ruleId)
    }

    // --- Debounce ---

    @Test
    fun debouncePreventsDuplicateFiring() {
        val rules = listOf(rule(threshold = 60.0))
        val t = telemetry(dutyCycle = 0.66)

        val first = engine.evaluate(rules, t)
        val second = engine.evaluate(rules, t)

        assertEquals(1, first.size)
        assertTrue(second.isEmpty())
    }

    @Test
    fun geigerAlertReportsWhileStillActive() {
        val rules = listOf(rule(threshold = 70.0, thresholdMax = 80.0))
        val t = telemetry(dutyCycle = 0.75)

        val first = engine.evaluate(rules, t)
        val second = engine.evaluate(rules, t)

        assertEquals(1, first.size)
        assertEquals(1, second.size)
    }

    @Test
    fun resetDebounceAllowsRefiring() {
        val rules = listOf(rule(threshold = 60.0))
        val t = telemetry(dutyCycle = 0.66)

        engine.evaluate(rules, t)
        engine.resetDebounce()
        val fired = engine.evaluate(rules, t)

        assertEquals(1, fired.size)
    }

    // --- Speed uses abs value ---

    @Test
    fun speedAlertUsesAbsoluteValue() {
        val fired = engine.evaluate(
            listOf(rule(id = "spd", controlId = "speed", threshold = 20.0)),
            telemetry(speed = -25.0),
        )
        assertEquals(1, fired.size)
    }

    // --- Duty uses abs * 100 ---

    @Test
    fun dutyAlertUsesAbsPercentage() {
        val fired = engine.evaluate(
            listOf(rule(threshold = 70.0)),
            telemetry(dutyCycle = -0.75),
        )
        assertEquals(1, fired.size)
    }

    // --- Cross-control: geiger wins over simple ---

    @Test
    fun crossControlGeigerWinsOverSimple() {
        val rules = listOf(
            rule(id = "spd", controlId = "speed", threshold = 10.0),
            rule(id = "duty", controlId = "duty", threshold = 70.0, thresholdMax = 90.0),
        )
        val fired = engine.evaluate(rules, telemetry(speed = 15.0, dutyCycle = 0.75))
        assertEquals(2, fired.size)
        assertEquals("duty", fired[0].ruleId)
    }
}

class VescAlertTemplateTest {
    private fun alert(
        controlId: String = "duty",
        value: Double = 75.0,
        threshold: Double = 70.0,
        thresholdMax: Double? = null,
    ) = FiredAlert(
        ruleId = "r1",
        controlId = controlId,
        value = value,
        threshold = threshold,
        thresholdMax = thresholdMax,
        soundType = "tts:test",
        rangeDepth = null,
        firedAt = 0L,
    )

    @Test
    fun basicPlaceholdersRendered() {
        val result = renderAlertMessageTemplate(
            "{value} {unit} over {threshold} {unit}",
            alert(controlId = "duty", value = 75.0, threshold = 70.0),
            batteryPercent = null,
        )
        assertEquals("75 % over 70 %", result)
    }

    @Test
    fun batteryVoltagePlaceholderRendered() {
        val result = renderAlertMessageTemplate(
            "Battery {voltage} volts, {percent}%",
            alert(controlId = "battery", value = 48.5, threshold = 50.0),
            batteryPercent = 42.0,
        )
        assertEquals("Battery 48.5 volts, 42%", result)
    }

    @Test
    fun batteryPercentMissingRecordsDiagnostic() {
        val diagnostics = mutableListOf<String>()
        val result = renderAlertMessageTemplate(
            "Battery {voltage} volts, {percent}%",
            alert(controlId = "battery", value = 48.5, threshold = 50.0),
            batteryPercent = null,
            onDiagnostic = { name, _ -> diagnostics.add(name) },
        )
        assertEquals("Battery 48.5 volts, %", result)
        assertTrue(diagnostics.any { it == "alert_template_placeholder_unavailable" })
    }

    @Test
    fun batteryPlaceholdersUnavailableForNonBattery() {
        val diagnostics = mutableListOf<String>()
        val result = renderAlertMessageTemplate(
            "Speed {value} {unit} voltage={voltage} pct={percent}",
            alert(controlId = "speed", value = 25.0, threshold = 20.0),
            batteryPercent = 80.0,
            onDiagnostic = { name, _ -> diagnostics.add(name) },
        )
        assertEquals("Speed 25.0 km/h voltage= pct=", result)
        assertEquals(2, diagnostics.count { it == "alert_template_placeholder_unavailable" })
    }

    @Test
    fun unknownPlaceholderStrippedWithDiagnostic() {
        val diagnostics = mutableListOf<String>()
        val result = renderAlertMessageTemplate(
            "Alert {value} {unknown}",
            alert(controlId = "speed", value = 25.0, threshold = 20.0),
            batteryPercent = null,
            onDiagnostic = { name, _ -> diagnostics.add(name) },
        )
        assertEquals("Alert 25.0", result)
        assertTrue(diagnostics.any { it == "alert_template_unknown_placeholder" })
    }

    @Test
    fun noBracesInOutputWhenAllPlaceholdersResolved() {
        val result = renderAlertMessageTemplate(
            "{value} {unit}",
            alert(controlId = "motor-temp", value = 65.3, threshold = 60.0),
            batteryPercent = null,
        )
        assertFalse(result.contains('{'))
    }

    @Test
    fun unitMapCorrect() {
        assertEquals("km/h", alertControlUnit("speed"))
        assertEquals("V", alertControlUnit("battery"))
        assertEquals("%", alertControlUnit("duty"))
        assertEquals("°C", alertControlUnit("motor-temp"))
        assertEquals("A", alertControlUnit("motor-current"))
        assertEquals("°C", alertControlUnit("controller-temp"))
        assertEquals("A", alertControlUnit("batt-current"))
        assertEquals("°", alertControlUnit("imu"))
        assertEquals("", alertControlUnit("footpad"))
    }
}
