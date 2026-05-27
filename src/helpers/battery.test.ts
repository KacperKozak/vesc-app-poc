import { expect, test } from 'bun:test'

import {
  DEFAULT_BATTERY_CONFIG,
  deriveBatteryConfig,
  estimateBatteryPercent,
} from '@/helpers/battery'

test('derives preset pack voltages and nominal watt-hours', () => {
  const derived = deriveBatteryConfig(DEFAULT_BATTERY_CONFIG)

  expect(derived.warning).toBeNull()
  expect(derived.minVoltage).toBe(60)
  expect(derived.maxVoltage).toBe(84)
  expect(derived.nominalVoltage).toBe(72)
  expect(derived.nominalWh).toBe(720)
})

test('estimates preset state of charge from per-cell curve', () => {
  expect(estimateBatteryPercent(84, DEFAULT_BATTERY_CONFIG)).toBe(100)
  expect(estimateBatteryPercent(60, DEFAULT_BATTERY_CONFIG)).toBe(0)
  expect(estimateBatteryPercent(76, DEFAULT_BATTERY_CONFIG)).toBeCloseTo(60, 5)
})

test('manual config uses generic min max curve', () => {
  const config = { mode: 'manual' as const, minVoltage: 60, maxVoltage: 84 }

  expect(deriveBatteryConfig(config).warning).toBeNull()
  expect(estimateBatteryPercent(84, config)).toBe(100)
  expect(estimateBatteryPercent(60, config)).toBe(0)
})

test('missing and unknown preset configs return unconfigured state', () => {
  expect(deriveBatteryConfig(null).warning).toBe('missing')
  expect(
    deriveBatteryConfig({
      mode: 'preset',
      cellPresetId: 'missing',
      seriesCount: 20,
      parallelCount: 2,
    }).warning,
  ).toBe('unknown-preset')
})
