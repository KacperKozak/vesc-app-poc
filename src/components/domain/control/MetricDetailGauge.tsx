import { useMemo } from 'react'
import type { SharedValue } from 'react-native-reanimated'

import { SingleGauge, type DualGaugeAlert } from '@/components/ui/charts/DualGauge'
import type { TelemetryMetricConfig } from '@/constants/telemetry'
import { deriveBatteryConfig, percentToVoltage } from '@/lib/battery'
import {
  getHistoryMetricHotRange,
  getHistoryMetricKeyForControlId,
} from '@/lib/history/metricColorScale'
import { useAlertsStore } from '@/store/alertsStore'
import { useBoardStore } from '@/store/boardStore'
import { useSettingsStore } from '@/store/settingsStore'

interface MetricDetailGaugeProps {
  metric: TelemetryMetricConfig
  value: SharedValue<number | null>
  min?: number
  max?: number
  label?: string
}

export function MetricDetailGauge({
  metric,
  value,
  min = metric.chartRange.min,
  max = metric.chartRange.max,
  label = metric.label.toUpperCase(),
}: MetricDetailGaugeProps) {
  const alertRules = useAlertsStore((s) => s.rules)
  const board = useBoardStore((s) => s.boards.find((b) => b.id === s.activeBoardId))
  const batteryConfig = useMemo(() => {
    if (metric.controlId !== 'battery') return null
    const derived = deriveBatteryConfig(board?.batteryConfig ?? null)
    return derived.warning == null ? derived : null
  }, [metric.controlId, board?.batteryConfig])
  const gradientsEnabled = useSettingsStore((s) => s.historyMetricGradientsEnabled)
  const hotRanges = useSettingsStore((s) => s.historyMetricHotRanges)
  const hotMetric = getHistoryMetricKeyForControlId(metric.controlId)
  const hotRange = hotMetric
    ? getHistoryMetricHotRange(hotMetric, hotRanges, gradientsEnabled)
    : null

  const alerts = useMemo<DualGaugeAlert[]>(
    () =>
      metric.controlId == null
        ? []
        : alertRules
            .filter((rule) => rule.enabled && rule.controlId === metric.controlId)
            .map((rule) => ({
              id: rule.id,
              threshold: batteryConfig
                ? percentToVoltage(
                    rule.threshold,
                    batteryConfig.minVoltage,
                    batteryConfig.maxVoltage,
                  )
                : rule.threshold,
              thresholdMax:
                batteryConfig && rule.thresholdMax != null
                  ? percentToVoltage(
                      rule.thresholdMax,
                      batteryConfig.minVoltage,
                      batteryConfig.maxVoltage,
                    )
                  : rule.thresholdMax,
            })),
    [alertRules, metric.controlId, batteryConfig],
  )

  return (
    <SingleGauge
      value={value}
      min={min}
      max={max}
      color={metric.color}
      unit={metric.unit}
      decimals={metric.decimals}
      label={label}
      alerts={alerts}
      hotRange={hotRange}
    />
  )
}
