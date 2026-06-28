import { create } from 'zustand'
import {
  addGroupRideConnectionListener,
  addGroupRideCreatedListener,
  addGroupRideEndedListener,
  addGroupRideSnapshotListener,
  addGroupRideUpdatedListener,
  addLocationListener,
  createGroupRide,
  startGroupRideObserve,
  stopGroupRideObserve,
  type GroupRideConnectionState,
  type GroupRideSummary,
} from 'vesc-ble'

import { nearbyRides, type NearbyRide } from '@/lib/groupRide/nearby'
import { useRiderStore } from '@/store/riderStore'
import { GROUP_RIDE_SERVER_URL } from '@/config/groupRide'

interface GroupRideState {
  connection: GroupRideConnectionState
  /** Raw active-ride list from the relay (unfiltered). */
  rides: GroupRideSummary[]
  /** Device's own location, mirrored from native GPS for local distance filtering. */
  ownLocation: { lat: number; lng: number } | null
  /** Active rides within range of {@link ownLocation}, nearest first. */
  nearby: NearbyRide[]
  /** Social-button badge state: true when at least one nearby ride exists. */
  badge: boolean
  observing: boolean
  /** Open the native observe WebSocket and mirror its lifecycle events into the store. */
  startObserving: () => void
  /** Close the observe WebSocket and clear observed state. */
  stopObserving: () => void
  /** Create a Group Ride from the device's own location; result arrives via `ride-created`. */
  createRide: (name: string) => void
}

let subscriptions: { remove: () => void }[] = []

export const useGroupRideStore = create<GroupRideState>((set, get) => ({
  connection: 'idle',
  rides: [],
  ownLocation: null,
  nearby: [],
  badge: false,
  observing: false,

  startObserving() {
    if (get().observing) return
    subscriptions = [
      addGroupRideConnectionListener(({ state }) => set({ connection: state })),
      addGroupRideSnapshotListener(({ rides }) => set(deriveNearby({ rides }, get()))),
      addGroupRideCreatedListener(({ ride }) =>
        set(deriveNearby({ rides: upsertRide(get().rides, ride) }, get())),
      ),
      addGroupRideUpdatedListener(({ ride }) =>
        set(deriveNearby({ rides: upsertRide(get().rides, ride) }, get())),
      ),
      addGroupRideEndedListener(({ rideId }) =>
        set(deriveNearby({ rides: get().rides.filter((ride) => ride.id !== rideId) }, get())),
      ),
      addLocationListener(({ latitude, longitude }) =>
        set(deriveNearby({ ownLocation: { lat: latitude, lng: longitude } }, get())),
      ),
    ]
    set({ observing: true })
    startGroupRideObserve(GROUP_RIDE_SERVER_URL)
  },

  stopObserving() {
    if (!get().observing) return
    stopGroupRideObserve()
    subscriptions.forEach((sub) => sub.remove())
    subscriptions = []
    set({
      observing: false,
      connection: 'idle',
      rides: [],
      ownLocation: null,
      nearby: [],
      badge: false,
    })
  },

  createRide(name) {
    const { ownLocation } = get()
    if (!ownLocation) return
    const { riderId, riderName } = useRiderStore.getState()
    if (!riderId) return
    createGroupRide({
      riderId,
      riderName: riderName?.trim() || 'Rider',
      name: name.trim() || null,
      lat: ownLocation.lat,
      lng: ownLocation.lng,
    })
  },
}))

/** Merge a `rides`/`ownLocation` change with the current state and recompute the nearby view. */
function deriveNearby(
  patch: Partial<Pick<GroupRideState, 'rides' | 'ownLocation'>>,
  current: GroupRideState,
): Pick<GroupRideState, 'rides' | 'ownLocation' | 'nearby' | 'badge'> {
  const rides = patch.rides ?? current.rides
  const ownLocation = patch.ownLocation ?? current.ownLocation
  const { rides: nearby, badge } = nearbyRides(rides, ownLocation)
  return { rides, ownLocation, nearby, badge }
}

function upsertRide(rides: GroupRideSummary[], ride: GroupRideSummary): GroupRideSummary[] {
  const index = rides.findIndex((existing) => existing.id === ride.id)
  if (index === -1) return [...rides, ride]
  const next = rides.slice()
  next[index] = ride
  return next
}
