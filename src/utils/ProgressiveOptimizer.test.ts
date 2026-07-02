import { describe, it, expect, beforeEach, vi } from 'vitest'
import { progressiveOptimizer, trackPerformance, measureFunction } from './ProgressiveOptimizer'
import type { OptimizationMetric, OptimizationRule } from './ProgressiveOptimizer'

// Mock localStorage for jsdom environment
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value }),
    removeItem: vi.fn((key: string) => { delete store[key] }),
    clear: vi.fn(() => { store = {} }),
    get length() { return Object.keys(store).length },
    key: vi.fn((index: number) => Object.keys(store)[index] || null),
  }
})()

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock })

describe('ProgressiveOptimizer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.clearAllTimers()
    localStorageMock.clear()
    // Reset the singleton's internal state
    progressiveOptimizer.clearMetrics()
  })

  describe('initialization', () => {
    it('should be a singleton instance', () => {
      expect(progressiveOptimizer).toBeDefined()
    })

    it('should return metrics array', () => {
      const metrics = progressiveOptimizer.getMetrics()
      expect(Array.isArray(metrics)).toBe(true)
    })

    it('should return patterns array', () => {
      const patterns = progressiveOptimizer.getPatterns()
      expect(Array.isArray(patterns)).toBe(true)
    })

    it('should return rules array', () => {
      const rules = progressiveOptimizer.getRules()
      expect(Array.isArray(rules)).toBe(true)
    })

    it('should return insights array', () => {
      const insights = progressiveOptimizer.getInsights()
      expect(Array.isArray(insights)).toBe(true)
    })
  })

  describe('metrics collection', () => {
    it('should record metrics with name, value, category', () => {
      progressiveOptimizer.recordMetric('loadTime', 1500, 'performance')
      const metrics = progressiveOptimizer.getMetrics()
      expect(metrics.length).toBeGreaterThanOrEqual(1)
      const loadTimeMetric = metrics.find(m => m.name === 'loadTime')
      expect(loadTimeMetric).toBeDefined()
      expect(loadTimeMetric!.value).toBe(1500)
      expect(loadTimeMetric!.category).toBe('performance')
    })

    it('should record metrics with metadata', () => {
      const metadata = { fileSize: 1024, pages: 10 }
      progressiveOptimizer.recordMetric('documentLoad', 2000, 'performance', metadata)
      const metrics = progressiveOptimizer.getMetrics()
      const metric = metrics.find(m => m.name === 'documentLoad')
      expect(metric).toBeDefined()
      expect(metric!.metadata).toEqual(metadata)
    })

    it('should handle different metric categories', () => {
      progressiveOptimizer.recordMetric('test_performance', 1, 'performance')
      progressiveOptimizer.recordMetric('test_usage', 2, 'usage')
      progressiveOptimizer.recordMetric('test_error', 3, 'error')
      progressiveOptimizer.recordMetric('test_memory', 4, 'memory')

      const metrics = progressiveOptimizer.getMetrics()
      const categories = ['performance', 'usage', 'error', 'memory']
      categories.forEach(cat => {
        expect(metrics.some(m => m.category === cat)).toBe(true)
      })
    })

    it('should not crash on invalid metric data', () => {
      expect(() => {
        progressiveOptimizer.recordMetric('', NaN, 'performance')
      }).not.toThrow()
    })

    it('should limit metrics to last 1000 entries', () => {
      progressiveOptimizer.clearMetrics()
      for (let i = 0; i < 1100; i++) {
        progressiveOptimizer.recordMetric(`metric_${i}`, i, 'performance')
      }
      const metrics = progressiveOptimizer.getMetrics()
      expect(metrics.length).toBeLessThanOrEqual(1000)
    })
  })

  describe('usage tracking', () => {
    it('should record usage patterns with string array features', () => {
      progressiveOptimizer.recordUsage('user_123', ['pdfLoad', 'annotation'], 180)
      const patterns = progressiveOptimizer.getPatterns()
      const userPattern = patterns.find(p => p.userId === 'user_123')
      expect(userPattern).toBeDefined()
      expect(userPattern!.features.pdfLoad).toBe(1)
      expect(userPattern!.features.annotation).toBe(1)
      expect(userPattern!.avgSessionDuration).toBe(180)
    })

    it('should update existing usage patterns', () => {
      progressiveOptimizer.recordUsage('user_456', ['feature1'], 120)
      progressiveOptimizer.recordUsage('user_456', ['feature1', 'feature2'], 180)

      const patterns = progressiveOptimizer.getPatterns()
      const userPattern = patterns.find(p => p.userId === 'user_456')
      expect(userPattern).toBeDefined()
      expect(userPattern!.features.feature1).toBe(2) // Accumulated
      expect(userPattern!.features.feature2).toBe(1)
      expect(userPattern!.avgSessionDuration).toBe(150) // Average of 120 and 180
    })

    it('should handle multiple users', () => {
      progressiveOptimizer.recordUsage('user_1', ['feature_a'], 100)
      progressiveOptimizer.recordUsage('user_2', ['feature_b'], 200)

      const patterns = progressiveOptimizer.getPatterns()
      expect(patterns.length).toBeGreaterThanOrEqual(2)
      expect(patterns.find(p => p.userId === 'user_1')).toBeDefined()
      expect(patterns.find(p => p.userId === 'user_2')).toBeDefined()
    })
  })

  describe('optimization rules', () => {
    it('should create optimization rules', () => {
      const rule = progressiveOptimizer.createRule({
        name: 'Quick Load Rule',
        condition: { metric: 'loadTime', operator: '>', threshold: 2000 },
        action: { type: 'enable_feature', config: { featureId: 'quickLoad' } },
        enabled: true,
      })

      expect(rule).toBeDefined()
      expect(rule.id).toMatch(/^opt_/)
      expect(rule.name).toBe('Quick Load Rule')

      const rules = progressiveOptimizer.getRules()
      expect(rules.some(r => r.id === rule.id)).toBe(true)
    })

    it('should toggle rules', () => {
      const rule = progressiveOptimizer.createRule({
        name: 'Test Rule',
        condition: { metric: 'test', operator: '>', threshold: 100 },
        action: { type: 'adjust_setting', config: { setting: 'test', value: true } },
        enabled: true,
      })

      const result = progressiveOptimizer.toggleRule(rule.id, false)
      expect(result).toBe(true)

      const rules = progressiveOptimizer.getRules()
      const toggledRule = rules.find(r => r.id === rule.id)
      expect(toggledRule!.enabled).toBe(false)
    })

    it('should delete rules', () => {
      const rule = progressiveOptimizer.createRule({
        name: 'Delete Me',
        condition: { metric: 'test', operator: '>', threshold: 0 },
        action: { type: 'disable_feature', config: { featureId: 'test' } },
        enabled: true,
      })

      const result = progressiveOptimizer.deleteRule(rule.id)
      expect(result).toBe(true)

      const rules = progressiveOptimizer.getRules()
      expect(rules.find(r => r.id === rule.id)).toBeUndefined()
    })

    it('should return false when toggling non-existent rule', () => {
      const result = progressiveOptimizer.toggleRule('non_existent', true)
      expect(result).toBe(false)
    })

    it('should return false when deleting non-existent rule', () => {
      const result = progressiveOptimizer.deleteRule('non_existent')
      expect(result).toBe(false)
    })
  })

  describe('convenience methods', () => {
    it('should record load time', () => {
      progressiveOptimizer.recordLoadTime('pdfOpen', 500)
      const metrics = progressiveOptimizer.getMetrics()
      expect(metrics.some(m => m.name === 'pdfOpen_load_time' && m.value === 500)).toBe(true)
    })

    it('should record memory usage', () => {
      progressiveOptimizer.recordMemoryUsage(1024000)
      const metrics = progressiveOptimizer.getMetrics()
      expect(metrics.some(m => m.name === 'memory_usage' && m.value === 1024000)).toBe(true)
    })

    it('should record error', () => {
      progressiveOptimizer.recordError('Test error', 'test context')
      const metrics = progressiveOptimizer.getMetrics()
      expect(metrics.some(m => m.name === 'error_rate' && m.category === 'error')).toBe(true)
    })

    it('should record feature usage', () => {
      progressiveOptimizer.recordFeatureUsage('annotation', 100)
      const metrics = progressiveOptimizer.getMetrics()
      expect(metrics.some(m => m.name === 'feature_usage_annotation')).toBe(true)
    })
  })

  describe('data export/import', () => {
    it('should export data as JSON string', () => {
      progressiveOptimizer.recordMetric('test', 1, 'performance')
      const exported = progressiveOptimizer.exportData()
      expect(typeof exported).toBe('string')
      const parsed = JSON.parse(exported)
      expect(parsed.metrics).toBeDefined()
      expect(parsed.patterns).toBeDefined()
      expect(parsed.rules).toBeDefined()
      expect(parsed.insights).toBeDefined()
    })

    it('should import data from JSON string', () => {
      progressiveOptimizer.recordMetric('pre_import', 1, 'performance')
      const exported = progressiveOptimizer.exportData()

      progressiveOptimizer.clearMetrics()
      const result = progressiveOptimizer.importData(exported)
      expect(result).toBe(true)

      const metrics = progressiveOptimizer.getMetrics()
      expect(metrics.some(m => m.name === 'pre_import')).toBe(true)
    })

    it('should return false for invalid JSON import', () => {
      const result = progressiveOptimizer.importData('invalid json')
      expect(result).toBe(false)
    })
  })

  describe('clearMetrics', () => {
    it('should clear all metrics', () => {
      progressiveOptimizer.recordMetric('test1', 1, 'performance')
      progressiveOptimizer.recordMetric('test2', 2, 'usage')
      progressiveOptimizer.clearMetrics()
      const metrics = progressiveOptimizer.getMetrics()
      expect(metrics).toHaveLength(0)
    })
  })

  describe('trackPerformance helper', () => {
    it('should record a performance metric', () => {
      trackPerformance('customOp', 42, 'performance')
      const metrics = progressiveOptimizer.getMetrics()
      expect(metrics.some(m => m.name === 'customOp' && m.value === 42)).toBe(true)
    })
  })

  describe('measureFunction helper', () => {
    it('should measure synchronous function execution', () => {
      const testFn = (x: number) => x * 2
      const measured = measureFunction(testFn, 'doubleOp')
      const result = measured(5)
      expect(result).toBe(10)
      // The helper records a metric with the name + '_duration' or just the name
      const metrics = progressiveOptimizer.getMetrics()
      expect(metrics.some(m => m.name.includes('doubleOp'))).toBe(true)
    })
  })

  describe('error handling', () => {
    it('should handle empty data gracefully', () => {
      progressiveOptimizer.clearMetrics()
      const metrics = progressiveOptimizer.getMetrics()
      expect(metrics).toEqual([])
    })

    it('should handle localStorage errors gracefully', () => {
      localStorageMock.setItem.mockImplementationOnce(() => { throw new Error('Storage full') })
      expect(() => {
        progressiveOptimizer.recordMetric('test', 1, 'performance')
      }).not.toThrow()
    })
  })
})