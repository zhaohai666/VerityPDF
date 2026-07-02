import { describe, it, expect } from 'vitest'
import { calcDistance, calcArea, calcAngle, formatMeasure, UNIT_LABELS } from './Measurement'

describe('Measurement Utils', () => {
  describe('calcDistance', () => {
    it('should calculate distance between two points in pt (default)', () => {
      const p1 = { x: 0, y: 0 }
      const p2 = { x: 0.1, y: 0 }

      const distance = calcDistance(p1, p2)
      // dx = 0.1 * 595.28 = 59.528, distPt = 59.528
      expect(distance).toBeCloseTo(59.528, 3)
    })

    it('should calculate distance with custom page dimensions', () => {
      const p1 = { x: 0, y: 0 }
      const p2 = { x: 0.5, y: 0 }

      const distance = calcDistance(p1, p2, 100, 100)
      expect(distance).toBeCloseTo(50, 3)
    })

    it('should calculate distance in mm', () => {
      const p1 = { x: 0, y: 0 }
      const p2 = { x: 0.1, y: 0 }

      // dx = 0.1 * 595.28 = 59.528pt, in mm: 59.528 * (25.4/72) ≈ 21.0
      const distance = calcDistance(p1, p2, 595.28, 841.89, 'mm')
      expect(distance).toBeCloseTo(21.0, 1)
    })

    it('should calculate distance in cm', () => {
      const p1 = { x: 0, y: 0 }
      const p2 = { x: 0.1, y: 0 }

      // dx = 59.528pt, in cm: 59.528 * (2.54/72) ≈ 2.10
      const distance = calcDistance(p1, p2, 595.28, 841.89, 'cm')
      expect(distance).toBeCloseTo(2.10, 2)
    })

    it('should calculate distance in inches', () => {
      const p1 = { x: 0, y: 0 }
      const p2 = { x: 0.1, y: 0 }

      // dx = 59.528pt, in inches: 59.528 / 72 ≈ 0.827
      const distance = calcDistance(p1, p2, 595.28, 841.89, 'in')
      expect(distance).toBeCloseTo(0.827, 3)
    })

    it('should calculate diagonal distance', () => {
      const p1 = { x: 0, y: 0 }
      const p2 = { x: 1, y: 1 }

      const distance = calcDistance(p1, p2, 100, 100)
      // sqrt(100² + 100²) = sqrt(20000) ≈ 141.421
      expect(distance).toBeCloseTo(141.421, 3)
    })

    it('should handle zero distance', () => {
      const p1 = { x: 0.5, y: 0.5 }
      const p2 = { x: 0.5, y: 0.5 }

      const distance = calcDistance(p1, p2)
      expect(distance).toBe(0)
    })

    it('should handle negative coordinates', () => {
      const p1 = { x: -0.1, y: -0.1 }
      const p2 = { x: 0.1, y: 0.1 }

      const distance = calcDistance(p1, p2, 100, 100)
      // dx = 0.2*100=20, dy = 0.2*100=20, dist = sqrt(800) ≈ 28.284
      expect(distance).toBeCloseTo(28.284, 3)
    })
  })

  describe('calcArea', () => {
    it('should calculate area of triangle', () => {
      const points = [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 0, y: 1 }
      ]

      const area = calcArea(points, 100, 100)
      // 0.5 * 100 * 100 = 5000
      expect(area).toBeCloseTo(5000, 3)
    })

    it('should calculate area of rectangle', () => {
      const points = [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 }
      ]

      const area = calcArea(points, 100, 100)
      expect(area).toBeCloseTo(10000, 3)
    })

    it('should return 0 for less than 3 points', () => {
      const points1 = [{ x: 0, y: 0 }]
      const points2 = [{ x: 0, y: 0 }, { x: 1, y: 0 }]

      expect(calcArea(points1)).toBe(0)
      expect(calcArea(points2)).toBe(0)
    })

    it('should calculate area in mm²', () => {
      const points = [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 }
      ]

      // A4 page area in pt² = 595.28 * 841.89 = 501180.4
      // In mm²: 501180.4 * (25.4/72)² ≈ 62370
      // Which equals 210 * 297 = 62370 mm²
      const area = calcArea(points, 595.28, 841.89, 'mm')
      expect(area).toBeCloseTo(210 * 297, -1)
    })

    it('should handle complex polygon', () => {
      const points = [
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        { x: 2, y: 1 },
        { x: 1, y: 1 },
        { x: 1, y: 2 },
        { x: 0, y: 2 }
      ]

      const area = calcArea(points, 100, 100)
      expect(area).toBeCloseTo(30000, 3)
    })

    it('should return same area regardless of point order (clockwise vs counter-clockwise)', () => {
      const pointsCCW = [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 }
      ]

      const pointsCW = [
        { x: 0, y: 0 },
        { x: 0, y: 1 },
        { x: 1, y: 1 },
        { x: 1, y: 0 }
      ]

      const area1 = calcArea(pointsCCW, 100, 100)
      const area2 = calcArea(pointsCW, 100, 100)

      expect(area1).toBe(area2)
    })
  })

  describe('calcAngle', () => {
    it('should calculate 90-degree angle', () => {
      const p1 = { x: 1, y: 0 }
      const vertex = { x: 0, y: 0 }
      const p2 = { x: 0, y: 1 }

      const angle = calcAngle(p1, vertex, p2)
      expect(angle).toBeCloseTo(90, 3)
    })

    it('should calculate 180-degree angle', () => {
      const p1 = { x: -1, y: 0 }
      const vertex = { x: 0, y: 0 }
      const p2 = { x: 1, y: 0 }

      const angle = calcAngle(p1, vertex, p2)
      expect(angle).toBeCloseTo(180, 3)
    })

    it('should calculate 45-degree angle', () => {
      const p1 = { x: 1, y: 0 }
      const vertex = { x: 0, y: 0 }
      const p2 = { x: 1, y: 1 }

      const angle = calcAngle(p1, vertex, p2)
      expect(angle).toBeCloseTo(45, 3)
    })

    it('should handle zero angle', () => {
      const p1 = { x: 1, y: 0 }
      const vertex = { x: 0, y: 0 }
      const p2 = { x: 2, y: 0 }

      const angle = calcAngle(p1, vertex, p2)
      expect(angle).toBeCloseTo(0, 3)
    })

    it('should handle acute angles', () => {
      const p1 = { x: 1, y: 0 }
      const vertex = { x: 0, y: 0 }
      const p2 = { x: 2, y: 1 }

      const angle = calcAngle(p1, vertex, p2)
      expect(angle).toBeCloseTo(26.565, 3)
    })

    it('should return positive angles only', () => {
      const p1 = { x: 0, y: 1 }
      const vertex = { x: 0, y: 0 }
      const p2 = { x: 1, y: 0 }

      const angle = calcAngle(p1, vertex, p2)
      expect(angle).toBeCloseTo(90, 3)
    })
  })

  describe('formatMeasure', () => {
    it('should format pt values with 1 decimal place', () => {
      expect(formatMeasure(10.123, 'pt')).toBe('10.1 pt')
      expect(formatMeasure(10.567, 'pt')).toBe('10.6 pt')
    })

    it('should format non-pt values with 2 decimal places', () => {
      expect(formatMeasure(10.123, 'mm')).toBe('10.12 mm')
      expect(formatMeasure(10.567, 'mm')).toBe('10.57 mm')
      expect(formatMeasure(10.123, 'cm')).toBe('10.12 cm')
      expect(formatMeasure(10.567, 'in')).toBe('10.57 in')
    })

    it('should handle zero values', () => {
      expect(formatMeasure(0, 'pt')).toBe('0.0 pt')
      expect(formatMeasure(0, 'mm')).toBe('0.00 mm')
    })

    it('should handle negative values', () => {
      expect(formatMeasure(-10.123, 'pt')).toBe('-10.1 pt')
      expect(formatMeasure(-10.567, 'mm')).toBe('-10.57 mm')
    })
  })

  describe('UNIT_LABELS', () => {
    it('should have all unit labels defined', () => {
      expect(UNIT_LABELS).toEqual({
        pt: 'pt',
        mm: 'mm',
        cm: 'cm',
        in: 'in'
      })
    })

    it('should return correct label for each unit', () => {
      expect(UNIT_LABELS.pt).toBe('pt')
      expect(UNIT_LABELS.mm).toBe('mm')
      expect(UNIT_LABELS.cm).toBe('cm')
      expect(UNIT_LABELS.in).toBe('in')
    })
  })
})