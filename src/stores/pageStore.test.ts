import { describe, it, expect, beforeEach } from 'vitest'
import { usePageStore } from './pageStore'

describe('Page Store', () => {
  beforeEach(() => {
    usePageStore.setState({
      isPageModified: false,
      modifiedPdfBase64: null,
    })
  })

  it('should initialize with default state', () => {
    const state = usePageStore.getState()
    expect(state.isPageModified).toBe(false)
    expect(state.modifiedPdfBase64).toBeNull()
  })

  it('should set page as modified with base64 data', () => {
    const testBase64 = 'sample_base64_data'
    
    usePageStore.getState().setModified(testBase64)
    
    const state = usePageStore.getState()
    expect(state.isPageModified).toBe(true)
    expect(state.modifiedPdfBase64).toBe(testBase64)
  })

  it('should set page as modified with empty string', () => {
    usePageStore.getState().setModified('')
    
    const state = usePageStore.getState()
    expect(state.isPageModified).toBe(true)
    expect(state.modifiedPdfBase64).toBe('')
  })

  it('should reset modified state', () => {
    // First set as modified
    const testBase64 = 'sample_base64_data'
    usePageStore.getState().setModified(testBase64)
    
    // Then reset
    usePageStore.getState().resetModified()
    
    const state = usePageStore.getState()
    expect(state.isPageModified).toBe(false)
    expect(state.modifiedPdfBase64).toBeNull()
  })

  it('should handle multiple modifications correctly', () => {
    const base64First = 'first_base64_data'
    const base64Second = 'second_base64_data'
    
    // First modification
    usePageStore.getState().setModified(base64First)
    expect(usePageStore.getState().modifiedPdfBase64).toBe(base64First)
    
    // Second modification overwrites the first
    usePageStore.getState().setModified(base64Second)
    expect(usePageStore.getState().modifiedPdfBase64).toBe(base64Second)
    expect(usePageStore.getState().isPageModified).toBe(true)
  })

  it('should reset after modification', () => {
    const testBase64 = 'test_data'
    
    // Set modified
    usePageStore.getState().setModified(testBase64)
    expect(usePageStore.getState().isPageModified).toBe(true)
    
    // Reset and verify
    usePageStore.getState().resetModified()
    const state = usePageStore.getState()
    expect(state.isPageModified).toBe(false)
    expect(state.modifiedPdfBase64).toBeNull()
  })
})