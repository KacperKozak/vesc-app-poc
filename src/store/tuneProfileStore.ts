import { create } from 'zustand'
import {
  getTuneProfile as nativeGetTuneProfile,
  getTuneProfiles as nativeGetTuneProfiles,
  saveProfile as nativeSaveProfile,
  type RefloatConfigSnapshot,
  type TuneProfile,
  type TuneProfileFieldValue,
} from 'vesc-ble'

export type { TuneProfile, TuneProfileFieldValue } from 'vesc-ble'

export interface TuneProfileBoardDiff {
  fieldId: string
  profileValue: TuneProfileFieldValue | undefined
  boardValue: TuneProfileFieldValue
}

interface TuneProfileState {
  profiles: TuneProfile[]
  activeProfile: TuneProfile | null
  activeBoardId: string | null
  draftFields: Record<string, TuneProfileFieldValue>
  hasDirtyFields: boolean
  boardFields: Record<string, TuneProfileFieldValue>
  boardDiff: TuneProfileBoardDiff[]
  hasBoardDiff: boolean
  loading: boolean
  saving: boolean
  error: string | null
}

interface TuneProfileActions {
  loadProfiles: (boardId: string) => Promise<TuneProfile[]>
  loadProfile: (profileId: string) => Promise<TuneProfile | null>
  setDraftField: (fieldId: string, value: TuneProfileFieldValue) => void
  setBoardSnapshot: (snapshot: RefloatConfigSnapshot | null) => void
  getDirtyFields: () => Record<string, TuneProfileFieldValue>
  revertField: (fieldId: string) => void
  acceptBoardField: (fieldId: string) => void
  acceptAllBoardValues: () => void
  discardAllEdits: () => void
  saveActiveProfile: () => Promise<TuneProfile | null>
  clear: () => void
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return 'Unable to load tune profiles.'
}

function sameFieldValue(
  a: TuneProfileFieldValue | undefined,
  b: TuneProfileFieldValue | undefined,
): boolean {
  return a === b || (typeof a === 'number' && typeof b === 'number' && Object.is(a, b))
}

function dirtyFields(
  profile: TuneProfile | null,
  draftFields: Record<string, TuneProfileFieldValue>,
): Record<string, TuneProfileFieldValue> {
  if (!profile) return {}
  return Object.fromEntries(
    Object.entries(draftFields).filter(
      ([fieldId, value]) => !sameFieldValue(value, profile.fields[fieldId]),
    ),
  )
}

function fieldsFromSnapshot(
  snapshot: RefloatConfigSnapshot | null,
): Record<string, TuneProfileFieldValue> {
  if (!snapshot) return {}
  return Object.fromEntries(
    snapshot.groups.flatMap((group) =>
      group.fields.map((field) => [field.id, field.value as TuneProfileFieldValue]),
    ),
  )
}

function boardDiff(
  profile: TuneProfile | null,
  boardFields: Record<string, TuneProfileFieldValue>,
): TuneProfileBoardDiff[] {
  if (!profile) return []
  return Object.entries(boardFields)
    .filter(([, boardValue]) => boardValue !== null)
    .flatMap(([fieldId, boardValue]) =>
      sameFieldValue(profile.fields[fieldId], boardValue)
        ? []
        : [{ fieldId, profileValue: profile.fields[fieldId], boardValue }],
    )
}

function nextDraftWithField(
  profile: TuneProfile,
  draftFields: Record<string, TuneProfileFieldValue>,
  fieldId: string,
  value: TuneProfileFieldValue,
): Record<string, TuneProfileFieldValue> {
  const savedValue = profile.fields[fieldId]
  const next = { ...draftFields }
  if (sameFieldValue(value, savedValue)) {
    delete next[fieldId]
  } else {
    next[fieldId] = value
  }
  return next
}

