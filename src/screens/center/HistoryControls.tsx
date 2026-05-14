import { Pressable, StyleSheet, Text, View } from 'react-native'
import {
  ArrowLeftIcon,
  CaretLeftIcon,
  CaretRightIcon,
  ListBulletsIcon,
} from 'phosphor-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

interface HistoryControlsProps {
  title: string
  canPrevious: boolean
  canNext: boolean
  loading: boolean
  onBack: () => void
  onPrevious: () => void
  onNext: () => void
  onOpenList: () => void
}

export function HistoryControls({
  title,
  canPrevious,
  canNext,
  loading,
  onBack,
  onPrevious,
  onNext,
  onOpenList,
}: HistoryControlsProps) {
  const insets = useSafeAreaInsets()
  return (
    <View style={[styles.wrap, { paddingTop: Math.max(insets.top, 8) }]} pointerEvents="box-none">
      <View style={styles.row}>
        <Pressable style={styles.iconButton} onPress={onBack}>
          <ArrowLeftIcon size={19} color="#f8fafc" weight="bold" />
        </Pressable>
        <Pressable
          style={[styles.iconButton, !canPrevious && styles.disabled]}
          disabled={!canPrevious || loading}
          onPress={onPrevious}
        >
          <CaretLeftIcon size={18} color="#f8fafc" weight="bold" />
        </Pressable>
        <Pressable style={styles.titleButton} onPress={onOpenList}>
          <ListBulletsIcon size={15} color="#cbd5e1" weight="bold" />
          <Text style={styles.title} numberOfLines={1}>
            {loading ? 'Loading ride...' : title}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.iconButton, !canNext && styles.disabled]}
          disabled={!canNext || loading}
          onPress={onNext}
        >
          <CaretRightIcon size={18} color="#f8fafc" weight="bold" />
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
    gap: 8,
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
  disabled: {
    opacity: 0.35,
  },
  titleButton: {
    flex: 1,
    minWidth: 0,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.28)',
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    flex: 1,
    minWidth: 0,
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: '800',
  },
})
