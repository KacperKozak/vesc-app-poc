import { useEffect } from 'react'
import { AppState, type AppStateStatus } from 'react-native'

import { useBleStore } from '@/store/bleStore'

export function useBleAppLifecycle(): void {
  const stopScan = useBleStore((s) => s.stopScan)
  const loadRecordings = useBleStore((s) => s.loadRecordings)

  useEffect(() => {
    const onChange = (nextState: AppStateStatus) => {
      if (nextState !== 'active') {
        const status = useBleStore.getState().status
        if (status === 'scanning') {
          stopScan()
        }
        return
      }

      void loadRecordings()
    }

    const subscription = AppState.addEventListener('change', onChange)
    return () => subscription.remove()
  }, [loadRecordings, stopScan])
}
