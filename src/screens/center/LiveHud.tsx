import { StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { BatteryIndicator, DualGaugeIndicator } from '@/components/cards'

interface LiveHudProps {
  visible: boolean
}

export function LiveHud({ visible }: LiveHudProps) {
  const insets = useSafeAreaInsets()
  if (!visible) return null

  return (
    <View
      style={[styles.wrap, { paddingTop: Math.max(insets.top + 46, 64) }]}
      pointerEvents="box-none"
    >
      <DualGaugeIndicator
        compact
        transparent
        split
        middleSlot={<BatteryIndicator compact transparent />}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 6,
    right: 6,
    zIndex: 10,
  },
})
