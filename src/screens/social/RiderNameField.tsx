import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { Input } from '@/components/ui/forms/Input'
import { useRiderStore } from '@/store/riderStore'
import { theme } from '@/constants/theme'

export function RiderNameField() {
  const riderName = useRiderStore((s) => s.riderName)
  const setName = useRiderStore((s) => s.setName)
  const [draft, setDraft] = useState(riderName ?? '')

  // Resync the field when the stored name changes (e.g. async load after mount).
  // Render-time state adjustment, the React-recommended alternative to an effect.
  const [syncedName, setSyncedName] = useState(riderName)
  if (riderName !== syncedName) {
    setSyncedName(riderName)
    setDraft(riderName ?? '')
  }

  const commit = () => {
    if (draft.trim() === (riderName ?? '')) return
    void setName(draft)
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>You</Text>
      <Input
        value={draft}
        onChangeText={setDraft}
        onBlur={commit}
        onSubmitEditing={commit}
        placeholder="Add a display name"
        placeholderTextColor={theme.palette.slate.textMuted}
        returnKeyType="done"
        maxLength={32}
        accessibilityLabel="Rider display name"
      />
    </View>
  )
}

const styles = StyleSheet.create({
  section: {
    gap: 8,
  },
  sectionTitle: {
    color: theme.palette.slate.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginLeft: 4,
  },
})
