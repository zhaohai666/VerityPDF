import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StampLibraryService } from '../../../../electron/services/enhanced/stamp-library/StampLibraryService';
import { BrowserWindow } from 'electron';

describe('StampLibraryService', () => {
  let service: StampLibraryService;
  let mockMainWindow: BrowserWindow;

  beforeEach(() => {
    service = new StampLibraryService();
    mockMainWindow = {
      webContents: {
        send: vi.fn()
      },
      getTitle: vi.fn()
    } as unknown as BrowserWindow;
    service.setMainWindow(mockMainWindow);
    vi.clearAllMocks();
  });

  it('should get all stamps', () => {
    const stamps = service.getAllStamps();

    expect(Array.isArray(stamps)).toBe(true);
    expect(stamps.length).toBeGreaterThan(0);

    // Check that we have the expected preset stamps
    const stampIds = stamps.map(s => s.id);
    expect(stampIds).toContain('approved');
    expect(stampIds).toContain('confidential');
    expect(stampIds).toContain('draft');
    expect(stampIds).toContain('date');

    // Check structure of a stamp
    const approvedStamp = stamps.find(s => s.id === 'approved');
    expect(approvedStamp).toBeDefined();
    expect(approvedStamp?.name).toBe('已批准');
    expect(approvedStamp?.text).toBe('APPROVED');
    expect(approvedStamp?.fontSize).toBe(48);
    expect(approvedStamp?.fontFamily).toBe('Helvetica-Bold');
    expect(approvedStamp?.color).toBe('rgba(0, 128, 0, 0.5)');
    expect(approvedStamp?.opacity).toBe(0.5);
    expect(approvedStamp?.rotation).toBe(-45);
  });

  it('should get stamp by ID', () => {
    const approvedStamp = service.getStampById('approved');
    expect(approvedStamp).toBeDefined();
    expect(approvedStamp?.id).toBe('approved');
    expect(approvedStamp?.name).toBe('已批准');
    expect(approvedStamp?.text).toBe('APPROVED');

    const confidentialStamp = service.getStampById('confidential');
    expect(confidentialStamp).toBeDefined();
    expect(confidentialStamp?.id).toBe('confidential');
    expect(confidentialStamp?.name).toBe('机密');
    expect(confidentialStamp?.text).toBe('CONFIDENTIAL');

    // Test non-existent ID
    const nonExistent = service.getStampById('non-existent');
    expect(nonExistent).toBeNull();

    // Test empty ID
    const emptyId = service.getStampById('');
    expect(emptyId).toBeNull();
  });

  it('should get date stamp text', () => {
    const dateText = service.getDateStampText();
    expect(typeof dateText).toBe('string');
    // Should be in YYYY-MM-DD format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    expect(dateText).toMatch(dateRegex);

    // Verify it's a valid date
    const dateParts = dateText.split('-');
    const year = parseInt(dateParts[0], 10);
    const month = parseInt(dateParts[1], 10) - 1; // Month is 0-indexed in JS
    const day = parseInt(dateParts[2], 10);
    const date = new Date(year, month, day);
    expect(date.getFullYear()).toBe(year);
    expect(date.getMonth()).toBe(month);
    expect(date.getDate()).toBe(day);
  });
});