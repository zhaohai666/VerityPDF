import { PDFDocument, PDFName, PDFArray, PDFDict, PDFString, PDFRef } from 'pdf-lib';

/** 超链接注释类型 */
export type HyperlinkType = 'uri' | 'goto';

/** 超链接注释数据 */
export interface HyperlinkAnnotation {
  id?: string;
  type: HyperlinkType;
  /** 注释所在页面 (0-based) */
  pageIndex: number;
  /** 矩形区域 [x1, y1, x2, y2] (PDF 点坐标) */
  rect: [number, number, number, number];
  /** URI 链接 (type='uri' 时必填) */
  uri?: string;
  /** 目标页面索引 (type='goto' 时必填) */
  destPageIndex?: number;
  /** 目标页面缩放模式 */
  destZoom?: 'fit' | 'fitH' | 'fitV' | 'xyz';
  /** 高亮模式 */
  highlightMode?: 'none' | 'invert' | 'outline' | 'push';
  /** 边框颜色 [r, g, b] 0-1 */
  color?: [number, number, number];
}

/** 超链接注释查询结果 */
export interface HyperlinkAnnotationInfo {
  id: string;
  type: HyperlinkType;
  pageIndex: number;
  /** 注释在页面 Annots 数组中的索引 */
  annotIndex: number;
  rect: [number, number, number, number];
  uri?: string;
  destPageIndex?: number;
  highlightMode: string;
  color?: [number, number, number];
}

/**
 * PDF 超链接注释服务
 * 支持添加/编辑/删除 URL 链接和页面跳转链接
 */
export class HyperlinkAnnotationService {
  /**
   * 获取 PDF 中所有超链接注释
   */
  async listHyperlinks(pdfData: ArrayBuffer): Promise<HyperlinkAnnotationInfo[]> {
    const doc = await PDFDocument.load(pdfData, { ignoreEncryption: true });
    const context = doc.context;
    const pages = doc.getPages();
    const result: HyperlinkAnnotationInfo[] = [];

    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      const annots = page.node.Annots();
      if (!annots) continue;

      for (let j = 0; j < annots.size(); j++) {
        const annotRef = annots.get(j);
        const annot = context.lookup(annotRef) as PDFDict;
        if (!annot) continue;

        const subtype = annot.get(PDFName.of('Subtype'));
        if (!subtype || subtype.toString() !== '/Link') continue;

        const info = this.parseLinkAnnotation(doc, annot, i, j);
        if (info) result.push(info);
      }
    }

