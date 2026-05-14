import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { RefObject } from 'react'
import { ArrowLeftIcon, ClockCounterClockwiseIcon } from 'phosphor-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { BottomTelemetryStrip, STRIP_CONTENT_HEIGHT } from '@/screens/center/BottomTelemetryStrip'
import { HistoryControls } from '@/screens/center/HistoryControls'
import { HistoryTelemetryPanel } from '@/screens/center/HistoryTelemetryPanel'
import { LiveHud } from '@/screens/center/LiveHud'
import { MapVignette } from '@/screens/center/MapVignette'
import { TopBar } from '@/screens/center/TopBar'
import type { CenterMapHandle } from '@/screens/center/CenterMap'
import { FloatingBar } from '@/components/FloatingBar'
import { HistorySessionSheet } from '@/components/history/HistorySessionSheet'
import { MapControls } from '@/components/map/MapControls'
import { MapStyleSwitch } from '@/components/map/MapStyleSwitch'
import type { Board } from '@/store/boardStore'
import type { HistorySession } from '@/store/historyStore'
import type { TelemetrySample } from '@/store/historyStore'
import type { MapStyleKey } from '@/constants/mapStyles'

interface CenterOverlayFlags {
  showTelemetry: boolean
  showMapFocus: boolean
  showRideReview: boolean
  showHistoryEmpty: boolean
}

interface CenterOverlaysProps {
  flags: CenterOverlayFlags
  mapRef: RefObject<CenterMapHandle | null>
  boards: Board[]
  activeBoardId: string | null
  activeBoard: Board | undefined
  bleStatus: string
  recordDebugSession: boolean
  onStopScan: () => void
  onRetryConnect: () => void
  onSelectBoard: (id: string) => void
  onAddBoard: () => void
  onToggleRecordDebug: () => void
  heading: number
  rotationLocked: boolean
  perspectiveEnabled: boolean
  targetLocation: { latitude: number; longitude: number } | null
  clearTargetLocation: () => void
  mapStyleKey: MapStyleKey
  setMapStyleKey: (key: MapStyleKey) => void
  setRotationLocked: (updater: (prev: boolean) => boolean) => void
  exitMapFocus: () => void
  enterRideReview: () => void
  selectedSession: HistorySession | null
  sessionSamples: TelemetrySample[]
  previousRide: HistorySession | null
  nextRide: HistorySession | null
  loadingSession: boolean
  historyLoading: boolean
  historyError: string | undefined
  sessions: HistorySession[]
  historySheetVisible: boolean
  setHistorySheetVisible: (visible: boolean) => void
  selectSession: (session: HistorySession | null) => Promise<void>
  selectRide: (session: HistorySession) => void
  exitRideReview: () => void
}

export function CenterOverlays({
  flags,
  mapRef,
  boards,
  activeBoardId,
  activeBoard,
  bleStatus,
  recordDebugSession,
  onStopScan,
  onRetryConnect,
  onSelectBoard,
  onAddBoard,
  onToggleRecordDebug,
  heading,
  rotationLocked,
  perspectiveEnabled,
  targetLocation,
  clearTargetLocation,
  mapStyleKey,
  setMapStyleKey,
  setRotationLocked,
  exitMapFocus,
  enterRideReview,
  selectedSession,
  sessionSamples,
  previousRide,
  nextRide,
  loadingSession,
  historyLoading,
  historyError,
  sessions,
  historySheetVisible,
  setHistorySheetVisible,
  selectSession,
  selectRide,
  exitRideReview,
}: CenterOverlaysProps) {
  const insets = useSafeAreaInsets()
  const aboveStripBottom = STRIP_CONTENT_HEIGHT + Math.max(insets.bottom, 6) + 8

  return (
    <>
      {flags.showTelemetry && (
        <>
          <MapVignette visible />
          <LiveHud visible />
          <BottomTelemetryStrip visible />
          <TopBar
            visible
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
          <FloatingBar
            bleStatus={bleStatus}
            activeBoard={activeBoard}
            onStopScan={onStopScan}
            onRetryConnect={onRetryConnect}
            bottomOffset={aboveStripBottom}
          />
          <Pressable
            style={[styles.historyButton, { bottom: aboveStripBottom }]}
            onPress={() => void enterRideReview()}
          >
            <ClockCounterClockwiseIcon size={18} color="#f8fafc" weight="bold" />
          </Pressable>
        </>
      )}

      {flags.showMapFocus && (
        <>
          <Pressable
            style={[styles.backButton, { top: Math.max(insets.top, 8) }]}
            onPress={exitMapFocus}
          >
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

      {flags.showRideReview && selectedSession && (
        <>
          <MapVignette visible />
          <HistoryTelemetryPanel samples={sessionSamples} loading={loadingSession} />
          <HistoryControls
            title={`${new Date(selectedSession.startAtMs).toLocaleString()} · ${
              selectedSession.deviceName
            }`}
            canPrevious={!!previousRide}
            canNext={!!nextRide}
            loading={loadingSession || historyLoading}
            onBack={exitRideReview}
            onPrevious={() => {
              if (previousRide) void selectSession(previousRide)
            }}
            onNext={() => {
              if (nextRide) void selectSession(nextRide)
            }}
            onOpenList={() => setHistorySheetVisible(true)}
          />
        </>
      )}

      {flags.showHistoryEmpty && (
        <HistoryControls
          title="No rides yet"
          canPrevious={false}
          canNext={false}
          loading={false}
          onBack={exitRideReview}
          onPrevious={() => undefined}
          onNext={() => undefined}
          onOpenList={() => setHistorySheetVisible(true)}
        />
      )}

      <HistorySessionSheet
        visible={historySheetVisible}
        sessions={sessions}
        selectedSessionId={selectedSession?.id ?? null}
        onClose={() => setHistorySheetVisible(false)}
        onSelectSession={selectRide}
      />

      {historyError ? (
        <View style={[styles.historyError, { bottom: aboveStripBottom }]}>
          <Text style={styles.historyErrorText} selectable>
            {historyError}
          </Text>
        </View>
      ) : null}
    </>
  )
}

const styles = StyleSheet.create({
  backButton: {
    position: 'absolute',
    left: 10,
    zIndex: 30,
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.28)',
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
  },
  historyButton: {
    position: 'absolute',
    right: 12,
    zIndex: 20,
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.28)',
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
  },
  historyError: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 25,
    borderRadius: 10,
    padding: 10,
    backgroundColor: 'rgba(69, 26, 26, 0.88)',
    borderWidth: 1,
    borderColor: '#7f1d1d',
  },
  historyErrorText: {
    color: '#fecaca',
    fontSize: 12,
    fontWeight: '700',
  },
})
