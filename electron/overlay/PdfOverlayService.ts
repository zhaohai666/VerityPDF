import { PDFDocument, PDFName, PDFArray, PDFRawStream, PDFPage } from 'pdf-lib';

/** 叠加选项 */
export interface OverlayOptions {
  mode: 'background' | 'foreground';
  opacity: number;
  scale: 'fit' | 'stretch' | 'original';
  pageIndices?: number[];
}

/**
 * PDF 叠加服务
 * 将一个 PDF 的内容叠加到另一个 PDF 上
 * 通过合并内容流实现背景/前景叠加
 */
export class PdfOverlayService {
  async overlayPdfs(
    basePdfData: ArrayBuffer,
    overlayPdfData: ArrayBuffer,
    options: OverlayOptions
  ): Promise<ArrayBuffer> {
    const baseDoc = await PDFDocument.load(basePdfData, { ignoreEncryption: true });
    const overlayDoc = await PDFDocument.load(overlayPdfData, { ignoreEncryption: true });

    const basePages = baseDoc.getPages();
    const totalBase = basePages.length;
    const totalOverlay = overlayDoc.getPageCount();

    const targetIndices = options.pageIndices && options.pageIndices.length > 0
      ? options.pageIndices.filter((i) => i >= 0 && i < totalBase)
      : Array.from({ length: totalBase }, (_, i) => i);

    // 复制叠加文档的页面到基底文档
    const copiedOverlayPages = await baseDoc.copyPages(overlayDoc, overlayDoc.getPageIndices());

    for (const baseIdx of targetIndices) {
      const basePage = basePages[baseIdx];
      const overlayIdx = baseIdx % totalOverlay;
      const overlayPage = copiedOverlayPages[overlayIdx];

      const { width: baseW, height: baseH } = basePage.getSize();
      const { width: overlayW, height: overlayH } = overlayPage.getSize();

      let scaleX: number, scaleY: number;
      switch (options.scale) {
        case 'fit': {
          const s = Math.min(baseW / overlayW, baseH / overlayH);
          scaleX = s;
          scaleY = s;
          break;
        }
        case 'stretch':
          scaleX = baseW / overlayW;
          scaleY = baseH / overlayH;
          break;
        case 'original':
        default:
          scaleX = 1;
          scaleY = 1;
      }

      const offsetX = (baseW - overlayW * scaleX) / 2;
      const offsetY = (baseH - overlayH * scaleY) / 2;

      const opacity = Math.max(0, Math.min(1, options.opacity));

      // 获取叠加页面的内容流字节
      const overlayContent = this.extractPageContent(overlayPage, baseDoc);
      if (!overlayContent) continue;

      // 构建叠加变换前缀
      let prefix = '';
      if (opacity < 1) {
        // 设置透明度需要 ExtGState
        prefix += `q\n`;
        prefix += `${scaleX.toFixed(6)} 0 0 ${scaleY.toFixed(6)} ${offsetX.toFixed(6)} ${offsetY.toFixed(6)} cm\n`;
      } else {
        prefix += `q\n`;
        prefix += `${scaleX.toFixed(6)} 0 0 ${scaleY.toFixed(6)} ${offsetX.toFixed(6)} ${offsetY.toFixed(6)} cm\n`;
      }

      const suffix = `\nQ\n`;
      const prefixBytes = new TextEncoder().encode(prefix);
      const suffixBytes = new TextEncoder().encode(suffix);

      const overlayWrapped = new Uint8Array(prefixBytes.length + overlayContent.length + suffixBytes.length);
      overlayWrapped.set(prefixBytes, 0);
      overlayWrapped.set(overlayContent, prefixBytes.length);
      overlayWrapped.set(suffixBytes, prefixBytes.length + overlayContent.length);

      // 获取基底页面的现有内容流
      const baseContent = this.extractPageContent(basePage, baseDoc);

      const context = baseDoc.context;

      if (options.mode === 'background') {
        // 背景模式: overlay内容 + 基底内容
        const baseWrapped = baseContent
          ? new Uint8Array([...new TextEncoder().encode('q\n'), ...baseContent, ...new TextEncoder().encode('\nQ\n')])
          : new Uint8Array(0);

        const combined = new Uint8Array(overlayWrapped.length + baseWrapped.length);
        combined.set(overlayWrapped, 0);
        combined.set(baseWrapped, overlayWrapped.length);

        const newStream = PDFRawStream.of(context.obj({ Length: combined.length }), combined);
        const newRef = context.register(newStream);
        basePage.node.set(PDFName.of('Contents'), newRef);
      } else {
        // 前景模式: 基底内容 + overlay内容
        const combined = new Uint8Array(
          (baseContent ? baseContent.length : 0) + overlayWrapped.length
        );
        if (baseContent) {
          combined.set(baseContent, 0);
        }
        combined.set(overlayWrapped, baseContent ? baseContent.length : 0);

        const newStream = PDFRawStream.of(context.obj({ Length: combined.length }), combined);
        const newRef = context.register(newStream);
        basePage.node.set(PDFName.of('Contents'), newRef);
      }
    }

    const bytes = await baseDoc.save();
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  }

  /** 提取页面内容流字节 */
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
      let offset = 0;
      for (const part of parts) {
        combined.set(part, offset);
        offset += part.length;
      }
      return combined;
    }

    if ('contents' in contentsObj) {
      return (contentsObj as PDFRawStream).contents;
    }

    return null;
  }
}
