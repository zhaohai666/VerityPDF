import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BlankPageDetectionService } from '../../../../electron/services/enhanced/blank-page-detection/BlankPageDetectionService';
import { BrowserWindow } from 'electron';

// Hoisted state to control per-test canvas behavior
const mockCanvasState = vi.hoisted(() => ({
  imageData: new Uint8ClampedArray(100 * 100 * 4).fill(255),
  callIndex: 0,
  imageDataPerCall: [] as Uint8ClampedArray[],
}));

// Mock fs to avoid actual file access
vi.mock('fs', () => ({
  readFileSync: vi.fn().mockReturnValue(Buffer.from([0, 1, 2, 3])),
}));

// Mock pdfjs-dist for the GlobalWorkerOptions import
vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: {
    workerSrc: '',
  },
  getDocument: vi.fn(),
}));

// Mock canvas with controlled pixel data
vi.mock('canvas', () => ({
  createCanvas: (width: number, height: number) => ({
    width,
    height,
    getContext: () => ({
      getImageData: () => {
        // Use per-call data if available, otherwise use the shared state
        const data =
          mockCanvasState.imageDataPerCall.length > 0
            ? mockCanvasState.imageDataPerCall[
                mockCanvasState.callIndex++ %
                  mockCanvasState.imageDataPerCall.length
              ]
            : mockCanvasState.imageData;
        return { data };
      },
    }),
  }),
}));

describe('BlankPageDetectionService', () => {
  let service: BlankPageDetectionService;
  let mockMainWindow: BrowserWindow;

  beforeEach(() => {
    // Reset mock canvas state
    mockCanvasState.imageData = new Uint8ClampedArray(100 * 100 * 4).fill(255);
    mockCanvasState.callIndex = 0;
    mockCanvasState.imageDataPerCall = [];

    service = new BlankPageDetectionService();
    mockMainWindow = {
      webContents: {
        send: vi.fn(),
      },
    } as unknown as BrowserWindow;
    service.setMainWindow(mockMainWindow);

    vi.clearAllMocks();
  });

  it('should detect blank pages correctly', async () => {
    // Mock pdfjs-dist getDocument to return a 1-page PDF
    const { getDocument } = await import('pdfjs-dist');
    vi.mocked(getDocument).mockReturnValue({
      promise: Promise.resolve({
        numPages: 1,
        getPage: vi.fn().mockResolvedValue({
          getViewport: () => ({ width: 100, height: 100 }),
          render: vi.fn().mockResolvedValue(undefined),
          destroy: vi.fn(),
        }),
        destroy: vi.fn(),
        cleanup: vi.fn(),
      }),
    } as any);

    // All white pixels (default) - page will be detected as blank
    const result = await service.detectBlankPages('/fake/path.pdf', {
      pixelThreshold: 240,
      nonWhiteRatioThreshold: 0.01,
    });

    expect(result.blankPages).toContain(1);
    expect(result.totalChecked).toBe(1);
  });

  it('should detect non-blank pages correctly', async () => {
    // Mock pdfjs-dist getDocument
    const { getDocument } = await import('pdfjs-dist');
    vi.mocked(getDocument).mockReturnValue({
      promise: Promise.resolve({
        numPages: 1,
        getPage: vi.fn().mockResolvedValue({
          getViewport: () => ({ width: 100, height: 100 }),
          render: vi.fn().mockResolvedValue(undefined),
          destroy: vi.fn(),
        }),
        destroy: vi.fn(),
        cleanup: vi.fn(),
      }),
    } as any);

    // Set many non-white pixels to exceed the 1% threshold
    const imageData = new Uint8ClampedArray(100 * 100 * 4);
    imageData.fill(255); // all white
    // Make 500 pixels (5% of 10000) non-white to exceed the 1% threshold
    for (let i = 0; i < 500 * 4; i += 4) {
      imageData[i] = 0;     // R
      imageData[i + 1] = 0; // G
      imageData[i + 2] = 0; // B
    }
    mockCanvasState.imageData = imageData;

    const result = await service.detectBlankPages('/fake/path.pdf', {
      pixelThreshold: 240,
      nonWhiteRatioThreshold: 0.01,
    });

    expect(result.blankPages).not.toContain(1);
    expect(result.totalChecked).toBe(1);
  });

  it('should handle multiple pages', async () => {
    // Mock pdfjs-dist getDocument - 2 pages
    const { getDocument } = await import('pdfjs-dist');
    vi.mocked(getDocument).mockReturnValue({
      promise: Promise.resolve({
        numPages: 2,
        getPage: vi
          .fn()
          .mockResolvedValueOnce({
            getViewport: () => ({ width: 100, height: 100 }),
            render: vi.fn().mockResolvedValue(undefined),
            destroy: vi.fn(),
          })
          .mockResolvedValueOnce({
            getViewport: () => ({ width: 100, height: 100 }),
            render: vi.fn().mockResolvedValue(undefined),
            destroy: vi.fn(),
          }),
        destroy: vi.fn(),
        cleanup: vi.fn(),
      }),
    } as any);

    // Page 1: all white (blank), Page 2: many non-white pixels (not blank)
    const allWhite = new Uint8ClampedArray(100 * 100 * 4).fill(255);
    const someBlack = new Uint8ClampedArray(100 * 100 * 4);
    someBlack.fill(255);
    // Make 500 pixels (5% of 10000) non-white to exceed the 1% threshold
    for (let i = 0; i < 500 * 4; i += 4) {
      someBlack[i] = 0;
      someBlack[i + 1] = 0;
      someBlack[i + 2] = 0;
    }
    mockCanvasState.imageDataPerCall = [allWhite, someBlack];
    mockCanvasState.callIndex = 0;

    const result = await service.detectBlankPages('/fake/path.pdf', {
      pixelThreshold: 240,
      nonWhiteRatioThreshold: 0.01,
    });

    expect(result.blankPages).toContain(1);
    expect(result.blankPages).not.toContain(2);
    expect(result.totalChecked).toBe(2);
  });

  it('should send progress updates', async () => {
    // Mock pdfjs-dist getDocument - 2 pages
    const { getDocument } = await import('pdfjs-dist');
    vi.mocked(getDocument).mockReturnValue({
      promise: Promise.resolve({
        numPages: 2,
        getPage: vi.fn().mockResolvedValue({
          getViewport: () => ({ width: 100, height: 100 }),
          render: vi.fn().mockResolvedValue(undefined),
          destroy: vi.fn(),
        }),
        destroy: vi.fn(),
        cleanup: vi.fn(),
      }),
    } as any);

    await service.detectBlankPages('/fake/path.pdf');

    expect(mockMainWindow.webContents.send).toHaveBeenCalledWith(
      'blank-page-detection:progress',
      expect.objectContaining({
        message: expect.stringContaining('开始检测'),
      })
    );
    expect(mockMainWindow.webContents.send).toHaveBeenCalledWith(
      'blank-page-detection:progress',
      expect.objectContaining({
        message: expect.stringContaining('检测完成'),
      })
    );
  });

  it('should throw error for invalid file path', async () => {
    await expect(
      service.detectBlankPages('', {
        pixelThreshold: 240,
        nonWhiteRatioThreshold: 0.01,
      })
    ).rejects.toThrow('无效的文件路径');
  });
});
