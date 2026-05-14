import { useCallback, useRef, useState, type RefObject } from 'react'
import { BackHandler, ToastAndroid } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { useShallow } from 'zustand/react/shallow'

import type { CenterMapHandle } from '@/screens/center/CenterMap'
import {
  canMapGestureFocus,
  getCenterOverlayFlags,
  type CenterViewState,
} from '@/screens/center/centerViewState'
import {
  getLatestSession,
  getNextRideSession,
  getPreviousRideSession,
} from '@/screens/center/centerState'
import { useBleStore } from '@/store/bleStore'
import { useHistoryStore, type HistorySession } from '@/store/historyStore'
import { useMapStore } from '@/store/mapStore'
import { type MapStyleKey } from '@/constants/mapStyles'

interface UseCenterScreenControllerArgs {
  mapRef: RefObject<CenterMapHandle | null>
}

export function useCenterScreenController({ mapRef }: UseCenterScreenControllerArgs) {
  const backPressedOnce = useRef(false)
  const [viewState, setViewState] = useState<CenterViewState>('telemetry')
  const [historySheetVisible, setHistorySheetVisible] = useState(false)
  const [historyLoadedOnce, setHistoryLoadedOnce] = useState(false)
  const [mapStyleKey, setMapStyleKey] = useState<MapStyleKey>('onedark')
  const [heading, setHeading] = useState(0)
  const [rotationLocked, setRotationLocked] = useState(false)
  const [perspectiveEnabled, setPerspectiveEnabled] = useState(true)
  const liveLocations = useBleStore((s) => s.liveLocationHistory)
  const {
    sessions,
    selectedSession,
    sessionSamples,
    sessionGpsSamples,
    sessionMarkers,
    loadingSession,
    loading: historyLoading,
    error: historyError,
    loadInitial,
    selectSession,
  } = useHistoryStore(
    useShallow((s) => ({
      sessions: s.sessions,
      selectedSession: s.selectedSession,
      sessionSamples: s.sessionSamples,
      sessionGpsSamples: s.sessionGpsSamples,
      sessionMarkers: s.sessionMarkers,
      loadingSession: s.loadingSession,
      loading: s.loading,
      error: s.error,
      loadInitial: s.loadInitial,
      selectSession: s.selectSession,
    })),
  )
  const { targetLocation, setTargetLocation, clearTargetLocation } = useMapStore(
    useShallow((s) => ({
      targetLocation: s.targetLocation,
      setTargetLocation: s.setTargetLocation,
      clearTargetLocation: s.clearTargetLocation,
    })),
  )

  const flags = getCenterOverlayFlags(viewState)
  const rideActive = flags.showRideReview && !!selectedSession
  const previousRide = getPreviousRideSession(sessions, selectedSession)
  const nextRide = getNextRideSession(sessions, selectedSession)

  const exitMapFocus = useCallback(() => {
    setViewState('telemetry')
    mapRef.current?.recenterLive()
  }, [mapRef])

  const exitRideReview = useCallback(() => {
    void selectSession(null)
    setHistorySheetVisible(false)
    setViewState('telemetry')
    requestAnimationFrame(() => mapRef.current?.recenterLive())
  }, [mapRef, selectSession])

  const enterRideReview = useCallback(async () => {
    if (!historyLoadedOnce) {
      await loadInitial()
      setHistoryLoadedOnce(true)
    }
    const latest = getLatestSession(useHistoryStore.getState().sessions)
    if (latest) {
      await selectSession(latest)
      setViewState('rideReview')
      return
    }
    setViewState('historyEmpty')
  }, [historyLoadedOnce, loadInitial, selectSession])

  const selectRide = useCallback(
    (session: HistorySession) => {
      setHistorySheetVisible(false)
      void selectSession(session)
      setViewState('rideReview')
    },
    [selectSession],
  )

  const handleMapFocus = useCallback(() => {
    if (canMapGestureFocus(viewState)) setViewState('mapFocus')
  }, [viewState])

  useFocusEffect(
    useCallback(() => {
      const handler = BackHandler.addEventListener('hardwareBackPress', () => {
        if (viewState === 'rideReview' || viewState === 'historyEmpty') {
          exitRideReview()
          return true
        }
        if (viewState === 'mapFocus') {
          exitMapFocus()
          return true
        }
        if (backPressedOnce.current) {
          BackHandler.exitApp()
          return true
        }
        backPressedOnce.current = true
        ToastAndroid.show('Press back again to exit', ToastAndroid.SHORT)
        setTimeout(() => {
          backPressedOnce.current = false
        }, 2000)
        return true
      })
      return () => handler.remove()
    }, [exitMapFocus, exitRideReview, viewState]),
  )

  return {
    flags,
    liveLocations,
    rideActive,
    mapStyleKey,
    setMapStyleKey,
    heading,
    setHeading,
    rotationLocked,
    setRotationLocked,
    perspectiveEnabled,
    setPerspectiveEnabled,
    targetLocation,
    setTargetLocation,
    clearTargetLocation,
    sessions,
    selectedSession,
    sessionSamples,
    sessionGpsSamples,
    sessionMarkers,
    previousRide,
    nextRide,
    loadingSession,
    historyLoading,
    historyError,
    historySheetVisible,
    setHistorySheetVisible,
    selectSession,
    enterRideReview,
    exitRideReview,
    selectRide,
    handleMapFocus,
    exitMapFocus,
  }
}
