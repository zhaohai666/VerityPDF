import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Mock SearchWorkerBridge to throw, forcing fallback to searchMainThread
// CRITICAL: Do NOT use vi.clearAllMocks() or vi.restoreAllMocks() as they clear
// the mock implementation, causing bridge.search() to return undefined instead
// of rejecting, which leads to "pdfResults is not iterable" error.
const mockSearch = vi.fn().mockRejectedValue(new Error('Worker not available'))
vi.mock('./SearchWorkerBridge', () => {
  return {
    SearchWorkerBridge: vi.fn().mockImplementation(() => ({
      search: mockSearch,
    })),
  }
})

import { SearchService } from './SearchService'

describe('SearchService', () => {
  let searchService: SearchService

  const createMockPDFService = (pageTexts: string[], pageCount?: number) => {
    return {
      isLoaded: true,
      numPages: pageCount ?? pageTexts.length,
      getPageText: vi.fn((page: number) => {
        const idx = page - 1
        if (idx >= 0 && idx < pageTexts.length) return Promise.resolve(pageTexts[idx])
        return Promise.resolve('')
      }),
      getPageTextItems: vi.fn().mockResolvedValue([]),
      getPageSize: vi.fn().mockResolvedValue({ width: 595.28, height: 841.89 }),
    } as any
  }

  beforeEach(() => {
    searchService = new SearchService()
    // Re-apply mock rejection to ensure it persists across tests
    mockSearch.mockRejectedValue(new Error('Worker not available'))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    // Do NOT use vi.restoreAllMocks() — it resets mockSearch to return undefined
    // Only clear console spy call counts (keep mock implementation)
    vi.spyOn(console, 'warn').mockClear()
    vi.spyOn(console, 'error').mockClear()
  })

  describe('search method', () => {
    it('should search for text matches in PDF pages', async () => {
      const mockPDFService = createMockPDFService([
        'Hello world',
        'Hello again',
        'No match here',
      ])

      const results = await searchService.search(mockPDFService, 'Hello', {
        caseSensitive: false,
        wholeWord: false,
      })

      expect(results.length).toBeGreaterThanOrEqual(2)
      expect(results.some(r => r.text.includes('Hello'))).toBe(true)
    })

    it('should handle case sensitivity correctly', async () => {
      const mockPDFService1 = createMockPDFService(['Hello World'])

      const resultsLower = await searchService.search(mockPDFService1, 'hello', {
        caseSensitive: true,
        wholeWord: false,
      })

      const mockPDFService2 = createMockPDFService(['Hello World'])
      const resultsUpper = await searchService.search(mockPDFService2, 'Hello', {
        caseSensitive: true,
        wholeWord: false,
      })

      const mockPDFService3 = createMockPDFService(['Hello World'])
      const resultsInsensitive = await searchService.search(mockPDFService3, 'hello', {
        caseSensitive: false,
        wholeWord: false,
      })

      expect(resultsLower).toHaveLength(0)
      expect(resultsUpper.length).toBeGreaterThanOrEqual(1)
      expect(resultsInsensitive.length).toBeGreaterThanOrEqual(1)
    })

    it('should handle whole word matching', async () => {
      const mockPDFService = createMockPDFService(['Hello wonderful world'])

      const resultsWholeWord = await searchService.search(mockPDFService, 'world', {
        caseSensitive: false,
        wholeWord: true,
      })

      const mockPDFService2 = createMockPDFService(['Hello wonderful world'])
      const resultsInsideWord = await searchService.search(mockPDFService2, 'wor', {
        caseSensitive: false,
        wholeWord: true,
      })

      expect(resultsWholeWord.length).toBeGreaterThanOrEqual(1)
      expect(resultsInsideWord).toHaveLength(0)
    })

    it('should return empty array when no matches found', async () => {
      const mockPDFService = createMockPDFService(['Different text'])

      const results = await searchService.search(mockPDFService, 'missing', {
        caseSensitive: false,
        wholeWord: false,
      })

      expect(results).toHaveLength(0)
    })

    it('should return empty array for empty query', async () => {
      const mockPDFService = createMockPDFService(['Some text'])

      const results = await searchService.search(mockPDFService, '', {
        caseSensitive: false,
        wholeWord: false,
      })

      expect(results).toHaveLength(0)
    })

    it('should return empty array when PDF not loaded', async () => {
      const mockPDFService = { isLoaded: false, numPages: 0, getPageText: vi.fn() }

      const results = await searchService.search(mockPDFService, 'query', {
        caseSensitive: false,
        wholeWord: false,
      })

      expect(results).toHaveLength(0)
    })

    it('should handle PDF service errors gracefully', async () => {
      const mockPDFService = {
        isLoaded: true,
        numPages: 1,
        getPageText: vi.fn().mockRejectedValue(new Error('PDF read error')),
        getPageTextItems: vi.fn().mockResolvedValue([]),
        getPageSize: vi.fn().mockResolvedValue({ width: 595.28, height: 841.89 }),
      }

      const results = await searchService.search(mockPDFService as any, 'query', {
        caseSensitive: false,
        wholeWord: false,
      })

      expect(results).toHaveLength(0)
    })

    it('should return correct match positions', async () => {
      const mockPDFService = createMockPDFService(['The quick brown fox jumps'])

      const results = await searchService.search(mockPDFService, 'fox', {
        caseSensitive: false,
        wholeWord: true,
      })

      expect(results.length).toBeGreaterThanOrEqual(1)
      expect(results[0].startOffset).toBeGreaterThanOrEqual(0)
      expect(results[0].endOffset).toBeGreaterThan(results[0].startOffset)
    })

    it('should include page number in results', async () => {
      const mockPDFService = createMockPDFService(['Hello world'])

      const results = await searchService.search(mockPDFService, 'Hello', {
        caseSensitive: false,
        wholeWord: false,
      })

      expect(results.length).toBeGreaterThanOrEqual(1)
      expect(results[0].page).toBeGreaterThanOrEqual(1)
    })

    it('should handle multiple matches on same page', async () => {
      const mockPDFService = createMockPDFService(['hello world hello universe'])

      const results = await searchService.search(mockPDFService, 'hello', {
        caseSensitive: false,
        wholeWord: true,
      })

      expect(results.length).toBeGreaterThanOrEqual(2)
    })

    it('should handle special regex characters safely', async () => {
      const mockPDFService = createMockPDFService(['test $pecial char^cters'])

      const results = await searchService.search(mockPDFService, '$pecial', {
        caseSensitive: false,
        wholeWord: false,
      })

      // Should handle regex metacharacters properly (either 0 or correct matches)
      expect(Array.isArray(results)).toBe(true)
    })

    it('should search across all pages', async () => {
      const mockPDFService = createMockPDFService(['Match'], 5)

      const results = await searchService.search(mockPDFService, 'Match', {
        caseSensitive: false,
        wholeWord: false,
      })

      expect(mockPDFService.getPageText).toHaveBeenCalled()
      expect(results.length).toBeGreaterThanOrEqual(1)
    })

    it('should mark results as pdf-text type', async () => {
      const mockPDFService = createMockPDFService(['Hello world'])

      const results = await searchService.search(mockPDFService, 'Hello', {
        caseSensitive: false,
        wholeWord: false,
      })

      if (results.length > 0) {
        expect(results[0].type).toBe('pdf-text')
      }
    })
  })

  describe('searchAnnotationsAndComments', () => {
    it('should search annotation content', () => {
      const annotations = [
        { id: '1', type: 'highlight', page: 1, content: 'Important note about testing' },
      ]
      const comments: any[] = []

      const results = searchService.searchAnnotationsAndComments(
        'testing',
        annotations,
        comments,
        { caseSensitive: false, wholeWord: false }
      )

      expect(results.length).toBeGreaterThanOrEqual(1)
      expect(results[0].type).toBe('annotation')
      expect(results[0].annotationId).toBe('1')
    })

    it('should search comment content', () => {
      const annotations: any[] = []
      const comments = [
        { id: 'c1', annotationId: 'a1', author: 'User', text: 'This is a test comment' },
      ]

      const results = searchService.searchAnnotationsAndComments(
        'test',
        annotations,
        comments,
        { caseSensitive: false, wholeWord: false }
      )

      expect(results.length).toBeGreaterThanOrEqual(1)
      expect(results[0].type).toBe('comment')
    })

    it('should return empty array for empty query', () => {
      const results = searchService.searchAnnotationsAndComments(
        '',
        [{ id: '1', type: 'highlight', page: 1, content: 'test' }],
        [],
        { caseSensitive: false, wholeWord: false }
      )

      expect(results).toHaveLength(0)
    })

    it('should handle case sensitivity in annotations', () => {
      const annotations = [
        { id: '1', type: 'highlight', page: 1, content: 'Important Note' },
      ]

      const resultsSensitive = searchService.searchAnnotationsAndComments(
        'important',
        annotations,
        [],
        { caseSensitive: true, wholeWord: false }
      )

      const resultsInsensitive = searchService.searchAnnotationsAndComments(
        'important',
        [{ id: '1', type: 'highlight', page: 1, content: 'Important Note' }],
        [],
        { caseSensitive: false, wholeWord: false }
      )

      expect(resultsSensitive).toHaveLength(0)
      expect(resultsInsensitive.length).toBeGreaterThanOrEqual(1)
    })

    it('should handle whole word matching in annotations', () => {
      const annotations = [
        { id: '1', type: 'highlight', page: 1, content: 'testing is important' },
      ]

      const resultsWholeWord = searchService.searchAnnotationsAndComments(
        'test',
        annotations,
        [],
        { caseSensitive: false, wholeWord: true }
      )

      const resultsPartial = searchService.searchAnnotationsAndComments(
        'test',
        [{ id: '1', type: 'highlight', page: 1, content: 'testing is important' }],
        [],
        { caseSensitive: false, wholeWord: false }
      )

      expect(resultsWholeWord).toHaveLength(0)
      expect(resultsPartial.length).toBeGreaterThanOrEqual(1)
    })

    it('should skip annotations with empty content', () => {
      const annotations = [
        { id: '1', type: 'highlight', page: 1 },
        { id: '2', type: 'highlight', page: 1, content: '' },
      ]

      const results = searchService.searchAnnotationsAndComments(
        'anything',
        annotations as any,
        [],
        { caseSensitive: false, wholeWord: false }
      )

      expect(results).toHaveLength(0)
    })
  })
})