export const useTuneProfileStore = create<TuneProfileState & TuneProfileActions>((set, get) => ({
  profiles: [],
  activeProfile: null,
  activeBoardId: null,
  draftFields: {},
  hasDirtyFields: false,
  boardFields: {},
  boardDiff: [],
  hasBoardDiff: false,
  loading: false,
  saving: false,
  error: null,

  async loadProfiles(boardId) {
    set({
      profiles: [],
      activeProfile: null,
      draftFields: {},
      hasDirtyFields: false,
      boardDiff: [],
      hasBoardDiff: false,
      loading: true,
      error: null,
      activeBoardId: boardId,
    })
    try {
      const profiles = await nativeGetTuneProfiles(boardId)
      const currentActive = get().activeProfile
      const activeProfile =
        profiles.find((profile) => profile.id === currentActive?.id) ?? profiles[0] ?? null
      const diff = boardDiff(activeProfile, get().boardFields)
      set({
        profiles,
        activeProfile,
        draftFields: {},
        hasDirtyFields: false,
        boardDiff: diff,
        hasBoardDiff: diff.length > 0,
        loading: false,
        error: null,
      })
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
      set((state) => {
        const diff = boardDiff(profile, state.boardFields)
        return {
          profiles:
            profile == null
              ? state.profiles
              : state.profiles.some((item) => item.id === profile.id)
                ? state.profiles.map((item) => (item.id === profile.id ? profile : item))
                : [...state.profiles, profile],
          activeProfile: profile,
          activeBoardId: profile?.boardId ?? state.activeBoardId,
          draftFields: {},
          hasDirtyFields: false,
          boardDiff: diff,
          hasBoardDiff: diff.length > 0,
          loading: false,
          error: null,
        }
      })
      return profile
    } catch (error) {
      set({ loading: false, error: errorMessage(error) })
      throw error
    }
  },

  setDraftField(fieldId, value) {
    set((state) => {
      if (!state.activeProfile) return state
      const savedValue = state.activeProfile.fields[fieldId]
      const draftFields = { ...state.draftFields }
      if (sameFieldValue(value, savedValue)) {
        delete draftFields[fieldId]
      } else {
        draftFields[fieldId] = value
      }
      return {
        draftFields,
        hasDirtyFields: Object.keys(dirtyFields(state.activeProfile, draftFields)).length > 0,
      }
    })
  },

  setBoardSnapshot(snapshot) {
    const boardFields = fieldsFromSnapshot(snapshot)
    set((state) => {
      const diff = boardDiff(state.activeProfile, boardFields)
      return {
        boardFields,
        boardDiff: diff,
        hasBoardDiff: diff.length > 0,
      }
    })
  },

  getDirtyFields() {
    const state = get()
    return dirtyFields(state.activeProfile, state.draftFields)
  },

  revertField(fieldId) {
    set((state) => {
      const draftFields = { ...state.draftFields }
      delete draftFields[fieldId]
      return {
        draftFields,
        hasDirtyFields: Object.keys(dirtyFields(state.activeProfile, draftFields)).length > 0,
      }
    })
  },

  acceptBoardField(fieldId) {
    set((state) => {
      if (
        !state.activeProfile ||
        !Object.prototype.hasOwnProperty.call(state.boardFields, fieldId)
      ) {
        return state
      }
      const draftFields = nextDraftWithField(
        state.activeProfile,
        state.draftFields,
        fieldId,
        state.boardFields[fieldId],
      )
      return {
        draftFields,
        hasDirtyFields: Object.keys(dirtyFields(state.activeProfile, draftFields)).length > 0,
      }
    })
  },

  acceptAllBoardValues() {
    set((state) => {
      const profile = state.activeProfile
      if (!profile) return state
      const draftFields = Object.entries(state.boardFields).reduce(
        (next, [fieldId, value]) => nextDraftWithField(profile, next, fieldId, value),
        { ...state.draftFields },
      )
      return {
        draftFields,
        hasDirtyFields: Object.keys(dirtyFields(state.activeProfile, draftFields)).length > 0,
      }
    })
  },

  discardAllEdits() {
    set({ draftFields: {}, hasDirtyFields: false })
  },

  async saveActiveProfile() {
    const profile = get().activeProfile
    if (!profile) return null
    const dirty = get().getDirtyFields()
    if (Object.keys(dirty).length === 0) return profile
    set({ saving: true, error: null })
    try {
      const saved = await nativeSaveProfile(profile.id, { ...profile.fields, ...dirty })
      set((state) => {
        const diff = boardDiff(saved, state.boardFields)
        return {
          profiles: state.profiles.map((item) => (item.id === saved.id ? saved : item)),
          activeProfile: saved,
          draftFields: {},
          hasDirtyFields: false,
          boardDiff: diff,
          hasBoardDiff: diff.length > 0,
          saving: false,
          error: null,
        }
      })
      return saved
    } catch (error) {
      set({ saving: false, error: errorMessage(error) })
      throw error
    }
  },

  clear() {
    set({
      profiles: [],
      activeProfile: null,
      activeBoardId: null,
      draftFields: {},
      hasDirtyFields: false,
      boardFields: {},
      boardDiff: [],
      hasBoardDiff: false,
      loading: false,
      saving: false,
      error: null,
    })
  },
}))
