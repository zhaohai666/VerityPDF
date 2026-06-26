import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MarkdownToPDFService } from '../../../electron/services/convert/MarkdownToPDFService';
import * as fs from 'fs';
import { execFile } from 'child_process';

// Mock fs
vi.mock('fs', () => {
  const actual = vi.importActual('fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
  };
});

// Mock child_process
vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    execFile: vi.fn(),
  };
});

describe('MarkdownToPDFService', () => {
  let service: MarkdownToPDFService;

  beforeEach(() => {
    service = new MarkdownToPDFService();
    vi.clearAllMocks();
  });

  it('should create an instance', () => {
    expect(service).toBeInstanceOf(MarkdownToPDFService);
  });

  it('should have a convertToPdf method', () => {
    expect(typeof service.convertToPdf).toBe('function');
  });

  it('should reject non-markdown files', async () => {
    const result = await service.convertToPdf('/tmp/test.txt', '/tmp', {});
    expect(result.success).toBe(false);
    expect(result.message).toContain('Input file must be a Markdown');
  });

  it('should return error for non-existent input file', async () => {
    const result = await service.convertToPdf('/non/existent/file.md', '/tmp', {});
    expect(result.success).toBe(false);
    expect(result.message).toContain('Input file not found');
  });

  it('should handle missing output directory gracefully', async () => {
    // Setup mocks
    // Mock fs.existsSync to return false for the output directory
    // and fs.mkdirSync to throw an error
    // For input file, we return true (so it passes extension and existence checks)
    (fs.existsSync as any).mockImplementation((path: string) => {
      if (path === '/non/existent/dir') {
        return false;
      }
      // For any other path, return true (so the input file check passes)
      return true;
    });

    (fs.mkdirSync as any).mockImplementation(() => {
      throw new Error('Failed to create directory');
    });

    // Mock execFile to resolve successfully (we won't reach this if mkdir fails)
    (execFile as any).mockResolvedValue({ stdout: '', stderr: '' });

    const result = await service.convertToPdf('/fake/file.md', '/non/existent/dir', {});
    expect(result.success).toBe(false);
    expect(result.message).toContain('Failed to create output directory');
  });
});