    return result;
  }

  /**
   * 添加超链接注释
   */
  async addHyperlink(pdfData: ArrayBuffer, link: HyperlinkAnnotation): Promise<ArrayBuffer> {
    const doc = await PDFDocument.load(pdfData, { ignoreEncryption: true });
    const pages = doc.getPages();

    if (link.pageIndex < 0 || link.pageIndex >= pages.length) {
      throw new Error(`页面索引超出范围: ${link.pageIndex}`);
    }

    const page = pages[link.pageIndex];
    const context = doc.context;

    const annotDict = context.obj({}) as PDFDict;

    // Subtype
    annotDict.set(PDFName.of('Subtype'), PDFName.of('Link'));

    // Rect
    const rectArray = context.obj(link.rect.map(Number));
    annotDict.set(PDFName.of('Rect'), rectArray);

    // Border (no border by default)
    annotDict.set(PDFName.of('Border'), context.obj([0, 0, 0]));

    // Highlight mode
    const hMode = link.highlightMode || 'invert';
    const hMap: Record<string, string> = { none: 'N', invert: 'I', outline: 'O', push: 'P' };
    annotDict.set(PDFName.of('H'), PDFName.of(hMap[hMode] || 'I'));

    // Color
    if (link.color) {
      annotDict.set(PDFName.of('C'), context.obj(link.color.map(Number)));
    }

    // Action
    if (link.type === 'uri' && link.uri) {
      const actionDict = context.obj({}) as PDFDict;
      actionDict.set(PDFName.of('S'), PDFName.of('URI'));
      actionDict.set(PDFName.of('URI'), PDFString.of(link.uri));
      annotDict.set(PDFName.of('A'), actionDict);
    } else if (link.type === 'goto' && link.destPageIndex !== undefined) {
      const destPage = pages[link.destPageIndex];
      if (!destPage) throw new Error(`目标页面不存在: ${link.destPageIndex}`);

      const zoomName = link.destZoom || 'fit';
      const zoomMap: Record<string, PDFName> = { fit: PDFName.of('Fit'), fitH: PDFName.of('FitH'), fitV: PDFName.of('FitV'), xyz: PDFName.of('XYZ') };
      const destArray = context.obj([destPage.ref, zoomMap[zoomName] || PDFName.of('Fit')]);
      annotDict.set(PDFName.of('Dest'), destArray);
    } else {
      throw new Error('超链接配置无效：URI 链接需要 uri，页面跳转需要 destPageIndex');
    }

    // Add annotation to page
    let annots = page.node.Annots();
    if (!annots) {
      annots = context.obj([]);
      page.node.set(PDFName.of('Annots'), annots);
    }
    annots.push(annotDict);

    const bytes = await doc.save();
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  }

  /**
   * 删除超链接注释
   */
  async removeHyperlink(pdfData: ArrayBuffer, pageIndex: number, annotIndex: number): Promise<ArrayBuffer> {
    const doc = await PDFDocument.load(pdfData, { ignoreEncryption: true });
    const pages = doc.getPages();

    if (pageIndex < 0 || pageIndex >= pages.length) {
      throw new Error(`页面索引超出范围: ${pageIndex}`);
    }

    const page = pages[pageIndex];
    const annots = page.node.Annots();
    if (!annots) throw new Error('该页面没有注释');

    // Find the annotIndex-th Link annotation
    const context = doc.context;
    let linkCount = 0;
    let removeIdx = -1;

    for (let j = 0; j < annots.size(); j++) {
      const annotRef = annots.get(j);
      const annot = context.lookup(annotRef) as PDFDict;
      if (!annot) continue;

      const subtype = annot.get(PDFName.of('Subtype'));
      if (subtype && subtype.toString() === '/Link') {
        if (linkCount === annotIndex) {
          removeIdx = j;
          break;
        }
        linkCount++;
      }
    }

    if (removeIdx === -1) throw new Error(`未找到索引为 ${annotIndex} 的超链接注释`);

    // Remove the annotation by creating a new array without it
    const newAnnots = context.obj([]);
    for (let j = 0; j < annots.size(); j++) {
      if (j !== removeIdx) {
        newAnnots.push(annots.get(j));
      }
    }
    page.node.set(PDFName.of('Annots'), newAnnots);

    const bytes = await doc.save();
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  }

  /**
   * 编辑超链接注释
   */
  async editHyperlink(
    pdfData: ArrayBuffer,
    pageIndex: number,
    annotIndex: number,
    updates: Partial<HyperlinkAnnotation>
  ): Promise<ArrayBuffer> {
    const doc = await PDFDocument.load(pdfData, { ignoreEncryption: true });
    const pages = doc.getPages();

    if (pageIndex < 0 || pageIndex >= pages.length) {
      throw new Error(`页面索引超出范围: ${pageIndex}`);
    }

    const page = pages[pageIndex];
    const annots = page.node.Annots();
    if (!annots) throw new Error('该页面没有注释');

    const context = doc.context;
    let linkCount = 0;
    let annot: PDFDict | null = null;

    for (let j = 0; j < annots.size(); j++) {
      const annotRef = annots.get(j);
      const a = context.lookup(annotRef) as PDFDict;
      if (!a) continue;

      const subtype = a.get(PDFName.of('Subtype'));
      if (subtype && subtype.toString() === '/Link') {
        if (linkCount === annotIndex) {
          annot = a;
          break;
        }
        linkCount++;
      }
    }

    if (!annot) throw new Error(`未找到索引为 ${annotIndex} 的超链接注释`);

    // Update rect
    if (updates.rect) {
      annot.set(PDFName.of('Rect'), context.obj(updates.rect.map(Number)));
    }

    // Update URI
    if (updates.uri !== undefined) {
      const actionDict = context.obj({}) as PDFDict;
      actionDict.set(PDFName.of('S'), PDFName.of('URI'));
      actionDict.set(PDFName.of('URI'), PDFString.of(updates.uri));
      annot.set(PDFName.of('A'), actionDict);
      // Remove Dest if switching to URI
      annot.delete(PDFName.of('Dest'));
    }

    // Update destination page
    if (updates.destPageIndex !== undefined) {
      const destPage = pages[updates.destPageIndex];
      if (!destPage) throw new Error(`目标页面不存在: ${updates.destPageIndex}`);
      const zoomName = updates.destZoom || 'fit';
      const zoomMap: Record<string, PDFName> = { fit: PDFName.of('Fit'), fitH: PDFName.of('FitH'), fitV: PDFName.of('FitV'), xyz: PDFName.of('XYZ') };
      const destArray = context.obj([destPage.ref, zoomMap[zoomName] || PDFName.of('Fit')]);
      annot.set(PDFName.of('Dest'), destArray);
      // Remove Action if switching to goto
      annot.delete(PDFName.of('A'));
    }

    // Update color
    if (updates.color) {
      annot.set(PDFName.of('C'), context.obj(updates.color.map(Number)));
    }

    // Update highlight mode
    if (updates.highlightMode) {
      const hMap: Record<string, string> = { none: 'N', invert: 'I', outline: 'O', push: 'P' };
      annot.set(PDFName.of('H'), PDFName.of(hMap[updates.highlightMode] || 'I'));
    }

    const bytes = await doc.save();
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  }

  private parseLinkAnnotation(doc: PDFDocument, annot: PDFDict, pageIndex: number, annotIndex: number): HyperlinkAnnotationInfo | null {
    const context = doc.context;
    const rectObj = annot.get(PDFName.of('Rect'));
    let rect: [number, number, number, number] = [0, 0, 0, 0];
    if (rectObj instanceof PDFArray) {
      rect = Array.from({ length: rectObj.size() }, (_, i) => {
        const v = rectObj.get(i);
        return typeof (v as any)?.value === 'number' ? (v as any).value : Number(v);
      }) as [number, number, number, number];
    }

    const hObj = annot.get(PDFName.of('H'));
    const hMap: Record<string, string> = { N: 'none', I: 'invert', O: 'outline', P: 'push' };
    const hStr = hObj ? hObj.toString().replace(/^\//, '') : 'I';
    const highlightMode = hMap[hStr] || 'invert';

    const colorObj = annot.get(PDFName.of('C'));
    let color: [number, number, number] | undefined;
    if (colorObj instanceof PDFArray && colorObj.size() >= 3) {
      color = Array.from({ length: 3 }, (_, i) => {
        const v = colorObj.get(i);
        return typeof (v as any)?.value === 'number' ? (v as any).value : Number(v);
      }) as [number, number, number];
    }

    // Check for URI action
    const actionObj = annot.get(PDFName.of('A'));
    if (actionObj) {
      const actionDict = actionObj instanceof PDFDict ? actionObj : context.lookup(actionObj) as PDFDict;
      if (actionDict) {
        const s = actionDict.get(PDFName.of('S'));
        if (s && s.toString() === '/URI') {
          const uriObj = actionDict.get(PDFName.of('URI'));
          const uri = uriObj ? (uriObj instanceof PDFString ? uriObj.decodeText() : String(uriObj).replace(/^\//, '')) : '';
          return { id: `p${pageIndex}_a${annotIndex}`, type: 'uri', pageIndex, annotIndex, rect, uri, highlightMode, color };
        }
      }
    }

    // Check for Dest (page jump)
    const destObj = annot.get(PDFName.of('Dest'));
    if (destObj) {
      let destPageIndex = -1;
      if (destObj instanceof PDFArray && destObj.size() > 0) {
        const pageRef = destObj.get(0);
        if (pageRef instanceof PDFRef) {
          const totalPages = doc.getPageCount();
          for (let i = 0; i < totalPages; i++) {
            if (doc.getPage(i).ref.toString() === pageRef.toString()) {
              destPageIndex = i;
              break;
            }
          }
        }
      }
      return { id: `p${pageIndex}_a${annotIndex}`, type: 'goto', pageIndex, annotIndex, rect, destPageIndex, highlightMode, color };
    }

    return null;
  }
}