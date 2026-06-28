import { create } from 'zustand'
import {
  addGroupRideConnectionListener,
  addGroupRideCreatedListener,
  addGroupRideEndedListener,
  addGroupRideSnapshotListener,
  addGroupRideUpdatedListener,
  startGroupRideObserve,
  stopGroupRideObserve,
  type GroupRideConnectionState,
  type GroupRideSummary,
} from 'vesc-ble'

import { GROUP_RIDE_SERVER_URL } from '@/config/groupRide'

interface GroupRideState {
  connection: GroupRideConnectionState
  /** Raw active-ride list from the relay (unfiltered — nearby filtering is slice 4). */
  rides: GroupRideSummary[]
  observing: boolean
  /** Open the native observe WebSocket and mirror its lifecycle events into the store. */
  startObserving: () => void
  /** Close the observe WebSocket and clear observed state. */
  stopObserving: () => void
}

let subscriptions: { remove: () => void }[] = []

export const useGroupRideStore = create<GroupRideState>((set, get) => ({
  connection: 'idle',
  rides: [],
  observing: false,

  startObserving() {
    if (get().observing) return
    subscriptions = [
      addGroupRideConnectionListener(({ state }) => set({ connection: state })),
      addGroupRideSnapshotListener(({ rides }) => set({ rides })),
      addGroupRideCreatedListener(({ ride }) => set((s) => ({ rides: upsertRide(s.rides, ride) }))),
      addGroupRideUpdatedListener(({ ride }) => set((s) => ({ rides: upsertRide(s.rides, ride) }))),
      addGroupRideEndedListener(({ rideId }) =>
        set((s) => ({ rides: s.rides.filter((ride) => ride.id !== rideId) })),
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
    set({ observing: false, connection: 'idle', rides: [] })
  },
}))

function upsertRide(rides: GroupRideSummary[], ride: GroupRideSummary): GroupRideSummary[] {
  const index = rides.findIndex((existing) => existing.id === ride.id)
  if (index === -1) return [...rides, ride]
  const next = rides.slice()
  next[index] = ride
  return next
}
