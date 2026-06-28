import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { Button } from '@/components/ui/base/Button'
import { Input } from '@/components/ui/forms/Input'
import type { NearbyRide } from '@/lib/groupRide/nearby'
import { useGroupRideStore } from '@/store/groupRideStore'
import { theme } from '@/constants/theme'

export function NearbyRidesSection() {
  const nearby = useGroupRideStore((s) => s.nearby)
  const hasLocation = useGroupRideStore((s) => s.ownLocation !== null)
  const createRide = useGroupRideStore((s) => s.createRide)
  const [name, setName] = useState('')

  const create = () => {
    createRide(name)
    setName('')
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Nearby group rides</Text>

      <View style={styles.createCard}>
        <Input
          value={name}
          onChangeText={setName}
          placeholder="Ride name (optional)"
          placeholderTextColor={theme.palette.slate.textMuted}
          returnKeyType="done"
          onSubmitEditing={create}
          maxLength={40}
          accessibilityLabel="Group ride name"
        />
        <Button
          label="Create Group Ride"
          onPress={create}
          disabled={!hasLocation}
          accessibilityLabel="Create Group Ride"
        />
        {!hasLocation && (
          <Text style={styles.hint}>Waiting for your location before you can start a ride.</Text>
        )}
      </View>

      {nearby.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>No group rides near you right now.</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {nearby.map((entry) => (
            <NearbyRideRow key={entry.ride.id} entry={entry} />
          ))}
        </View>
      )}
    </View>
  )
}

function NearbyRideRow({ entry }: { entry: NearbyRide }) {
  const { ride, distanceM } = entry
  const riders = `${ride.riderCount} ${ride.riderCount === 1 ? 'rider' : 'riders'}`

  return (
    <View style={styles.row}>
      <Text style={styles.rideName} numberOfLines={1}>
        {ride.name}
      </Text>
      <Text style={styles.rideMeta}>
        {riders} · {formatDistance(distanceM)}
      </Text>
    </View>
  )
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`
  return `${(meters / 1000).toFixed(1)} km`
}

const styles = StyleSheet.create({
  section: {
    gap: 8,
  },
  sectionTitle: {
    color: theme.palette.slate.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginLeft: 4,
  },
  createCard: {
    backgroundColor: theme.palette.slate.surfaceDeep,
    borderColor: theme.palette.slate.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  hint: {
    color: theme.palette.slate.textMuted,
    fontSize: 12,
    lineHeight: 16,
  },
  list: {
    gap: 8,
  },
  emptyCard: {
    backgroundColor: theme.palette.slate.surfaceDeep,
    borderColor: theme.palette.slate.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
  },
  emptyText: {
    color: theme.palette.slate.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  row: {
    backgroundColor: theme.palette.slate.surfaceDeep,
    borderColor: theme.palette.slate.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 4,
  },
  rideName: {
    color: theme.palette.slate.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  rideMeta: {
    color: theme.palette.slate.textSecondary,
    fontSize: 13,
  },
})
