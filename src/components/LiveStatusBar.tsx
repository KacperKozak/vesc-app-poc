import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useShallow } from 'zustand/react/shallow'

import { useBleStore } from '@/store/bleStore'
import { minuteBucketStart } from '@/store/liveMonitor'

type BucketSlot = { bucketStartMs: number; points: number; boardCount: number; gpsCount: number }

function buildBucketSlots(
  liveBuckets: { bucketStartMs: number; boardCount: number; gpsCount: number }[],
  nowMs: number,
): { slots: BucketSlot[]; currentBucketStart: number } {
  const currentBucketStart = minuteBucketStart(nowMs)
  const bucketsByStart = new Map(liveBuckets.map((b) => [b.bucketStartMs, b]))
  const slots = Array.from({ length: 10 }, (_, i) => {
    const bucketStartMs = currentBucketStart - (9 - i) * 60_000
    const bucket = bucketsByStart.get(bucketStartMs)
    const boardCount = bucket?.boardCount ?? 0
    const gpsCount = bucket?.gpsCount ?? 0
    return { bucketStartMs, boardCount, gpsCount, points: boardCount + gpsCount }
  })
  return { slots, currentBucketStart }
}

export function LiveStatusBar() {
  const { liveDataBuckets, liveLastPointAtMs } = useBleStore(
    useShallow((s) => ({
      liveDataBuckets: s.liveDataBuckets,
      liveLastPointAtMs: s.liveLastPointAtMs,
    })),
  )
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    const interval = setInterval(() => setNowMs(Date.now()), 500)
    return () => clearInterval(interval)
  }, [])

  const ageMs = liveLastPointAtMs ? nowMs - liveLastPointAtMs : null
  const active = ageMs != null && ageMs < 15_000
  const boardTotal = liveDataBuckets.reduce((total, b) => total + b.boardCount, 0)
  const gpsTotal = liveDataBuckets.reduce((total, b) => total + b.gpsCount, 0)
  const { slots, currentBucketStart } = buildBucketSlots(liveDataBuckets, nowMs)
  const maxBoard = Math.max(1, ...slots.map((s) => s.boardCount))
  const maxGps = Math.max(1, ...slots.map((s) => s.gpsCount))

  return (
    <View style={styles.container}>
      <Pressable style={styles.bar} onPress={() => setExpanded(!expanded)}>
        <View style={[styles.dot, active && styles.dotActive]} />
        <Text style={styles.label} numberOfLines={1}>
          {active ? 'Receiving' : 'Idle'}
        </Text>
        {!expanded && <View style={styles.separator} />}
        {!expanded && (
          <View style={styles.miniSources}>
            <MiniSource
              label="Board"
              slots={slots}
              getValue={(s) => s.boardCount}
              max={maxBoard}
              currentBucketStart={currentBucketStart}
              activeColor="#3b82f6"
              currentColor="#60a5fa"
            />
            <View style={styles.miniSourceDivider} />
            <MiniSource
              label="GPS"
              slots={slots}
              getValue={(s) => s.gpsCount}
              max={maxGps}
              currentBucketStart={currentBucketStart}
              activeColor="#10b981"
              currentColor="#34d399"
            />
          </View>
        )}
        <View style={styles.spacer} />
        <Text style={styles.chevron}>{expanded ? '▴' : '▾'}</Text>
      </Pressable>

      {expanded && (
        <ExpandedView
          slots={slots}
          currentBucketStart={currentBucketStart}
          boardTotal={boardTotal}
          gpsTotal={gpsTotal}
        />
      )}
    </View>
  )
}

function MiniSource({
  label,
  slots,
  getValue,
  max,
  currentBucketStart,
  activeColor,
  currentColor,
}: {
  label: string
  slots: BucketSlot[]
  getValue: (s: BucketSlot) => number
  max: number
  currentBucketStart: number
  activeColor: string
  currentColor: string
}) {
  const hasData = slots.some((s) => getValue(s) > 0)
  return (
    <View style={styles.miniSource}>
      <Text style={styles.miniSourceLabel}>{label}</Text>
      <View style={styles.miniBars}>
        {slots.map((slot) => {
          const count = getValue(slot)
          const isCurrent = slot.bucketStartMs === currentBucketStart
          const height = count > 0 ? Math.max(5, Math.round((count / max) * 14)) : 4
          const backgroundColor = !hasData
            ? '#1e293b'
            : count > 0
              ? isCurrent
                ? currentColor
                : activeColor
              : '#1e293b'
          return (
            <View key={slot.bucketStartMs} style={styles.miniBarSlot}>
              <View style={[styles.miniBar, { height, backgroundColor }]} />
            </View>
          )
        })}
      </View>
    </View>
  )
}

