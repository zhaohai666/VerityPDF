import { PDFDocument, PDFName, PDFArray, PDFRawStream } from 'pdf-lib';

/** 小册子选项 */
export interface BookletOptions {
  /** 装订方向: left=左翻（西文）, right=右翻（中文/日文） */
  binding: 'left' | 'right';
  /** 每张纸上的页面数（2=仅重排序, 4=缩放并排到一张纸上） */
  pagesPerSheet: 2 | 4;
  /** 是否自动补空白页使总页数为4的倍数 */
  addBlankPages: boolean;
}

/** 小册子结果 */
export interface BookletResult {
  pdfData: ArrayBuffer;
  totalPages: number;
  totalSheets: number;
  addedBlankPages: number;
  pageOrder: number[];
}

/**
 * 小册子页序排列服务
 * 重新排列 PDF 页面顺序，使其打印后可以对折装订成小册子
 */
export class BookletService {
  /**
   * 生成小册子页序
   * 对于 N 页（补齐到4的倍数），每张纸包含4个页面:
   * - 正面: 左=[N], 右=[1]  →  翻面后: 左=[2], 右=[N-1]
   * - 即每 sheet 产出 4 个逻辑页
   */
  private generateBookletOrder(totalPages: number, binding: 'left' | 'right'): number[] {
    // 补齐到 4 的倍数
    const padded = Math.ceil(totalPages / 4) * 4;
    const totalSheets = padded / 4;
    const order: number[] = [];

    for (let sheet = 0; sheet < totalSheets; sheet++) {
      if (binding === 'left') {
        // 左翻（西文装订）
        // 正面：右页=大页号，左页=小页号
        // Sheet i 正面: [padded - 2*i, 2*i + 1]
        // Sheet i 反面: [2*i + 2, padded - 2*i - 1]
        const p1 = padded - 2 * sheet;      // 正面左（大）
        const p2 = 2 * sheet + 1;           // 正面右（小）
        const p3 = 2 * sheet + 2;           // 反面左（小）
        const p4 = padded - 2 * sheet - 1;  // 反面右（大）

        order.push(p1, p2);  // 正面
        order.push(p3, p4);  // 反面
      } else {
        // 右翻（中文/日文装订）- 镜像
        const p1 = 2 * sheet + 1;
        const p2 = padded - 2 * sheet;
        const p3 = padded - 2 * sheet - 1;
        const p4 = 2 * sheet + 2;

        order.push(p2, p1);  // 正面
        order.push(p4, p3);  // 反面
      }
    }

    // 将 1-based 页号转为 0-based，超出原始页数的用 -1 表示空白页
    return order.map(p => (p >= 1 && p <= totalPages ? p - 1 : -1));
  }

  async createBooklet(pdfData: ArrayBuffer, options: BookletOptions): Promise<BookletResult> {
    const srcDoc = await PDFDocument.load(pdfData, { ignoreEncryption: true });
    const totalPages = srcDoc.getPageCount();

    if (totalPages < 2) {
      throw new Error('小册子至少需要 2 页');
    }

    const paddedTotal = Math.ceil(totalPages / 4) * 4;
    const addedBlanks = options.addBlankPages ? paddedTotal - totalPages : 0;
    const pageOrder = this.generateBookletOrder(totalPages, options.binding);

    if (options.pagesPerSheet === 2) {
      // 仅重排序，不缩放（每张纸只放一页，用户自行双面打印）
      return this.reorderOnly(srcDoc, pageOrder, totalPages, addedBlanks);
    } else {
      // 缩放并排：将两页缩小放到一张纸上（saddle-stitch）
      return this.imposeBooklet(srcDoc, pageOrder, totalPages, addedBlanks, options);
    }
  }

  /**
   * 仅重排页序（每页保持原始尺寸）
   */
  private async reorderOnly(
    srcDoc: PDFDocument,
    pageOrder: number[],
    _totalPages: number,
    addedBlanks: number
  ): Promise<BookletResult> {
    const newDoc = await PDFDocument.create();
    const validIndices = pageOrder.filter(i => i >= 0);
    const copiedPages = await newDoc.copyPages(srcDoc, validIndices);

    let copyIdx = 0;
    for (const pageIdx of pageOrder) {
      if (pageIdx >= 0) {
        newDoc.addPage(copiedPages[copyIdx++]);
      } else if (addedBlanks > 0) {
        // 添加空白页（使用第一页的尺寸）
        const firstPage = srcDoc.getPages()[0];
        const { width, height } = firstPage.getSize();
        newDoc.addPage([width, height]);
      }
    }

    const bytes = await newDoc.save();
    const resultData = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

    return {
      pdfData: resultData,
      totalPages: pageOrder.length,
      totalSheets: pageOrder.length / 4,
      addedBlankPages: addedBlanks,
      pageOrder: pageOrder.map(i => i + 1), // 返回 1-based 给用户看
    };
  }

