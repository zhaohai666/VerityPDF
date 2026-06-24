import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SmartRenameService } from '../../../../electron/services/enhanced/smart-rename/SmartRenameService';
import { BrowserWindow } from 'electron';
import { PDFDocument } from 'pdf-lib';

// Mock fs to avoid actual file access
vi.mock('fs', () => ({
  readFileSync: vi.fn().mockReturnValue(Buffer.from([0, 1, 2, 3])),
}));

// Hoisted mock function for pdfjs-dist getDocument
const mockGetDocument = vi.hoisted(() =>
  vi.fn().mockReturnValue({
    promise: Promise.resolve({
      numPages: 1,
      getPage: vi.fn().mockResolvedValue({
        getTextContent: vi.fn().mockResolvedValue({ items: [] }),
      }),
      destroy: vi.fn(),
      cleanup: vi.fn(),
    }),
    destroy: vi.fn(),
  })
);

// Mock pdfjs-dist
vi.mock('pdfjs-dist', () => ({
  default: {
    getDocument: mockGetDocument,
  },
  getDocument: mockGetDocument,
}));

describe('SmartRenameService', () => {
  let service: SmartRenameService;
  let mockMainWindow: BrowserWindow;

  beforeEach(() => {
    service = new SmartRenameService();
    mockMainWindow = {
      webContents: {
        send: vi.fn(),
      },
    } as unknown as BrowserWindow;
    service.setMainWindow(mockMainWindow);

    vi.clearAllMocks();

    // Reset the default getDocument mock behavior
    mockGetDocument.mockReturnValue({
      promise: Promise.resolve({
        numPages: 1,
        getPage: vi.fn().mockResolvedValue({
          getTextContent: vi.fn().mockResolvedValue({ items: [] }),
        }),
        destroy: vi.fn(),
        cleanup: vi.fn(),
      }),
      destroy: vi.fn(),
    });
  });

  it('should throw error for invalid file path', async () => {
    await expect(service.generateRenameSuggestions('')).rejects.toThrow(
      '无效的文件路径'
    );
  });

  it('should generate filename from PDF metadata', async () => {
    // Mock PDFDocument.load to return a doc with metadata
    const loadMock = vi.spyOn(PDFDocument, 'load').mockResolvedValue({
      getTitle: () => 'Test Document',
      getAuthor: () => 'John Doe',
      getSubject: () => 'Test Subject',
      getKeywords: () => 'test, keyword',
      getCreationDate: () => new Date('2024-01-15'),
      getModificationDate: () => new Date('2024-01-15'),
      getCreator: () => 'Test Creator',
      getProducer: () => 'Test Producer',
      getPageCount: () => 1,
      getPage: () => ({
        getSize: () => ({ width: 595, height: 842 }),
      }),
    } as any);

    const result = await service.generateRenameSuggestions(
      '/fake/path/test.pdf'
    );

    loadMock.mockRestore();

    expect(result).toContain('Test_Document');
    expect(result).toContain('John_Doe');
    expect(result).toContain('2024-01-15');
  });

  it('should generate filename with default name when metadata is empty', async () => {
    // Mock PDFDocument.load with empty metadata
    const loadMock = vi.spyOn(PDFDocument, 'load').mockResolvedValue({
      getTitle: () => '',
      getAuthor: () => '',
      getSubject: () => '',
      getKeywords: () => '',
      getCreationDate: () => undefined,
      getModificationDate: () => undefined,
      getCreator: () => '',
      getProducer: () => '',
      getPageCount: () => 1,
      getPage: () => ({
        getSize: () => ({ width: 595, height: 842 }),
      }),
    } as any);

    const result = await service.generateRenameSuggestions(
      '/fake/path/test.pdf'
    );

    loadMock.mockRestore();

    // Should include a date in the filename
    expect(result).toMatch(/\d{4}-\d{2}-\d{2}/); // YYYY-MM-DD format
    expect(result.length).toBeGreaterThan(0);
  });

  it('should sanitize filename by replacing invalid characters', async () => {
    // Mock PDFDocument.load with special characters in metadata
    const loadMock = vi.spyOn(PDFDocument, 'load').mockResolvedValue({
      getTitle: () => 'Test:Document*With?Invalid<Chars>',
      getAuthor: () => 'Author/Name\\Test',
      getSubject: () => '',
      getKeywords: () => '',
      getCreationDate: () => new Date('2024-01-15'),
      getModificationDate: () => new Date('2024-01-15'),
      getCreator: () => '',
      getProducer: () => '',
      getPageCount: () => 1,
      getPage: () => ({
        getSize: () => ({ width: 595, height: 842 }),
      }),
    } as any);

    const result = await service.generateRenameSuggestions(
      '/fake/path/test.pdf'
    );

    loadMock.mockRestore();

    // Invalid characters should be replaced
    expect(result).not.toMatch(/[\\/:*?"<>|]/);
    expect(result).not.toContain(':');
    expect(result).not.toContain('*');
    expect(result).not.toContain('?');
    expect(result).not.toContain('<');
    expect(result).not.toContain('>');
    expect(result).not.toContain('|');
  });

  it('should extract keywords from PDF content', async () => {
    const loadMock = vi.spyOn(PDFDocument, 'load').mockResolvedValue({
      getTitle: () => '',
      getAuthor: () => '',
      getSubject: () => '',
      getKeywords: () => '',
      getCreationDate: () => undefined,
      getModificationDate: () => undefined,
      getCreator: () => '',
      getProducer: () => '',
      getPageCount: () => 1,
      getPage: () => ({
        getSize: () => ({ width: 595, height: 842 }),
      }),
    } as any);

    // Override getDocument mock for keyword extraction
    mockGetDocument.mockReturnValue({
      promise: Promise.resolve({
        numPages: 1,
        getPage: vi.fn().mockResolvedValue({
          getTextContent: vi.fn().mockResolvedValue({
            items: [
              { str: 'Project' },
              { str: 'Alpha' },
              { str: 'Research' },
              { str: 'Development' },
              { str: 'Test' },
              { str: 'The' },
              { str: 'and' },
            ],
          }),
        }),
        destroy: vi.fn(),
        cleanup: vi.fn(),
      }),
      destroy: vi.fn(),
    });

    const result = await service.generateRenameSuggestions(
      '/fake/path/test.pdf'
    );

    loadMock.mockRestore();

    expect(result).toBeTruthy();
  });

  it('should send progress updates', async () => {
    const loadMock = vi.spyOn(PDFDocument, 'load').mockResolvedValue({
      getTitle: () => 'Test',
      getAuthor: () => '',
      getSubject: () => '',
      getKeywords: () => '',
      getCreationDate: () => new Date(),
      getModificationDate: () => new Date(),
      getCreator: () => '',
      getProducer: () => '',
      getPageCount: () => 1,
      getPage: () => ({
        getSize: () => ({ width: 595, height: 842 }),
      }),
    } as any);

    await service.generateRenameSuggestions('/fake/path/test.pdf');

    loadMock.mockRestore();

    expect(mockMainWindow.webContents.send).toHaveBeenCalledWith(
      'smart-rename:progress',
      expect.objectContaining({
        message: expect.stringContaining('开始分析'),
      })
    );
    expect(mockMainWindow.webContents.send).toHaveBeenCalledWith(
      'smart-rename:progress',
      expect.objectContaining({
        message: expect.stringContaining('完成'),
      })
    );
  });

  it('should handle empty content gracefully', async () => {
    const loadMock = vi.spyOn(PDFDocument, 'load').mockResolvedValue({
      getTitle: () => '',
      getAuthor: () => '',
      getSubject: () => '',
      getKeywords: () => '',
      getCreationDate: () => undefined,
      getModificationDate: () => undefined,
      getCreator: () => '',
      getProducer: () => '',
      getPageCount: () => 1,
      getPage: () => ({
        getSize: () => ({ width: 595, height: 842 }),
      }),
    } as any);

    const result = await service.generateRenameSuggestions(
      '/fake/path/test.pdf'
    );

    loadMock.mockRestore();

    expect(result).toBeTruthy();
    expect(result.length).toBeGreaterThan(0);
  });

  it('should generate unique filenames for different dates', async () => {
    const loadMock = vi.spyOn(PDFDocument, 'load');
    loadMock.mockResolvedValueOnce({
      getTitle: () => 'Report',
      getAuthor: () => 'Author',
      getSubject: () => '',
      getKeywords: () => '',
      getCreationDate: () => new Date('2024-02-15'),
      getModificationDate: () => new Date('2024-02-15'),
      getCreator: () => '',
      getProducer: () => '',
      getPageCount: () => 1,
      getPage: () => ({
        getSize: () => ({ width: 595, height: 842 }),
      }),
    } as any);

    const result1 = await service.generateRenameSuggestions(
      '/fake/path/test1.pdf'
    );

    loadMock.mockResolvedValueOnce({
      getTitle: () => 'Report',
      getAuthor: () => 'Author',
      getSubject: () => '',
      getKeywords: () => '',
      getCreationDate: () => new Date('2024-03-15'),
      getModificationDate: () => new Date('2024-03-15'),
      getCreator: () => '',
      getProducer: () => '',
      getPageCount: () => 1,
      getPage: () => ({
        getSize: () => ({ width: 595, height: 842 }),
      }),
    } as any);

    const result2 = await service.generateRenameSuggestions(
      '/fake/path/test2.pdf'
    );

    loadMock.mockRestore();

    expect(result1).toContain('2024-02-15');
    expect(result2).toContain('2024-03-15');
  });
});
