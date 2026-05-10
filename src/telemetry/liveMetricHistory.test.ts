import { describe, expect, test } from 'bun:test'
import type { LocationEvent, TelemetryEvent } from 'vesc-ble'

import {
  appendLocationSample,
  appendTelemetrySample,
  createLiveMetricBuffer,
  getLatestGps,
  getLatestTelemetry,
  projectLiveMetricHistory,
  summarizeLiveStatus,
} from './liveMetricHistory'

function telemetry(overrides: Partial<TelemetryEvent> = {}): TelemetryEvent {
  return {
    generation: 1,
    hasFault: false,
    faultCode: 0,
    pitch: 1,
    roll: 2,
    balancePitch: 3,
    balanceCurrent: 4,
    speed: 12,
    batteryVoltage: 48,
    motorCurrent: 20,
    batteryCurrent: 7,
    erpm: 1000,
    dutyCycle: 0.42,
    state: 1,
    stateName: 'running',
    switchState: 0,
    adc1: 0.1,
    adc2: 0.2,
    odometer: 123,
    tempMosfet: 40,
    tempMotor: 35,
    avgLatency: 18,
    lastPacketAt: 10_000,
    ...overrides,
  }
}

function location(overrides: Partial<LocationEvent> = {}): LocationEvent {
  return {
    latitude: 50,
    longitude: 19,
    speedMps: 4,
    bearingDeg: 90,
    accuracyM: 3,
    altitudeM: 250,
    timestamp: 10_000,
    precise: true,
    saved: true,
    ...overrides,
  }
}

describe('live metric history', () => {
  test('appends telemetry, prunes by live window, and projects metrics', () => {
    const buffer = createLiveMetricBuffer()
    appendTelemetrySample(buffer, telemetry({ lastPacketAt: 0, speed: 1 }), 10_000)
    appendTelemetrySample(buffer, telemetry({ lastPacketAt: 5_000, speed: -8 }), 10_000)
    appendTelemetrySample(buffer, telemetry({ lastPacketAt: 11_000, speed: 14 }), 10_000)

    const history = projectLiveMetricHistory(buffer)

    expect(history.speed).toEqual([
      { ts: 5_000, value: 8 },
      { ts: 11_000, value: 14 },
    ])
    expect(history.duty).toEqual([
      { ts: 5_000, value: 42 },
      { ts: 11_000, value: 42 },
    ])
  })

  test('deduplicates telemetry samples by timestamp', () => {
    const buffer = createLiveMetricBuffer()
    appendTelemetrySample(buffer, telemetry({ lastPacketAt: 1_000, speed: 1 }), 10_000)
    appendTelemetrySample(buffer, telemetry({ lastPacketAt: 1_000, speed: 2 }), 10_000)

    expect(projectLiveMetricHistory(buffer).speed).toEqual([{ ts: 1_000, value: 1 }])
  })

  test('summarizes board and GPS freshness without exposing sample arrays', () => {
    const buffer = createLiveMetricBuffer()
    appendTelemetrySample(buffer, telemetry({ lastPacketAt: 2_000, avgLatency: 25 }), 10_000)
    appendLocationSample(
      buffer,
      location({ timestamp: 3_000, precise: false, accuracyM: 12 }),
      10_000,
    )

    expect(summarizeLiveStatus(buffer)).toEqual({
      boardSampleCount: 1,
      boardLastPacketAt: 2_000,
      boardAvgLatencyMs: 25,
      gpsSampleCount: 1,
      gpsLastFixAt: 3_000,
      gpsPrecise: false,
      gpsAccuracyM: 12,
    })
  })

  test('returns latest telemetry and GPS samples for shared value seeding', () => {
    const buffer = createLiveMetricBuffer()
    appendTelemetrySample(buffer, telemetry({ lastPacketAt: 2_000, speed: 9 }), 10_000)
    appendLocationSample(buffer, location({ timestamp: 3_000, speedMps: 5 }), 10_000)

    expect(getLatestTelemetry(buffer)?.speed).toBe(9)
    expect(getLatestGps(buffer)?.speedMps).toBe(5)
  })
})
