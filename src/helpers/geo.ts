const R = 6_371_000 // Earth radius in metres

export interface LatLng {
  latitude: number
  longitude: number
}

/** Haversine distance between two coordinates, in metres. */
export function haversineM(a: LatLng, b: LatLng): number {
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180
  const lat1 = (a.latitude * Math.PI) / 180
  const lat2 = (b.latitude * Math.PI) / 180
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

/** Initial bearing from a → b, in degrees [0, 360). 0 = north, clockwise. */
export function bearingTo(a: LatLng, b: LatLng): number {
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180
  const lat1 = (a.latitude * Math.PI) / 180
  const lat2 = (b.latitude * Math.PI) / 180
  const y = Math.sin(dLon) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon)
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

/**
 * Returns the clock-face hour (1–12) of a target relative to the direction
 * you're currently heading.
 * e.g. heading = 0°, target bearing = 90° → 3 o'clock
 */
export function clockHour(headingDeg: number, targetBearingDeg: number): number {
  const rel = (targetBearingDeg - headingDeg + 360) % 360
  const hour = Math.round(rel / 30) % 12
  return hour === 0 ? 12 : hour
}

/** Human-readable distance: "340 m" or "1.2 km". */
export function fmtDistance(metres: number): string {
  if (metres < 1000) return `${Math.round(metres)} m`
  return `${(metres / 1000).toFixed(1)} km`
}
