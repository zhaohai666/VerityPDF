import { PDFDocument, degrees, PDFPage, PDFName, PDFArray, PDFRawStream, PDFStream } from 'pdf-lib';
import fs from 'fs';
import type { BrowserWindow } from 'electron';

/**
 * 批量页面操作服务
 * 基于 pdf-lib 实现批量旋转、空白页检测、页面裁剪
 */
export class BatchPageService {
  private mainWindow: BrowserWindow | null = null;

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  private sendProgress(progress: number, message: string): void {
    this.mainWindow?.webContents.send('batch:progress', { progress, message });
  }

  /**
   * 批量旋转指定页面
   */
  async batchRotate(pdfData: ArrayBuffer, options: { pageIndices: number[]; angle: number }): Promise<ArrayBuffer> {
    const { pageIndices, angle } = options;
    const binary = Buffer.from(pdfData);
    const doc = await PDFDocument.load(binary, { ignoreEncryption: true });
    const totalPages = doc.getPageCount();
    const total = pageIndices.length;

    for (let i = 0; i < total; i++) {
      const idx = pageIndices[i];
      if (idx < 0 || idx >= totalPages) continue;

      const page = doc.getPage(idx);
      const currentAngle = page.getRotation().angle;
      page.setRotation(degrees((currentAngle + angle) % 360));

      if (i % 10 === 0) {
        this.sendProgress((i + 1) / total, `旋转页面 ${i + 1}/${total}...`);
      }
    }

    this.sendProgress(1, '旋转完成');
    const bytes = await doc.save();
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  }

  /**
   * 检测空白页面
   * 分析每页内容流，检查是否包含可见绘制操作
   */
  async detectBlankPages(filePath: string, _threshold: number = 0.02): Promise<{ blankIndices: number[]; totalChecked: number }> {
    const data = fs.readFileSync(filePath);
    const doc = await PDFDocument.load(data, { ignoreEncryption: true });
    const totalPages = doc.getPageCount();
    const blankIndices: number[] = [];

    for (let i = 0; i < totalPages; i++) {
      const page = doc.getPage(i);
      const isBlank = await this.isPageBlank(page);

      if (isBlank) {
        blankIndices.push(i);
      }

      if (i % 10 === 0 || i === totalPages - 1) {
        this.sendProgress((i + 1) / totalPages, `检测页面 ${i + 1}/${totalPages}...`);
      }
    }

    this.sendProgress(1, `检测完成，发现 ${blankIndices.length} 个空白页`);
    return { blankIndices, totalChecked: totalPages };
  }

  /**
   * 判断单页是否为空白页
   * 通过分析内容流中的 PDF 绘制操作符来判断
   */
  private async isPageBlank(page: PDFPage): Promise<boolean> {
    try {
      // 获取页面的内容流
      const contents = page.node.lookup(PDFName.of('Contents'));
      if (!contents) return true; // 没有内容流 = 空白

      // 提取原始内容流字节
      const rawBytes = this.extractContentBytes(contents);
      if (!rawBytes || rawBytes.length === 0) return true;

      // 将字节解码为文本，分析绘制操作符
      const contentText = this.decodeContentStream(rawBytes);

      // PDF 可见绘制操作符
      const visibleOps = [
        'S', 's', 'f', 'F', 'f\\*', 'B', 'B\\*', 'b', 'b\\*', // 路径绘制
        'Tj', 'TJ', "'", '"', // 文本显示
        'Do', // XObject 引用（图片、表单等）
        'sh', // 着色图案
      ];

      // 检查是否有可见绘制操作
      for (const op of visibleOps) {
        // 匹配操作符（前面是空白或数字，后面是空白或字符串结尾）
        const regex = new RegExp(`(?:^|\\s)${op}(?:\\s|$)`, 'm');
        if (regex.test(contentText)) {
          // 对于 'Do' 操作，额外检查是否有实际内容
          if (op === 'Do') {
            // 检查引用的 XObject 是否存在于资源中
            const resources = page.node.lookup(PDFName.of('Resources'));
            if (resources) {
              const xObject = (resources as { lookup?: (key: PDFName) => unknown }).lookup?.(PDFName.of('XObject'));
              if (xObject) continue; // 有 XObject 资源，非空白
            }
            continue;
          }
          return false; // 发现可见操作，非空白
        }
      }

      // 额外检查：如果内容流非常短（< 50 字节），视为空白
      if (rawBytes.length < 50) return true;

      return true;
    } catch {
      // 解析失败时保守认为非空白
      return false;
    }
  }

