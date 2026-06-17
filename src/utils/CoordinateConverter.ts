import type { Point, Rotation } from '@/types';

/**
 * PDF ↔ 屏幕坐标转换工具
 *
 * PDF 坐标系：左下角为原点，Y 轴向上
 * 屏幕坐标系：左上角为原点，Y 轴向下
 */
export class CoordinateConverter {
  /**
   * PDF 坐标 → 屏幕坐标
   */
  static pdfToScreen(
    pdfPoint: Point,
    pageHeight: number,
    scale: number,
    rotation: Rotation = 0
  ): Point {
    let x: number, y: number;

    switch (rotation) {
      case 90:
        x = pdfPoint.y * scale;
        y = (pageHeight - pdfPoint.x) * scale;
        break;
      case 180:
        x = (pageHeight - pdfPoint.x) * scale;
        y = pdfPoint.y * scale;
        break;
      case 270:
        x = (pageHeight - pdfPoint.y) * scale;
        y = (pageHeight - pdfPoint.x) * scale;
        break;
      default:
        x = pdfPoint.x * scale;
        y = (pageHeight - pdfPoint.y) * scale;
    }

    return { x, y };
  }

  /**
   * 屏幕坐标 → PDF 坐标
   */
  static screenToPdf(
    screenPoint: Point,
    pageHeight: number,
    scale: number,
    rotation: Rotation = 0
  ): Point {
    let x: number, y: number;

    switch (rotation) {
      case 90:
        x = pageHeight - screenPoint.y / scale;
        y = screenPoint.x / scale;
        break;
      case 180:
        x = pageHeight - screenPoint.x / scale;
        y = screenPoint.y / scale;
        break;
      case 270:
        x = screenPoint.y / scale;
        y = pageHeight - screenPoint.x / scale;
        break;
      default:
        x = screenPoint.x / scale;
        y = pageHeight - screenPoint.y / scale;
    }

    return { x, y };
  }

  /**
   * PDF 尺寸 → 屏幕尺寸
   */
  static pdfSizeToScreen(
    width: number,
    height: number,
    scale: number,
    _rotation: Rotation = 0
  ): { width: number; height: number } {
    return {
      width: width * scale,
      height: height * scale,
    };
  }

  /**
   * 屏幕尺寸 → PDF 尺寸
   */
  static screenSizeToPdf(
    width: number,
    height: number,
    scale: number,
    _rotation: Rotation = 0
  ): { width: number; height: number } {
    return {
      width: width / scale,
      height: height / scale,
    };
  }

  /**
   * 计算缩放后旋转的页面显示尺寸
   */
  static getPageDisplaySize(
    pageWidth: number,
    pageHeight: number,
    scale: number,
    rotation: Rotation = 0
  ): { width: number; height: number } {
    const isRotated = rotation === 90 || rotation === 270;
    const w = isRotated ? pageHeight : pageWidth;
    const h = isRotated ? pageWidth : pageHeight;
    return {
      width: w * scale,
      height: h * scale,
    };
  }
}
