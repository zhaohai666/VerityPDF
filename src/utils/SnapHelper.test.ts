import { describe, it, expect, beforeEach } from 'vitest'
import { SnapHelper, SnapGuide } from './SnapHelper'

describe('SnapHelper', () => {
  let snapHelper: SnapHelper

  beforeEach(() => {
    snapHelper = new SnapHelper()
  })

  describe('initialization', () => {
    it('should initialize with default threshold=5 and enabled=true', () => {
      const result = snapHelper.snap({ x: 3, y: 3 }, [{ x: 0, y: 0, width: 10, height: 10 }], 1)
      // X: left=0 (|3-0|=3<5✓), centerX=5 (|3-5|=2<5✓), right=10 (|3-10|=7✗)
      // Y: top=0 (|3-0|=3<5✓), centerY=5 (|3-5|=2<5✓), bottom=10 (|3-10|=7✗)
      // Last matching X edge = centerX=5, last matching Y edge = centerY=5
      expect(result.point.x).toBe(5)
      expect(result.point.y).toBe(5)
    })

    it('should initialize with custom threshold and enabled', () => {
      const custom = new SnapHelper(10, false)
      const result = custom.snap({ x: 5, y: 5 }, [{ x: 0, y: 0, width: 10, height: 10 }], 1)
      expect(result.point).toEqual({ x: 5, y: 5 })
      expect(result.guides).toHaveLength(0)
    })
  })

  describe('setEnabled', () => {
    it('should enable snapping', () => {
      snapHelper.setEnabled(true)
      snapHelper.setThreshold(10)
      const result = snapHelper.snap({ x: 5, y: 5 }, [{ x: 0, y: 0, width: 10, height: 10 }], 1)
      expect(result.guides.length).toBeGreaterThan(0)
    })

    it('should disable snapping and return original point', () => {
      snapHelper.setEnabled(false)
      const point = { x: 5, y: 5 }
      const result = snapHelper.snap(point, [{ x: 0, y: 0, width: 10, height: 10 }], 1)
      expect(result.point).toEqual(point)
      expect(result.guides).toHaveLength(0)
    })
  })

  describe('setThreshold', () => {
    it('should change the snap threshold', () => {
      snapHelper.setThreshold(1)
      // Distance 3 > threshold 1 → no snap
      const result = snapHelper.snap({ x: 3, y: 3 }, [{ x: 0, y: 0, width: 10, height: 10 }], 1)
      expect(result.point.x).toBe(3)
      expect(result.point.y).toBe(3)
    })

    it('should allow snapping with larger threshold', () => {
      snapHelper.setThreshold(20)
      const result = snapHelper.snap({ x: 15, y: 15 }, [{ x: 0, y: 0, width: 10, height: 10 }], 1)
      // X: left=0 (|15-0|=15<20✓), centerX=5 (|15-5|=10<20✓), right=10 (|15-10|=5<20✓)
      // Y: top=0 (|15-0|=15<20✓), centerY=5 (|15-5|=10<20✓), bottom=10 (|15-10|=5<20✓)
      // Last matching X = right=10, last matching Y = bottom=10
      expect(result.point.x).toBe(10)
      expect(result.point.y).toBe(10)
    })
  })

  describe('snap method', () => {
    it('should return original point when disabled', () => {
      snapHelper.setEnabled(false)
      const point = { x: 100, y: 100 }
      const result = snapHelper.snap(point, [{ x: 50, y: 50, width: 10, height: 10 }], 1)
      expect(result.point).toEqual(point)
      expect(result.guides).toHaveLength(0)
    })

    it('should return original point when no references', () => {
      const point = { x: 100, y: 100 }
      const result = snapHelper.snap(point, [], 1)
      expect(result.point).toEqual(point)
      expect(result.guides).toHaveLength(0)
    })

    it('should snap to a single edge within threshold', () => {
      // Use threshold=2 so only left edge is within range for point x=1
      // left=0: |1-0|=1<2✓, centerX=5: |1-5|=4>=2✗, right=10: |1-10|=9>=2✗
      snapHelper.setThreshold(2)
      const result = snapHelper.snap({ x: 1, y: 50 }, [{ x: 0, y: 0, width: 10, height: 10 }], 1)
      expect(result.point.x).toBe(0) // snapped to left edge (only matching edge)
      expect(result.guides.some(g => g.axis === 'x' && g.position === 0)).toBe(true)
    })

    it('should snap to last matching edge when multiple edges within threshold', () => {
      // Point x=3, ref edges: left=0, centerX=5, right=10
      // |3-0|=3 < 10 ✓, |3-5|=2 < 10 ✓, |3-10|=7 < 10 ✓
      // Last matching X edge is right=10
      snapHelper.setThreshold(10)
      const result = snapHelper.snap({ x: 3, y: 50 }, [{ x: 0, y: 40, width: 10, height: 10 }], 1)
      expect(result.point.x).toBe(10) // last matching edge (right)
    })

    it('should push multiple guides for multiple matching edges', () => {
      // Point x=3, ref edges: left=0, centerX=5, right=10
      // All 3 within threshold(10) → 3 x-guides pushed
      snapHelper.setThreshold(10)
      const result = snapHelper.snap({ x: 3, y: 50 }, [{ x: 0, y: 40, width: 10, height: 10 }], 1)
      const xGuides = result.guides.filter(g => g.axis === 'x')
      expect(xGuides).toHaveLength(3) // left, centerX, right all matched
      expect(xGuides.map(g => g.position)).toEqual([0, 5, 10])
    })

    it('should snap to both X and Y axes', () => {
      snapHelper.setThreshold(5)
      // Point (3, 3), ref (0, 0, 10, 10)
      // X edges: left=0 (|3-0|=3<5), centerX=5 (|3-5|=2<5), right=10 (|3-10|=7>5)
      // Y edges: top=0 (|3-0|=3<5), centerY=5 (|3-5|=2<5), bottom=10 (|3-10|=7>5)
      // Last matching X: centerX=5, last matching Y: centerY=5
      const result = snapHelper.snap({ x: 3, y: 3 }, [{ x: 0, y: 0, width: 10, height: 10 }], 1)
      expect(result.point.x).toBe(5) // last matching X edge
      expect(result.point.y).toBe(5) // last matching Y edge
      expect(result.guides.filter(g => g.axis === 'x')).toHaveLength(2) // left + centerX
      expect(result.guides.filter(g => g.axis === 'y')).toHaveLength(2) // top + centerY
    })

    it('should not snap when point is outside threshold', () => {
      snapHelper.setThreshold(5)
      const result = snapHelper.snap({ x: 20, y: 20 }, [{ x: 0, y: 0, width: 10, height: 10 }], 1)
      // All edges (0,5,10) are > 5 away from 20
      expect(result.point.x).toBe(20)
      expect(result.point.y).toBe(20)
      expect(result.guides).toHaveLength(0)
    })

    it('should handle exact threshold boundary (not snapped)', () => {
      snapHelper.setThreshold(5)
      // |5-0|=5 is NOT < 5 (strict less-than)
      const result = snapHelper.snap({ x: 5, y: 5 }, [{ x: 0, y: 0, width: 10, height: 10 }], 1)
      // left=0: |5-0|=5 NOT <5; centerX=5: |5-5|=0<5 ✓; right=10: |5-10|=5 NOT <5
      expect(result.point.x).toBe(5) // snapped to centerX
      expect(result.point.y).toBe(5) // snapped to centerY
    })

    it('should handle multiple reference rectangles', () => {
      snapHelper.setThreshold(10)
      const references = [
        { x: 30, y: 30, width: 10, height: 10 }, // edges: L=30,CX=35,R=40,T=30,CY=35,B=40
        { x: 60, y: 60, width: 10, height: 10 }  // edges: L=60,CX=65,R=70,T=60,CY=65,B=70
      ]

      // Point (33, 63)
      // Ref1 X: |33-30|=3<10→snap 30, |33-35|=2<10→snap 35, |33-40|=7<10→snap 40
      // Ref2 X: |33-60|=27>10, |33-65|=32>10, |33-70|=37>10
      // Ref1 Y: |63-30|=33>10, |63-35|=28>10, |63-40|=23>10
      // Ref2 Y: |63-60|=3<10→snap 60, |63-65|=2<10→snap 65, |63-70|=7<10→snap 70
      const result = snapHelper.snap({ x: 33, y: 63 }, references, 1)
      expect(result.point.x).toBe(40) // last matching X from ref1
      expect(result.point.y).toBe(70) // last matching Y from ref2
      expect(result.guides.filter(g => g.axis === 'x')).toHaveLength(3) // 3 from ref1
      expect(result.guides.filter(g => g.axis === 'y')).toHaveLength(3) // 3 from ref2
    })

    it('should produce correct guide structure', () => {
      snapHelper.setThreshold(5)
      const result = snapHelper.snap({ x: 3, y: 50 }, [{ x: 0, y: 0, width: 10, height: 10 }], 1)
      const guide = result.guides.find(g => g.axis === 'x' && g.position === 0)
      expect(guide).toBeDefined()
      expect(guide!.type).toBe('snap')
    })
  })

  describe('edge cases', () => {
    it('should handle zero-size rectangles', () => {
      // Zero-size rect: all edges at (0,0)
      snapHelper.setThreshold(5)
      const result = snapHelper.snap({ x: 3, y: 3 }, [{ x: 0, y: 0, width: 0, height: 0 }], 1)
      // left=0, centerX=0, right=0 → all same, all within threshold
      // top=0, centerY=0, bottom=0 → all same, all within threshold
      expect(result.point.x).toBe(0)
      expect(result.point.y).toBe(0)
      expect(result.guides.length).toBeGreaterThan(0)
    })

    it('should handle negative coordinates', () => {
      snapHelper.setThreshold(10)
      const result = snapHelper.snap({ x: -8, y: -8 }, [{ x: -10, y: -10, width: 5, height: 5 }], 1)
      // left=-10: |-8-(-10)|=2<10→snap; centerX=-7.5: |-8-(-7.5)|=0.5<10→snap; right=-5: |-8-(-5)|=3<10→snap
      expect(result.point.x).toBe(-5) // last matching (right)
      expect(result.point.y).toBe(-5) // last matching (bottom)
      expect(result.guides.length).toBeGreaterThan(0)
    })

    it('should handle very large coordinates', () => {
      snapHelper.setThreshold(10)
      const result = snapHelper.snap(
        { x: 1000003, y: 1000003 },
        [{ x: 1000000, y: 1000000, width: 10, height: 10 }],
        1
      )
      // left=1000000: |1000003-1000000|=3<10→snap; centerX=1000005: |1000003-1000005|=2<10→snap; right=1000010: |1000003-1000010|=7<10→snap
      expect(result.point.x).toBe(1000010) // last matching (right)
      expect(result.point.y).toBe(1000010) // last matching (bottom)
    })

    it('should handle very small threshold', () => {
      snapHelper.setThreshold(0.1)
      const result = snapHelper.snap({ x: 30.05, y: 30.05 }, [{ x: 30, y: 30, width: 20, height: 20 }], 1)
      // |30.05-30|=0.05<0.1→snap to left; |30.05-40|=9.95>0.1→no; |30.05-50|=19.95>0.1→no
      expect(result.point.x).toBe(30) // snapped to left edge
      expect(result.point.y).toBe(30) // snapped to top edge
    })

    it('should return original point when no edges within threshold', () => {
      snapHelper.setThreshold(1)
      const result = snapHelper.snap({ x: 50, y: 50 }, [{ x: 0, y: 0, width: 10, height: 10 }], 1)
      expect(result.point).toEqual({ x: 50, y: 50 })
      expect(result.guides).toHaveLength(0)
    })
  })
})