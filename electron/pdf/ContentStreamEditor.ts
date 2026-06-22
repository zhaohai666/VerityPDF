import { PDFDocument, PDFPage, PDFName } from 'pdf-lib';
import { ContentStreamParser, type TextSegment } from './ContentStreamParser';

/** 搜索结果项（用于前端显示） */
export interface PDFTextSegment {
  index: number;
  text: string;
  fontName: string;
  fontSize: number;
  page: number;       // 1-based
  position: { x: number; y: number };
}

/** 样式修改选项 */
export interface StyleChanges {
  fontSize?: number;
  color?: string;     // hex color like #FF0000
}

/**
 * PDF Content Stream 编辑器
 * 支持文本替换、删除、样式修改
 */
export class ContentStreamEditor {
  private parser = new ContentStreamParser();

  /**
   * 获取指定页面的所有文本段（供前端显示和选择）
   */
  async getTextSegments(
    pdfData: ArrayBuffer,
    page: number       // 1-based
  ): Promise<PDFTextSegment[]> {
    const pdfDoc = await PDFDocument.load(pdfData, { ignoreEncryption: true });
    const pages = pdfDoc.getPages();
    const pageIndex = page - 1;
    if (pageIndex < 0 || pageIndex >= pages.length) return [];

    const contentBytes = ContentStreamParser.getPageContentBytes(pages[pageIndex]);
    if (!contentBytes) return [];

    const { textSegments } = this.parser.parse(contentBytes);

    return textSegments
      .filter((s) => s.text.trim().length > 0)
      .map((s, i) => ({
        index: i,
        text: s.text,
        fontName: s.fontName,
        fontSize: s.fontSize,
        page,
        position: { ...s.position },
      }));
  }

  /**
   * 替换指定页面指定文本段的文本
   */
  async replaceText(
    pdfData: ArrayBuffer,
    page: number,        // 1-based
    segmentIndex: number,
    newText: string
  ): Promise<ArrayBuffer> {
    const pdfDoc = await PDFDocument.load(pdfData, { ignoreEncryption: true });
    const pages = pdfDoc.getPages();
    const pageIndex = page - 1;
    if (pageIndex < 0 || pageIndex >= pages.length) {
      throw new Error(`无效的页码: ${page}`);
    }

    const contentBytes = ContentStreamParser.getPageContentBytes(pages[pageIndex]);
    if (!contentBytes) throw new Error('无法读取页面内容流');

    const { textSegments } = this.parser.parse(contentBytes);
    if (segmentIndex < 0 || segmentIndex >= textSegments.length) {
      throw new Error(`无效的文本段索引: ${segmentIndex}`);
    }

    const segment = textSegments[segmentIndex];
    const raw = new TextDecoder('latin1').decode(contentBytes);

    // 编码新文本为 PDF 字符串格式
    const newOperand = this.encodeTextOperand(newText, segment.rawOperand);

    // 替换原始字节
    const before = raw.substring(0, segment.startOffset);
    const after = raw.substring(segment.endOffset);
    const newContent = before + newOperand + after;

    // 写回内容流
    await this.writeContentStream(pdfDoc, pages[pageIndex], newContent);

    const savedBytes = await pdfDoc.save({ useObjectStreams: false });
    return savedBytes.buffer.slice(
      savedBytes.byteOffset,
      savedBytes.byteOffset + savedBytes.byteLength
    ) as ArrayBuffer;
  }

  /**
   * 删除指定页面的多个文本段
   */
  async deleteText(
    pdfData: ArrayBuffer,
    page: number,         // 1-based
    segmentIndices: number[]
  ): Promise<ArrayBuffer> {
    if (!segmentIndices || segmentIndices.length === 0) {
      return pdfData.slice(0);
    }

    const pdfDoc = await PDFDocument.load(pdfData, { ignoreEncryption: true });
    const pages = pdfDoc.getPages();
    const pageIndex = page - 1;
    if (pageIndex < 0 || pageIndex >= pages.length) {
      throw new Error(`无效的页码: ${page}`);
    }

    const contentBytes = ContentStreamParser.getPageContentBytes(pages[pageIndex]);
    if (!contentBytes) throw new Error('无法读取页面内容流');

    const { textSegments } = this.parser.parse(contentBytes);

    // 收集要删除的段，按 startOffset 降序排列
    const toDelete: TextSegment[] = segmentIndices
      .filter((i) => i >= 0 && i < textSegments.length)
      .map((i) => textSegments[i])
      .sort((a, b) => b.startOffset - a.startOffset);

    const raw = new TextDecoder('latin1').decode(contentBytes);
    let newContent = raw;

    for (const seg of toDelete) {
      // 用空字符串替换操作数，保留操作符（避免破坏流结构）
      const before = newContent.substring(0, seg.startOffset);
      const after = newContent.substring(seg.endOffset);
      newContent = before + '()' + after;
    }

    await this.writeContentStream(pdfDoc, pages[pageIndex], newContent);

    const savedBytes = await pdfDoc.save({ useObjectStreams: false });
    return savedBytes.buffer.slice(
      savedBytes.byteOffset,
      savedBytes.byteOffset + savedBytes.byteLength
    ) as ArrayBuffer;
  }

