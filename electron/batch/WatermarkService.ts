import { PDFDocument, degrees, rgb, StandardFonts, PDFPage, PDFFont } from 'pdf-lib';
import type { BrowserWindow } from 'electron';

/** 解析颜色字符串为 rgb 对象 */
function parseColor(color?: string): { r: number; g: number; b: number } {
  if (!color) return { r: 0.5, g: 0.5, b: 0.5 };
  const hex = color.replace('#', '');
  if (hex.length === 6) {
    return {
      r: parseInt(hex.substring(0, 2), 16) / 255,
      g: parseInt(hex.substring(2, 4), 16) / 255,
      b: parseInt(hex.substring(4, 6), 16) / 255,
    };
  }
  return { r: 0.5, g: 0.5, b: 0.5 };
}

/**
 * 水印/页码/页眉页脚服务
 * 基于 pdf-lib 绘制文本与图片元素
 */
export class WatermarkService {
  private mainWindow: BrowserWindow | null = null;

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  private sendProgress(progress: number, message: string): void {
    this.mainWindow?.webContents.send('batch:progress', { progress, message });
  }

  /**
   * 添加水印（文字或图片）
   */
  async addWatermark(
    pdfData: ArrayBuffer,
    options: {
      type: 'text' | 'image';
      content: string;
      opacity: number;
      rotation: number;
      fontSize?: number;
      fontFamily?: string;
      color?: string;
      position?: 'center' | 'tile';
      tileSpacing?: number;
      pageIndices?: number[];
    }
  ): Promise<ArrayBuffer> {
    const binary = Buffer.from(pdfData);
    const doc = await PDFDocument.load(binary, { ignoreEncryption: true });
    const totalPages = doc.getPageCount();
    const indices = options.pageIndices && options.pageIndices.length > 0
      ? options.pageIndices.filter((i) => i >= 0 && i < totalPages)
      : Array.from({ length: totalPages }, (_, i) => i);

    const font = await doc.embedFont(StandardFonts.Helvetica);
    const fontSize = options.fontSize || 48;
    const color = parseColor(options.color);
    const opacity = Math.max(0, Math.min(1, options.opacity));
    const rotationDeg = options.rotation || 0;
    const position = options.position || 'center';

    // 如果是图片水印，预先嵌入
    let image: Awaited<ReturnType<typeof doc.embedPng>> | null = null;
    if (options.type === 'image' && options.content) {
      try {
        const imgData = options.content.startsWith('data:')
          ? Buffer.from(options.content.split(',')[1], 'base64')
          : Buffer.from(options.content, 'base64');
        // 尝试 PNG，失败则尝试 JPG
        try {
          image = await doc.embedPng(imgData);
        } catch {
          image = await doc.embedJpg(imgData);
        }
      } catch {
        throw new Error('无法解析图片数据，请确保提供有效的 PNG 或 JPG 格式');
      }
    }

    const total = indices.length;
    for (let i = 0; i < total; i++) {
      const page = doc.getPage(indices[i]);
      const { width: pw, height: ph } = page.getSize();

      if (position === 'tile') {
        // 平铺模式：在页面上重复绘制水印
        const spacing = options.tileSpacing || 150;
        const cols = Math.ceil(pw / spacing) + 1;
        const rows = Math.ceil(ph / spacing) + 1;

        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < cols; col++) {
            const x = col * spacing;
            const y = row * spacing;
            this.drawWatermarkItem(page, font, image, options, {
              x, y, fontSize, color, opacity, rotationDeg,
            });
          }
        }
      } else {
        // 居中模式
        this.drawWatermarkItem(page, font, image, options, {
          x: pw / 2, y: ph / 2, fontSize, color, opacity, rotationDeg,
        });
      }

