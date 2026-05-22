import { useMemo } from 'react'
import { StyleSheet, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { withSpring, withTiming, type SharedValue } from 'react-native-reanimated'

interface MapRevealGestureProps {
  progress: SharedValue<number>
  dragOpacity: SharedValue<number>
  onPan: (deltaX: number, deltaY: number, animationDuration?: number) => void
  onReveal: () => void
  onFinish: (revealed: boolean, accumulatedX?: number, accumulatedY?: number) => void
}

const REVEAL_DISTANCE_DP = 190
const RESISTANCE_AT_BREAK = 0.28
const BREAK_RELEASE_MS = 100
const FADE_TIMING = { duration: 260 } as const
const REVEAL_SPRING = {
  damping: 18,
  stiffness: 160,
  mass: 0.8,
} as const

function createMapRevealGesture({
  progress,
  dragOpacity,
  onPan,
  onReveal,
  onFinish,
}: MapRevealGestureProps) {
  let completed = false
  let appliedX = 0
  let appliedY = 0

  return Gesture.Pan()
    .runOnJS(true)
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
      // cancel any in-flight camera animations by issuing a no-op immediate pan
      // this calls the host `onPan` with zero delta and `0` duration which
      // upstream `previewPanBy` treats as an immediate interrupt.
      // Prevents restore/setCamera animations from conflicting with new drags.
      try {
        onPan(0, 0, 0)
      } catch (e) {
        // swallow - onPan is provided by parent and may be synchronous
      }
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
      const nextProgress = Math.min(1, distance / REVEAL_DISTANCE_DP)
      const easedProgress = nextProgress * nextProgress
      dragOpacity.value = nextProgress

      if (completed) {
        const deltaX = event.translationX - appliedX
        const deltaY = event.translationY - appliedY
        appliedX = event.translationX
        appliedY = event.translationY
        onPan(deltaX, deltaY)
        return
      }

      if (distance >= REVEAL_DISTANCE_DP) {
        completed = true
        progress.value = 1
        dragOpacity.value = 1
        const panGain = 1 - RESISTANCE_AT_BREAK * easedProgress
        const nextAppliedX = event.translationX * panGain
        const nextAppliedY = event.translationY * panGain
        const deltaX = nextAppliedX - appliedX
        const deltaY = nextAppliedY - appliedY
        appliedX = event.translationX
        appliedY = event.translationY
        // animate the final break transition so the last shift is visible
        onPan(deltaX, deltaY, BREAK_RELEASE_MS)
        onReveal()
        return
      }

      const panGain = 1 - RESISTANCE_AT_BREAK * easedProgress
      const nextAppliedX = event.translationX * panGain
      const nextAppliedY = event.translationY * panGain
      const deltaX = nextAppliedX - appliedX
      const deltaY = nextAppliedY - appliedY
      appliedX = nextAppliedX
      appliedY = nextAppliedY
      progress.value = easedProgress
      onPan(deltaX, deltaY)
    })
    .onFinalize(() => {
      if (!completed) {
        progress.value = withSpring(0, REVEAL_SPRING)
        dragOpacity.value = withTiming(0, FADE_TIMING)
      }
      completed = false
      appliedX = 0
      appliedY = 0
      onFinish(completed)
    })
}

export function MapRevealGesture({
  progress,
  dragOpacity,
  onPan,
  onReveal,
  onFinish,
}: MapRevealGestureProps) {
  'use no memo'
  const gesture = useMemo(
    () => createMapRevealGesture({ progress, dragOpacity, onPan, onReveal, onFinish }),
    [dragOpacity, onFinish, onPan, onReveal, progress],
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
