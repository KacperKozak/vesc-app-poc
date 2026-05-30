import { useMemo } from 'react'
import type { StyleProp, ViewStyle } from 'react-native'
import { useShallow } from 'zustand/react/shallow'

import { BatteryBar } from '@/components/ui/base/BatteryBar'
import { type SparklinePoint } from '@/components/ui/charts/Sparkline'
import { deriveBatteryConfig } from '@/lib/battery'
import { useLiveMetric, liveSelectors } from '@/hooks/useLiveMetric'
import { useBoardStore } from '@/store/boardStore'
import { useLiveWindowMs } from '@/store/settingsStore'

interface BatteryIndicatorProps {
  compact?: boolean
  transparent?: boolean
  containerStyle?: StyleProp<ViewStyle>
}

export function BatteryIndicator({ compact, transparent, containerStyle }: BatteryIndicatorProps) {
  const batteryVoltageHistory = useLiveMetric(liveSelectors.batteryVoltage)
  const batteryPercentHistory = useLiveMetric(liveSelectors.batteryPercent)
  const windowMs = useLiveWindowMs()
  const batteryConfig = useBoardStore(
    useShallow((s) => {
      const board = s.boards.find((b) => b.id === s.activeBoardId)
      return board?.batteryConfig ?? null
    }),
  )

  const { smoothVoltage, batterySeries } = useMemo(() => {
    const series: SparklinePoint[] = batteryPercentHistory.map((p) => ({
      ts: p.ts,
      value: p.value,
    }))
    return { smoothVoltage: batteryVoltageHistory.at(-1)?.value ?? null, batterySeries: series }
  }, [batteryVoltageHistory, batteryPercentHistory])

  const voltage = smoothVoltage
  const percent = batteryPercentHistory.at(-1)?.value ?? null
  const batteryConfigured = deriveBatteryConfig(batteryConfig).warning == null

  return (
    <BatteryBar
      percent={batteryConfigured ? percent : null}
      voltage={voltage}
      series={batteryConfigured ? batterySeries : undefined}
      windowMs={windowMs}
      hint={!batteryConfigured ? 'Set battery config in board settings' : undefined}
      compact={compact}
      transparent={transparent}
      containerStyle={containerStyle}
    />
  )
}
