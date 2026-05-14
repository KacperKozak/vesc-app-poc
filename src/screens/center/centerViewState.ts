export type CenterViewState = 'telemetry' | 'mapFocus' | 'rideReview' | 'historyEmpty'

export interface CenterOverlayFlags {
  showTelemetry: boolean
  showMapFocus: boolean
  showRideReview: boolean
  showHistoryEmpty: boolean
}

export function getCenterOverlayFlags(viewState: CenterViewState): CenterOverlayFlags {
  return {
    showTelemetry: viewState === 'telemetry',
    showMapFocus: viewState === 'mapFocus',
    showRideReview: viewState === 'rideReview',
    showHistoryEmpty: viewState === 'historyEmpty',
  }
}

export function canMapGestureFocus(viewState: CenterViewState): boolean {
  return viewState === 'telemetry'
}
