import { useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { TelemetryLineChart } from '@/components/charts/TelemetryLineChart'
import { computeAutoRange, type TelemetryChartPoint } from '@/components/charts/chartMath'
import { telemetry } from '@/constants/telemetry'
import { downsampleTimeSeries } from '@/history/playback'
import { dutyPercent, fmtDutyPercent } from '@/helpers/format'
import type { TelemetrySample } from '@/store/historyStore'

interface HistoryTelemetryPanelProps {
  samples: TelemetrySample[]
  loading: boolean
}

const CHART_MAX_POINTS = 220

export function HistoryTelemetryPanel({ samples, loading }: HistoryTelemetryPanelProps) {
  const sortedSamples = useMemo(
    () => [...samples].sort((a, b) => a.capturedAtMs - b.capturedAtMs),
    [samples],
  )
  const chartSamples = useMemo(
    () => downsampleTimeSeries(sortedSamples, CHART_MAX_POINTS, (sample) => sample.capturedAtMs),
    [sortedSamples],
  )
  const latest = sortedSamples.at(-1) ?? null
  const speedPoints = useMemo<TelemetryChartPoint[]>(
    () =>
      chartSamples.map((sample) => ({
        date: new Date(sample.capturedAtMs),
        value: sample.speedKmh,
      })),
    [chartSamples],
  )
  const speedRange = useMemo(
    () =>
      computeAutoRange(speedPoints, {
        includeZero: true,
        minSpan: 10,
        paddingRatio: 0.1,
        fallbackMin: -5,
        fallbackMax: 5,
      }),
    [speedPoints],
  )

  if (loading) {
    return (
      <View style={styles.panel}>
        <Text style={styles.empty}>Loading ride telemetry...</Text>
      </View>
    )
  }

  if (!latest || sortedSamples.length < 2) {
    return (
      <View style={styles.panel}>
        <Text style={styles.empty}>No board samples for this ride.</Text>
      </View>
    )
  }

  return (
    <View style={styles.panel}>
      <TelemetryLineChart
        label={telemetry.speed.label}
        value={telemetry.speed.formatWithUnit(latest.speedKmh)}
        points={speedPoints}
        color={telemetry.speed.color}
        range={speedRange}
        currentPoint={{
          date: new Date(latest.capturedAtMs),
          value: latest.speedKmh,
        }}
        height={48}
        containerStyle={styles.chart}
        formatValue={(value) => telemetry.speed.formatWithUnit(value)}
      />
      <View style={styles.metrics}>
        <Metric label="Duty" value={fmtDutyPercent(latest.dutyCycle, false)} />
        <Metric label="Batt" value={telemetry.battVoltage.formatWithUnit(latest.batteryVoltage)} />
        <Metric
          label="Motor"
          value={
            latest.tempMotor == null ? '-' : telemetry.motorTemp.formatWithUnit(latest.tempMotor)
          }
        />
        <Metric
          label="Ctrl"
          value={
            latest.tempMosfet == null
              ? '-'
              : telemetry.controllerTemp.formatWithUnit(latest.tempMosfet)
          }
        />
        <Metric
          label="Motor A"
          value={telemetry.motorCurrent.formatWithUnit(latest.motorCurrent)}
        />
        <Metric
          label="Batt A"
          value={telemetry.battCurrent.formatWithUnit(latest.batteryCurrent)}
        />
      </View>
    </View>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 8,
    zIndex: 20,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.22)',
    backgroundColor: 'rgba(15, 23, 42, 0.82)',
    padding: 8,
    gap: 8,
  },
  chart: {
    minHeight: 72,
  },
  metrics: {
    flexDirection: 'row',
    gap: 6,
  },
  metric: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    gap: 2,
  },
  metricLabel: {
    color: '#64748b',
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  metricValue: {
    color: '#f8fafc',
    fontSize: 12,
    fontFamily: 'monospace',
    fontWeight: '900',
  },
  empty: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    paddingVertical: 12,
  },
})
