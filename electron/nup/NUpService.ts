import { PDFDocument, PDFName, PDFArray, PDFRawStream, PDFPage } from 'pdf-lib';
import { PAPER_SIZES } from '../resize/PageResizeService';

/** N-up 布局 */
export type NUpLayout = '2x1' | '1x2' | '2x2' | '3x3' | '4x4';

/** N-up 选项 */
export interface NUpOptions {
  layout: NUpLayout;
  pageSize?: string | { width: number; height: number };
  margin?: number;
  border?: boolean;
  order?: 'row' | 'column';
}

/**
 * N-up 多页缩小排列服务
 * 将多个页面缩小排列在单页上
 */
export class NUpService {
  async createNUp(
    pdfData: ArrayBuffer,
    options: NUpOptions
  ): Promise<ArrayBuffer> {
    const srcDoc = await PDFDocument.load(pdfData, { ignoreEncryption: true });
    const srcPages = srcDoc.getPages();
    const totalSrc = srcPages.length;

    // 解析布局
    const [cols, rows] = options.layout.split('x').map(Number) as [number, number];
    const pagesPerSheet = cols * rows;

    // 获取输出页面尺寸
    let outWidth: number, outHeight: number;
    if (options.pageSize) {
      if (typeof options.pageSize === 'string') {
        const size = PAPER_SIZES[options.pageSize];
        if (!size) throw new Error(`未知的纸张尺寸: ${options.pageSize}`);
        outWidth = size.width;
        outHeight = size.height;
      } else {
        outWidth = options.pageSize.width;
        outHeight = options.pageSize.height;
      }
    } else {
      // 默认使用第一页尺寸
      const firstPage = srcPages[0];
      outWidth = firstPage.getSize().width;
      outHeight = firstPage.getSize().height;
    }

    const margin = options.margin || 10;
    const border = options.border || false;
    const order = options.order || 'row';

    // 计算每个缩略区域的尺寸
    const cellWidth = (outWidth - margin * (cols + 1)) / cols;
    const cellHeight = (outHeight - margin * (rows + 1)) / rows;

    // 创建新文档
    const newDoc = await PDFDocument.create();

    // 复制所有源页面
    const copiedPages = await newDoc.copyPages(srcDoc, srcDoc.getPageIndices());

    let pageIndex = 0;
    const context = newDoc.context;

    while (pageIndex < totalSrc) {
      const newPage = newDoc.addPage([outWidth, outHeight]);

      const contentParts: Uint8Array[] = [];
      const encoder = new TextEncoder();

      for (let slot = 0; slot < pagesPerSheet && pageIndex < totalSrc; slot++) {
        let col: number, row: number;
        if (order === 'row') {
          col = slot % cols;
          row = Math.floor(slot / cols);
        } else {
          col = Math.floor(slot / rows);
          row = slot % rows;
        }

        // 计算位置（从顶部开始）
        const x = margin + col * (cellWidth + margin);
        const y = outHeight - margin - (row + 1) * cellHeight - row * margin;

        const srcPage = copiedPages[pageIndex];
        const { width: srcW, height: srcH } = srcPage.getSize();

        // 计算缩放比例（保持比例适应）
        const scaleX = cellWidth / srcW;
        const scaleY = cellHeight / srcH;
        const scale = Math.min(scaleX, scaleY);

        const scaledW = srcW * scale;
        const scaledH = srcH * scale;
        const cellOffsetX = x + (cellWidth - scaledW) / 2;
        const cellOffsetY = y + (cellHeight - scaledH) / 2;

        // 提取源页面内容
        const srcContent = this.extractPageContent(srcPage, newDoc);

        // 绘制边框
        if (border) {
          contentParts.push(encoder.encode(
            `q 0.5 0.5 0.5 RG 0.5 w ${x.toFixed(2)} ${y.toFixed(2)} ${cellWidth.toFixed(2)} ${cellHeight.toFixed(2)} re S Q\n`
          ));
        }

        // 绘制缩略页面内容
        if (srcContent) {
          contentParts.push(encoder.encode('q\n'));
          contentParts.push(encoder.encode(
            `${scale.toFixed(6)} 0 0 ${scale.toFixed(6)} ${cellOffsetX.toFixed(6)} ${cellOffsetY.toFixed(6)} cm\n`
          ));
          contentParts.push(srcContent);
          contentParts.push(encoder.encode('\nQ\n'));
        }

        pageIndex++;
      }

      // 合并所有内容流
      const totalLen = contentParts.reduce((sum, p) => sum + p.length, 0);
      const combined = new Uint8Array(totalLen);
      let offset = 0;
      for (const part of contentParts) {
        combined.set(part, offset);
        offset += part.length;
      }

      const newStream = PDFRawStream.of(context.obj({ Length: combined.length }), combined);
      const newRef = context.register(newStream);
      newPage.node.set(PDFName.of('Contents'), newRef);
    }

    const bytes = await newDoc.save();
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  }

  private extractPageContent(page: PDFPage, doc: PDFDocument): Uint8Array | null {
    const context = doc.context;
    const contentsRef = page.node.get(PDFName.of('Contents'));
    if (!contentsRef) return null;

    const contentsObj = context.lookup(contentsRef);
    if (!contentsObj) return null;

    if (contentsObj instanceof PDFArray) {
      const parts: Uint8Array[] = [];
      for (let i = 0; i < contentsObj.size(); i++) {
        const ref = contentsObj.get(i);
        const stream = context.lookup(ref) as PDFRawStream;
        if (stream && (stream as any).contents) {
          parts.push((stream as any).contents);
        }
      }
      if (parts.length === 0) return null;
      const totalLen = parts.reduce((sum, p) => sum + p.length, 0);
      const combined = new Uint8Array(totalLen);
      let off = 0;
      for (const part of parts) {
        combined.set(part, off);
        off += part.length;
      }
      return combined;
    }

    if ('contents' in contentsObj) {
      return (contentsObj as PDFRawStream).contents;
    }
    return null;
  }
}
