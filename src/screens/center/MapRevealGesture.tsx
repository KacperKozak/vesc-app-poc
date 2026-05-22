import { useMemo } from 'react'
import { StyleSheet, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { withSpring, withTiming, type SharedValue } from 'react-native-reanimated'

interface MapRevealGestureProps {
  progress: SharedValue<number>
  dragOpacity: SharedValue<number>
  onPanStart: () => void
  onPan: (totalX: number, totalY: number, animationDuration?: number) => void
  onZoomStart: () => void
  onZoom: (scale: number) => void
  onZoomEnd: () => void
  onReveal: () => void
  onFinish: (revealed: boolean, accumulatedX?: number, accumulatedY?: number) => void
}

const REVEAL_DISTANCE_DP = 170
const REVEAL_TOSS_SECONDS = 0.16
const MIN_TOSS_DISTANCE_DP = 34
const RESISTANCE_AT_BREAK = 0.28
const BREAK_RELEASE_MS = 100
const FADE_TIMING = { duration: 260 } as const
const REVEAL_SPRING = {
  damping: 18,
  stiffness: 160,
  mass: 0.8,
} as const

function getProjectedDistance(
  translationX: number,
  translationY: number,
  velocityX: number,
  velocityY: number,
) {
  return Math.hypot(
    translationX + velocityX * REVEAL_TOSS_SECONDS,
    translationY + velocityY * REVEAL_TOSS_SECONDS,
  )
}

function createMapRevealGesture({
  progress,
  dragOpacity,
  onPanStart,
  onPan,
  onZoomStart,
  onZoom,
  onZoomEnd,
  onReveal,
  onFinish,
}: MapRevealGestureProps) {
  let completed = false
  let appliedX = 0
  let appliedY = 0
  let pinching = false

  const pan = Gesture.Pan()
    .runOnJS(true)
    .maxPointers(1)
    .minDistance(4)
    .onTouchesDown(() => {
      completed = false
      appliedX = 0
      appliedY = 0
      progress.value = 0
      dragOpacity.value = 0
    })
    .onBegin(() => {
      completed = false
      appliedX = 0
      appliedY = 0
      progress.value = 0
      dragOpacity.value = 0
      onPanStart()
    })
    .onStart(() => {
      completed = false
      appliedX = 0
      appliedY = 0
      progress.value = 0
      dragOpacity.value = 0
    })
    .onUpdate((event) => {
      const distance = Math.hypot(event.translationX, event.translationY)
      const projectedDistance = getProjectedDistance(
        event.translationX,
        event.translationY,
        event.velocityX,
        event.velocityY,
      )
      const shouldReveal =
        distance >= REVEAL_DISTANCE_DP ||
        (distance >= MIN_TOSS_DISTANCE_DP && projectedDistance >= REVEAL_DISTANCE_DP)
      const nextProgress = Math.min(1, distance / REVEAL_DISTANCE_DP)
      const easedProgress = nextProgress * nextProgress
      dragOpacity.value = nextProgress

      if (completed) {
        appliedX = event.translationX
        appliedY = event.translationY
        onPan(appliedX, appliedY)
        return
      }

      if (shouldReveal) {
        completed = true
        progress.value = 1
        dragOpacity.value = 1
        const panGain = 1 - RESISTANCE_AT_BREAK * easedProgress
        const nextAppliedX = event.translationX * panGain
        const nextAppliedY = event.translationY * panGain
        appliedX = nextAppliedX
        appliedY = nextAppliedY
        // animate the final break transition so the last shift is visible
        onPan(appliedX, appliedY, BREAK_RELEASE_MS)
        onReveal()
        return
      }

      const panGain = 1 - RESISTANCE_AT_BREAK * easedProgress
      const nextAppliedX = event.translationX * panGain
      const nextAppliedY = event.translationY * panGain
      appliedX = nextAppliedX
      appliedY = nextAppliedY
      progress.value = easedProgress
      onPan(appliedX, appliedY)
    })
    .onFinalize(() => {
      const wasCompleted = completed
      if (pinching) {
        completed = false
        appliedX = 0
        appliedY = 0
        return
      }
      if (!completed) {
        progress.value = withSpring(0, REVEAL_SPRING)
        dragOpacity.value = withTiming(0, FADE_TIMING)
      }
      completed = false
      appliedX = 0
      appliedY = 0
      onFinish(wasCompleted)
    })

  const pinch = Gesture.Pinch()
    .runOnJS(true)
    .onBegin(() => {
      pinching = true
      completed = false
      appliedX = 0
      appliedY = 0
      progress.value = 0
      dragOpacity.value = 0
      onZoomStart()
    })
    .onUpdate((event) => {
      onZoom(event.scale)
    })
    .onFinalize(() => {
      pinching = false
      onZoomEnd()
    })

  return Gesture.Simultaneous(pan, pinch)
}

export function MapRevealGesture({
  progress,
  dragOpacity,
  onPanStart,
  onPan,
  onZoomStart,
  onZoom,
  onZoomEnd,
  onReveal,
  onFinish,
}: MapRevealGestureProps) {
  'use no memo'
  const gesture = useMemo(
    () =>
      createMapRevealGesture({
        progress,
        dragOpacity,
        onPanStart,
        onPan,
        onZoomStart,
        onZoom,
        onZoomEnd,
        onReveal,
        onFinish,
      }),
    [dragOpacity, onFinish, onPan, onPanStart, onReveal, onZoom, onZoomEnd, onZoomStart, progress],
  )

  return (
    <GestureDetector gesture={gesture}>
      <View style={styles.hitArea} />
    </GestureDetector>
  )
}

const styles = StyleSheet.create({
  hitArea: {
    ...StyleSheet.absoluteFill,
    zIndex: 5,
    backgroundColor: 'rgba(0,0,0,0.001)',
  },
})
