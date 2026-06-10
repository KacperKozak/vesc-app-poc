import { StyleSheet, View } from 'react-native'
import { ArrowLeftIcon, ImagesSquareIcon, TrashIcon } from 'phosphor-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { IconButton } from '@/components/ui/base/IconButton'
import { ScreenTitle } from '@/components/ui/base/ScreenTitle'
import { theme } from '@/constants/theme'

interface HistoryControlsProps {
  loading: boolean
  canRemove: boolean
  mediaEnabled: boolean
  mediaLoading: boolean
  onBack: () => void
  onToggleMedia: () => void
  onRemove: () => void
}

export function HistoryControls({
  loading,
  canRemove,
  mediaEnabled,
  mediaLoading,
  onBack,
  onToggleMedia,
  onRemove,
}: HistoryControlsProps) {
  const insets = useSafeAreaInsets()
  return (
    <View style={[styles.wrap, { paddingTop: Math.max(insets.top, 8) }]} pointerEvents="box-none">
      <View style={styles.row}>
        <IconButton icon={ArrowLeftIcon} onPress={onBack} />
        <View style={styles.titleWrap}>
          <ScreenTitle title="History" />
        </View>
        <IconButton
          icon={ImagesSquareIcon}
          onPress={onToggleMedia}
          loading={mediaLoading}
          style={mediaEnabled ? styles.mediaEnabled : undefined}
        />
        <IconButton
          icon={TrashIcon}
          onPress={onRemove}
          destructive
          disabled={!canRemove || loading}
        />
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
  mediaEnabled: {
    borderColor: theme.bran.border,
    backgroundColor: theme.bran.bg,
  },
})
