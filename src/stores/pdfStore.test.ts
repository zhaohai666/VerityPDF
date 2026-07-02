import { describe, it, expect, beforeEach } from 'vitest'
import { usePdfStore } from './pdfStore'
import type { PDFDocumentInfo, PDFOutlineItem } from '@/types'

const mockDocumentInfo: PDFDocumentInfo = {
  pageCount: 10,
  title: 'Test Document',
  author: 'Test Author',
  subject: 'Test Subject',
  keywords: ['test', 'document'],
  creator: 'Test Creator',
  producer: 'Test Producer',
  creationDate: new Date('2024-01-01'),
  modificationDate: new Date('2024-01-02'),
  isEncrypted: false,
  permissions: {
    print: true,
    modify: true,
    copy: true,
    annotate: true,
    fillForms: true,
    accessibility: true,
    assemble: true,
  },
  fileSize: 1024000,
  version: '1.7',
}

const mockOutline: PDFOutlineItem[] = [
  {
    title: 'Chapter 1',
    page: 1,
    children: [
      { title: 'Section 1.1', page: 2, children: [] },
      { title: 'Section 1.2', page: 4, children: [] },
    ],
  },
  {
    title: 'Chapter 2',
    page: 6,
    children: [
      { title: 'Section 2.1', page: 7, children: [] },
    ],
  },
]

