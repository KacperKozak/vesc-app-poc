import { useEffect, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { CaretDownIcon, GearSixIcon } from 'phosphor-react-native'
import { router } from 'expo-router'

import { BoardMenu, type BoardMenuItem } from '@/components/BoardMenu'
import { BoardSelectorSheet } from '@/components/BoardSelectorSheet'
import { VibeWheelLogo } from '@/components/VibeWheelLogo'
import { routes } from '@/navigation/routes'
import type { Board } from '@/store/boardStore'
import type { RecordingInfo } from '@/store/bleStore'

interface TopBarProps {
  boards: Board[]
  activeBoardId: string | null
  activeBoard: Board | undefined
  replayBoardName: string | null
  recordings: RecordingInfo[]
  recordDebugSession: boolean
  inlineItems: BoardMenuItem[]
  menuItems: BoardMenuItem[]
  onSelectBoard: (id: string) => void
  onAddBoard: () => void
  onReplay: (recording: RecordingInfo) => void
  onToggleRecordDebug: () => void
}

export function TopBar({
  boards,
  activeBoardId,
  activeBoard,
  replayBoardName,
  recordings,
  recordDebugSession,
  inlineItems,
  menuItems,
  onSelectBoard,
  onAddBoard,
  onReplay,
  onToggleRecordDebug,
}: TopBarProps) {
  const [selectorOpen, setSelectorOpen] = useState(false)

  const displayName = replayBoardName ?? activeBoard?.name ?? 'No board'

  return (
    <View style={styles.container}>
      <VibeWheelLogo size={32} />
      <Pressable style={styles.selector} onPress={() => setSelectorOpen(true)}>
        <View style={styles.selectorContent}>
          <Text style={styles.selectorText} numberOfLines={1}>
            {displayName}
          </Text>
          <CaretDownIcon size={12} color="#6b7280" weight="bold" />
        </View>
      </Pressable>

      <BoardMenu items={inlineItems} />

      <JsLagProbe />

      <BoardMenu items={menuItems} />

      <Pressable style={styles.iconBtn} onPress={() => router.push(routes.settings)}>
        <GearSixIcon size={20} color="#94a3b8" weight="light" />
      </Pressable>

      <BoardSelectorSheet
        visible={selectorOpen}
        boards={boards}
        activeBoardId={activeBoardId}
        recordings={recordings}
        recordDebugSession={recordDebugSession}
        onClose={() => setSelectorOpen(false)}
        onSelectBoard={(id) => {
          onSelectBoard(id)
          setSelectorOpen(false)
        }}
        onAddBoard={() => {
          setSelectorOpen(false)
          onAddBoard()
        }}
        onReplay={(recording) => {
          setSelectorOpen(false)
          onReplay(recording)
        }}
        onToggleRecordDebug={onToggleRecordDebug}
      />
    </View>
  )
}

function JsLagProbe() {
  const samplesRef = useRef<number[]>([])
  const [maxLagMs, setMaxLagMs] = useState(0)

  useEffect(() => {
    let expectedAt = Date.now() + 250
    const interval = setInterval(() => {
      const now = Date.now()
      const lag = Math.max(0, now - expectedAt)
      expectedAt = now + 250

      const samples = samplesRef.current
      samples.push(lag)
      while (samples.length > 20) samples.shift()

      const nextMax = Math.round(Math.max(...samples))
      setMaxLagMs(nextMax)
    }, 250)

    return () => clearInterval(interval)
  }, [])

  const color = maxLagMs > 250 ? '#f87171' : maxLagMs > 80 ? '#facc15' : '#4ade80'

  return (
    <View style={[styles.lagProbe, { borderColor: color }]}>
      <Text style={[styles.lagText, { color }]}>JS {maxLagMs}ms</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#0f1729',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    gap: 8,
  },
  selector: {
    flex: 1,
    minWidth: 0,
  },
  selectorContent: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 8,
  },
  selectorText: {
    flex: 1,
    color: '#f1f5f9',
    fontSize: 15,
    fontWeight: '700',
  },
  iconBtn: {
    padding: 6,
  },
  lagProbe: {
    minWidth: 64,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: '#020617',
  },
  lagText: {
    fontSize: 11,
    fontWeight: '800',
  },
})
