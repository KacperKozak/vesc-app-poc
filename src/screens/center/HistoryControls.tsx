import { Pressable, StyleSheet, View } from 'react-native'
import { ArrowLeftIcon, TrashIcon } from 'phosphor-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { ScreenTitle } from '@/components/navigation/ScreenTitle'

interface HistoryControlsProps {
  loading: boolean
  canRemove: boolean
  onBack: () => void
  onRemove: () => void
}

export function HistoryControls({ loading, canRemove, onBack, onRemove }: HistoryControlsProps) {
  const insets = useSafeAreaInsets()
  return (
    <View style={[styles.wrap, { paddingTop: Math.max(insets.top, 8) }]} pointerEvents="box-none">
      <View style={styles.row}>
        <Pressable style={styles.iconButton} onPress={onBack}>
          <ArrowLeftIcon size={19} color="#f8fafc" weight="bold" />
        </Pressable>
        <View style={styles.titleWrap}>
          <ScreenTitle title="History" />
        </View>
        <Pressable
          style={[
            styles.iconButton,
            styles.removeButton,
            (!canRemove || loading) && styles.disabled,
          ]}
          disabled={!canRemove || loading}
          onPress={onRemove}
        >
          <TrashIcon size={17} color="#f87171" weight="bold" />
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 10,
    right: 10,
    zIndex: 30,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  titleWrap: {
    flex: 1,
    alignItems: 'center',
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.28)',
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
  },
  removeButton: {
    borderColor: 'rgba(248, 113, 113, 0.28)',
  },
  disabled: {
    opacity: 0.35,
  },
})
