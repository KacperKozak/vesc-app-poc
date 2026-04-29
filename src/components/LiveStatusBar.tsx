import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useShallow } from 'zustand/react/shallow'

import { useHistoryStore, type TelemetryHistoryBlock } from '@/store/historyStore'

export function LiveStatusBar() {
  const { liveBlocks, summary, refreshLive } = useHistoryStore(
    useShallow((s) => ({
      liveBlocks: s.liveBlocks,
      summary: s.summary,
      refreshLive: s.refreshLive,
    })),
  )

  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    void refreshLive()
    const interval = setInterval(() => void refreshLive(), 500)
    return () => clearInterval(interval)
  }, [refreshLive])

  const lastAt = summary?.lastAtMs ?? null
  const ageMs = lastAt ? Date.now() - lastAt : null
  const active = ageMs != null && ageMs < 15_000
  const boardCount = liveBlocks.reduce((total, b) => total + b.sampleCount, 0)
  const gpsCount = liveBlocks.reduce((total, b) => total + b.gpsPointCount, 0)
  const totalPoints = boardCount + gpsCount

  if (!summary) return null

  return (
    <View style={styles.container}>
      <Pressable style={styles.bar} onPress={() => setExpanded(!expanded)}>
        <View style={[styles.dot, active && styles.dotActive]} />
        <Text style={styles.label} numberOfLines={1}>
          {active ? 'Collecting' : 'Idle'}
        </Text>
        <Text style={styles.age}>
          {ageMs == null ? '' : `${Math.max(0, Math.round(ageMs / 1000))}s`}
        </Text>
        <View style={styles.separator} />
        <Text style={styles.count}>{totalPoints} pts</Text>
        <Text style={styles.chevron}>{expanded ? '▴' : '▾'}</Text>
      </Pressable>

      {expanded && (
        <ExpandedView
          liveBlocks={liveBlocks}
          boardCount={boardCount}
          gpsCount={gpsCount}
          summary={summary}
        />
      )}
    </View>
  )
}

function ExpandedView({
  liveBlocks,
  boardCount,
  gpsCount,
  summary,
}: {
  liveBlocks: TelemetryHistoryBlock[]
  boardCount: number
  gpsCount: number
  summary: { sampleCount: number; gpsPointCount: number; lastAtMs: number | null }
}) {
  const latestBlock = liveBlocks[0]
  const topSpeed = latestBlock ? latestBlock.maxAbsSpeedKmh || latestBlock.maxGpsSpeedKmh || 0 : 0
  const currentBucketStart = Date.now() - (Date.now() % 60_000)
  const blocksByStart = new Map(liveBlocks.map((b) => [b.bucketStartMs, b]))
  const barSlots = Array.from({ length: 10 }, (_, i) => {
    const bucketStartMs = currentBucketStart - (9 - i) * 60_000
    const block = blocksByStart.get(bucketStartMs)
    return { bucketStartMs, points: block ? block.sampleCount + block.gpsPointCount : 0 }
  })
  const maxPoints = Math.max(1, ...barSlots.map((s) => s.points))

  return (
    <View style={styles.expanded}>
      <View style={styles.bars}>
        {barSlots.map((slot) => {
          const isCurrent = slot.bucketStartMs === currentBucketStart
          const height =
            slot.points > 0 ? Math.max(4, Math.round((slot.points / maxPoints) * 28)) : 3
          return (
            <View key={slot.bucketStartMs} style={styles.barSlot}>
              <View
                style={[
                  styles.barFill,
                  slot.points === 0 && styles.barEmpty,
                  isCurrent && styles.barCurrent,
                  { height },
                ]}
              />
            </View>
          )
        })}
      </View>
      <Text style={styles.barsLabel}>10 min · points/min</Text>
      <View style={styles.metrics}>
        <MetricItem label="Board" value={String(boardCount)} />
        <MetricItem label="GPS" value={String(gpsCount)} />
        <MetricItem label="Top" value={`${topSpeed.toFixed(1)} km/h`} />
        <MetricItem label="Total" value={String(summary.sampleCount + summary.gpsPointCount)} />
      </View>
    </View>
  )
}

function MetricItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricItem}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0c1524',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 8,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#4b5563',
  },
  dotActive: {
    backgroundColor: '#22c55e',
  },
  label: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '700',
  },
  age: {
    color: '#64748b',
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
  separator: {
    width: 1,
    height: 10,
    backgroundColor: '#334155',
  },
  count: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    flex: 1,
  },
  chevron: {
    color: '#475569',
    fontSize: 10,
  },
  expanded: {
    paddingHorizontal: 12,
    paddingBottom: 10,
    gap: 6,
  },
  bars: {
    height: 32,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
  },
  barSlot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  barFill: {
    borderRadius: 2,
    backgroundColor: '#3b82f6',
  },
  barCurrent: {
    backgroundColor: '#22c55e',
  },
  barEmpty: {
    backgroundColor: '#1e293b',
  },
  barsLabel: {
    color: '#475569',
    fontSize: 9,
    fontWeight: '700',
  },
  metrics: {
    flexDirection: 'row',
    gap: 4,
  },
  metricItem: {
    flex: 1,
    gap: 1,
  },
  metricLabel: {
    color: '#475569',
    fontSize: 9,
    fontWeight: '700',
  },
  metricValue: {
    color: '#94a3b8',
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
})
