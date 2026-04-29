import { useCallback } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Record, StopCircle } from 'phosphor-react-native'
import { useShallow } from 'zustand/react/shallow'

import { useBoardStore } from '@/store/boardStore'
import { useBleStore } from '@/store/bleStore'

export function RecordFAB() {
  const activeBoard = useBoardStore((s) => s.boards.find((b) => b.id === s.activeBoardId))
  const { recording, start, stop } = useBleStore(
    useShallow((s) => ({
      recording: s.telemetryRecordingEnabled,
      start: s.startTelemetryRecording,
      stop: s.stopTelemetryRecording,
    })),
  )

  const toggle = useCallback(() => {
    if (recording) {
      stop()
    } else {
      start({
        deviceId: activeBoard?.bleId ?? activeBoard?.id ?? null,
        deviceName: activeBoard?.name ?? null,
      })
    }
  }, [activeBoard?.bleId, activeBoard?.id, activeBoard?.name, recording, start, stop])

  return (
    <View style={styles.wrapper} pointerEvents="box-none">
      <Pressable style={[styles.fab, recording && styles.fabActive]} onPress={toggle}>
        {recording ? (
          <StopCircle size={22} color="#052e16" weight="fill" />
        ) : (
          <Record size={22} color="#f1f5f9" weight="fill" />
        )}
        <Text style={[styles.label, recording && styles.labelActive]}>
          {recording ? 'REC' : 'REC'}
        </Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    bottom: 16,
    right: 16,
  },
  fab: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    paddingHorizontal: 18,
    borderRadius: 24,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  fabActive: {
    backgroundColor: '#22c55e',
    borderColor: '#16a34a',
  },
  label: {
    color: '#f1f5f9',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
  },
  labelActive: {
    color: '#052e16',
  },
})
