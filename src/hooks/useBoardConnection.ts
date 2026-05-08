import { useCallback, useMemo } from 'react'
import { router } from 'expo-router'
import { PencilSimpleIcon, PowerIcon, StarIcon } from 'phosphor-react-native'
import { useShallow } from 'zustand/react/shallow'

import { useBoardStore } from '@/store/boardStore'
import { useBleStore } from '@/store/bleStore'
import { routes } from '@/navigation/routes'
import type { BoardMenuItem } from '@/components/BoardMenu'

function isBoardBusy(status: string): boolean {
  return (
    status === 'connecting' ||
    status === 'discovering' ||
    status === 'subscribing' ||
    status === 'waiting_for_telemetry' ||
    status === 'reconnecting' ||
    status === 'disconnecting'
  )
}

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
    nativeStateReady,
    recordDebugSession,
    stopScan,
    connect,
    disconnect,
    setSelectedBoard,
    setRecordDebugSession,
  } = useBleStore(
    useShallow((s) => ({
      status: s.status,
      nativeStateReady: s.nativeStateReady,
      recordDebugSession: s.recordDebugSession,
      stopScan: s.stopScan,
      connect: s.connect,
      disconnect: s.disconnect,
      setSelectedBoard: s.setSelectedBoard,
      setRecordDebugSession: s.setRecordDebugSession,
    })),
  )

  const activeBoard = boards.find((b) => b.id === activeBoardId)
  const isSessionActive =
    bleStatus === 'connected' || bleStatus === 'stale' || bleStatus === 'reconnecting'

  const inlineItems = useMemo<BoardMenuItem[]>(() => {
    const items: BoardMenuItem[] = []
    if (activeBoard) {
      items.push({
        label: 'Edit Board',
        icon: PencilSimpleIcon,
        onPress: () =>
          router.push({ pathname: routes.addBoardDetails, params: { boardId: activeBoard.id } }),
      })
    }
    if (isSessionActive) {
      items.push({
        label: 'Disconnect',
        icon: PowerIcon,
        onPress: () => void disconnect(),
      })
    }
    return items
  }, [activeBoard, isSessionActive, disconnect])

  const menuItems = useMemo<BoardMenuItem[]>(() => {
    const items: BoardMenuItem[] = []
    if (activeBoard && !activeBoard.isStarred) {
      items.push({
        label: 'Make main',
        icon: StarIcon,
        onPress: () => void starBoard(activeBoard.id),
      })
    }
    return items
  }, [activeBoard, starBoard])

  const handleSelectBoard = useCallback(
    (id: string) => {
      setActiveBoard(id)
      setSelectedBoard(id)
    },
    [setActiveBoard, setSelectedBoard],
  )

  const handleAddBoard = useCallback(() => {
    router.push(routes.addBoardScan)
  }, [])

  const handleCancel = useCallback(() => {
    const { status } = useBleStore.getState()
    if (isBoardBusy(status)) {
      void disconnect()
    } else {
      stopScan()
    }
  }, [stopScan, disconnect])

  const handleRetryConnect = useCallback(() => {
    if (!activeBoardId) return
    void connect(activeBoardId)
  }, [activeBoardId, connect])

  return {
    boards,
    activeBoard,
    activeBoardId,
    nativeStateReady,
    bleStatus,
    recordDebugSession,
    inlineItems,
    menuItems,
    handleSelectBoard,
    handleAddBoard,
    handleCancel,
    handleRetryConnect,
    setRecordDebugSession,
  }
}
