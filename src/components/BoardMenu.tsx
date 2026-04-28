import { useRef, useState } from 'react'
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native'

export interface BoardMenuItem {
  label: string
  icon: string
  onPress: () => void
  destructive?: boolean
  separator?: boolean
}

function DropdownMenu({
  items,
  anchor,
  onClose,
}: {
  items: BoardMenuItem[]
  anchor: { top: number; right: number }
  onClose: () => void
}) {
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <View style={[dropStyles.menu, { top: anchor.top, right: anchor.right }]}>
        {items.map((item, i) => (
          <View key={item.label}>
            {item.separator && i > 0 && <View style={dropStyles.separator} />}
            <TouchableOpacity
              style={dropStyles.item}
              onPress={() => {
                onClose()
                item.onPress()
              }}
            >
              <Text style={dropStyles.icon}>{item.icon}</Text>
              <Text style={[dropStyles.label, item.destructive && dropStyles.destructive]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>
    </Modal>
  )
}

export function BoardMenu({ items }: { items: BoardMenuItem[] }) {
  const menuButtonRef = useRef<View>(null)
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(null)

  if (items.length === 0) return null

  const openMenu = () => {
    menuButtonRef.current?.measure((_x, _y, _w, h, _px, pageY) => {
      setAnchor({ top: pageY + h + 4, right: 12 })
    })
  }

  return (
    <>
      <View ref={menuButtonRef} collapsable={false}>
        <TouchableOpacity style={styles.menuButton} onPress={openMenu}>
          <Text style={styles.menuDots}>⋮</Text>
        </TouchableOpacity>
      </View>

      {anchor && <DropdownMenu items={items} anchor={anchor} onClose={() => setAnchor(null)} />}
    </>
  )
}

const styles = StyleSheet.create({
  menuButton: { paddingHorizontal: 8, paddingVertical: 4 },
  menuDots: { color: '#9ca3af', fontSize: 22, lineHeight: 22 },
})

const dropStyles = StyleSheet.create({
  menu: {
    position: 'absolute',
    backgroundColor: '#1f2937',
    borderRadius: 12,
    minWidth: 200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 12,
    overflow: 'hidden',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 16,
    gap: 12,
  },
  icon: { fontSize: 16, width: 20, textAlign: 'center' },
  label: { color: '#f9fafb', fontSize: 15 },
  destructive: { color: '#f87171' },
  separator: { height: 1, backgroundColor: '#374151', marginHorizontal: 0 },
})
