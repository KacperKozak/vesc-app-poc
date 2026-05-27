import type { BatteryConfig, BatteryPresetConfig } from 'vesc-ble'

export type { BatteryConfig, BatteryPresetConfig }

interface BatterySocPoint {
  voltage: number
  soc: number
}

export interface BatteryCellPreset {
  id: string
  formFactor: string
  brand: string
  model: string
  chemistry: string
  nominalVoltage: number
  fullVoltage: number
  datasheetEmptyVoltage: number
  recommendedEmptyVoltage: number
  capacityAh: number
  maxContinuousDischargeA?: number
  verified: boolean
  socCurve: BatterySocPoint[]
}

export interface DerivedBatteryConfig {
  mode: BatteryConfig['mode']
  minVoltage: number
  maxVoltage: number
  nominalVoltage: number | null
  nominalWh: number | null
  preset: BatteryCellPreset | null
  warning: 'missing' | 'unknown-preset' | 'invalid' | null
}

const MANUAL_CURVE: { v: number; soc: number }[] = [
  { v: 1.0, soc: 100 },
  { v: 0.95, soc: 90 },
  { v: 0.9, soc: 75 },
  { v: 0.82, soc: 55 },
  { v: 0.72, soc: 35 },
  { v: 0.55, soc: 18 },
  { v: 0.35, soc: 7 },
  { v: 0.15, soc: 2 },
  { v: 0.0, soc: 0 },
]

const PRESET_CURVE: BatterySocPoint[] = [
  { voltage: 4.2, soc: 100 },
  { voltage: 4.1, soc: 92 },
  { voltage: 4.0, soc: 83 },
  { voltage: 3.9, soc: 72 },
  { voltage: 3.8, soc: 60 },
  { voltage: 3.7, soc: 46 },
  { voltage: 3.6, soc: 32 },
  { voltage: 3.5, soc: 18 },
  { voltage: 3.3, soc: 7 },
  { voltage: 3.0, soc: 0 },
]

export const DEFAULT_BATTERY_CONFIG: BatteryPresetConfig = {
  mode: 'preset',
  cellPresetId: 'molicel:21700:p50b',
  seriesCount: 20,
  parallelCount: 2,
}

export const BATTERY_CELL_PRESETS: BatteryCellPreset[] = [
  {
    id: 'molicel:21700:p45b',
    formFactor: '21700',
    brand: 'Molicel',
    model: 'P45B',
    chemistry: 'NMC',
    nominalVoltage: 3.6,
    fullVoltage: 4.2,
    datasheetEmptyVoltage: 2.5,
    recommendedEmptyVoltage: 3.0,
    capacityAh: 4.5,
    maxContinuousDischargeA: 45,
    verified: true,
    socCurve: PRESET_CURVE,
  },
  {
    id: 'molicel:21700:p50b',
    formFactor: '21700',
    brand: 'Molicel',
    model: 'P50B',
    chemistry: 'NMC',
    nominalVoltage: 3.6,
    fullVoltage: 4.2,
    datasheetEmptyVoltage: 2.5,
    recommendedEmptyVoltage: 3.0,
    capacityAh: 5.0,
    maxContinuousDischargeA: 60,
    verified: true,
    socCurve: PRESET_CURVE,
  },
  {
    id: 'molicel:18650:p30b',
    formFactor: '18650',
    brand: 'Molicel',
    model: 'P30B',
    chemistry: 'NMC',
    nominalVoltage: 3.6,
    fullVoltage: 4.2,
    datasheetEmptyVoltage: 2.5,
    recommendedEmptyVoltage: 3.0,
    capacityAh: 3.0,
    maxContinuousDischargeA: 36,
    verified: true,
    socCurve: PRESET_CURVE,
  },
  {
    id: 'samsung:21700:50s',
    formFactor: '21700',
    brand: 'Samsung',
    model: '50S',
    chemistry: 'NCA',
    nominalVoltage: 3.6,
    fullVoltage: 4.2,
    datasheetEmptyVoltage: 2.5,
    recommendedEmptyVoltage: 3.0,
    capacityAh: 5.0,
    maxContinuousDischargeA: 25,
    verified: true,
    socCurve: PRESET_CURVE,
  },
  {
    id: 'reliance:21700:rs50',
    formFactor: '21700',
    brand: 'Reliance',
    model: 'RS50',
    chemistry: 'NMC',
    nominalVoltage: 3.6,
    fullVoltage: 4.2,
    datasheetEmptyVoltage: 2.5,
    recommendedEmptyVoltage: 3.0,
    capacityAh: 5.0,
    verified: false,
    socCurve: PRESET_CURVE,
  },
]

