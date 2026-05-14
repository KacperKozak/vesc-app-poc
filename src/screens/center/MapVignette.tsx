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
            <Stop offset="40%" stopColor="#0f172a" stopOpacity="0.08" />
            <Stop offset="68%" stopColor="#0f172a" stopOpacity="0.28" />
            <Stop offset="100%" stopColor="#0f172a" stopOpacity="0.55" />
          </RadialGradient>
          <LinearGradient id="map-vignette-top" x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0%" stopColor="#0f172a" stopOpacity="0.55" />
            <Stop offset="50%" stopColor="#0f172a" stopOpacity="0.18" />
            <Stop offset="100%" stopColor="#0f172a" stopOpacity="0" />
          </LinearGradient>
          <LinearGradient id="map-vignette-bottom" x1="0%" y1="100%" x2="0%" y2="0%">
            <Stop offset="0%" stopColor="#0f172a" stopOpacity="0.98" />
            <Stop offset="35%" stopColor="#0f172a" stopOpacity="0.82" />
            <Stop offset="65%" stopColor="#0f172a" stopOpacity="0.38" />
            <Stop offset="100%" stopColor="#0f172a" stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#map-vignette)" />
        <Rect x="0" y="0" width="100%" height="30%" fill="url(#map-vignette-top)" />
        <Rect x="0" y="44%" width="100%" height="56%" fill="url(#map-vignette-bottom)" />
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
