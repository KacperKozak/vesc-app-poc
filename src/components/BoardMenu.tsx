import { Pressable, StyleSheet, View } from 'react-native'
import { type Icon } from 'phosphor-react-native'

export interface BoardMenuItem {
  label: string
  icon: Icon
  onPress: () => void
  destructive?: boolean
  separator?: boolean
}

export function BoardMenu({ items }: { items: BoardMenuItem[] }) {
  if (items.length === 0) return null

  return (
    <View style={styles.container}>
      {items.map((item, i) => (
        <Pressable
          key={`${item.label}-${i}`}
          style={styles.iconButton}
          accessibilityRole="button"
          accessibilityLabel={item.label}
          onPress={item.onPress}
        >
          <item.icon size={18} color={item.destructive ? '#f87171' : '#9ca3af'} weight="regular" />
        </Pressable>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  iconButton: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
})
