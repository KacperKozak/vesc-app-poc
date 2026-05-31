import { theme } from '@/constants/theme'
import { dutyPercent } from '@/helpers/format'
import type { TelemetrySample } from '@/store/historyStore'

export type HistoryMetricKey =
  | 'speed'
  | 'duty'
  | 'battery'
  | 'tempMotor'
  | 'tempController'
  | 'motorCurrent'
  | 'batteryCurrent'

export interface MetricColorRange {
  min: number
  max: number
  baseColor: string
  hotColor: string
}

export interface MetricHotRange {
  start: number
  end: number
}

const HISTORY_METRIC_HOT_RANGES: Partial<Record<HistoryMetricKey, MetricHotRange>> = {
  speed: { start: 30, end: 40 },
  duty: { start: 60, end: 80 },
  tempMotor: { start: 70, end: 90 },
  tempController: { start: 60, end: 80 },
  motorCurrent: { start: 35, end: 55 },
  batteryCurrent: { start: 25, end: 45 },
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function parseHexColor(color: string): [number, number, number] | null {
  const hex = color.startsWith('#') ? color.slice(1) : color
  if (hex.length !== 6) return null
  const value = Number.parseInt(hex, 16)
  if (!Number.isFinite(value)) return null
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

function toHexChannel(value: number): string {
  return Math.round(value).toString(16).padStart(2, '0')
}

function interpolateHexColor(from: string, to: string, amount: number): string {
  const fromRgb = parseHexColor(from)
  const toRgb = parseHexColor(to)
  if (!fromRgb || !toRgb) return amount >= 1 ? to : from
  const t = clamp01(amount)
  return `#${fromRgb
    .map((channel, index) => channel + (toRgb[index] - channel) * t)
    .map(toHexChannel)
    .join('')}`
}

export function getTelemetrySampleMetricValue(
  sample: TelemetrySample,
  metric: HistoryMetricKey,
): number | null {
  switch (metric) {
    case 'speed':
      return sample.speedKmh
    case 'duty':
      return dutyPercent(sample.dutyCycle, false)
    case 'battery':
      return sample.batteryVoltage
    case 'tempMotor':
      return sample.tempMotor
    case 'tempController':
      return sample.tempMosfet
    case 'motorCurrent':
      return sample.motorCurrent
    case 'batteryCurrent':
      return sample.batteryCurrent
  }
}

export function makeMetricColorRange(
  baseColor: string,
  hotRange: MetricHotRange | null | undefined,
): MetricColorRange | null {
  if (!hotRange) return null
  const min = Math.min(hotRange.start, hotRange.end)
  const max = Math.max(hotRange.start, hotRange.end)
  if (min === max) return null
  return { min, max, baseColor, hotColor: theme.error.color }
}

export function getHistoryMetricHotRange(metric: HistoryMetricKey): MetricHotRange | null {
  return HISTORY_METRIC_HOT_RANGES[metric] ?? null
}

export function getHistoryMetricColorRange(
  metric: HistoryMetricKey,
  baseColor: string,
): MetricColorRange | null {
  return makeMetricColorRange(baseColor, getHistoryMetricHotRange(metric))
}

export function getHistoryMetricKeyForControlId(
  controlId: string | undefined,
): HistoryMetricKey | null {
  switch (controlId) {
    case 'speed':
      return 'speed'
    case 'duty':
      return 'duty'
    case 'motor-temp':
      return 'tempMotor'
    case 'controller-temp':
      return 'tempController'
    case 'motor-current':
      return 'motorCurrent'
    case 'batt-current':
      return 'batteryCurrent'
    case 'battery':
      return 'battery'
    default:
      return null
  }
}

export function getMetricRampColor(value: number, range: MetricColorRange | null): string {
  if (!range) return theme.neutral.textSecondary
  const span = range.max - range.min
  if (span <= 0) return range.baseColor
  const normalized = clamp01((value - range.min) / span)
  if (normalized <= 0) return range.baseColor
  return interpolateHexColor(range.baseColor, range.hotColor, normalized)
}
