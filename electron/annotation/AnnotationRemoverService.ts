import { PDFDocument, PDFName, PDFArray, PDFDict } from 'pdf-lib';

/** 标注统计信息 */
export interface AnnotationStats {
  total: number;
  byType: Record<string, number>;
  byPage: Record<number, number>;
}

/** 删除标注选项 */
export interface RemoveAnnotationOptions {
  removeAll: boolean;
  types?: string[];
  pageIndices?: number[];
  preserveSignatures?: boolean;
}

/** 删除结果 */
export interface RemoveAnnotationResult {
  removedCount: number;
  remainingCount: number;
  pdfData: ArrayBuffer;
}

/**
 * PDF 标注移除服务
 * 支持按类型、按页面批量删除 PDF 原生标注
 */
export class AnnotationRemoverService {
  /**
   * 检测 PDF 中的标注统计信息
   */
  async detectAnnotations(pdfData: ArrayBuffer): Promise<AnnotationStats> {
    const doc = await PDFDocument.load(pdfData, { ignoreEncryption: true });
    const context = doc.context;
    const pages = doc.getPages();

    const byType: Record<string, number> = {};
    const byPage: Record<number, number> = {};
    let total = 0;

    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      const annots = page.node.Annots();
      if (!annots) continue;

      let pageAnnotCount = 0;
      for (let j = 0; j < annots.size(); j++) {
        const annotRef = annots.get(j);
        const annot = context.lookup(annotRef) as PDFDict;
        if (!annot) continue;

        const subtype = annot.get(PDFName.of('Subtype'));
        const subtypeStr = subtype ? subtype.toString().replace(/^\//, '') : 'Unknown';

        // 检查是否为签名标注（Widget + Sig）
        const ft = annot.get(PDFName.of('FT'));
        if (subtypeStr === 'Widget' && ft && ft.toString() === '/Sig') {
          continue; // 跳过签名标注
        }

        byType[subtypeStr] = (byType[subtypeStr] || 0) + 1;
        pageAnnotCount++;
        total++;
      }

      if (pageAnnotCount > 0) {
        byPage[i] = pageAnnotCount;
      }
    }

    return { total, byType, byPage };
  }

  /**
   * 删除 PDF 中的标注
   */
  async removeAnnotations(
    pdfData: ArrayBuffer,
    options: RemoveAnnotationOptions
  ): Promise<RemoveAnnotationResult> {
    const doc = await PDFDocument.load(pdfData, { ignoreEncryption: true });
    const context = doc.context;
    const pages = doc.getPages();
    const totalPages = pages.length;

    const targetIndices = options.pageIndices && options.pageIndices.length > 0
      ? options.pageIndices.filter((i) => i >= 0 && i < totalPages)
      : Array.from({ length: totalPages }, (_, i) => i);

    const targetTypes = options.types?.map((t) => `/${t}`);
    const preserveSignatures = options.preserveSignatures !== false;

    let removedCount = 0;
    let remainingCount = 0;

    for (const pageIdx of targetIndices) {
      const page = pages[pageIdx];
      const annotsRef = page.node.get(PDFName.of('Annots'));
      if (!annotsRef) continue;

      const annots = context.lookup(annotsRef);
      if (!annots || !(annots instanceof PDFArray)) continue;

      const toKeep: Array<ReturnType<typeof annots.get>> = [];

      for (let j = 0; j < annots.size(); j++) {
        const annotRef = annots.get(j);
        const annot = context.lookup(annotRef) as PDFDict;
        if (!annot) {
          toKeep.push(annotRef);
          continue;
        }

        const subtype = annot.get(PDFName.of('Subtype'));
        const subtypeStr = subtype ? subtype.toString() : '';

        // 保留签名标注
        if (preserveSignatures) {
          const ft = annot.get(PDFName.of('FT'));
          if (subtypeStr === '/Widget' && ft && ft.toString() === '/Sig') {
            toKeep.push(annotRef);
            remainingCount++;
            continue;
          }
        }

        // 按类型过滤
        if (!options.removeAll && targetTypes && targetTypes.length > 0) {
          if (!targetTypes.includes(subtypeStr)) {
            toKeep.push(annotRef);
            remainingCount++;
            continue;
          }
        }

        removedCount++;
      }

      // 重建 Annots 数组
      if (removedCount > 0) {
        const newAnnots = context.obj(toKeep);
        page.node.set(PDFName.of('Annots'), newAnnots);
      }
    }

    // 对于非目标页面，统计其保留的标注
    for (let i = 0; i < totalPages; i++) {
      if (!targetIndices.includes(i)) {
        const annots = pages[i].node.Annots();
        if (annots) remainingCount += annots.size();
      }
    }

    const bytes = await doc.save();
    const pdfResult = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

    return { removedCount, remainingCount, pdfData: pdfResult };
  }
}
