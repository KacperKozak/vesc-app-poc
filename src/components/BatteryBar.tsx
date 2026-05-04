import { StyleSheet, Text, View } from 'react-native'

import { Sparkline, type SparklinePoint } from '@/components/charts/Sparkline'
import { theme } from '@/constants/theme'

interface Props {
  /** Current battery state-of-charge in percent (0–100), or null if unknown. */
  percent: number | null
  /** Current pack voltage (smoothed). */
  voltage: number | null
  /** Last 10 min battery % series (already smoothed). */
  series?: SparklinePoint[]
  /** Hint text shown when voltage limits aren't configured yet. */
  hint?: string
  alert?: boolean
}

/**
 * Compact battery indicator: % + voltage on the left, 10-min sparkline
 * filling the right. Sits at the top of the telemetry view.
 */
export function BatteryBar({ percent, voltage, series, hint, alert = false }: Props) {
  const color = alert
    ? theme.error.color
    : percent != null && percent < 30
      ? theme.warning.color
      : theme.gps.color
  return (
    <View style={[styles.wrap, alert && styles.wrapAlert]}>
      <View style={styles.left}>
        <Text style={styles.label}>BATTERY</Text>
        <View style={styles.numbers}>
          <Text style={[styles.percent, { color }]} numberOfLines={1}>
            {percent != null ? `${Math.round(percent)}%` : '—'}
          </Text>
          {voltage != null ? <Text style={styles.voltage}>{voltage.toFixed(1)} V</Text> : null}
        </View>
      </View>
      <View style={styles.right}>
        {series && series.length > 1 ? (
          <Sparkline points={series} color={color} height={32} range={{ min: 0, max: 100 }} />
        ) : hint ? (
          <Text style={styles.hint}>{hint}</Text>
        ) : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginHorizontal: 4,
    marginBottom: 6,
    gap: 14,
  },
  wrapAlert: {
    borderWidth: 1,
    borderColor: theme.error.border,
  },
  left: {
    minWidth: 92,
  },
  label: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  numbers: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginTop: 2,
  },
  percent: {
    fontSize: 22,
    fontFamily: 'monospace',
    fontWeight: '700',
  },
  voltage: {
    color: '#64748b',
    fontSize: 11,
    fontFamily: 'monospace',
    fontWeight: '600',
  },
  right: {
    flex: 1,
    justifyContent: 'center',
  },
  hint: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'right',
  },
})
