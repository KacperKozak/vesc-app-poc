import { useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { useBleStore } from '@/store/bleStore'
import { liveTelemetryRuntime } from '@/lib/telemetry/liveTelemetryRuntime'
import { theme } from '@/constants/theme'

/**
 * Debug overlay: observed live telemetry rate (frames in the last second) and the latest
 * round-trip latency. Used to eyeball polling speed while testing response-paced polling.
 */
export function PollRateBadge() {
  const version = useBleStore((s) => s.metricVersion)

  const stats = useMemo(() => {
    const telemetry = liveTelemetryRuntime.getTelemetry()
    if (telemetry.length === 0) return null
    const latest = telemetry[telemetry.length - 1]
    const now = latest.lastPacketAt
    let count = 0
    for (let i = telemetry.length - 1; i >= 0; i--) {
      if (now - telemetry[i].lastPacketAt > 1000) break
      count++
    }
    return { hz: count, rttMs: latest.avgLatency }
  }, [version])

  if (!stats) return null

  return (
    <View style={styles.wrapper} pointerEvents="none">
      <View style={styles.badge}>
        <Text style={styles.value}>{stats.hz} Hz</Text>
        {stats.rttMs != null ? <Text style={styles.sub}>· {stats.rttMs} ms</Text> : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    top: 52,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    backgroundColor: theme.neutral.surface,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    opacity: 0.9,
  },
  value: {
    color: theme.neutral.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  sub: {
    color: theme.neutral.textSecondary,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
})