  /**
   * 从 Contents 对象提取原始字节
   */
  private extractContentBytes(contents: unknown): Uint8Array | null {
    try {
      // Contents 可能是单个流或流数组
      if (contents instanceof PDFArray) {
        // 多个内容流，拼接
        const parts: Uint8Array[] = [];
        for (let i = 0; i < contents.size(); i++) {
          const item = contents.lookup(i);
          const bytes = this.getStreamBytes(item);
          if (bytes) parts.push(bytes);
        }
        if (parts.length === 0) return null;
        // 拼接所有部分
        const totalLength = parts.reduce((sum, p) => sum + p.length, 0);
        const result = new Uint8Array(totalLength + parts.length); // +parts.length for newlines
        let offset = 0;
        for (const part of parts) {
          result.set(part, offset);
          offset += part.length;
          result[offset++] = 10; // newline separator
        }
        return result.slice(0, offset);
      }
      return this.getStreamBytes(contents);
    } catch {
      return null;
    }
  }

  /**
   * 从 PDF 流对象获取解码后的字节
   */
  private getStreamBytes(obj: unknown): Uint8Array | null {
    try {
      if (obj instanceof PDFRawStream) {
        const decoded = obj.getContents();
        return decoded instanceof Uint8Array ? decoded : new Uint8Array(decoded);
      }
      if (obj instanceof PDFStream) {
        // pdf-lib PDFStream 的 contents
        const contents = (obj as { contents?: Uint8Array }).contents;
        if (contents) return contents instanceof Uint8Array ? contents : new Uint8Array(contents);
      }
      // 尝试通过 getContents 方法
      if (obj && typeof obj === 'object' && 'getContents' in obj) {
        const c = (obj as { getContents: () => Uint8Array }).getContents();
        return c instanceof Uint8Array ? c : new Uint8Array(c);
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * 将内容流字节解码为文本（用于操作符分析）
   */
  private decodeContentStream(bytes: Uint8Array): string {
    try {
      return new TextDecoder('latin1').decode(bytes);
    } catch {
      // 回退：逐字节转换
      let result = '';
      for (let i = 0; i < bytes.length; i++) {
        result += String.fromCharCode(bytes[i]);
      }
      return result;
    }
  }

  /**
   * 批量裁剪页面（设置 CropBox）
   */
  async batchCrop(pdfData: ArrayBuffer, options: { pageIndices: number[]; margin: { top: number; right: number; bottom: number; left: number } }): Promise<ArrayBuffer> {
    const { pageIndices, margin } = options;
    const binary = Buffer.from(pdfData);
    const doc = await PDFDocument.load(binary, { ignoreEncryption: true });
    const totalPages = doc.getPageCount();
    const total = pageIndices.length;

    for (let i = 0; i < total; i++) {
      const idx = pageIndices[i];
      if (idx < 0 || idx >= totalPages) continue;

      const page = doc.getPage(idx);
      const { width, height } = page.getSize();

      const cropX = margin.left;
      const cropY = margin.bottom;
      const cropW = width - margin.left - margin.right;
      const cropH = height - margin.top - margin.bottom;

      if (cropW <= 0 || cropH <= 0) {
        throw new Error(`第 ${idx + 1} 页裁剪后尺寸为负，请减小边距`);
      }

      page.setCropBox(cropX, cropY, cropW, cropH);

      if (i % 10 === 0) {
        this.sendProgress((i + 1) / total, `裁剪页面 ${i + 1}/${total}...`);
      }
    }

    this.sendProgress(1, '裁剪完成');
    const bytes = await doc.save();
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  }

  /**
   * 删除空白页面（在检测后调用）
   */
  async removeBlankPages(pdfData: ArrayBuffer, blankIndices: number[]): Promise<ArrayBuffer> {
    if (blankIndices.length === 0) return pdfData;

    const binary = Buffer.from(pdfData);
    const doc = await PDFDocument.load(binary, { ignoreEncryption: true });

    // 从后往前删除，避免索引偏移
    const sorted = [...blankIndices].sort((a, b) => b - a);
    const total = sorted.length;

    for (let i = 0; i < total; i++) {
      const idx = sorted[i];
      if (idx >= 0 && idx < doc.getPageCount()) {
        doc.removePage(idx);
      }
      if (i % 10 === 0) {
        this.sendProgress((i + 1) / total, `删除空白页 ${i + 1}/${total}...`);
      }
    }

    this.sendProgress(1, `已删除 ${total} 个空白页`);
    const bytes = await doc.save();
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  }
}
