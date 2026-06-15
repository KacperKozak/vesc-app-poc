import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router, useLocalSearchParams } from 'expo-router'
import { CheckCircleIcon, CircleIcon, WarningCircleIcon } from 'phosphor-react-native'

import { Button } from '@/components/ui/base/Button'
import { formatBoardTransport } from '@/lib/boardTransport'
import { useTransportDetection } from '@/hooks/useTransportDetection'
import { theme } from '@/constants/theme'

export default function DetectTransportScreen() {
  const { boardId } = useLocalSearchParams<{ boardId: string }>()
  const detection = useTransportDetection(boardId)

  const handleConfirm = async () => {
    if (await detection.confirm()) router.back()
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        {detection.phase === 'detecting' ? (
          <View style={styles.centered}>
            <ActivityIndicator color={theme.wheel.color} />
            <Text style={styles.statusText}>Probing direct and CAN transports…</Text>
          </View>
        ) : null}

        {detection.phase === 'failed' ? (
          <View style={styles.centered}>
            <WarningCircleIcon size={40} color={theme.error.text} weight="duotone" />
            <Text style={styles.title}>No working transport</Text>
            <Text style={styles.statusText}>
              Detection found no Board Transport that returns telemetry. Nothing was saved.
            </Text>
          </View>
        ) : null}

        {detection.phase === 'picking' ? (
          <View style={styles.list}>
            <Text style={styles.title}>
              {detection.candidates.length === 1 ? 'Confirm transport' : 'Pick a transport'}
            </Text>
            {detection.candidates.map((candidate) => {
              const isSelected = candidate === detection.selected
              return (
                <Pressable
                  key={String(candidate)}
                  style={[styles.option, isSelected && styles.optionSelected]}
                  onPress={() => detection.select(candidate)}
                  testID={`detect-transport-option-${candidate}`}
                >
                  {isSelected ? (
                    <CheckCircleIcon size={22} color={theme.wheel.color} weight="fill" />
                  ) : (
                    <CircleIcon size={22} color={theme.neutral.textMuted} weight="regular" />
                  )}
                  <Text style={styles.optionLabel}>{formatBoardTransport(candidate)}</Text>
                </Pressable>
              )
            })}
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        {detection.phase === 'failed' ? (
          <Button label="Retry" onPress={detection.retry} testID="detect-transport-retry" />
        ) : (
          <Button
            label="Confirm"
            onPress={handleConfirm}
            disabled={detection.phase !== 'picking' || detection.selected == null}
            loading={detection.saving}
            testID="detect-transport-confirm"
          />
        )}
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.neutral.bg,
  },
  content: {
    flexGrow: 1,
    padding: 16,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 24,
  },
  list: {
    gap: 8,
  },
  title: {
    color: theme.neutral.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  statusText: {
    color: theme.neutral.textSecondary,
    fontSize: 14,
    textAlign: 'center',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.neutral.border,
    backgroundColor: theme.neutral.surface,
  },
  optionSelected: {
    borderColor: theme.wheel.color,
  },
  optionLabel: {
    color: theme.neutral.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    padding: 16,
  },
})
