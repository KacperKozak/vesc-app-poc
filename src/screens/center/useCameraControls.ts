import type { Camera as CameraRef } from '@rnmapbox/maps'
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'

import { MAP_DEFAULTS } from '@/constants/mapStyles'
import { distanceMeters, getBounds, zoomLevelForDelta } from '@/helpers/mapGeometry'

const MERCATOR_TILE_SIZE = 512
const MAX_MERCATOR_LATITUDE = 85.05112878
const MIN_ZOOM = 0
const HISTORY_PREVIEW_ZOOM = 11.8
const HISTORY_PREVIEW_BOTTOM_PADDING = 300
const HISTORY_PREVIEW_SIDE_PADDING = 72
const HISTORY_PREVIEW_TOP_PADDING = 120
const HISTORY_DYNAMIC_FULL_DISTANCE_M = 80_000
const HISTORY_DYNAMIC_MAX_EXTRA_PADDING = 220
const HISTORY_DYNAMIC_MAX_EXTRA_DURATION_MS = 450
const HISTORY_DYNAMIC_MAX_ZOOM_OUT = 2.4

export interface CameraSnapshot {
  centerCoordinate: [number, number]
  zoomLevel: number
  heading: number
  pitch: number
}

export interface HistoryPreviewTarget {
  latitude: number
  longitude: number
  minLatitude: number | null
  maxLatitude: number | null
  minLongitude: number | null
  maxLongitude: number | null
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function longitudeToWorldX(longitude: number, worldSize: number) {
  return ((longitude + 180) / 360) * worldSize
}

function latitudeToWorldY(latitude: number, worldSize: number) {
  const clampedLatitude = clamp(latitude, -MAX_MERCATOR_LATITUDE, MAX_MERCATOR_LATITUDE)
  const sinLatitude = Math.sin((clampedLatitude * Math.PI) / 180)
  return (0.5 - Math.log((1 + sinLatitude) / (1 - sinLatitude)) / (4 * Math.PI)) * worldSize
}

function worldXToLongitude(x: number, worldSize: number) {
  return (x / worldSize) * 360 - 180
}

function worldYToLatitude(y: number, worldSize: number) {
  const mercatorY = 0.5 - y / worldSize
  return (180 / Math.PI) * (2 * Math.atan(Math.exp(mercatorY * 2 * Math.PI)) - Math.PI / 2)
}

function getCameraForScreenPan(baseCamera: CameraSnapshot, totalX: number, totalY: number) {
  const worldSize = MERCATOR_TILE_SIZE * 2 ** baseCamera.zoomLevel
  const [longitude, latitude] = baseCamera.centerCoordinate
  const headingRadians = (-baseCamera.heading * Math.PI) / 180
  const worldDeltaX = totalX * Math.cos(headingRadians) - totalY * Math.sin(headingRadians)
  const worldDeltaY = totalX * Math.sin(headingRadians) + totalY * Math.cos(headingRadians)
  const centerX = longitudeToWorldX(longitude, worldSize) - worldDeltaX
  const centerY = latitudeToWorldY(latitude, worldSize) - worldDeltaY

  return {
    ...baseCamera,
    centerCoordinate: [
      worldXToLongitude(centerX, worldSize),
      clamp(worldYToLatitude(centerY, worldSize), -MAX_MERCATOR_LATITUDE, MAX_MERCATOR_LATITUDE),
    ] as [number, number],
  }
}

export function getPitchForZoom(zoom: number, perspectiveEnabled: boolean) {
  if (!perspectiveEnabled) return 0
  const progress = clamp(
    (zoom - MAP_DEFAULTS.perspectiveMinZoom) /
      (MAP_DEFAULTS.perspectiveMaxZoom - MAP_DEFAULTS.perspectiveMinZoom),
    0,
    1,
  )
  return progress * MAP_DEFAULTS.activePitch
}

function getHistoryPreviewBounds(preview: HistoryPreviewTarget) {
  if (
    preview.minLatitude == null ||
    preview.maxLatitude == null ||
    preview.minLongitude == null ||
    preview.maxLongitude == null ||
    (preview.minLatitude === preview.maxLatitude && preview.minLongitude === preview.maxLongitude)
  ) {
    return null
  }
  return {
    ne: [preview.maxLongitude, preview.maxLatitude] as [number, number],
    sw: [preview.minLongitude, preview.minLatitude] as [number, number],
  }
}

function getHistoryPreviewPlan(jumpDistanceM: number) {
  const progress = clamp(jumpDistanceM / HISTORY_DYNAMIC_FULL_DISTANCE_M, 0, 1)
  const extraPadding = HISTORY_DYNAMIC_MAX_EXTRA_PADDING * progress
  return {
    duration: MAP_DEFAULTS.animationDuration + HISTORY_DYNAMIC_MAX_EXTRA_DURATION_MS * progress,
    progress,
    padding: [
      HISTORY_PREVIEW_TOP_PADDING + extraPadding * 0.5,
      HISTORY_PREVIEW_SIDE_PADDING + extraPadding,
      HISTORY_PREVIEW_BOTTOM_PADDING + extraPadding,
      HISTORY_PREVIEW_SIDE_PADDING + extraPadding,
    ] as [number, number, number, number],
  }
}

interface GpsFix {
  latitude: number
  longitude: number
  timestamp: number
  accuracyM?: number | null
}

interface UseCameraControlsParams {
  ref: React.ForwardedRef<any>
  cameraFix: GpsFix | null
  persistedFallback: [number, number] | null
  perspectiveEnabled: boolean
  historyActive: boolean
  historyPreview: ({ key: string } & HistoryPreviewTarget) | null
  rideRoute: [number, number][]
  onHeadingChange: (heading: number) => void
  onPerspectiveChange: (enabled: boolean) => void
}

export function useCameraControls({
  ref,
  cameraFix,
  persistedFallback,
  perspectiveEnabled,
  historyActive,
  historyPreview,
  rideRoute,
  onHeadingChange,
  onPerspectiveChange,
}: UseCameraControlsParams) {
  const cameraRef = useRef<CameraRef>(null)
  const previewPanBaseRef = useRef<CameraSnapshot | null>(null)
  const previewZoomBaseRef = useRef<CameraSnapshot | null>(null)
  const currentCameraRef = useRef<CameraSnapshot | null>(null)
  const historyPreviewTargetRef = useRef<HistoryPreviewTarget | null>(null)
  const lastCenteredAtRef = useRef<number | null>(null)
  const [followGps, setFollowGps] = useState(true)

  const gpsCamera = useMemo(() => {
    if (!cameraFix) {
      return {
        centerCoordinate: persistedFallback ?? MAP_DEFAULTS.fallbackCoordinate,
        zoomLevel:
          persistedFallback == null
            ? MAP_DEFAULTS.fallbackZoom
            : MAP_DEFAULTS.persistedGpsFallbackZoom,
      }
    }
    const baseDelta =
      cameraFix.accuracyM != null
        ? Math.max(MAP_DEFAULTS.zoomDeltaMinAccuracy, cameraFix.accuracyM / 111_000)
        : MAP_DEFAULTS.zoomDeltaFallback
    return {
      centerCoordinate: [cameraFix.longitude, cameraFix.latitude] as [number, number],
      zoomLevel: zoomLevelForDelta(baseDelta * MAP_DEFAULTS.zoomDeltaMultiplier),
    }
  }, [cameraFix, persistedFallback])

  const getHistoryPreviewCamera = useCallback(
    (coordinate: { latitude: number; longitude: number }) => ({
      centerCoordinate: [coordinate.longitude, coordinate.latitude] as [number, number],
      zoomLevel: HISTORY_PREVIEW_ZOOM,
      heading: 0,
      pitch: getPitchForZoom(HISTORY_PREVIEW_ZOOM, perspectiveEnabled),
      padding: {
        paddingBottom: HISTORY_PREVIEW_BOTTOM_PADDING,
        paddingTop: 0,
        paddingLeft: 0,
        paddingRight: 0,
      },
      animationDuration: MAP_DEFAULTS.animationDuration,
      animationMode: 'easeTo' as const,
    }),
    [perspectiveEnabled],
  )

  const recenterLive = useCallback(
    (options?: { resetPadding?: boolean }) => {
      setFollowGps(true)
      if (!cameraFix) return
      lastCenteredAtRef.current = cameraFix.timestamp
      cameraRef.current?.setCamera({
        ...gpsCamera,
        heading: 0,
        pitch: getPitchForZoom(gpsCamera.zoomLevel, perspectiveEnabled),
        ...(options?.resetPadding
          ? { padding: { paddingBottom: 0, paddingTop: 0, paddingLeft: 0, paddingRight: 0 } }
          : {}),
        animationDuration: MAP_DEFAULTS.animationDuration,
        animationMode: 'easeTo',
      })
      onHeadingChange(0)
    },
    [cameraFix, gpsCamera, onHeadingChange, perspectiveEnabled],
  )

  const fitRide = useCallback(() => {
    if (rideRoute.length < 2) return
    const bounds = getBounds(rideRoute)
    cameraRef.current?.fitBounds(bounds.ne, bounds.sw, [90, 40, 120, 40], 700)
  }, [rideRoute])

  const previewHistorySession = useCallback(
    (preview: HistoryPreviewTarget) => {
      historyPreviewTargetRef.current = preview
      setFollowGps(false)
      const current = currentCameraRef.current
      const jumpDistanceM = current
        ? distanceMeters(
            { longitude: current.centerCoordinate[0], latitude: current.centerCoordinate[1] },
            preview,
          )
        : 0
      const plan = getHistoryPreviewPlan(jumpDistanceM)
      const bounds = getHistoryPreviewBounds(preview)
      if (bounds) {
        cameraRef.current?.fitBounds(bounds.ne, bounds.sw, plan.padding, plan.duration)
      } else {
        cameraRef.current?.setCamera({
          ...getHistoryPreviewCamera(preview),
          zoomLevel: HISTORY_PREVIEW_ZOOM - HISTORY_DYNAMIC_MAX_ZOOM_OUT * plan.progress,
          animationDuration: plan.duration,
        })
      }
      onHeadingChange(0)
    },
    [getHistoryPreviewCamera, onHeadingChange],
  )

  const restorePreviewPan = useCallback(() => {
    setFollowGps(true)
    const restoreCamera = previewPanBaseRef.current ?? gpsCamera
    previewPanBaseRef.current = null
    if (cameraFix) {
      lastCenteredAtRef.current = cameraFix.timestamp
    }
    cameraRef.current?.setCamera({
      ...restoreCamera,
      pitch: getPitchForZoom(restoreCamera.zoomLevel, perspectiveEnabled),
      animationDuration: MAP_DEFAULTS.followAnimationDuration,
      animationMode: 'easeTo',
    })
  }, [cameraFix, gpsCamera, perspectiveEnabled])

  useImperativeHandle(
    ref,
    () => ({
      recenterLive,
      previewHistorySession,
      beginPreviewPan() {
        previewPanBaseRef.current = currentCameraRef.current ?? {
          ...gpsCamera,
          heading: 0,
          pitch: getPitchForZoom(gpsCamera.zoomLevel, perspectiveEnabled),
        }
        setFollowGps(false)
      },
      previewPanBy(deltaX: number, deltaY: number, animationDuration = 0) {
        setFollowGps(false)
        const baseCamera = previewPanBaseRef.current
        if (!baseCamera) return
        cameraRef.current?.setCamera({
          ...getCameraForScreenPan(baseCamera, deltaX, deltaY),
          pitch: getPitchForZoom(baseCamera.zoomLevel, perspectiveEnabled),
          animationMode: 'linearTo',
          animationDuration,
        })
      },
      beginPreviewZoom() {
        previewZoomBaseRef.current = currentCameraRef.current
        setFollowGps(false)
      },
      previewZoomBy(scale: number) {
        const baseCamera = previewZoomBaseRef.current
        if (!baseCamera || scale <= 0) return
        const zoomLevel = clamp(
          baseCamera.zoomLevel + Math.log2(scale),
          MIN_ZOOM,
          MAP_DEFAULTS.maxZoom,
        )
        cameraRef.current?.setCamera({
          ...baseCamera,
          zoomLevel,
          pitch: getPitchForZoom(zoomLevel, perspectiveEnabled),
          animationDuration: 0,
        })
      },
      endPreviewZoom() {
        previewZoomBaseRef.current = null
      },
      restorePreviewPan,
      resetRotation() {
        cameraRef.current?.setCamera({
          heading: 0,
          animationDuration: MAP_DEFAULTS.animationDuration,
          animationMode: 'easeTo',
        })
        onHeadingChange(0)
      },
      togglePerspective() {
        const enabled = !perspectiveEnabled
        onPerspectiveChange(enabled)
        const zoomLevel = currentCameraRef.current?.zoomLevel ?? gpsCamera.zoomLevel
        cameraRef.current?.setCamera({
          pitch: getPitchForZoom(zoomLevel, enabled),
          animationDuration: MAP_DEFAULTS.animationDuration,
          animationMode: 'easeTo',
        })
      },
      setPadding(bottom: number) {
        cameraRef.current?.setCamera({
          padding: { paddingBottom: bottom, paddingTop: 0, paddingLeft: 0, paddingRight: 0 },
          animationDuration: bottom === 0 ? 0 : 300,
          animationMode: 'easeTo',
        })
      },
      zoomToLevel(zoom: number) {
        setFollowGps(false)
        const current = currentCameraRef.current
        cameraRef.current?.setCamera({
          ...(current ? { centerCoordinate: current.centerCoordinate } : {}),
          zoomLevel: zoom,
          pitch: getPitchForZoom(zoom, perspectiveEnabled),
          animationDuration: MAP_DEFAULTS.animationDuration,
          animationMode: 'easeTo',
        })
      },
    }),
    [
      gpsCamera,
      onHeadingChange,
      onPerspectiveChange,
      perspectiveEnabled,
      previewHistorySession,
      recenterLive,
      restorePreviewPan,
    ],
  )

  useEffect(() => {
    if (!cameraFix || !followGps || historyActive) return
    historyPreviewTargetRef.current = null
    if (lastCenteredAtRef.current === cameraFix.timestamp) return
    lastCenteredAtRef.current = cameraFix.timestamp
    cameraRef.current?.setCamera({
      ...gpsCamera,
      pitch: getPitchForZoom(gpsCamera.zoomLevel, perspectiveEnabled),
      animationDuration: MAP_DEFAULTS.followAnimationDuration,
      animationMode: 'easeTo',
    })
  }, [cameraFix, followGps, gpsCamera, historyActive, perspectiveEnabled])

  useEffect(() => {
    if (!historyActive || !historyPreview) return
    const frame = requestAnimationFrame(() => {
      previewHistorySession(historyPreview)
    })
    return () => cancelAnimationFrame(frame)
  }, [historyActive, historyPreview, previewHistorySession])

  useEffect(() => {
    if (!historyActive || rideRoute.length < 2) return
    historyPreviewTargetRef.current = null
    const frame = requestAnimationFrame(fitRide)
    const timer = setTimeout(fitRide, 120)
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(timer)
    }
  }, [fitRide, historyActive, rideRoute.length])

  return {
    cameraRef,
    currentCameraRef,
    gpsCamera,
    followGps,
    setFollowGps,
    getHistoryPreviewCamera,
  }
}
