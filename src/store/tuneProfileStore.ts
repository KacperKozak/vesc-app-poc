import { create } from 'zustand'
import {
  getTuneProfile as nativeGetTuneProfile,
  getTuneProfiles as nativeGetTuneProfiles,
  type TuneProfile,
} from 'vesc-ble'

export type { TuneProfile } from 'vesc-ble'

interface TuneProfileState {
  profiles: TuneProfile[]
  activeProfile: TuneProfile | null
  activeBoardId: string | null
  loading: boolean
  error: string | null
}

interface TuneProfileActions {
  loadProfiles: (boardId: string) => Promise<TuneProfile[]>
  loadProfile: (profileId: string) => Promise<TuneProfile | null>
  clear: () => void
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return 'Unable to load tune profiles.'
}

export const useTuneProfileStore = create<TuneProfileState & TuneProfileActions>((set, get) => ({
  profiles: [],
  activeProfile: null,
  activeBoardId: null,
  loading: false,
  error: null,

  async loadProfiles(boardId) {
    set({ profiles: [], activeProfile: null, loading: true, error: null, activeBoardId: boardId })
    try {
      const profiles = await nativeGetTuneProfiles(boardId)
      const currentActive = get().activeProfile
      const activeProfile =
        profiles.find((profile) => profile.id === currentActive?.id) ?? profiles[0] ?? null
      set({ profiles, activeProfile, loading: false, error: null })
      return profiles
    } catch (error) {
      set({ loading: false, error: errorMessage(error) })
      throw error
    }
  },

  async loadProfile(profileId) {
    set({ loading: true, error: null })
    try {
      const profile = await nativeGetTuneProfile(profileId)
      set((state) => ({
        profiles:
          profile == null
            ? state.profiles
            : state.profiles.some((item) => item.id === profile.id)
              ? state.profiles.map((item) => (item.id === profile.id ? profile : item))
              : [...state.profiles, profile],
        activeProfile: profile,
        activeBoardId: profile?.boardId ?? state.activeBoardId,
        loading: false,
        error: null,
      }))
      return profile
    } catch (error) {
      set({ loading: false, error: errorMessage(error) })
      throw error
    }
  },

  clear() {
    set({
      profiles: [],
      activeProfile: null,
      activeBoardId: null,
      loading: false,
      error: null,
    })
  },
}))