      if (i % 10 === 0) {
        this.sendProgress((i + 1) / total, `添加水印 ${i + 1}/${total}...`);
      }
    }

    this.sendProgress(1, '水印添加完成');
    const bytes = await doc.save();
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  }

  /** 在指定位置绘制单个水印元素 */
  private drawWatermarkItem(
    page: PDFPage,
    font: PDFFont,
    image: { width: number; height: number } | null,
    options: { type: 'text' | 'image'; content: string },
    draw: { x: number; y: number; fontSize: number; color: { r: number; g: number; b: number }; opacity: number; rotationDeg: number }
  ): void {
    if (options.type === 'text') {
      const textWidth = font.widthOfTextAtSize(options.content, draw.fontSize);
      page.drawText(options.content, {
        x: draw.x - textWidth / 2,
        y: draw.y - draw.fontSize / 2,
        size: draw.fontSize,
        font,
        color: rgb(draw.color.r, draw.color.g, draw.color.b),
        opacity: draw.opacity,
        rotate: degrees(draw.rotationDeg),
      });
    } else if (image && options.type === 'image') {
      const imgScale = draw.fontSize * 2 / Math.max(image.width, image.height);
      const imgW = image.width * imgScale;
      const imgH = image.height * imgScale;
      page.drawImage(image as Parameters<typeof page.drawImage>[0], {
        x: draw.x - imgW / 2,
        y: draw.y - imgH / 2,
        width: imgW,
        height: imgH,
        opacity: draw.opacity,
        rotate: degrees(draw.rotationDeg),
      });
    }
  }

  /**
   * 添加页码
   */
  async addPageNumbers(
    pdfData: ArrayBuffer,
    options: {
      position: 'bottom-center' | 'bottom-right' | 'bottom-left' | 'top-center' | 'top-right' | 'top-left';
      style: 'arabic' | 'roman' | 'dash' | 'of-total';
      fontSize: number;
      fontFamily?: string;
      color?: string;
      startIndex: number;
      pageIndices?: number[];
    }
  ): Promise<ArrayBuffer> {
    const binary = Buffer.from(pdfData);
    const doc = await PDFDocument.load(binary, { ignoreEncryption: true });
    const totalPages = doc.getPageCount();
    const indices = options.pageIndices && options.pageIndices.length > 0
      ? options.pageIndices.filter((i) => i >= 0 && i < totalPages)
      : Array.from({ length: totalPages }, (_, i) => i);

    const font = await doc.embedFont(StandardFonts.Helvetica);
    const fontSize = options.fontSize || 12;
    const color = parseColor(options.color);
    const startIndex = options.startIndex || 1;
    const margin = 40; // pt from edge

    const total = indices.length;
    for (let i = 0; i < total; i++) {
      const page = doc.getPage(indices[i]);
      const { width: pw, height: ph } = page.getSize();
      const pageNum = startIndex + i;
      const text = this.formatPageNumber(pageNum, startIndex + total - 1, options.style);

      const textWidth = font.widthOfTextAtSize(text, fontSize);
      const { x, y } = this.calculatePosition(options.position, pw, ph, textWidth, fontSize, margin);

      page.drawText(text, {
        x, y,
        size: fontSize,
        font,
        color: rgb(color.r, color.g, color.b),
      });

      if (i % 10 === 0) {
        this.sendProgress((i + 1) / total, `添加页码 ${i + 1}/${total}...`);
      }
    }

    this.sendProgress(1, '页码添加完成');
    const bytes = await doc.save();
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  }

  /**
   * 添加页眉页脚
   */
  async addHeaderFooter(
    pdfData: ArrayBuffer,
    options: {
      headerText?: string;
      footerText?: string;
      fontSize: number;
      fontFamily?: string;
      color?: string;
      pageIndices?: number[];
    }
  ): Promise<ArrayBuffer> {
    const binary = Buffer.from(pdfData);
    const doc = await PDFDocument.load(binary, { ignoreEncryption: true });
    const totalPages = doc.getPageCount();
    const indices = options.pageIndices && options.pageIndices.length > 0
      ? options.pageIndices.filter((i) => i >= 0 && i < totalPages)
      : Array.from({ length: totalPages }, (_, i) => i);

    const font = await doc.embedFont(StandardFonts.Helvetica);
    const fontSize = options.fontSize || 10;
    const color = parseColor(options.color);
    const margin = 30;
    const today = new Date().toLocaleDateString('zh-CN');

    const total = indices.length;
    for (let i = 0; i < total; i++) {
      const page = doc.getPage(indices[i]);
      const { width: pw, height: ph } = page.getSize();
      const pageNum = i + 1;

      // 页眉（左对齐）
      if (options.headerText) {
        const headerText = this.replaceVariables(options.headerText, pageNum, totalPages, today);
        page.drawText(headerText, {
          x: margin,
          y: ph - margin,
          size: fontSize,
          font,
          color: rgb(color.r, color.g, color.b),
        });
      }

      // 页脚（居中）
      if (options.footerText) {
        const footerText = this.replaceVariables(options.footerText, pageNum, totalPages, today);
        const textWidth = font.widthOfTextAtSize(footerText, fontSize);
        page.drawText(footerText, {
          x: (pw - textWidth) / 2,
          y: margin - fontSize,
          size: fontSize,
          font,
          color: rgb(color.r, color.g, color.b),
        });
      }

      if (i % 10 === 0) {
        this.sendProgress((i + 1) / total, `添加页眉页脚 ${i + 1}/${total}...`);
      }
    }

    this.sendProgress(1, '页眉页脚添加完成');
    const bytes = await doc.save();
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  }

  /** 格式化页码 */
  private formatPageNumber(pageNum: number, totalPages: number, style: string): string {
    switch (style) {
      case 'roman':
        return this.toRoman(pageNum);
      case 'dash':
        return `- ${pageNum} -`;
      case 'of-total':
        return `第 ${pageNum} 页 / 共 ${totalPages} 页`;
      case 'arabic':
      default:
        return String(pageNum);
    }
  }

  /** 数字转罗马数字 */
  private toRoman(num: number): string {
    const lookup: [number, string][] = [
      [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
      [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
      [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
    ];
    let result = '';
    let remaining = num;
    for (const [value, symbol] of lookup) {
      while (remaining >= value) {
        result += symbol;
        remaining -= value;
      }
    }
    return result;
  }

  /** 计算页码位置坐标 */
  private calculatePosition(
    position: string,
    pageWidth: number,
    pageHeight: number,
    textWidth: number,
    fontSize: number,
    margin: number
  ): { x: number; y: number } {
    const positions: Record<string, { x: number; y: number }> = {
      'bottom-center': { x: (pageWidth - textWidth) / 2, y: margin },
      'bottom-right': { x: pageWidth - textWidth - margin, y: margin },
      'bottom-left': { x: margin, y: margin },
      'top-center': { x: (pageWidth - textWidth) / 2, y: pageHeight - margin - fontSize },
      'top-right': { x: pageWidth - textWidth - margin, y: pageHeight - margin - fontSize },
      'top-left': { x: margin, y: pageHeight - margin - fontSize },
    };
    return positions[position] || positions['bottom-center'];
  }

  /** 替换页眉页脚中的变量 */
  private replaceVariables(text: string, page: number, total: number, date: string): string {
    return text
      .replace(/\{page\}/g, String(page))
      .replace(/\{total\}/g, String(total))
      .replace(/\{date\}/g, date);
  }
}