  /**
   * 缩放并排模式：将两页缩小放到一张纸上
   */
  private async imposeBooklet(
    srcDoc: PDFDocument,
    pageOrder: number[],
    _totalPages: number,
    addedBlanks: number,
    _options: BookletOptions
  ): Promise<BookletResult> {
    const newDoc = await PDFDocument.create();
    const firstPage = srcDoc.getPages()[0];
    const { width: srcW, height: srcH } = firstPage.getSize();

    // 每张纸的尺寸：两页并排放置（横向）
    const sheetWidth = srcH * 2;  // 横向，两页宽度 = 2 * 原始高度
    const sheetHeight = srcW;      // 高度 = 原始宽度

    // 每两个逻辑页组成一张物理纸
    for (let i = 0; i < pageOrder.length; i += 2) {
      const leftIdx = pageOrder[i];
      const rightIdx = pageOrder[i + 1];

      const sheet = newDoc.addPage([sheetWidth, sheetHeight]);
      const context = newDoc.context;

      // 缩放因子
      const scale = Math.min(srcH / srcW, 1);

      // 复制并放置左页
      if (leftIdx >= 0) {
        const [copiedLeft] = await newDoc.copyPages(srcDoc, [leftIdx]);
        // 使用内容流注入方式放置页面
        this.placePageOnSheet(sheet, copiedLeft, srcDoc, 0, 0, srcH, srcW, context);
      }

      // 复制并放置右页
      if (rightIdx !== undefined && rightIdx >= 0) {
        const [copiedRight] = await newDoc.copyPages(srcDoc, [rightIdx]);
        this.placePageOnSheet(sheet, copiedRight, srcDoc, srcH, 0, srcH, srcW, context);
      }
    }

    const bytes = await newDoc.save();
    const resultData = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

    return {
      pdfData: resultData,
      totalPages: pageOrder.length,
      totalSheets: pageOrder.length / 2,
      addedBlankPages: addedBlanks,
      pageOrder: pageOrder.map(i => i + 1),
    };
  }

  /**
   * 将源页面内容缩放后放置到目标页面的指定位置
   */
  private placePageOnSheet(
    targetPage: ReturnType<PDFDocument['addPage']>,
    sourcePage: ReturnType<PDFDocument['addPage']>,
    _srcDoc: PDFDocument,
    x: number,
    y: number,
    targetW: number,
    targetH: number,
    context: PDFDocument['context']
  ): void {
    const { width: srcW, height: srcH } = sourcePage.getSize();
    const scaleX = targetW / srcW;
    const scaleY = targetH / srcH;

    // 提取源页面内容流
    const contentsRef = sourcePage.node.get(PDFName.of('Contents'));
    if (!contentsRef) return;

    const contentsObj = sourcePage.node.context.lookup(contentsRef);
    let srcBytes: Uint8Array | null = null;

    if (contentsObj instanceof PDFArray) {
      const parts: Uint8Array[] = [];
      for (let i = 0; i < contentsObj.size(); i++) {
        const ref = contentsObj.get(i);
        const stream = sourcePage.node.context.lookup(ref) as PDFRawStream;
        if (stream && (stream as any).contents) {
          parts.push((stream as any).contents);
        }
      }
      const totalLen = parts.reduce((s, p) => s + p.length, 0);
      srcBytes = new Uint8Array(totalLen);
      let offset = 0;
      for (const part of parts) {
        srcBytes.set(part, offset);
        offset += part.length;
      }
    } else if (contentsObj && 'contents' in (contentsObj as any)) {
      srcBytes = (contentsObj as any).contents;
    }

    if (!srcBytes) return;

    const scale = Math.min(scaleX, scaleY);
    const offsetX = x + (targetW - srcW * scale) / 2;
    const offsetY = y + (targetH - srcH * scale) / 2;

    // 构建变换后的内容流
    const prefix = `q ${scale.toFixed(6)} 0 0 ${scale.toFixed(6)} ${offsetX.toFixed(6)} ${offsetY.toFixed(6)} cm\n`;
    const suffix = `\nQ\n`;
    const prefixBytes = new TextEncoder().encode(prefix);
    const suffixBytes = new TextEncoder().encode(suffix);

    const combined = new Uint8Array(prefixBytes.length + srcBytes.length + suffixBytes.length);
    combined.set(prefixBytes, 0);
    combined.set(srcBytes, prefixBytes.length);
    combined.set(suffixBytes, prefixBytes.length + srcBytes.length);

    // 获取现有内容并追加
    const existingRef = targetPage.node.get(PDFName.of('Contents'));
    let existingBytes = new Uint8Array(0);
    if (existingRef) {
      const existingObj = context.lookup(existingRef);
      if (existingObj && 'contents' in (existingObj as any)) {
        existingBytes = (existingObj as any).contents;
      }
    }

    const total = new Uint8Array(existingBytes.length + combined.length);
    total.set(existingBytes, 0);
    total.set(combined, existingBytes.length);

    const newStream = PDFRawStream.of(context.obj({ Length: total.length }), total);
    const newRef = context.register(newStream);
    targetPage.node.set(PDFName.of('Contents'), newRef);
  }
}
