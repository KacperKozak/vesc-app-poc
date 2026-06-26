import { forwardRef } from 'react'
import { StyleSheet, TextInput, type TextInputProps } from 'react-native'
import { theme } from '@/constants/theme'

export const inputBase = {
  backgroundColor: theme.palette.slate.surfaceDeep,
  borderWidth: 1,
  borderColor: theme.palette.slate.border,
  borderRadius: 8,
  paddingHorizontal: 14,
  paddingVertical: 12,
  color: theme.palette.slate.textPrimary,
  fontSize: 15,
  fontWeight: '600' as const,
}

interface InputProps extends TextInputProps {}

export const Input = forwardRef<TextInput, InputProps>(function Input({ style, ...props }, ref) {
  return <TextInput ref={ref} style={[styles.input, style]} {...props} />
})

const styles = StyleSheet.create({
  input: { ...inputBase },
})
