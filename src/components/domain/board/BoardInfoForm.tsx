import { StyleSheet, Text, View } from 'react-native'
import { theme } from '@/constants/theme'
import { Input } from '@/components/ui/forms/Input'

interface BoardInfoFormProps {
  name: string
  description: string
  onChangeName: (value: string) => void
  onChangeDescription: (value: string) => void
}

export function BoardInfoForm({
  name,
  description,
  onChangeName,
  onChangeDescription,
}: BoardInfoFormProps) {
  return (
    <View style={styles.form}>
      <Text style={styles.label}>Board name</Text>
      <Input
        value={name}
        onChangeText={onChangeName}
        placeholder="e.g. FloBoard Pro"
        placeholderTextColor={theme.neutral.textDim}
        returnKeyType="next"
      />
      <Text style={styles.label}>Description</Text>
      <Input
        style={styles.inputMultiline}
        value={description}
        onChangeText={onChangeDescription}
        placeholder="Optional notes about this board"
        placeholderTextColor={theme.neutral.textDim}
        multiline
        numberOfLines={3}
        textAlignVertical="top"
      />
    </View>
  )
}

const styles = StyleSheet.create({
  form: {
    gap: 10,
  },
  label: {
    color: theme.neutral.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  inputMultiline: {
    minHeight: 84,
    paddingTop: 12,
  },
})
