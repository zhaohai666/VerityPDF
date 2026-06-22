import { PDFDocument, PDFName, PDFArray, PDFRawStream } from 'pdf-lib';

/** 纸张尺寸预定义（单位：点，1点=1/72英寸） */
export const PAPER_SIZES: Record<string, { width: number; height: number }> = {
  A3: { width: 841.89, height: 1190.55 },
  A4: { width: 595.28, height: 841.89 },
  A5: { width: 419.53, height: 595.28 },
  Letter: { width: 612, height: 792 },
  Legal: { width: 612, height: 1008 },
  B5: { width: 498.90, height: 708.66 },
};

/** 缩放模式 */
export type ScaleMode = 'fit' | 'stretch' | 'crop';

/** 缩放选项 */
export interface ResizeOptions {
  targetSize: string | { width: number; height: number };
  scaleMode: ScaleMode;
  pageIndices?: number[];
}

/**
 * 页面尺寸缩放服务
 * 创建新文档，将源页面缩放后嵌入到新页面中
 */
export class PageResizeService {
  async resizePages(
    pdfData: ArrayBuffer,
    options: ResizeOptions
  ): Promise<ArrayBuffer> {
    const srcDoc = await PDFDocument.load(pdfData, { ignoreEncryption: true });
    const srcPages = srcDoc.getPages();
    const totalPages = srcPages.length;

    // 获取目标尺寸
    let targetWidth: number;
    let targetHeight: number;
    if (typeof options.targetSize === 'string') {
      const size = PAPER_SIZES[options.targetSize];
      if (!size) throw new Error(`未知的纸张尺寸: ${options.targetSize}`);
      targetWidth = size.width;
      targetHeight = size.height;
    } else {
      targetWidth = options.targetSize.width;
      targetHeight = options.targetSize.height;
    }

    const targetIndices = options.pageIndices && options.pageIndices.length > 0
      ? options.pageIndices.filter((i) => i >= 0 && i < totalPages)
      : Array.from({ length: totalPages }, (_, i) => i);

    // 创建新文档
    const newDoc = await PDFDocument.create();

    // 复制所有页面到新文档
    const copiedPages = await newDoc.copyPages(srcDoc, srcDoc.getPageIndices());

    for (let i = 0; i < totalPages; i++) {
      const copiedPage = copiedPages[i];

      if (targetIndices.includes(i)) {
        const srcPage = srcPages[i];
        const { width: srcWidth, height: srcHeight } = srcPage.getSize();

        let scaleX: number, scaleY: number, offsetX = 0, offsetY = 0;

        switch (options.scaleMode) {
          case 'fit': {
            const s = Math.min(targetWidth / srcWidth, targetHeight / srcHeight);
            scaleX = s;
            scaleY = s;
            offsetX = (targetWidth - srcWidth * s) / 2;
            offsetY = (targetHeight - srcHeight * s) / 2;
            break;
          }
          case 'stretch': {
            scaleX = targetWidth / srcWidth;
            scaleY = targetHeight / srcHeight;
            break;
          }
          case 'crop': {
            const s = Math.max(targetWidth / srcWidth, targetHeight / srcHeight);
            scaleX = s;
            scaleY = s;
            offsetX = (targetWidth - srcWidth * s) / 2;
            offsetY = (targetHeight - srcHeight * s) / 2;
            break;
          }
          default:
            scaleX = 1;
            scaleY = 1;
        }

        // 设置新的 MediaBox 和 CropBox
        copiedPage.setMediaBox(0, 0, targetWidth, targetHeight);
        copiedPage.setCropBox(0, 0, targetWidth, targetHeight);

        // 在原有内容流前添加变换矩阵
        this.prependTransform(newDoc, copiedPage, scaleX, scaleY, offsetX, offsetY);
      }

      newDoc.addPage(copiedPage);
    }

    const bytes = await newDoc.save();
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  }

  /**
   * 在页面内容流前插入缩放和平移变换
   */
  private prependTransform(
    doc: PDFDocument,
    page: ReturnType<PDFDocument['addPage']>,
    scaleX: number,
    scaleY: number,
    offsetX: number,
    offsetY: number
  ): void {
    const context = doc.context;

    // 构建变换矩阵: q scaleX 0 0 scaleY offsetX offsetY cm
    const transformStr = `q ${scaleX.toFixed(6)} 0 0 ${scaleY.toFixed(6)} ${offsetX.toFixed(6)} ${offsetY.toFixed(6)} cm\n`;
    const transformBytes = new TextEncoder().encode(transformStr);

    // 结束标记
    const endStr = `\nQ\n`;
    const endBytes = new TextEncoder().encode(endStr);

    // 获取现有内容流
    const contentsRef = page.node.get(PDFName.of('Contents'));
    if (!contentsRef) return;

    const contentsObj = context.lookup(contentsRef);
    let existingBytes: Uint8Array;

    if (contentsObj instanceof PDFArray) {
      // 多个内容流：合并
      const parts: Uint8Array[] = [];
      for (let i = 0; i < contentsObj.size(); i++) {
        const ref = contentsObj.get(i);
        const stream = context.lookup(ref) as PDFRawStream;
        if (stream && stream.contents) {
          parts.push(stream.contents);
        }
      }
      const totalLen = parts.reduce((sum, p) => sum + p.length, 0);
      existingBytes = new Uint8Array(totalLen);
      let offset = 0;
      for (const part of parts) {
        existingBytes.set(part, offset);
        offset += part.length;
      }
    } else if (contentsObj && 'contents' in contentsObj) {
      existingBytes = (contentsObj as PDFRawStream).contents;
    } else {
      return;
    }

    // 合并: transform + existing + end
    const combined = new Uint8Array(transformBytes.length + existingBytes.length + endBytes.length);
    combined.set(transformBytes, 0);
    combined.set(existingBytes, transformBytes.length);
    combined.set(endBytes, transformBytes.length + existingBytes.length);

    // 创建新的内容流
    const newStream = PDFRawStream.of(
      context.obj({ Length: combined.length }),
      combined
    );
    const newRef = context.register(newStream);
    page.node.set(PDFName.of('Contents'), newRef);
  }
}
