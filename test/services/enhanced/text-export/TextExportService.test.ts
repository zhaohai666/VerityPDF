import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TextExportService } from '../../../../electron/services/enhanced/text-export/TextExportService';
import { BrowserWindow } from 'electron';

// Use vi.hoisted() to define variables needed by vi.mock factories
// vi.mock is hoisted to the top of the file, so vars must be defined before it runs
const mockGetDocument = vi.hoisted(() => vi.fn().mockReturnValue({
  promise: Promise.resolve({
    numPages: 1,
    getPage: vi.fn().mockResolvedValue({
      getTextContent: vi.fn().mockResolvedValue({
        items: [
          { str: 'Test ', lang: undefined, transform: [1, 0, 0, 1, 0, 0] },
          { str: 'text', lang: undefined, transform: [1, 0, 0, 1, 30, 0] }
        ]
      })
    }),
    cleanup: vi.fn()
  })
}));

// Mock modules at the top level so hoisting works correctly
vi.mock('fs', () => ({
  readFileSync: vi.fn().mockReturnValue(Buffer.from([])),
  writeFileSync: vi.fn()
}));

vi.mock('pdfjs-dist', () => ({
  default: {
    GlobalWorkerOptions: {
      workerSrc: ''
    },
    getDocument: mockGetDocument
  },
  GlobalWorkerOptions: {
    workerSrc: ''
  },
  getDocument: mockGetDocument
}));

describe('TextExportService', () => {
  let service: TextExportService;
  let mockMainWindow: BrowserWindow;

  beforeEach(() => {
    service = new TextExportService();
    mockMainWindow = {
      webContents: {
        send: vi.fn()
      }
    } as unknown as BrowserWindow;
    service.setMainWindow(mockMainWindow);
    vi.clearAllMocks();
  });

  it('should create an instance', () => {
    expect(service).toBeInstanceOf(TextExportService);
  });

  it('should have an exportText method', () => {
    expect(typeof service.exportText).toBe('function');
  });

  it('should return a promise when exportText is called', async () => {
    const promise = service.exportText('/fake/path.pdf', '/output/path.txt');
    await expect(promise).resolves.toBe('/output/path.txt');
  });
});
