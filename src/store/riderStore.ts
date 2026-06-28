import { create } from 'zustand'
import { getSettings, updateSetting } from 'vesc-ble'

import { generateId } from '@/helpers/id'

interface RiderState {
  /** Persistent device-scoped anonymous Rider id. Null until loaded. */
  riderId: string | null
  /** Rider-chosen display name, or null when unset. */
  riderName: string | null
  loaded: boolean
  /** Load identity from native settings, generating a Rider id on first use. */
  load: () => Promise<void>
  /** Set the display name (trimmed; empty clears it back to null). */
  setName: (name: string) => Promise<void>
}

export const useRiderStore = create<RiderState>((set) => ({
  riderId: null,
  riderName: null,
  loaded: false,

  async load() {
    try {
      const settings = await getSettings()
      let riderId = settings.riderId
      if (!riderId) {
        riderId = generateId()
        await updateSetting('riderId', riderId)
      }
      set({ riderId, riderName: settings.riderName ?? null, loaded: true })
    } catch {
      set({ loaded: true })
    }
  },

  async setName(name) {
    const trimmed = name.trim()
    const value = trimmed.length ? trimmed : null
    set({ riderName: value })
    await updateSetting('riderName', value)
  },
}))
