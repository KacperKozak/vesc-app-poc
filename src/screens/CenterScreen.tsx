import { View, Text, Pressable, StyleSheet } from 'react-native'
import { router } from 'expo-router'

import { TelemetryView } from '@/components/TelemetryView'
import { routes } from '@/navigation/routes'
import type { Board } from '@/db/boards'
import type { RecordingInfo } from '@/store/bleStore'

interface CenterScreenProps {
  bleStatus: string
  activeBoard: Board | undefined
  activeReplay: RecordingInfo | undefined
  onStopScan: () => void
  onRetryConnect: () => void
}

export function CenterScreen({
  bleStatus,
  activeBoard,
  activeReplay,
  onStopScan,
  onRetryConnect,
}: CenterScreenProps) {
  const showTelemetry =
    !!activeBoard?.bleId || bleStatus === 'connected' || bleStatus === 'connecting'

  if (!showTelemetry) {
    return (
      <View style={styles.container}>
        <View style={styles.empty}>
          {activeBoard ? (
            <>
              <Text style={styles.emptyTitle}>{activeBoard.name}</Text>
              <Text style={styles.emptySubtitle}>No device paired</Text>
              <Pressable
                style={styles.settingsButton}
                onPress={() =>
                  router.push({
                    pathname: routes.addBoardDetails,
                    params: { boardId: activeBoard.id },
                  })
                }
              >
                <Text style={styles.settingsButtonText}>Open Settings</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.emptyTitle}>No board added yet</Text>
              <Pressable style={styles.addButton} onPress={() => router.push(routes.addBoardScan)}>
                <Text style={styles.addButtonText}>+ Add your first board</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <TelemetryView />

      {activeBoard && bleStatus === 'scanning' && (
        <ConnectionBar
          variant="scanning"
          text={`Searching for ${activeBoard.name}`}
          buttonText="Stop"
          onPress={onStopScan}
        />
      )}

      {activeBoard && bleStatus === 'idle' && activeBoard.bleId && (
        <ConnectionBar
          variant="warning"
          text="Board not connected"
          buttonText="Connect"
          onPress={onRetryConnect}
        />
      )}

      {activeBoard && bleStatus === 'error' && activeBoard.bleId && (
        <ConnectionBar
          variant="error"
          text="Connection failed"
          buttonText="Retry"
          onPress={onRetryConnect}
        />
      )}
    </View>
  )
}

function ConnectionBar({
  variant,
  text,
  buttonText,
  onPress,
}: {
  variant: 'scanning' | 'warning' | 'error'
  text: string
  buttonText: string
  onPress: () => void
}) {
  return (
    <View style={[styles.bar, barVariants[variant]]}>
      <Text style={[styles.barText, textVariants[variant]]}>{text}</Text>
      <Pressable style={[styles.barButton, buttonVariants[variant]]} onPress={onPress}>
        <Text style={styles.barButtonText}>{buttonText}</Text>
      </Pressable>
    </View>
  )
}

const barVariants = StyleSheet.create({
  scanning: { backgroundColor: '#0c1a2e', borderWidth: 1, borderColor: '#1e40af' },
  warning: { backgroundColor: '#451a03', borderWidth: 1, borderColor: '#92400e' },
  error: { backgroundColor: '#1e293b' },
})

const textVariants = StyleSheet.create({
  scanning: { color: '#60a5fa' },
  warning: { color: '#fbbf24' },
  error: { color: '#94a3b8' },
})

const buttonVariants = StyleSheet.create({
  scanning: { backgroundColor: '#1d4ed8' },
  warning: { backgroundColor: '#b45309' },
  error: { backgroundColor: '#334155' },
})

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyTitle: {
    color: '#94a3b8',
    fontSize: 16,
    textAlign: 'center',
  },
  emptySubtitle: {
    color: '#64748b',
    fontSize: 13,
    textAlign: 'center',
  },
  addButton: {
    marginTop: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: '#3b82f6',
    borderRadius: 10,
  },
  addButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  settingsButton: {
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 28,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  settingsButtonText: {
    color: '#94a3b8',
    fontWeight: '600',
    fontSize: 14,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 12,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    gap: 12,
  },
  barText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  barButton: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
  },
  barButtonText: {
    color: '#f1f5f9',
    fontSize: 13,
    fontWeight: '700',
  },
})