  /**
   * 修改指定文本段的样式（字号/颜色）
   */
  async modifyStyle(
    pdfData: ArrayBuffer,
    page: number,          // 1-based
    segmentIndex: number,
    changes: StyleChanges
  ): Promise<ArrayBuffer> {
    const pdfDoc = await PDFDocument.load(pdfData, { ignoreEncryption: true });
    const pages = pdfDoc.getPages();
    const pageIndex = page - 1;
    if (pageIndex < 0 || pageIndex >= pages.length) {
      throw new Error(`无效的页码: ${page}`);
    }

    const contentBytes = ContentStreamParser.getPageContentBytes(pages[pageIndex]);
    if (!contentBytes) throw new Error('无法读取页面内容流');

    const { textSegments } = this.parser.parse(contentBytes);
    if (segmentIndex < 0 || segmentIndex >= textSegments.length) {
      throw new Error(`无效的文本段索引: ${segmentIndex}`);
    }

    const segment = textSegments[segmentIndex];
    const raw = new TextDecoder('latin1').decode(contentBytes);

    // 构建要插入的前缀命令
    let prefix = '';

    if (changes.fontSize !== undefined && changes.fontSize !== segment.fontSize) {
      // 插入新的 Tf 操作修改字号（保留当前字体名）
      const fontName = segment.fontName || '/F1';
      prefix += `q ${fontName} ${changes.fontSize} Tf\n`;
    }

    if (changes.color) {
      const { r, g, b } = this.hexToRgb(changes.color);
      prefix += `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg\n`;
    }

    // 在操作数前插入前缀
    if (prefix) {
      const insertPos = segment.startOffset;
      const before = raw.substring(0, insertPos);
      const after = raw.substring(insertPos);
      const suffix = changes.fontSize !== undefined ? '\nQ' : '';
      const newContent = before + prefix + after + suffix;

      await this.writeContentStream(pdfDoc, pages[pageIndex], newContent);
    }

    const savedBytes = await pdfDoc.save({ useObjectStreams: false });
    return savedBytes.buffer.slice(
      savedBytes.byteOffset,
      savedBytes.byteOffset + savedBytes.byteLength
    ) as ArrayBuffer;
  }

  /**
   * 将新文本编码为与原始操作数相同的 PDF 字符串格式
   */
  private encodeTextOperand(newText: string, originalOperand: string): string {
    if (!originalOperand || originalOperand.length < 2) {
      // 默认使用字面字符串
      return `(${this.escapePdfString(newText)})`;
    }

    // 十六进制字符串
    if (originalOperand[0] === '<' && originalOperand[originalOperand.length - 1] === '>') {
      const hex = originalOperand.slice(1, -1).replace(/\s/g, '');
      // 判断编码宽度：4 字符 = CJK (Identity-H), 2 字符 = Latin1
      const isUnicode = hex.length >= 4 && hex.length % 4 === 0;

      if (isUnicode) {
        // 编码为 4 字节 Unicode 十六进制
        let hexStr = '';
        for (let i = 0; i < newText.length; i++) {
          hexStr += newText.charCodeAt(i).toString(16).padStart(4, '0');
        }
        return `<${hexStr}>`;
      } else {
        // 编码为 2 字节十六进制 (Latin1)
        let hexStr = '';
        for (let i = 0; i < newText.length; i++) {
          hexStr += newText.charCodeAt(i).toString(16).padStart(2, '0');
        }
        return `<${hexStr}>`;
      }
    }

    // 字面字符串
    if (originalOperand[0] === '(' && originalOperand[originalOperand.length - 1] === ')') {
      return `(${this.escapePdfString(newText)})`;
    }

    // TJ 数组格式：替换第一个字符串元素
    if (originalOperand[0] === '[') {
      return this.replaceTJText(originalOperand, newText);
    }

    return `(${this.escapePdfString(newText)})`;
  }

  /**
   * 转义 PDF 字面字符串中的特殊字符
   */
  private escapePdfString(text: string): string {
    return text
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r');
  }

  /**
   * 在 TJ 数组中替换文本内容
   * TJ 数组格式：[(text) kern (text) ...]
   * 策略：将所有文本合并到新文本，保持第一个字符串元素，移除其余
   */
  private replaceTJText(_raw: string, newText: string): string {
    // 简化处理：将整个 TJ 数组替换为只含一个字符串的 TJ
    const escaped = this.escapePdfString(newText);
    return `[(${escaped})]`;
  }

  /**
   * 十六进制颜色转 RGB (0-1)
   */
  private hexToRgb(hex: string): { r: number; g: number; b: number } {
    const clean = hex.replace('#', '');
    const r = parseInt(clean.substring(0, 2), 16) / 255;
    const g = parseInt(clean.substring(2, 4), 16) / 255;
    const b = parseInt(clean.substring(4, 6), 16) / 255;
    return { r, g, b };
  }

  /**
   * 将新内容流写回页面
   */
  private async writeContentStream(
    pdfDoc: PDFDocument,
    page: PDFPage,
    content: string
  ): Promise<void> {
    const newStreamBytes = new TextEncoder().encode(content);
    const context = pdfDoc.context;
    const newStream = context.flateStream(newStreamBytes);
    page.node.set(PDFName.of('Contents'), context.register(newStream));
  }
}
