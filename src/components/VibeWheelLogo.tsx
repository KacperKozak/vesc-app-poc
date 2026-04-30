import { View, Text, StyleSheet } from 'react-native'

export function VibeWheelLogo({ size = 32 }: { size?: number }) {
  const fontSize = Math.round(size * 0.38)
  const subSize = Math.round(size * 0.22)

  return (
    <View style={styles.root}>
      <Text style={[styles.main, { fontSize }]}>VIBE</Text>
      <Text style={[styles.sub, { fontSize: subSize }]}>WHEEL</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  main: {
    color: '#f1f5f9',
    fontWeight: '900',
    letterSpacing: 1.5,
    lineHeight: undefined,
  },
  sub: {
    color: '#3b82f6',
    fontWeight: '800',
    letterSpacing: 2,
    marginTop: -2,
  },
})
