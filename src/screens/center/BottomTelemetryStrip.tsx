import { Pressable, StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated'

import { Sparkline } from '@/components/ui/charts/Sparkline'
import { TickText } from '@/components/ui/base/TickText'
import { BatteryIndicator } from '@/components/domain/cards/BatteryIndicator'
import { interaction, theme } from '@/constants/theme'
import { telemetry } from '@/constants/telemetry'
import { routes } from '@/navigation/routes'
import { liveSelectors, useLiveMetric } from '@/hooks/useLiveMetric'
import { useBleStore } from '@/store/bleStore'
import { useLiveWindowMs } from '@/store/settingsStore'
import { liveTelemetryRuntime } from '@/lib/telemetry/liveTelemetryRuntime'

const FOOTPAD_ACTIVE_V = 0.8
const PITCH_CLAMP_DEG = 18
export const STRIP_CONTENT_HEIGHT = 160

interface BottomTelemetryStripProps {
  revealProgress?: SharedValue<number>
}

export function BottomTelemetryStrip({ revealProgress }: BottomTelemetryStripProps) {
  const insets = useSafeAreaInsets()
  const windowMs = useLiveWindowMs()
  // Sparklines need the windowed history series (cold path, ~3Hz).
  const motorTempSeries = useLiveMetric(liveSelectors.motorTemp)
  const controllerTempSeries = useLiveMetric(liveSelectors.controllerTemp)
  const motorCurrentSeries = useLiveMetric(liveSelectors.motorCurrent)
  const batteryCurrentSeries = useLiveMetric(liveSelectors.batteryCurrent)
  const bleStatus = useBleStore((s) => s.status)
  const imuConnected = bleStatus === 'connected'
  // Live numbers, IMU tilt and footpad dots read SharedValues (hot path, ~31Hz, no re-render).
  const tick = liveTelemetryRuntime.values

  const revealStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: revealProgress ? 74 * revealProgress.value : 0 }],
  }))

  const imuLineStyle = useAnimatedStyle(() => {
    const p = tick.pitch.value ?? 0
    const clamped = Math.max(-PITCH_CLAMP_DEG, Math.min(PITCH_CLAMP_DEG, p))
    return { transform: [{ rotate: `${imuConnected ? clamped : 0}deg` }] }
  })

  const footpad1Style = useAnimatedStyle(() => {
    const a = tick.adc1.value
    const active = a != null && a > FOOTPAD_ACTIVE_V
    return {
      borderColor: active ? theme.gps.text : theme.neutral.textDim,
      backgroundColor: active ? theme.gps.text : 'transparent',
    }
  })

  const footpad2Style = useAnimatedStyle(() => {
    const a = tick.adc2.value
    const active = a != null && a > FOOTPAD_ACTIVE_V
    return {
      borderColor: active ? theme.gps.text : theme.neutral.textDim,
      backgroundColor: active ? theme.gps.text : 'transparent',
    }
  })

  return (
    <Animated.View
      style={[styles.wrap, { paddingBottom: Math.max(insets.bottom * 0.5, 8) }]}
      pointerEvents="box-none"
    >
      <Animated.View style={revealStyle}>
        <View style={styles.strip}>
          <Pressable
            style={({ pressed }) => [styles.metricCell, pressed && styles.cellPressed]}
            android_ripple={interaction.ripple}
            onPress={() => router.push(routes.controlTemperatures)}
            testID="telemetry-motor-temp-cell"
          >
            <Text style={styles.subLabel}>Motor</Text>
            <TickText
              value={tick.motorTemp}
              decimals={telemetry.motorTemp.decimals}
              unit={telemetry.motorTemp.unit}
              style={styles.value}
            />
            <Sparkline
              points={motorTempSeries}
              color={telemetry.motorTemp.color}
              height={18}
              fmtMax={telemetry.motorTemp.formatWithUnit}
              showMaxBadge
              minSpan={20}
              windowMs={windowMs}
            />
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.metricCell, pressed && styles.cellPressed]}
            android_ripple={interaction.ripple}
            onPress={() => router.push(routes.controlTemperatures)}
            testID="telemetry-controller-temp-cell"
          >
            <Text style={styles.subLabel}>Ctrl</Text>
            <TickText
              value={tick.controllerTemp}
              decimals={telemetry.controllerTemp.decimals}
              unit={telemetry.controllerTemp.unit}
              style={styles.value}
            />
            <Sparkline
              points={controllerTempSeries}
              color={telemetry.controllerTemp.color}
              height={18}
              fmtMax={telemetry.controllerTemp.formatWithUnit}
              showMaxBadge
              minSpan={20}
              windowMs={windowMs}
            />
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.metricCell, pressed && styles.cellPressed]}
            android_ripple={interaction.ripple}
            onPress={() => router.push(routes.controlCurrents)}
            testID="telemetry-motor-current-cell"
          >
            <Text style={styles.subLabel}>Motor</Text>
            <TickText
              value={tick.motorCurrent}
              decimals={telemetry.motorCurrent.decimals}
              unit={telemetry.motorCurrent.unit}
              style={styles.value}
            />
            <Sparkline
              points={motorCurrentSeries}
              color={telemetry.motorCurrent.color}
              height={18}
              fmtMax={telemetry.motorCurrent.formatWithUnit}
              showMaxBadge
              minSpan={20}
              windowMs={windowMs}
            />
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.metricCell, pressed && styles.cellPressed]}
            android_ripple={interaction.ripple}
            onPress={() => router.push(routes.controlCurrents)}
            testID="telemetry-battery-current-cell"
          >
            <Text style={styles.subLabel}>Batt</Text>
            <TickText
              value={tick.batteryCurrent}
              decimals={telemetry.battCurrent.decimals}
              unit={telemetry.battCurrent.unit}
              style={styles.value}
            />
            <Sparkline
              points={batteryCurrentSeries}
              color={telemetry.battCurrent.color}
              height={18}
              fmtMax={telemetry.battCurrent.formatWithUnit}
              showMaxBadge
              minSpan={20}
              windowMs={windowMs}
            />
          </Pressable>
        </View>

        <View style={styles.bottomRow}>
          <Pressable
            style={({ pressed }) => [styles.sideIcon, pressed && styles.cellPressed]}
            android_ripple={interaction.rippleBorderless}
            onPress={() => router.push(routes.controlImu)}
          >
            <View
              style={[
                styles.imuMarker,
                { borderColor: imuConnected ? theme.target.color : theme.neutral.textMuted },
              ]}
            />
            <Animated.View
              style={[
                styles.imuLine,
                { backgroundColor: imuConnected ? theme.target.color : theme.neutral.textMuted },
                imuLineStyle,
              ]}
            />
          </Pressable>
          <BatteryIndicator transparent containerStyle={styles.batteryCenter} />
          <Pressable
            style={({ pressed }) => [styles.sideIcon, pressed && styles.cellPressed]}
            android_ripple={interaction.rippleBorderless}
            onPress={() => router.push(routes.controlFootpad)}
          >
            <View style={styles.footpadRow}>
              <Animated.View style={[styles.footpadDot, footpad1Style]} />
              <Animated.View style={[styles.footpadDot, footpad2Style]} />
            </View>
          </Pressable>
        </View>
      </Animated.View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
  },
  strip: {
    flexDirection: 'row',
    paddingTop: 6,
    paddingBottom: 2,
    paddingHorizontal: 20,
    gap: 8,
  },
  metricCell: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  subLabel: {
    color: theme.neutral.textMuted,
    fontSize: 8,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  value: {
    color: theme.neutral.textPrimary,
    fontSize: 13,
    fontFamily: 'monospace',
    fontWeight: '800',
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 4,
  },
  sideIcon: {
    width: 56,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  batteryCenter: {
    flex: 1,
    marginHorizontal: 4,
  },
  footpadRow: {
    flexDirection: 'row',
    gap: 6,
  },
  footpadDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: theme.neutral.textDim,
    backgroundColor: 'transparent',
  },
  cellPressed: {
    opacity: interaction.pressedOpacity,
  },
  imuLine: {
    width: 32,
    height: 1,
    borderRadius: 1,
    backgroundColor: theme.target.color,
  },
  imuMarker: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.target.color,
    backgroundColor: 'transparent',
  },
})