function ExpandedView({
  slots,
  currentBucketStart,
  boardTotal,
  gpsTotal,
}: {
  slots: BucketSlot[]
  currentBucketStart: number
  boardTotal: number
  gpsTotal: number
}) {
  const maxBoard = Math.max(1, ...slots.map((s) => s.boardCount))
  const maxGps = Math.max(1, ...slots.map((s) => s.gpsCount))

  return (
    <View style={styles.expanded}>
      <View style={styles.expandedSources}>
        <SourceChart
          label="Board"
          slots={slots}
          getValue={(s) => s.boardCount}
          max={maxBoard}
          currentBucketStart={currentBucketStart}
          activeColor="#3b82f6"
          currentColor="#60a5fa"
          total={boardTotal}
        />
        <View style={styles.expandedDivider} />
        <SourceChart
          label="GPS"
          slots={slots}
          getValue={(s) => s.gpsCount}
          max={maxGps}
          currentBucketStart={currentBucketStart}
          activeColor="#10b981"
          currentColor="#34d399"
          total={gpsTotal}
        />
      </View>
      <Text style={styles.barsLabel}>10 min · points/min</Text>
    </View>
  )
}

function SourceChart({
  label,
  slots,
  getValue,
  max,
  currentBucketStart,
  activeColor,
  currentColor,
  total,
}: {
  label: string
  slots: BucketSlot[]
  getValue: (s: BucketSlot) => number
  max: number
  currentBucketStart: number
  activeColor: string
  currentColor: string
  total: number
}) {
  const hasData = total > 0
  return (
    <View style={styles.sourceChart}>
      <View style={styles.sourceChartHeader}>
        <Text style={styles.sourceChartLabel}>{label}</Text>
        <Text style={[styles.sourceChartTotal, { color: hasData ? activeColor : '#475569' }]}>
          {total}
        </Text>
      </View>
      <View style={styles.bars}>
        {slots.map((slot) => {
          const count = getValue(slot)
          const isCurrent = slot.bucketStartMs === currentBucketStart
          const height = count > 0 ? Math.max(4, Math.round((count / max) * 28)) : 3
          const backgroundColor = !hasData
            ? '#1e293b'
            : count > 0
              ? isCurrent
                ? currentColor
                : activeColor
              : '#1e293b'
          return (
            <View key={slot.bucketStartMs} style={styles.barSlot}>
              <View style={[styles.barFill, { height, backgroundColor }]} />
            </View>
          )
        })}
      </View>
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
  separator: {
    width: 1,
    height: 10,
    backgroundColor: '#334155',
  },
  miniSources: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  miniSource: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  miniSourceLabel: {
    color: '#475569',
    fontSize: 9,
    fontWeight: '700',
  },
  miniBars: {
    height: 16,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
  },
  miniBarSlot: {
    width: 3,
    height: 16,
    justifyContent: 'flex-end',
  },
  miniBar: {
    width: 3,
    borderRadius: 1,
  },

  miniSourceDivider: {
    width: 1,
    height: 10,
    backgroundColor: '#1e293b',
  },
  spacer: { flex: 1 },
  chevron: {
    color: '#475569',
    fontSize: 10,
  },
  expanded: {
    paddingHorizontal: 12,
    paddingBottom: 10,
    gap: 4,
  },
  expandedSources: {
    flexDirection: 'row',
    gap: 10,
  },
  expandedDivider: {
    width: 1,
    backgroundColor: '#1e293b',
    alignSelf: 'stretch',
  },
  sourceChart: {
    flex: 1,
    gap: 4,
  },
  sourceChartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sourceChartLabel: {
    color: '#475569',
    fontSize: 9,
    fontWeight: '700',
  },
  sourceChartTotal: {
    fontSize: 9,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
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
  },

  barsLabel: {
    color: '#475569',
    fontSize: 9,
    fontWeight: '700',
  },
})
