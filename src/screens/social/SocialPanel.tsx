import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { NearbyRidesSection } from '@/screens/social/NearbyRidesSection'
import { RideStatsSection } from '@/screens/social/RideStatsSection'
import { RiderNameField } from '@/screens/social/RiderNameField'
import { theme } from '@/constants/theme'

export function SocialPanel() {
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <RiderNameField />

        <NearbyRidesSection />
        <Placeholder
          title="Riders"
          body="When you join a group ride, the riders with you appear here."
        />

        <RideStatsSection />
      </ScrollView>
    </SafeAreaView>
  )
}

interface PlaceholderProps {
  title: string
  body: string
}

function Placeholder({ title, body }: PlaceholderProps) {
  return (
    <View style={styles.placeholderSection}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.placeholderCard}>
        <Text style={styles.placeholderText}>{body}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.palette.slate.bg,
  },
  content: {
    padding: 16,
    gap: 20,
  },
  sectionTitle: {
    color: theme.palette.slate.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginLeft: 4,
  },
  placeholderSection: {
    gap: 8,
  },
  placeholderCard: {
    backgroundColor: theme.palette.slate.surfaceDeep,
    borderColor: theme.palette.slate.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
  },
  placeholderText: {
    color: theme.palette.slate.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
})
