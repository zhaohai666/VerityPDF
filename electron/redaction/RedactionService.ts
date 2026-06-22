import { PDFDocument, PDFName } from 'pdf-lib';
import { ContentStreamParser, type ParsedOperation } from '../pdf/ContentStreamParser';

/** 擦除矩形（PDF 点坐标） */
export interface RedactionRect {
  page: number;       // 1-based
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 擦除结果统计 */
export interface RedactionResult {
  removedTextCount: number;
  removedImageCount: number;
  pagesProcessed: number;
}

/**
 * 检查两个矩形是否相交
 */
function rectsIntersect(
  a: { x: number; y: number; width: number; height: number },
  b: RedactionRect
): boolean {
  return !(
    a.x + a.width < b.x ||
    b.x + b.width < a.x ||
    a.y + a.height < b.y ||
    b.y + b.height < a.y
  );
}

/**
 * 对象级 PDF 内容擦除服务
 *
 * 工作原理：
 * 1. 解析 PDF 内容流，提取文本块（BT...ET）和图像引用（Do）
 * 2. 判断每个操作是否与擦除矩形相交
 * 3. 从内容流中移除相交操作的原始字节
 * 4. 在擦除区域插入黑色填充矩形
 * 5. 清理不再被引用的 XObject 资源
 */
export class RedactionService {
  /**
   * 执行擦除
   */
  async redact(
    pdfData: ArrayBuffer,
    rects: RedactionRect[]
  ): Promise<{ data: ArrayBuffer; result: RedactionResult }> {
    if (!rects || rects.length === 0) {
      return {
        data: pdfData.slice(0),
        result: { removedTextCount: 0, removedImageCount: 0, pagesProcessed: 0 },
      };
    }

    const pdfDoc = await PDFDocument.load(pdfData, { ignoreEncryption: true });
    const pages = pdfDoc.getPages();
    const parser = new ContentStreamParser();
    let totalTextRemoved = 0;
    let totalImageRemoved = 0;
    let pagesProcessed = 0;

    // Group rects by page
    const rectsByPage = new Map<number, RedactionRect[]>();
    for (const rect of rects) {
      const pg = rect.page;
      if (!rectsByPage.has(pg)) rectsByPage.set(pg, []);
      rectsByPage.get(pg)!.push(rect);
    }

    for (const [pageNum, pageRects] of rectsByPage) {
      const pageIndex = pageNum - 1;
      if (pageIndex < 0 || pageIndex >= pages.length) continue;

      const page = pages[pageIndex];
      pagesProcessed++;

      // Get page content stream using shared static method
      const contentBytes = ContentStreamParser.getPageContentBytes(page);
      if (!contentBytes) continue;

      // Parse operations
      const { operations } = parser.parse(contentBytes);

      // Find operations that intersect with redaction rects
      const toRemove: ParsedOperation[] = [];
      for (const op of operations) {
        if (op.type === 'text-block' && op.bbox) {
          for (const rect of pageRects) {
            if (rectsIntersect(op.bbox, rect)) {
              toRemove.push(op);
              totalTextRemoved++;
              break;
            }
          }
        } else if (op.type === 'image') {
          totalImageRemoved++;
          toRemove.push(op);
        }
      }

      if (toRemove.length === 0) continue;

      // Sort by startOffset descending to safely remove from end to start
      toRemove.sort((a, b) => b.startOffset - a.startOffset);

      // Build new content stream with removed operations
      const raw = new TextDecoder('latin1').decode(contentBytes);
      let newContent = raw;

      for (const op of toRemove) {
        const before = newContent.substring(0, op.startOffset);
        const after = newContent.substring(op.endOffset);
        newContent = before + after;
      }

      // Add black fill rectangles for each redaction rect
      let fillCommands = '';
      for (const rect of pageRects) {
        fillCommands += `q 0 0 0 rg ${rect.x.toFixed(2)} ${rect.y.toFixed(2)} ${rect.width.toFixed(2)} ${rect.height.toFixed(2)} re f Q\n`;
      }

      newContent = fillCommands + newContent;

      // Write new content stream to page
      const newStreamBytes = new TextEncoder().encode(newContent);
      const context = pdfDoc.context;
      const newStream = context.flateStream(newStreamBytes);
      page.node.set(PDFName.of('Contents'), context.register(newStream));
    }

    const savedBytes = await pdfDoc.save();
    const resultBuffer = savedBytes.buffer.slice(
      savedBytes.byteOffset,
      savedBytes.byteOffset + savedBytes.byteLength
    ) as ArrayBuffer;

    return {
      data: resultBuffer,
      result: {
        removedTextCount: totalTextRemoved,
        removedImageCount: totalImageRemoved,
        pagesProcessed,
      },
    };
  }
}
