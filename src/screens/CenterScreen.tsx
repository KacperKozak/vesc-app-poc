import { useRef, useState } from 'react'
import { ActivityIndicator, View, Text, Pressable, StyleSheet } from 'react-native'
import { router } from 'expo-router'
import { ArrowLeftIcon } from 'phosphor-react-native'
import { useShallow } from 'zustand/react/shallow'

import { CenterMap, type CenterMapHandle } from '@/screens/center/CenterMap'
import { TopBar } from '@/screens/center/TopBar'
import { LiveHud } from '@/screens/center/LiveHud'
import { BottomTelemetryStrip } from '@/screens/center/BottomTelemetryStrip'
import { canShowBaseOverlays } from '@/screens/center/centerState'
import { FloatingBar } from '@/components/FloatingBar'
import { MapControls } from '@/components/map/MapControls'
import { MapStyleSwitch } from '@/components/map/MapStyleSwitch'
import { routes } from '@/navigation/routes'
import type { Board } from '@/store/boardStore'
import { useBleStore } from '@/store/bleStore'
import { useMapStore } from '@/store/mapStore'
import { type MapStyleKey } from '@/constants/mapStyles'

interface CenterScreenProps {
  activeBoard: Board | undefined
  activeBoardId: string | null
  boards: Board[]
  boardsLoaded: boolean
  bleStatus: string
  recordDebugSession: boolean
  onStopScan: () => void
  onRetryConnect: () => void
  onSelectBoard: (id: string) => void
  onAddBoard: () => void
  onToggleRecordDebug: () => void
}

export function CenterScreen({
  activeBoard,
  activeBoardId,
  boards,
  boardsLoaded,
  bleStatus,
  recordDebugSession,
  onStopScan,
  onRetryConnect,
  onSelectBoard,
  onAddBoard,
  onToggleRecordDebug,
}: CenterScreenProps) {
  const mapRef = useRef<CenterMapHandle>(null)
  const [mapFocused, setMapFocused] = useState(false)
  const [mapStyleKey, setMapStyleKey] = useState<MapStyleKey>('onedark')
  const [heading, setHeading] = useState(0)
  const [rotationLocked, setRotationLocked] = useState(false)
  const [perspectiveEnabled, setPerspectiveEnabled] = useState(true)
  const liveLocations = useBleStore((s) => s.liveLocationHistory)
  const { targetLocation, setTargetLocation, clearTargetLocation } = useMapStore(
    useShallow((s) => ({
      targetLocation: s.targetLocation,
      setTargetLocation: s.setTargetLocation,
      clearTargetLocation: s.clearTargetLocation,
    })),
  )
  const hasBle = !!activeBoard?.bleId
  const showBaseOverlays = canShowBaseOverlays({ mapFocused, hasRide: false })

  const exitMapFocus = () => {
    setMapFocused(false)
    mapRef.current?.recenterLive()
  }

  if (!boardsLoaded) {
    return (
      <View style={styles.container}>
        <View style={styles.empty}>
          <ActivityIndicator size="small" color="#3b82f6" />
          <Text style={styles.emptySubtitle}>Loading boards...</Text>
        </View>
      </View>
    )
  }

  if (!hasBle) {
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
      <CenterMap
        ref={mapRef}
        liveLocations={liveLocations}
        rideGpsSamples={[]}
        rideMarkers={[]}
        rideActive={false}
        mapStyleKey={mapStyleKey}
        rotationLocked={rotationLocked}
        perspectiveEnabled={perspectiveEnabled}
        onPerspectiveChange={setPerspectiveEnabled}
        onHeadingChange={setHeading}
        onMapFocus={() => setMapFocused(true)}
        onLongPressTarget={setTargetLocation}
        targetLocation={targetLocation}
        onClearTarget={clearTargetLocation}
      />
      <LiveHud visible={showBaseOverlays} />
      <BottomTelemetryStrip visible={showBaseOverlays} />
      <TopBar
        visible={showBaseOverlays}
        boards={boards}
        activeBoardId={activeBoardId}
        activeBoard={activeBoard}
        bleStatus={bleStatus}
        recordDebugSession={recordDebugSession}
        onSelectBoard={onSelectBoard}
        onAddBoard={onAddBoard}
        onToggleRecordDebug={onToggleRecordDebug}
        onDisconnect={onStopScan}
        onRetryConnect={onRetryConnect}
      />
      {showBaseOverlays && (
        <FloatingBar
          bleStatus={bleStatus}
          activeBoard={activeBoard}
          onStopScan={onStopScan}
          onRetryConnect={onRetryConnect}
        />
      )}
      {mapFocused && (
        <>
          <Pressable style={styles.backButton} onPress={exitMapFocus}>
            <ArrowLeftIcon size={20} color="#f8fafc" weight="bold" />
          </Pressable>
          <MapControls
            heading={heading}
            rotationLocked={rotationLocked}
            perspectiveEnabled={perspectiveEnabled}
            followGps={false}
            showClearTarget={!!targetLocation}
            onResetRotation={() => mapRef.current?.resetRotation()}
            onToggleRotationLock={() => setRotationLocked((prev) => !prev)}
            onTogglePerspective={() => mapRef.current?.togglePerspective()}
            onRecenter={exitMapFocus}
            onClearTarget={clearTargetLocation}
          />
          <MapStyleSwitch activeKey={mapStyleKey} onSelect={setMapStyleKey} />
        </>
      )}
    </View>
  )
}

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
  backButton: {
    position: 'absolute',
    top: 44,
    left: 12,
    zIndex: 30,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.28)',
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
  },
})
