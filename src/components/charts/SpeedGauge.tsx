import { StyleSheet, Text, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'

import { Sparkline, type SparklinePoint } from '@/components/charts/Sparkline'
import { theme } from '@/constants/theme'

interface Props {
  /** Current VESC speed in km/h. */
  value: number | null
  /** Last-10-min VESC speed series — drawn inside the bowl. */
  series?: SparklinePoint[]
  /** GPS speed in km/h, shown as small secondary readout under the sparkline. */
  gpsValue?: number | null
  /** Max gauge value. Defaults to 50 km/h. */
  max?: number
}

// 180° dial. ViewBox 200×120, center (100, 100), radius 80.
// Arc draws across the top half; the lower bowl is empty space we fill with
// the speed number + sparkline + GPS readout.
const VB_W = 200
const VB_H = 120
const CX = 100
const CY = 100
const R = 80
const STROKE = 12

/** Project fraction f (0..1) along the half-circle to (x, y) on the arc. */
function arcPoint(f: number) {
  const angle = Math.PI - Math.PI * f // π → 0, sweeping through π/2 (top)
  return { x: CX + R * Math.cos(angle), y: CY - R * Math.sin(angle) }
}

function arcPath(f: number) {
  const end = arcPoint(Math.min(1, Math.max(0, f)))
  return `M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${end.x} ${end.y}`
}

/**
 * Half-circle speedometer. VESC speed in the center; a 10-min sparkline of
 * the same value sits in the bowl below; GPS speed is a small secondary
 * readout for cross-check.
 */
export function SpeedGauge({ value, series, gpsValue, max = 50 }: Props) {
  const v = value ?? 0
  const fraction = Math.min(1, Math.max(0, v / max))
  const color = fraction > 0.85 ? theme.error.color : theme.wheel.color
  const peak =
    series && series.length > 0
      ? series.reduce((m, p) => (p.value > m ? p.value : m), -Infinity)
      : null

  return (
    <View style={styles.wrap}>
      <View style={styles.dial}>
        <Svg viewBox={`0 0 ${VB_W} ${VB_H}`} style={styles.svg}>
          {/* Background arc (full half-circle) */}
          <Path
            d={arcPath(1)}
            stroke="#334155"
            strokeWidth={STROKE}
            strokeLinecap="round"
            fill="none"
          />
          {/* Filled arc up to current speed */}
          {value != null && fraction > 0 ? (
            <Path
              d={arcPath(fraction)}
              stroke={color}
              strokeWidth={STROKE}
              strokeLinecap="round"
              fill="none"
            />
          ) : null}
        </Svg>

        {/* Tick labels at start/end of dial */}
        <Text style={[styles.tick, styles.tickLeft]}>0</Text>
        <Text style={[styles.tick, styles.tickRight]}>{max}</Text>

        {/* Big speed number sits high in the bowl. */}
        <View style={styles.numberWrap} pointerEvents="none">
          <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit>
            {value != null ? value.toFixed(1) : '—'}
          </Text>
          <Text style={styles.unit}>km/h</Text>
        </View>
      </View>

      {/* Sparkline + GPS readout sit under the dial, inside the gauge card. */}
      <View style={styles.footer}>
        <View style={styles.sparkRow}>
          {series && series.length > 1 ? (
            <Sparkline points={series} color={color} height={28} range={{ min: 0, max }} />
          ) : (
            <View style={{ height: 28 }} />
          )}
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaItem}>
            <Text style={styles.metaLabel}>MAX </Text>
            {peak != null && peak > 0 ? `${peak.toFixed(1)} km/h` : '—'}
          </Text>
          <Text style={styles.metaItem}>
            <Text style={styles.metaLabel}>GPS </Text>
            <Text style={styles.gpsValue}>
              {gpsValue != null ? `${gpsValue.toFixed(1)} km/h` : '—'}
            </Text>
          </Text>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 4,
    marginBottom: 6,
  },
  dial: {
    width: '100%',
    aspectRatio: VB_W / VB_H,
    position: 'relative',
  },
  svg: {
    width: '100%',
    height: '100%',
  },
  numberWrap: {
    position: 'absolute',
    left: '15%',
    right: '15%',
    top: '32%',
    alignItems: 'center',
  },
  value: {
    color: '#f1f5f9',
    fontSize: 60,
    fontFamily: 'monospace',
    fontWeight: '700',
    lineHeight: 64,
  },
  unit: {
    color: '#64748b',
    fontSize: 14,
    fontWeight: '500',
    marginTop: -4,
  },
  tick: {
    position: 'absolute',
    color: '#475569',
    fontSize: 10,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  tickLeft: {
    left: '6%',
    bottom: '8%',
  },
  tickRight: {
    right: '6%',
    bottom: '8%',
  },
  footer: {
    marginTop: 4,
  },
  sparkRow: {
    width: '100%',
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  metaItem: {
    color: '#cbd5e1',
    fontSize: 11,
    fontFamily: 'monospace',
    fontWeight: '700',
  },
  metaLabel: {
    color: '#64748b',
    fontWeight: '700',
  },
  gpsValue: {
    color: theme.gps.text,
  },
})
