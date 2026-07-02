import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  generateId,
  debounce,
  throttle,
  hashFile,
  getVerityPath,
  getBaseName,
  formatFileSize,
  clamp
} from './helpers'

// Mock crypto.subtle for jsdom environment
const mockDigest = vi.fn()
beforeEach(() => {
  mockDigest.mockReset()
  if (!globalThis.crypto?.subtle) {
    Object.defineProperty(globalThis, 'crypto', {
      value: {
        subtle: {
          digest: mockDigest
        },
        getRandomValues: (arr: Uint8Array) => {
          for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256)
          return arr
        }
      },
      writable: true,
      configurable: true
    })
  } else {
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(mockDigest)
  }
})

describe('Utility Functions', () => {
  describe('generateId', () => {
    it('should generate unique ID with default prefix', () => {
      const id1 = generateId()
      const id2 = generateId()

      expect(id1).toMatch(/^id_\d+_[a-z0-9]+$/)
      expect(id1).not.toBe(id2)
    })

    it('should generate unique ID with custom prefix', () => {
      const id = generateId('custom')
      expect(id).toMatch(/^custom_\d+_[a-z0-9]+$/)
    })

    it('should generate different IDs with different timestamps', () => {
      const id1 = generateId('test')
      vi.spyOn(Date, 'now').mockImplementationOnce(() => Date.now() + 1000)
      const id2 = generateId('test')
      expect(id1).not.toBe(id2)
    })
  })

  describe('debounce', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('should debounce function calls', () => {
      const mockFn = vi.fn()
      const debouncedFn = debounce(mockFn, 100)

      debouncedFn()
      expect(mockFn).not.toHaveBeenCalled()

      vi.advanceTimersByTime(50)
      debouncedFn()
      expect(mockFn).not.toHaveBeenCalled()

      vi.advanceTimersByTime(100)
      expect(mockFn).toHaveBeenCalledTimes(1)
    })

    it('should cancel debounced function', () => {
      const mockFn = vi.fn()
      const debouncedFn = debounce(mockFn, 100)

      debouncedFn()
      expect(mockFn).not.toHaveBeenCalled()

      debouncedFn.cancel()

      vi.advanceTimersByTime(100)
      expect(mockFn).not.toHaveBeenCalled()
    })

    it('should handle multiple calls correctly', () => {
      const mockFn = vi.fn()
      const debouncedFn = debounce(mockFn, 200)

      debouncedFn(1)
      debouncedFn(2)
      debouncedFn(3)

      expect(mockFn).not.toHaveBeenCalled()

      vi.advanceTimersByTime(199)
      expect(mockFn).not.toHaveBeenCalled()

      vi.advanceTimersByTime(1)
      expect(mockFn).toHaveBeenCalledTimes(1)
      expect(mockFn).toHaveBeenCalledWith(3)
    })
  })

  describe('throttle', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('should throttle function calls', () => {
      const mockFn = vi.fn()
      const throttledFn = throttle(mockFn, 100)

      throttledFn(1)
      expect(mockFn).toHaveBeenCalledTimes(1)
      expect(mockFn).toHaveBeenCalledWith(1)

      throttledFn(2)
      expect(mockFn).toHaveBeenCalledTimes(1)

      vi.advanceTimersByTime(100)
      throttledFn(3)
      expect(mockFn).toHaveBeenCalledTimes(2)
      expect(mockFn).toHaveBeenCalledWith(3)
    })

    it('should handle multiple rapid calls', () => {
      const mockFn = vi.fn()
      const throttledFn = throttle(mockFn, 50)

      throttledFn(1)
      throttledFn(2)
      throttledFn(3)

      expect(mockFn).toHaveBeenCalledTimes(1)
      expect(mockFn).toHaveBeenCalledWith(1)

      vi.advanceTimersByTime(50)
      throttledFn(4)
      expect(mockFn).toHaveBeenCalledTimes(2)
      expect(mockFn).toHaveBeenCalledWith(4)
    })
  })

  describe('hashFile', () => {
    it('should hash ArrayBuffer correctly', async () => {
      // Mock crypto.subtle.digest to return a known hash
      const fakeHash = new Uint8Array(32).fill(0xab)
      mockDigest.mockResolvedValue(fakeHash.buffer)

      const data = new TextEncoder().encode('Hello, World!').buffer
      const hash = await hashFile(data)

      expect(hash).toBe('sha256:' + 'ab'.repeat(32))
      expect(mockDigest).toHaveBeenCalledWith('SHA-256', data)
    })

    it('should generate same hash for same data', async () => {
      const fakeHash = new Uint8Array(32).fill(0xcd)
      mockDigest.mockResolvedValue(fakeHash.buffer)

      const data1 = new TextEncoder().encode('test data').buffer
      const data2 = new TextEncoder().encode('test data').buffer

      const hash1 = await hashFile(data1)
      const hash2 = await hashFile(data2)

      expect(hash1).toBe(hash2)
    })

    it('should generate different hashes for different data', async () => {
      mockDigest.mockResolvedValueOnce(new Uint8Array(32).fill(0x11).buffer)
      mockDigest.mockResolvedValueOnce(new Uint8Array(32).fill(0x22).buffer)

      const data1 = new TextEncoder().encode('data 1').buffer
      const data2 = new TextEncoder().encode('data 2').buffer

      const hash1 = await hashFile(data1)
      const hash2 = await hashFile(data2)

      expect(hash1).not.toBe(hash2)
    })

    it('should handle empty buffer', async () => {
      const fakeHash = new Uint8Array(32).fill(0x00)
      mockDigest.mockResolvedValue(fakeHash.buffer)

      const data = new ArrayBuffer(0)
      const hash = await hashFile(data)

      expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/)
    })

    it('should format hash with correct prefix', async () => {
      const fakeHash = new Uint8Array([0x01, 0x23, 0xab, 0xcd, ...new Uint8Array(28).fill(0)])
      mockDigest.mockResolvedValue(fakeHash.buffer)

      const data = new ArrayBuffer(4)
      const hash = await hashFile(data)

      expect(hash).toMatch(/^sha256:/)
      expect(hash).toContain('0123abcd')
    })
  })

  describe('getVerityPath', () => {
    it('should replace .pdf extension with .verity', () => {
      expect(getVerityPath('/path/to/document.pdf')).toBe('/path/to/document.verity')
    })

    it('should handle uppercase .PDF extension', () => {
      expect(getVerityPath('/path/to/document.PDF')).toBe('/path/to/document.verity')
    })

    it('should handle mixed case .Pdf extension', () => {
      expect(getVerityPath('/path/to/document.Pdf')).toBe('/path/to/document.verity')
    })

    it('should only replace the last .pdf extension', () => {
      expect(getVerityPath('/path/to/document.pdf.backup.pdf')).toBe('/path/to/document.pdf.backup.verity')
    })

    it('should return unchanged if no .pdf extension', () => {
      expect(getVerityPath('/path/to/document.txt')).toBe('/path/to/document.txt')
    })
  })

  describe('getBaseName', () => {
    it('should extract filename without extension', () => {
      expect(getBaseName('/path/to/document.pdf')).toBe('document')
    })

    it('should handle Windows-style paths', () => {
      expect(getBaseName('C:\\Users\\test\\file.txt')).toBe('file')
    })

    it('should handle filename without path', () => {
      expect(getBaseName('file.pdf')).toBe('file')
    })

    it('should handle filename with multiple dots', () => {
      expect(getBaseName('archive.tar.gz')).toBe('archive.tar')
    })

    it('should handle filename without extension', () => {
      expect(getBaseName('README')).toBe('README')
    })

    it('should handle empty string', () => {
      expect(getBaseName('')).toBe('')
    })
  })

  describe('formatFileSize', () => {
    it('should format bytes', () => {
      expect(formatFileSize(0)).toBe('0 B')
      expect(formatFileSize(100)).toBe('100 B')
      expect(formatFileSize(1023)).toBe('1023 B')
    })

    it('should format kilobytes', () => {
      expect(formatFileSize(1024)).toBe('1.0 KB')
      expect(formatFileSize(1536)).toBe('1.5 KB')
      expect(formatFileSize(1024 * 1024 - 1)).toBe('1024.0 KB')
    })

    it('should format megabytes', () => {
      expect(formatFileSize(1024 * 1024)).toBe('1.0 MB')
      expect(formatFileSize(1024 * 1024 * 512)).toBe('512.0 MB')
      expect(formatFileSize(1024 * 1024 * 1024 - 1)).toBe('1024.0 MB')
    })

    it('should format gigabytes', () => {
      expect(formatFileSize(1024 * 1024 * 1024)).toBe('1.00 GB')
      expect(formatFileSize(1024 * 1024 * 1024 * 2.5)).toBe('2.50 GB')
    })
  })

  describe('clamp', () => {
    it('should return value when within range', () => {
      expect(clamp(5, 0, 10)).toBe(5)
      expect(clamp(0, 0, 10)).toBe(0)
      expect(clamp(10, 0, 10)).toBe(10)
    })

    it('should clamp to minimum when below range', () => {
      expect(clamp(-5, 0, 10)).toBe(0)
      expect(clamp(-100, -50, 50)).toBe(-50)
    })

    it('should clamp to maximum when above range', () => {
      expect(clamp(15, 0, 10)).toBe(10)
      expect(clamp(100, -50, 50)).toBe(50)
    })

    it('should handle equal min and max', () => {
      expect(clamp(5, 3, 3)).toBe(3)
      expect(clamp(1, 3, 3)).toBe(3)
    })
  })
})