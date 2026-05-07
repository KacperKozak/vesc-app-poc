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
          style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
          accessibilityRole="button"
          accessibilityLabel={item.label}
          onPress={item.onPress}
          hitSlop={6}
          android_ripple={{
            color: 'rgba(148, 163, 184, 0.24)',
            borderless: false,
            foreground: true,
          }}
        >
          <item.icon size={18} color={item.destructive ? '#f87171' : '#9ca3af'} weight="light" />
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
    minWidth: 40,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    overflow: 'hidden',
  },
  iconButtonPressed: {
    opacity: 0.75,
  },
})
