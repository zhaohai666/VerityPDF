import { describe, it, expect, beforeEach } from 'vitest'
import { useOCRStore } from './ocrStore'

describe('OCR Store', () => {
  beforeEach(() => {
    useOCRStore.getState().reset()
  })

  it('should initialize with default state', () => {
    const state = useOCRStore.getState()
    expect(state.isRecognizing).toBe(false)
    expect(state.progress).toEqual({ status: '', progress: 0 })
    expect(state.result).toBeNull()
    expect(state.selectedPage).toBe(1)
    expect(state.selectedRegion).toBeNull()
    expect(state.language).toBe('eng+chi_sim')
    expect(state.panelVisible).toBe(false)
    expect(state.regionMode).toBe(false)
    expect(state.preprocessOptions).toEqual({
      denoise: true,
      denoiseStrength: 5,
      deskew: true,
      contrastEnhance: true,
      binarize: false,
      sharpen: false,
    })
  })

  it('should set isRecognizing', () => {
    useOCRStore.getState().setIsRecognizing(true)
    expect(useOCRStore.getState().isRecognizing).toBe(true)

    useOCRStore.getState().setIsRecognizing(false)
    expect(useOCRStore.getState().isRecognizing).toBe(false)
  })

  it('should set progress', () => {
    useOCRStore.getState().setProgress({ status: 'recognizing', progress: 0.5 })
    expect(useOCRStore.getState().progress).toEqual({ status: 'recognizing', progress: 0.5 })
  })

  it('should set result', () => {
    const mockResult = {
      pages: [{ page: 1, text: 'Hello', confidence: 0.95 }],
    } as any

    useOCRStore.getState().setResult(mockResult)
    expect(useOCRStore.getState().result).toEqual(mockResult)
  })

  it('should set result to null', () => {
    useOCRStore.getState().setResult({ pages: [] } as any)
    expect(useOCRStore.getState().result).not.toBeNull()

    useOCRStore.getState().setResult(null)
    expect(useOCRStore.getState().result).toBeNull()
  })

  it('should set selectedPage', () => {
    useOCRStore.getState().setSelectedPage(3)
    expect(useOCRStore.getState().selectedPage).toBe(3)
  })

  it('should set selectedRegion', () => {
    const region = { x: 10, y: 20, width: 100, height: 50 }
    useOCRStore.getState().setSelectedRegion(region)
    expect(useOCRStore.getState().selectedRegion).toEqual(region)
  })

  it('should clear selectedRegion by setting null', () => {
    useOCRStore.getState().setSelectedRegion({ x: 10, y: 20, width: 100, height: 50 })
    useOCRStore.getState().setSelectedRegion(null)
    expect(useOCRStore.getState().selectedRegion).toBeNull()
  })

  it('should set language', () => {
    useOCRStore.getState().setLanguage('chi_sim')
    expect(useOCRStore.getState().language).toBe('chi_sim')
  })

  it('should set panelVisible', () => {
    useOCRStore.getState().setPanelVisible(true)
    expect(useOCRStore.getState().panelVisible).toBe(true)

    useOCRStore.getState().setPanelVisible(false)
    expect(useOCRStore.getState().panelVisible).toBe(false)
  })

  it('should set regionMode and clear selectedRegion when enabling', () => {
    useOCRStore.getState().setSelectedRegion({ x: 10, y: 20, width: 100, height: 50 })
    expect(useOCRStore.getState().selectedRegion).not.toBeNull()

    useOCRStore.getState().setRegionMode(true)
    expect(useOCRStore.getState().regionMode).toBe(true)
    expect(useOCRStore.getState().selectedRegion).toBeNull()
  })

  it('should set preprocessOptions', () => {
    const customOptions = {
      denoise: false,
      denoiseStrength: 3,
      deskew: false,
      contrastEnhance: false,
      binarize: true,
      sharpen: true,
    }
    useOCRStore.getState().setPreprocessOptions(customOptions)
    expect(useOCRStore.getState().preprocessOptions).toEqual(customOptions)
  })

  it('should reset state', () => {
    useOCRStore.getState().setIsRecognizing(true)
    useOCRStore.getState().setProgress({ status: 'working', progress: 0.8 })
    useOCRStore.getState().setResult({ pages: [] } as any)
    useOCRStore.getState().setSelectedRegion({ x: 1, y: 2, width: 3, height: 4 })
    useOCRStore.getState().setRegionMode(true)

    useOCRStore.getState().reset()

    const state = useOCRStore.getState()
    expect(state.isRecognizing).toBe(false)
    expect(state.progress).toEqual({ status: '', progress: 0 })
    expect(state.result).toBeNull()
    expect(state.selectedRegion).toBeNull()
    expect(state.regionMode).toBe(false)
    // Note: reset does NOT reset language, selectedPage, panelVisible, preprocessOptions
  })
})