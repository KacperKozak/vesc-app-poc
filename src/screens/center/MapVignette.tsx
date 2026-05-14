import { StyleSheet, View } from 'react-native'
import Svg, { Defs, Rect, RadialGradient, LinearGradient, Stop } from 'react-native-svg'

interface MapVignetteProps {
  visible: boolean
}

export function MapVignette({ visible }: MapVignetteProps) {
  if (!visible) return null

  return (
    <View pointerEvents="none" style={styles.wrap}>
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <RadialGradient id="map-vignette" cx="50%" cy="50%" rx="68%" ry="62%">
            <Stop offset="0%" stopColor="#0f172a" stopOpacity="0" />
            <Stop offset="40%" stopColor="#0f172a" stopOpacity="0.2" />
            <Stop offset="68%" stopColor="#0f172a" stopOpacity="0.62" />
            <Stop offset="100%" stopColor="#0f172a" stopOpacity="0.94" />
          </RadialGradient>
          <LinearGradient id="map-vignette-top" x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0%" stopColor="#0f172a" stopOpacity="0.9" />
            <Stop offset="50%" stopColor="#0f172a" stopOpacity="0.46" />
            <Stop offset="100%" stopColor="#0f172a" stopOpacity="0" />
          </LinearGradient>
          <LinearGradient id="map-vignette-bottom" x1="0%" y1="100%" x2="0%" y2="0%">
            <Stop offset="0%" stopColor="#0f172a" stopOpacity="0.96" />
            <Stop offset="40%" stopColor="#0f172a" stopOpacity="0.7" />
            <Stop offset="100%" stopColor="#0f172a" stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#map-vignette)" />
        <Rect x="0" y="0" width="100%" height="34%" fill="url(#map-vignette-top)" />
        <Rect x="0" y="60%" width="100%" height="40%" fill="url(#map-vignette-bottom)" />
      </Svg>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 4,
  },
})
