import { describe, it, expect } from 'vitest';
import { CoordinateConverter } from './CoordinateConverter';

describe('CoordinateConverter', () => {
  it('should convert PDF to screen with no rotation', () => {
    const pdfPoint = { x: 100, y: 100 };
    const pageHeight = 1000;
    const scale = 2;

    const result = CoordinateConverter.pdfToScreen(pdfPoint, pageHeight, scale);

    expect(result).toEqual({ x: 200, y: 1800 }); // y = (1000 - 100) * 2 = 1800
  });

  it('should convert screen to PDF with no rotation', () => {
    const screenPoint = { x: 200, y: 1800 };
    const pageHeight = 1000;
    const scale = 2;

    const result = CoordinateConverter.screenToPdf(screenPoint, pageHeight, scale);

    expect(result).toEqual({ x: 100, y: 100 });
  });

  it('should convert PDF to screen with 90° rotation', () => {
    const pdfPoint = { x: 100, y: 200 };
    const pageHeight = 1000;
    const scale = 1;

    const result = CoordinateConverter.pdfToScreen(pdfPoint, pageHeight, scale, 90);

    expect(result).toEqual({ x: 200, y: 900 }); // x = y * scale = 200, y = (pageHeight - x) * scale = 900
  });

  it('should convert PDF to screen with 180° rotation', () => {
    const pdfPoint = { x: 100, y: 200 };
    const pageHeight = 1000;
    const scale = 1;

    const result = CoordinateConverter.pdfToScreen(pdfPoint, pageHeight, scale, 180);

    // 180° rotation: x = (pageHeight - pdfPoint.x) * scale = (1000-100)*1 = 900
    //                y = pdfPoint.y * scale = 200*1 = 200
    expect(result).toEqual({ x: 900, y: 200 });
  });

  it('should convert PDF to screen with 270° rotation', () => {
    const pdfPoint = { x: 200, y: 100 };
    const pageHeight = 1000;
    const scale = 1;

    const result = CoordinateConverter.pdfToScreen(pdfPoint, pageHeight, scale, 270);

    // From code: case 270: x = pageHeight - pdfPoint.y * scale; y = pageHeight - pdfPoint.x * scale;
    // x = 1000 - 100*1 = 900
    // y = 1000 - 200*1 = 800
    expect(result).toEqual({ x: 900, y: 800 });
  });

  it('should convert size correctly', () => {
    const result = CoordinateConverter.pdfSizeToScreen(100, 200, 2);
    expect(result).toEqual({ width: 200, height: 400 });
  });

  it('should convert screen size to PDF', () => {
    const result = CoordinateConverter.screenSizeToPdf(200, 400, 2);
    expect(result).toEqual({ width: 100, height: 200 });
  });

  it('should get display size for rotated page', () => {
    // 90 degree rotation swaps width and height
    const result = CoordinateConverter.getPageDisplaySize(100, 200, 1, 90);
    expect(result).toEqual({ width: 200, height: 100 });

    // 0 degree rotation (default)
    const result2 = CoordinateConverter.getPageDisplaySize(100, 200, 1, 0);
    expect(result2).toEqual({ width: 100, height: 200 });
  });
});