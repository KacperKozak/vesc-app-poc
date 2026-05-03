import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert } from 'react-native'
import { router } from 'expo-router'
import { PencilSimpleIcon, PowerIcon, StarIcon, TrashIcon } from 'phosphor-react-native'
import { useShallow } from 'zustand/react/shallow'

import { useBoardStore } from '@/store/boardStore'
import { useBleStore } from '@/store/bleStore'
import { usePermissions } from '@/ble/usePermissions'
import { routes } from '@/navigation/routes'
import type { BoardMenuItem } from '@/components/BoardMenu'
import type { RecordingInfo } from '@/store/bleStore'

const SCAN_WATCHDOG_MS = 10_000

export function useBoardConnection() {
  const { boards, activeBoardId, setActiveBoard, starBoard } = useBoardStore(
    useShallow((s) => ({
      boards: s.boards,
      activeBoardId: s.activeBoardId,
      setActiveBoard: s.setActiveBoard,
      starBoard: s.starBoard,
    })),
  )
  const {
    status: bleStatus,
    sessionMode,
    devices,
    recordings,
    connectedId,
    recordDebugSession,
    loadRecordings,
    startScan,
    stopScan,
    connect,
    disconnect,
    replayRecording,
    deleteRecording,
    setRecordDebugSession,
  } = useBleStore(
    useShallow((s) => ({
      status: s.status,
      sessionMode: s.sessionMode,
      devices: s.devices,
      recordings: s.recordings,
      connectedId: s.connectedId,
      recordDebugSession: s.recordDebugSession,
      loadRecordings: s.loadRecordings,
      startScan: s.startScan,
      stopScan: s.stopScan,
      connect: s.connect,
      disconnect: s.disconnect,
      replayRecording: s.replayRecording,
      deleteRecording: s.deleteRecording,
      setRecordDebugSession: s.setRecordDebugSession,
    })),
  )
  const { status: permStatus } = usePermissions()
  const [scanEnabled, setScanEnabled] = useState(true)
  const connectingRef = useRef(false)

  const activeBoard = boards.find((b) => b.id === activeBoardId)
  const activeReplay =
    sessionMode === 'replay' && connectedId
      ? recordings.find((r) => r.path === connectedId)
      : undefined
  const replayBoardName = activeReplay
    ? `${activeReplay.deviceName} (${new Date(activeReplay.startedAt).toLocaleString()})`
    : null

  // Start scanning when conditions align
  useEffect(() => {
    if (!scanEnabled) return
    if (permStatus !== 'granted') return
    if (!activeBoard?.bleId) return
    if (bleStatus !== 'idle') return
    connectingRef.current = false
    startScan()
  }, [scanEnabled, permStatus, activeBoard?.bleId, bleStatus, startScan])

  useEffect(() => {
    if (bleStatus === 'error' || bleStatus === 'idle') {
      connectingRef.current = false
    }
  }, [bleStatus])

  // Reset on board change or unmount
  useEffect(() => {
    setScanEnabled(true)
    connectingRef.current = false
    return () => {
      stopScan()
      void disconnect()
    }
  }, [activeBoardId, disconnect, stopScan])

  // Auto-connect when board appears in scan results
  useEffect(() => {
    if (!activeBoard?.bleId) return
    if (bleStatus !== 'scanning') return
    if (connectingRef.current) return
    const match = devices.find((d) => d.id === activeBoard.bleId)
    if (!match) return
    connectingRef.current = true
    stopScan()
    void connect(match.id, activeBoard.name)
  }, [activeBoard?.bleId, activeBoard?.name, bleStatus, connect, devices, stopScan])

  // Android BLE scans can stall after adapter/GATT errors without reporting onScanFailed.
  useEffect(() => {
    if (bleStatus !== 'scanning') return
    const timer = setTimeout(() => {
      const status = useBleStore.getState().status
      if (status === 'scanning') startScan()
    }, SCAN_WATCHDOG_MS)
    return () => clearTimeout(timer)
  }, [bleStatus, devices.length, startScan])

  useEffect(() => {
    void loadRecordings()
  }, [loadRecordings])

  const menuItems = useMemo<BoardMenuItem[]>(() => {
    const items: BoardMenuItem[] = []
    if (activeBoard && !activeReplay) {
      items.push({
        label: 'Edit Board',
        icon: PencilSimpleIcon,
        onPress: () =>
          router.push({ pathname: routes.addBoardDetails, params: { boardId: activeBoard.id } }),
      })
    }
    if (activeBoard && !activeBoard.isStarred && !activeReplay) {
      items.push({
        label: 'Make main',
        icon: StarIcon,
        onPress: () => starBoard(activeBoard.id),
      })
    }
    if (bleStatus === 'connected' || bleStatus === 'connecting') {
      items.push({
        label: activeReplay ? 'Stop' : 'Disconnect',
        icon: PowerIcon,
        onPress: () => {
          setScanEnabled(false)
          void disconnect()
        },
      })
      if (activeReplay) {
        items.push({
          label: 'Remove recording',
          icon: TrashIcon,
          destructive: true,
          onPress: () =>
            Alert.alert(
              'Remove Recording',
              `Remove "${activeReplay.fileName}"? This cannot be undone.`,
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Remove',
                  style: 'destructive',
                  onPress: () => {
                    void disconnect().then(() => deleteRecording(activeReplay))
                  },
                },
              ],
            ),
        })
      }
    }
    return items
  }, [activeBoard, activeReplay, bleStatus, deleteRecording, disconnect, starBoard])

  const handleSelectBoard = useCallback((id: string) => setActiveBoard(id), [setActiveBoard])

  const handleAddBoard = useCallback(() => {
    router.push(routes.addBoardScan)
  }, [])

  const handleReplay = useCallback(
    (recording: RecordingInfo) => {
      setScanEnabled(false)
      void replayRecording(recording)
    },
    [replayRecording],
  )

  const handleStopScan = useCallback(() => {
    setScanEnabled(false)
    stopScan()
  }, [stopScan])

  const handleRetryConnect = useCallback(() => {
    connectingRef.current = false
    setScanEnabled(true)
    startScan()
  }, [startScan])

  return {
    boards,
    activeBoard,
    activeBoardId,
    replayBoardName,
    bleStatus,
    recordings,
    recordDebugSession,
    menuItems,
    handleSelectBoard,
    handleAddBoard,
    handleReplay,
    handleStopScan,
    handleRetryConnect,
    setRecordDebugSession,
  }
}