const PRESET_BY_ID = new Map(BATTERY_CELL_PRESETS.map((preset) => [preset.id, preset]))

export function getBatteryPreset(id: string): BatteryCellPreset | null {
  return PRESET_BY_ID.get(id) ?? null
}

export function deriveBatteryConfig(
  config: BatteryConfig | null | undefined,
): DerivedBatteryConfig {
  if (!config) {
    return {
      mode: 'manual',
      minVoltage: 0,
      maxVoltage: 0,
      nominalVoltage: null,
      nominalWh: null,
      preset: null,
      warning: 'missing',
    }
  }

  if (config.mode === 'manual') {
    const valid = config.maxVoltage > config.minVoltage
    return {
      mode: 'manual',
      minVoltage: config.minVoltage,
      maxVoltage: config.maxVoltage,
      nominalVoltage: valid ? (config.minVoltage + config.maxVoltage) / 2 : null,
      nominalWh: null,
      preset: null,
      warning: valid ? null : 'invalid',
    }
  }

  const preset = getBatteryPreset(config.cellPresetId)
  if (!preset) {
    return {
      mode: 'preset',
      minVoltage: 0,
      maxVoltage: 0,
      nominalVoltage: null,
      nominalWh: null,
      preset: null,
      warning: 'unknown-preset',
    }
  }

  const series = Math.max(1, Math.trunc(config.seriesCount))
  const parallel = Math.max(1, Math.trunc(config.parallelCount))
  return {
    mode: 'preset',
    minVoltage: preset.recommendedEmptyVoltage * series,
    maxVoltage: preset.fullVoltage * series,
    nominalVoltage: preset.nominalVoltage * series,
    nominalWh: preset.nominalVoltage * series * preset.capacityAh * parallel,
    preset,
    warning: null,
  }
}

export function estimateBatteryPercent(
  voltage: number,
  config: BatteryConfig | null,
): number | null {
  const derived = deriveBatteryConfig(config)
  if (derived.warning != null) return null

  if (config?.mode === 'preset' && derived.preset) {
    return interpolateCurve(voltage / config.seriesCount, derived.preset.socCurve)
  }

  return estimateManualBatteryPercent(voltage, derived.minVoltage, derived.maxVoltage)
}

function estimateManualBatteryPercent(
  voltage: number,
  minVoltage: number | null,
  maxVoltage: number | null,
): number | null {
  if (minVoltage == null || maxVoltage == null) return null
  if (maxVoltage <= minVoltage) return null

  const norm = (voltage - minVoltage) / (maxVoltage - minVoltage)
  if (norm >= 1) return 100
  if (norm <= 0) return 0

  for (let i = 0; i < MANUAL_CURVE.length - 1; i++) {
    const hi = MANUAL_CURVE[i]
    const lo = MANUAL_CURVE[i + 1]
    if (norm <= hi.v && norm >= lo.v) {
      const span = hi.v - lo.v
      const t = span > 0 ? (norm - lo.v) / span : 0
      return lo.soc + t * (hi.soc - lo.soc)
    }
  }
  return 0
}

function interpolateCurve(voltage: number, curve: BatterySocPoint[]): number {
  const sorted = [...curve].sort((a, b) => b.voltage - a.voltage)
  const first = sorted[0]
  const last = sorted.at(-1)
  if (!first || !last) return 0
  if (voltage >= first.voltage) return 100
  if (voltage <= last.voltage) return 0

  for (let i = 0; i < sorted.length - 1; i++) {
    const hi = sorted[i]
    const lo = sorted[i + 1]
    if (voltage <= hi.voltage && voltage >= lo.voltage) {
      const span = hi.voltage - lo.voltage
      const t = span > 0 ? (voltage - lo.voltage) / span : 0
      return lo.soc + t * (hi.soc - lo.soc)
    }
  }
  return 0
}
