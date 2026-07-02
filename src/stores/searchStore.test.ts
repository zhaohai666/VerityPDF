import { describe, it, expect, beforeEach } from 'vitest'
import { useSearchStore } from './searchStore'
import type { SearchResultItem } from '../services/search/SearchService'

const mockResult: SearchResultItem = {
  page: 0,
  matchIndex: 1,
  text: 'search result text',
  startOffset: 10,
  endOffset: 20,
  rects: [{ x: 100, y: 200, width: 300, height: 50 }],
}

describe('Search Store', () => {
  beforeEach(() => {
    useSearchStore.setState({
      visible: false,
      query: '',
      replaceQuery: '',
      options: { caseSensitive: false, wholeWord: false },
      results: [],
      currentMatchIndex: 0,
      isSearching: false,
      searchProgress: 0,
      showReplace: false,
    })
  })

  it('should initialize with default state', () => {
    const state = useSearchStore.getState()
    expect(state.visible).toBe(false)
    expect(state.query).toBe('')
    expect(state.replaceQuery).toBe('')
    expect(state.options).toEqual({ caseSensitive: false, wholeWord: false })
    expect(state.results).toEqual([])
    expect(state.currentMatchIndex).toBe(0)
    expect(state.isSearching).toBe(false)
    expect(state.searchProgress).toBe(0)
    expect(state.showReplace).toBe(false)
  })

  it('should set visibility', () => {
    useSearchStore.getState().setVisible(true)
    expect(useSearchStore.getState().visible).toBe(true)
    
    useSearchStore.getState().setVisible(false)
    expect(useSearchStore.getState().visible).toBe(false)
  })

  it('should toggle visibility', () => {
    const initial = useSearchStore.getState().visible
    useSearchStore.getState().toggleVisible()
    expect(useSearchStore.getState().visible).toBe(!initial)
    
    useSearchStore.getState().toggleVisible()
    expect(useSearchStore.getState().visible).toBe(initial)
  })

  it('should set query', () => {
    useSearchStore.getState().setQuery('search term')
    expect(useSearchStore.getState().query).toBe('search term')
  })

  it('should set replace query', () => {
    useSearchStore.getState().setReplaceQuery('replacement')
    expect(useSearchStore.getState().replaceQuery).toBe('replacement')
  })

  it('should set options with partial merge', () => {
    useSearchStore.getState().setOptions({ caseSensitive: true })
    expect(useSearchStore.getState().options).toEqual({ caseSensitive: true, wholeWord: false })
    
    useSearchStore.getState().setOptions({ wholeWord: true })
    expect(useSearchStore.getState().options).toEqual({ caseSensitive: true, wholeWord: true })
  })

  it('should set results and update current match index', () => {
    const results = [mockResult]
    useSearchStore.getState().setResults(results)
    
    const state = useSearchStore.getState()
    expect(state.results).toEqual(results)
    expect(state.currentMatchIndex).toBe(0) // Should be set to 0 when results exist
  })

  it('should set current match index to -1 for empty results', () => {
    useSearchStore.getState().setResults([])
    expect(useSearchStore.getState().currentMatchIndex).toBe(-1)
  })

  it('should set current match index', () => {
    useSearchStore.getState().setCurrentMatchIndex(5)
    expect(useSearchStore.getState().currentMatchIndex).toBe(5)
  })

  it('should navigate to next match', () => {
    const results = [mockResult, mockResult, mockResult]
    useSearchStore.getState().setResults(results)
    
    expect(useSearchStore.getState().currentMatchIndex).toBe(0)
    
    useSearchStore.getState().nextMatch()
    expect(useSearchStore.getState().currentMatchIndex).toBe(1)
    
    useSearchStore.getState().nextMatch()
    expect(useSearchStore.getState().currentMatchIndex).toBe(2)
    
    // Should wrap around to 0
    useSearchStore.getState().nextMatch()
    expect(useSearchStore.getState().currentMatchIndex).toBe(0)
  })

  it('should navigate to previous match', () => {
    const results = [mockResult, mockResult, mockResult]
    useSearchStore.getState().setResults(results)
    useSearchStore.getState().setCurrentMatchIndex(2)
    
    expect(useSearchStore.getState().currentMatchIndex).toBe(2)
    
    useSearchStore.getState().prevMatch()
    expect(useSearchStore.getState().currentMatchIndex).toBe(1)
    
    useSearchStore.getState().prevMatch()
    expect(useSearchStore.getState().currentMatchIndex).toBe(0)
    
    // Should wrap around to end
    useSearchStore.getState().prevMatch()
    expect(useSearchStore.getState().currentMatchIndex).toBe(2)
  })

  it('should not change current match index when no results exist', () => {
    useSearchStore.getState().setResults([])
    
    useSearchStore.getState().nextMatch()
    expect(useSearchStore.getState().currentMatchIndex).toBe(-1)
    
    useSearchStore.getState().prevMatch()
    expect(useSearchStore.getState().currentMatchIndex).toBe(-1)
  })

  it('should set search progress', () => {
    useSearchStore.getState().setSearchProgress(0.5)
    expect(useSearchStore.getState().searchProgress).toBe(0.5)
    
    useSearchStore.getState().setSearchProgress(1)
    expect(useSearchStore.getState().searchProgress).toBe(1)
  })

  it('should set search status', () => {
    useSearchStore.getState().setIsSearching(true)
    expect(useSearchStore.getState().isSearching).toBe(true)
    
    useSearchStore.getState().setIsSearching(false)
    expect(useSearchStore.getState().isSearching).toBe(false)
  })

  it('should set show replace panel', () => {
    useSearchStore.getState().setShowReplace(true)
    expect(useSearchStore.getState().showReplace).toBe(true)
    
    useSearchStore.getState().setShowReplace(false)
    expect(useSearchStore.getState().showReplace).toBe(false)
  })

  it('should reset to default state', () => {
    // Set some custom state
    useSearchStore.getState().setVisible(true)
    useSearchStore.getState().setQuery('test query')
    useSearchStore.getState().setReplaceQuery('test replace')
    useSearchStore.getState().setOptions({ caseSensitive: true })
    useSearchStore.getState().setResults([mockResult])
    useSearchStore.getState().setIsSearching(true)
    useSearchStore.getState().setSearchProgress(0.7)
    useSearchStore.getState().setShowReplace(true)
    
    // Reset
    useSearchStore.getState().reset()
    
    // Verify reset state
    const state = useSearchStore.getState()
    expect(state.visible).toBe(false)
    expect(state.query).toBe('')
    expect(state.replaceQuery).toBe('')
    expect(state.results).toEqual([])
    expect(state.currentMatchIndex).toBe(0)
    expect(state.isSearching).toBe(false)
    expect(state.searchProgress).toBe(0)
    // Note: showReplace is not reset by the reset function
    expect(state.showReplace).toBe(true) // This should remain unchanged
  })

  it('should handle multiple next/prev navigation cycles', () => {
    const results = [mockResult, mockResult, mockResult]
    useSearchStore.getState().setResults(results)
    
    // Navigate through all results multiple times
    for (let i = 0; i < 6; i++) {
      useSearchStore.getState().nextMatch()
    }
    expect(useSearchStore.getState().currentMatchIndex).toBe(0) // Full cycle back to 0
    
    // Navigate backwards multiple times
    for (let i = 0; i < 4; i++) {
      useSearchStore.getState().prevMatch()
    }
    expect(useSearchStore.getState().currentMatchIndex).toBe(2) // Should be at 2 (0-4+3)%3 = 2
  })
})