import { describe, expect, test } from 'bun:test'

import { distanceMeters, isPointOutsideVisibleMapArea, makeCircleFeature } from './mapGeometry'

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

  test('treats points behind top and bottom map UI as outside visible area', () => {
    const layout = { width: 400, height: 800 }
    const verticalInsets = { top: 122, bottom: 142 }

    expect(isPointOutsideVisibleMapArea({ x: 200, y: 121 }, layout, verticalInsets)).toBe(true)
    expect(isPointOutsideVisibleMapArea({ x: 200, y: 659 }, layout, verticalInsets)).toBe(true)
    expect(isPointOutsideVisibleMapArea({ x: 200, y: 122 }, layout, verticalInsets)).toBe(false)
    expect(isPointOutsideVisibleMapArea({ x: 200, y: 658 }, layout, verticalInsets)).toBe(false)
  })

  test('still uses physical map bounds for left and right edges', () => {
    const layout = { width: 400, height: 800 }
    const verticalInsets = { top: 122, bottom: 142 }

    expect(isPointOutsideVisibleMapArea({ x: -1, y: 400 }, layout, verticalInsets)).toBe(true)
    expect(isPointOutsideVisibleMapArea({ x: 401, y: 400 }, layout, verticalInsets)).toBe(true)
    expect(isPointOutsideVisibleMapArea({ x: 0, y: 400 }, layout, verticalInsets)).toBe(false)
    expect(isPointOutsideVisibleMapArea({ x: 400, y: 400 }, layout, verticalInsets)).toBe(false)
  })
})
