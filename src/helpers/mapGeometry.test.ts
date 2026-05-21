import { describe, expect, test } from 'bun:test'

import { distanceMeters, makeCircleFeature } from './mapGeometry'

describe('mapGeometry', () => {
  test('distanceMeters returns zero for same coordinate', () => {
    expect(distanceMeters({ latitude: 50, longitude: 19 }, { latitude: 50, longitude: 19 })).toBe(0)
  })

  test('distanceMeters measures nearby points in meters', () => {
    expect(
      distanceMeters({ latitude: 50, longitude: 19 }, { latitude: 50.001, longitude: 19 }),
    ).toBeCloseTo(111, 0)
  })

  test('makeCircleFeature returns closed polygon around center', () => {
    const circle = makeCircleFeature(19, 50, 100)
    const coordinates = circle.geometry.coordinates[0]
    expect(coordinates).toHaveLength(65)
    expect(coordinates[0]).toEqual(coordinates[coordinates.length - 1])
  })
})