describe('PDF Store', () => {
  beforeEach(() => {
    usePdfStore.getState().reset()
  })

  it('should initialize with default state', () => {
    const state = usePdfStore.getState()
    expect(state.filePath).toBeNull()
    expect(state.documentInfo).toBeNull()
    expect(state.isLoaded).toBe(false)
    expect(state.isLoading).toBe(false)
    expect(state.loadingProgress).toBe(0)
    expect(state.passwordRequired).toBe(false)
    expect(state.currentPage).toBe(1)
    expect(state.zoom).toBe(1.0)
    expect(state.effectiveZoom).toBe(1.0)
    expect(state.zoomMode).toBe('fitWidth')
    expect(state.rotation).toBe(0)
    expect(state.scrollMode).toBe('continuous')
    expect(state.lowMemoryMode).toBe(false)
    expect(state.outline).toEqual([])
  })

  it('should set file path', () => {
    usePdfStore.getState().setFilePath('/test/document.pdf')
    expect(usePdfStore.getState().filePath).toBe('/test/document.pdf')
  })

  it('should set document info', () => {
    usePdfStore.getState().setDocumentInfo(mockDocumentInfo)
    expect(usePdfStore.getState().documentInfo).toEqual(mockDocumentInfo)
  })

  it('should set loaded state', () => {
    usePdfStore.getState().setLoaded(true)
    expect(usePdfStore.getState().isLoaded).toBe(true)
  })

  it('should set loading state', () => {
    usePdfStore.getState().setLoading(true)
    expect(usePdfStore.getState().isLoading).toBe(true)
  })

  it('should set loading progress', () => {
    usePdfStore.getState().setLoadingProgress(50)
    expect(usePdfStore.getState().loadingProgress).toBe(50)
  })

  it('should set password required', () => {
    usePdfStore.getState().setPasswordRequired(true)
    expect(usePdfStore.getState().passwordRequired).toBe(true)
  })

  it('should set current page', () => {
    usePdfStore.getState().setDocumentInfo(mockDocumentInfo)
    usePdfStore.getState().setCurrentPage(5)
    expect(usePdfStore.getState().currentPage).toBe(5)
  })

  it('should clamp current page to valid range', () => {
    usePdfStore.getState().setDocumentInfo(mockDocumentInfo)
    usePdfStore.getState().setCurrentPage(-1)
    expect(usePdfStore.getState().currentPage).toBe(1)

    usePdfStore.getState().setCurrentPage(100)
    expect(usePdfStore.getState().currentPage).toBe(10)
  })

  it('should set zoom level and update effectiveZoom and zoomMode', () => {
    usePdfStore.getState().setZoom(1.5)
    expect(usePdfStore.getState().zoom).toBe(1.5)
    expect(usePdfStore.getState().effectiveZoom).toBe(1.5)
    expect(usePdfStore.getState().zoomMode).toBe('custom')
  })

  it('should clamp zoom to [0.25, 4.0]', () => {
    usePdfStore.getState().setZoom(0.1)
    expect(usePdfStore.getState().zoom).toBe(0.25)

    usePdfStore.getState().setZoom(5.0)
    expect(usePdfStore.getState().zoom).toBe(4.0)
  })

  it('should set effective zoom with clamping', () => {
    usePdfStore.getState().setEffectiveZoom(2)
    expect(usePdfStore.getState().effectiveZoom).toBe(2)

    usePdfStore.getState().setEffectiveZoom(0.1)
    expect(usePdfStore.getState().effectiveZoom).toBe(0.25)

    usePdfStore.getState().setEffectiveZoom(5.0)
    expect(usePdfStore.getState().effectiveZoom).toBe(4.0)
  })

  it('should set zoom mode', () => {
    usePdfStore.getState().setZoomMode('fit-page')
    expect(usePdfStore.getState().zoomMode).toBe('fit-page')
  })

  it('should set rotation', () => {
    usePdfStore.getState().setRotation(90)
    expect(usePdfStore.getState().rotation).toBe(90)
  })

  it('should normalize rotation to [0, 360)', () => {
    usePdfStore.getState().setRotation(360)
    expect(usePdfStore.getState().rotation).toBe(0)

    usePdfStore.getState().setRotation(-90)
    expect(usePdfStore.getState().rotation).toBe(270)
  })

  it('should set scroll mode', () => {
    usePdfStore.getState().setScrollMode('horizontal')
    expect(usePdfStore.getState().scrollMode).toBe('horizontal')
  })

  it('should set outline', () => {
    usePdfStore.getState().setOutline(mockOutline)
    expect(usePdfStore.getState().outline).toEqual(mockOutline)
  })

  it('should set low memory mode', () => {
    usePdfStore.getState().setLowMemoryMode(true)
    expect(usePdfStore.getState().lowMemoryMode).toBe(true)
  })

  it('should zoom in by 0.25 increments up to 4.0x', () => {
    usePdfStore.getState().setZoom(1)

    usePdfStore.getState().zoomIn()
    expect(usePdfStore.getState().zoom).toBe(1.25)
    expect(usePdfStore.getState().effectiveZoom).toBe(1.25)
    expect(usePdfStore.getState().zoomMode).toBe('custom')

    usePdfStore.getState().zoomIn()
    usePdfStore.getState().zoomIn()
    expect(usePdfStore.getState().zoom).toBe(1.75)

    // Should not exceed 4.0x
    for (let i = 0; i < 20; i++) {
      usePdfStore.getState().zoomIn()
    }
    expect(usePdfStore.getState().zoom).toBe(4.0)
  })

  it('should zoom out by 0.25 increments down to 0.25x', () => {
    usePdfStore.getState().setZoom(2)

    usePdfStore.getState().zoomOut()
    expect(usePdfStore.getState().zoom).toBe(1.75)

    usePdfStore.getState().zoomOut()
    usePdfStore.getState().zoomOut()
    expect(usePdfStore.getState().zoom).toBe(1.25)

    // Should not go below 0.25x
    for (let i = 0; i < 20; i++) {
      usePdfStore.getState().zoomOut()
    }
    expect(usePdfStore.getState().zoom).toBe(0.25)
  })

  it('should go to next page when document is loaded', () => {
    usePdfStore.getState().setDocumentInfo(mockDocumentInfo)
    usePdfStore.getState().setCurrentPage(2)

    usePdfStore.getState().nextPage()
    expect(usePdfStore.getState().currentPage).toBe(3)

    // Should not exceed page count
    usePdfStore.getState().setCurrentPage(10)
    usePdfStore.getState().nextPage()
    expect(usePdfStore.getState().currentPage).toBe(10)
  })

  it('should not go to next page when no document is loaded', () => {
    // Without documentInfo, nextPage checks documentInfo && currentPage < pageCount
    // documentInfo is null, so nextPage does nothing
    expect(usePdfStore.getState().currentPage).toBe(1)
    usePdfStore.getState().nextPage()
    expect(usePdfStore.getState().currentPage).toBe(1)
  })

  it('should go to previous page', () => {
    usePdfStore.getState().setDocumentInfo(mockDocumentInfo)
    usePdfStore.getState().setCurrentPage(5)

    usePdfStore.getState().prevPage()
    expect(usePdfStore.getState().currentPage).toBe(4)

    // Should not go below page 1
    usePdfStore.getState().setCurrentPage(1)
    usePdfStore.getState().prevPage()
    expect(usePdfStore.getState().currentPage).toBe(1)
  })

  it('should rotate page in 90 degree increments', () => {
    usePdfStore.getState().setRotation(0)

    usePdfStore.getState().rotatePage()
    expect(usePdfStore.getState().rotation).toBe(90)

    usePdfStore.getState().rotatePage()
    expect(usePdfStore.getState().rotation).toBe(180)

    usePdfStore.getState().rotatePage()
    expect(usePdfStore.getState().rotation).toBe(270)

    usePdfStore.getState().rotatePage()
    expect(usePdfStore.getState().rotation).toBe(0)
  })

  it('should reset to initial state', () => {
    // Set some state
    usePdfStore.getState().setFilePath('/test/document.pdf')
    usePdfStore.getState().setDocumentInfo(mockDocumentInfo)
    usePdfStore.getState().setLoaded(true)
    usePdfStore.getState().setCurrentPage(5)
    usePdfStore.getState().setZoom(2)
    usePdfStore.getState().setRotation(90)
    usePdfStore.getState().setOutline(mockOutline)

    // Reset
    usePdfStore.getState().reset()

    // Verify reset - note: reset does NOT include effectiveZoom
    const state = usePdfStore.getState()
    expect(state.filePath).toBeNull()
    expect(state.documentInfo).toBeNull()
    expect(state.isLoaded).toBe(false)
    expect(state.isLoading).toBe(false)
    expect(state.loadingProgress).toBe(0)
    expect(state.passwordRequired).toBe(false)
    expect(state.currentPage).toBe(1)
    expect(state.zoom).toBe(1.0)
    expect(state.zoomMode).toBe('fitWidth')
    expect(state.rotation).toBe(0)
    expect(state.scrollMode).toBe('continuous')
    expect(state.lowMemoryMode).toBe(false)
    expect(state.outline).toEqual([])
  })

  it('should handle page navigation edge cases', () => {
    usePdfStore.getState().setDocumentInfo(mockDocumentInfo)

    // setCurrentPage clamps to valid range
    usePdfStore.getState().setCurrentPage(-1)
    expect(usePdfStore.getState().currentPage).toBe(1)

    usePdfStore.getState().setCurrentPage(15)
    expect(usePdfStore.getState().currentPage).toBe(10)
  })

  it('should handle edge case when document info is not set', () => {
    // nextPage should not increment when no document
    usePdfStore.getState().nextPage()
    expect(usePdfStore.getState().currentPage).toBe(1)

    // prevPage should not go below 1
    usePdfStore.getState().prevPage()
    expect(usePdfStore.getState().currentPage).toBe(1)
  })

  it('should handle zoom edge cases', () => {
    // setZoom clamps and sets effectiveZoom + zoomMode
    usePdfStore.getState().setZoom(1.5)
    expect(usePdfStore.getState().zoom).toBe(1.5)
    expect(usePdfStore.getState().effectiveZoom).toBe(1.5)
    expect(usePdfStore.getState().zoomMode).toBe('custom')

    // setZoom clamps to max 4.0
    usePdfStore.getState().setZoom(4.999999)
    expect(usePdfStore.getState().zoom).toBe(4.0)
  })
})