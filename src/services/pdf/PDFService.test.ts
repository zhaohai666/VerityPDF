import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock pdfjs-dist before importing PDFService
vi.mock('pdfjs-dist', () => {
  const mockPage = {
    getViewport: vi.fn(({ scale }) => ({
      width: 595.28 * scale,
      height: 841.89 * scale,
      rotation: 0,
    })),
    getTextContent: vi.fn().mockResolvedValue({
      items: [
        { str: 'Hello World', transform: [1, 0, 0, 1, 50, 700], width: 100, height: 12 },
      ],
    }),
    render: vi.fn().mockReturnValue({
      promise: Promise.resolve(),
      cancel: vi.fn(),
    }),
  }

  const mockDocument = {
    numPages: 10,
    getPage: vi.fn().mockResolvedValue(mockPage),
    getMetadata: vi.fn().mockResolvedValue({
      info: {
        Title: 'Test Document',
        Author: 'Test Author',
        Subject: 'Test Subject',
        Creator: 'Test Creator',
        Producer: 'Test Producer',
        CreationDate: '2024-01-01',
        ModDate: '2024-01-02',
      },
      metadata: {
        getAll: vi.fn().mockReturnValue(''),
      },
    }),
    destroy: vi.fn(),
  }

  return {
    GlobalWorkerOptions: {
      workerSrc: '',
    },
    getDocument: vi.fn().mockReturnValue({
      promise: Promise.resolve(mockDocument),
      onProgress: null,
    }),
    TextLayer: {},
  }
})

import { PDFService } from './PDFService'

describe('PDFService', () => {
  let pdfService: PDFService

  beforeEach(() => {
    vi.clearAllMocks()
    pdfService = new PDFService()
  })

  describe('initialization', () => {
    it('should create a PDFService instance', () => {
      expect(pdfService).toBeDefined()
    })

    it('should not be loaded initially', () => {
      expect(pdfService.isLoaded).toBe(false)
    })

    it('should have zero pages initially', () => {
      expect(pdfService.numPages).toBe(0)
    })
  })

  describe('loadDocument', () => {
    it('should load a PDF document from ArrayBuffer', async () => {
      const data = new ArrayBuffer(8)
      const doc = await pdfService.loadDocument(data)

      expect(doc).toBeDefined()
      expect(doc.numPages).toBe(10)
      expect(pdfService.isLoaded).toBe(true)
      expect(pdfService.numPages).toBe(10)
    })

    it('should throw error when loading fails', async () => {
      const pdfjsLib = await import('pdfjs-dist')
      vi.mocked(pdfjsLib.getDocument).mockReturnValueOnce({
        promise: Promise.reject(new Error('Invalid PDF')),
        onProgress: null,
      })

      const data = new ArrayBuffer(8)
      await expect(pdfService.loadDocument(data)).rejects.toThrow('Invalid PDF')
    })
  })

  describe('getPage', () => {
    it('should get a page by number', async () => {
      const data = new ArrayBuffer(8)
      await pdfService.loadDocument(data)

      const page = await pdfService.getPage(1)
      expect(page).toBeDefined()
      expect(page.getViewport).toBeDefined()
    })

    it('should throw error when PDF not loaded', async () => {
      await expect(pdfService.getPage(1)).rejects.toThrow('PDF not loaded')
    })
  })

  describe('getDocumentInfo', () => {
    it('should return document info when PDF is loaded', async () => {
      const data = new ArrayBuffer(8)
      await pdfService.loadDocument(data)

      const info = await pdfService.getDocumentInfo('/test/document.pdf')
      expect(info).toBeDefined()
      expect(info!.pageCount).toBe(10)
      expect(info!.title).toBe('Test Document')
      expect(info!.author).toBe('Test Author')
      expect(info!.filePath).toBe('/test/document.pdf')
    })

    it('should return null when PDF not loaded', async () => {
      const info = await pdfService.getDocumentInfo('/test/document.pdf')
      expect(info).toBeNull()
    })
  })

  describe('getPageSize', () => {
    it('should return page dimensions', async () => {
      const data = new ArrayBuffer(8)
      await pdfService.loadDocument(data)

      const size = await pdfService.getPageSize(1)
      expect(size).toBeDefined()
      expect(size.width).toBeGreaterThan(0)
      expect(size.height).toBeGreaterThan(0)
    })
  })

  describe('getPageText', () => {
    it('should get text content from a page', async () => {
      const data = new ArrayBuffer(8)
      await pdfService.loadDocument(data)

      const text = await pdfService.getPageText(1)
      expect(typeof text).toBe('string')
    })

    it('should throw error when PDF not loaded', async () => {
      await expect(pdfService.getPageText(1)).rejects.toThrow()
    })
  })

  describe('getPageTextItems', () => {
    it('should get text items with positions from a page', async () => {
      const data = new ArrayBuffer(8)
      await pdfService.loadDocument(data)

      const items = await pdfService.getPageTextItems(1)
      expect(Array.isArray(items)).toBe(true)
    })
  })

  describe('renderPage', () => {
    it('should render a page to canvas', async () => {
      const data = new ArrayBuffer(8)
      await pdfService.loadDocument(data)

      const canvas = document.createElement('canvas')
      await pdfService.renderPage(1, canvas, 1.0)

      // Canvas should have dimensions set
      expect(canvas.width).toBeGreaterThan(0)
      expect(canvas.height).toBeGreaterThan(0)
    })
  })

  describe('document lifecycle', () => {
    it('should track loaded state after loading document', async () => {
      const data = new ArrayBuffer(8)
      await pdfService.loadDocument(data)
      expect(pdfService.isLoaded).toBe(true)
      expect(pdfService.numPages).toBe(10)
    })

    it('should handle loading a new document after previous one', async () => {
      const data1 = new ArrayBuffer(8)
      await pdfService.loadDocument(data1)
      expect(pdfService.isLoaded).toBe(true)

      // Loading a new document should work
      const data2 = new ArrayBuffer(8)
      const doc = await pdfService.loadDocument(data2)
      expect(doc).toBeDefined()
      expect(pdfService.isLoaded).toBe(true)
    })
  })

  describe('error handling', () => {
    it('should handle missing PDF gracefully', () => {
      expect(() => new PDFService()).not.toThrow()
    })

    it('should handle operations on unloaded PDF', async () => {
      await expect(pdfService.getPage(1)).rejects.toThrow()
    })
  })
})