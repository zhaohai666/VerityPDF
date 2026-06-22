import { PDFPage, PDFArray, PDFStream, PDFRawStream, decodePDFRawStream } from 'pdf-lib';

/** 解析后的内容流操作 */
export interface ParsedOperation {
  type: 'text-block' | 'image' | 'other';
  startOffset: number;
  endOffset: number;
  bbox: { x: number; y: number; width: number; height: number } | null;
  rawBytes: string;
}

/** 文本段信息（用于编辑和搜索） */
export interface TextSegment {
  text: string;              // 解码后的可读文本
  rawOperand: string;        // 原始操作数字节（含括号/十六进制）
  operator: string;          // Tj / TJ / ' / "
  startOffset: number;       // 操作数起始字节偏移
  endOffset: number;         // 操作数结束字节偏移
  operatorOffset: number;    // 操作符起始字节偏移
  position: { x: number; y: number };
  fontName: string;          // 当前字体名（如 /F1）
  fontSize: number;          // 当前字号
  /** 所在 BT...ET 文本块范围 */
  textBlockStart: number;
  textBlockEnd: number;
}

/** 解析完整结果 */
export interface ParseResult {
  operations: ParsedOperation[];
  textSegments: TextSegment[];
}

/**
 * 轻量 PDF 内容流解析器
 * - 解析 BT...ET 文本块和 Do 图像引用操作
 * - 提取每个文本段的可读文本、字体、字号、位置
 * - 跟踪 CTM 和文本矩阵变换
 */
export class ContentStreamParser {
  private tokens: Array<{ value: string; offset: number }> = [];
  private pos = 0;
  private textMatrix: [number, number, number, number, number, number] = [1, 0, 0, 1, 0, 0];
  private ctmStack: Array<[number, number, number, number, number, number]> = [];
  private currentCTM: [number, number, number, number, number, number] = [1, 0, 0, 1, 0, 0];
  private currentFont = '';
  private currentFontSize = 12;

  /**
   * 解析内容流字节
   */
  parse(contentBytes: Uint8Array): ParseResult {
    const raw = new TextDecoder('latin1').decode(contentBytes);
    this.tokenize(raw);
    this.pos = 0;
    this.textMatrix = [1, 0, 0, 1, 0, 0];
    this.ctmStack = [];
    this.currentCTM = [1, 0, 0, 1, 0, 0];
    this.currentFont = '';
    this.currentFontSize = 12;

    const operations: ParsedOperation[] = [];
    const textSegments: TextSegment[] = [];
    const operandStack: string[] = [];
    const operandOffsetStack: number[] = []; // 跟踪每个操作数的偏移
    let inTextBlock = false;
    let textBlockStart = 0;
    let textBbox: { minX: number; minY: number; maxX: number; maxY: number } | null = null;

    while (this.pos < this.tokens.length) {
      const token = this.tokens[this.pos];
      const operator = token.value;

      if (this.isOperator(operator)) {
        const opStartOffset = operandOffsetStack.length > 0
          ? operandOffsetStack[0]
          : token.offset;
        const opEndOffset = token.offset + token.value.length;

        switch (operator) {
          case 'q':
            this.ctmStack.push([...this.currentCTM]);
            operandStack.length = 0;
            operandOffsetStack.length = 0;
            break;

          case 'Q':
            if (this.ctmStack.length > 0) {
              this.currentCTM = this.ctmStack.pop()!;
            }
            operandStack.length = 0;
            operandOffsetStack.length = 0;
            break;

          case 'cm': {
            if (operandStack.length >= 6) {
              const [a, b, c, d, e, f] = operandStack.slice(-6).map(Number);
              const m = this.currentCTM;
              this.currentCTM = [
                a * m[0] + b * m[2],
                a * m[1] + b * m[3],
                c * m[0] + d * m[2],
                c * m[1] + d * m[3],
                e * m[0] + f * m[2] + m[4],
                e * m[1] + f * m[3] + m[5],
              ];
            }
            operandStack.length = 0;
            operandOffsetStack.length = 0;
            break;
          }

          case 'BT':
            inTextBlock = true;
            textBlockStart = opStartOffset;
            textBbox = null;
            this.textMatrix = [1, 0, 0, 1, 0, 0];
            operandStack.length = 0;
            operandOffsetStack.length = 0;
            break;

          case 'ET': {
            if (inTextBlock && textBbox) {
              const pageBbox = this.transformBBox(textBbox, this.currentCTM);
              operations.push({
                type: 'text-block',
                startOffset: textBlockStart,
                endOffset: opEndOffset,
                bbox: pageBbox,
                rawBytes: raw.substring(textBlockStart, opEndOffset),
              });
            }
            inTextBlock = false;
            operandStack.length = 0;
            operandOffsetStack.length = 0;
            break;
          }

          case 'Tf': {
            if (operandStack.length >= 2) {
              this.currentFont = operandStack[operandStack.length - 2];
              this.currentFontSize = parseFloat(operandStack[operandStack.length - 1]);
            }
            operandStack.length = 0;
            operandOffsetStack.length = 0;
            break;
          }

          case 'Td':
          case 'TD': {
            if (operandStack.length >= 2) {
              const tx = parseFloat(operandStack[operandStack.length - 2]);
              const ty = parseFloat(operandStack[operandStack.length - 1]);
              this.textMatrix[4] += tx * this.textMatrix[0] + ty * this.textMatrix[2];
              this.textMatrix[5] += tx * this.textMatrix[1] + ty * this.textMatrix[3];
            }
            operandStack.length = 0;
            operandOffsetStack.length = 0;
            break;
          }

          case 'Tm': {
            if (operandStack.length >= 6) {
              const [a, b, c, d, e, f] = operandStack.slice(-6).map(Number);
              this.textMatrix = [a, b, c, d, e, f];
            }
            operandStack.length = 0;
            operandOffsetStack.length = 0;
            break;
          }

          case 'T*': {
            this.textMatrix[5] -= 12;
            operandStack.length = 0;
            operandOffsetStack.length = 0;
            break;
          }

          case 'Tj':
          case 'TJ':
          case "'":
          case '"': {
            if (inTextBlock) {
              const tm = this.textMatrix;
              const px = tm[4];
              const py = tm[5];
              const estWidth = operator === 'TJ' ? 50 : 30;
              const estHeight = 10;
              if (textBbox) {
                textBbox.minX = Math.min(textBbox.minX, px);
                textBbox.minY = Math.min(textBbox.minY, py);
                textBbox.maxX = Math.max(textBbox.maxX, px + estWidth);
                textBbox.maxY = Math.max(textBbox.maxY, py + estHeight);
              } else {
                textBbox = {
                  minX: px, minY: py,
                  maxX: px + estWidth, maxY: py + estHeight,
                };
              }

              // 提取文本段
              const textOperand = operandStack.length > 0 ? operandStack[operandStack.length - 1] : '';
              const textOperandOffset = operandOffsetStack.length > 0
                ? operandOffsetStack[operandOffsetStack.length - 1]
                : token.offset;
              const decodedText = this.decodeTextString(textOperand, operator);

              textSegments.push({
                text: decodedText,
                rawOperand: textOperand,
                operator,
                startOffset: textOperandOffset,
                endOffset: textOperandOffset + textOperand.length,
                operatorOffset: token.offset,
                position: { x: px, y: py },
                fontName: this.currentFont,
                fontSize: this.currentFontSize,
                textBlockStart,
                textBlockEnd: opEndOffset, // 会在 ET 时更新
              });
            }
            operandStack.length = 0;
            operandOffsetStack.length = 0;
            break;
          }

          case 'Do': {
            if (operandStack.length >= 1) {
              operations.push({
                type: 'image',
                startOffset: opStartOffset,
                endOffset: opEndOffset,
                bbox: null,
                rawBytes: raw.substring(opStartOffset, opEndOffset),
              });
            }
            operandStack.length = 0;
            operandOffsetStack.length = 0;
            break;
          }

          default:
            operandStack.length = 0;
            operandOffsetStack.length = 0;
            break;
        }
        this.pos++;
      } else {
        operandStack.push(operator);
        operandOffsetStack.push(token.offset);
        this.pos++;
      }
    }

    // 回填 textBlockEnd
    for (const seg of textSegments) {
      // 查找包含此段的 ET 操作
      const parentOp = operations.find(
        (op) => op.type === 'text-block' && seg.operatorOffset >= op.startOffset && seg.operatorOffset <= op.endOffset
      );
      if (parentOp) {
        seg.textBlockEnd = parentOp.endOffset;
      }
    }

    return { operations, textSegments };
  }

  /**
   * 解码 PDF 文本操作数为可读字符串
   */
  private decodeTextString(raw: string, operator: string): string {
    if (!raw) return '';

    // Tj: 单个字符串 (text) 或 <hex>
    if (operator === 'Tj' || operator === "'" || operator === '"') {
      return this.decodePdfString(raw);
    }

    // TJ: 数组 [(text) kern (text) ...]
    if (operator === 'TJ') {
      return this.decodeTJArray(raw);
    }

    return raw;
  }

  /**
   * 解码单个 PDF 字符串：(literal) 或 <hex>
   */
  private decodePdfString(raw: string): string {
    if (!raw || raw.length < 2) return '';

    // 十六进制字符串 <hex>
    if (raw[0] === '<' && raw[raw.length - 1] === '>') {
      const hex = raw.slice(1, -1).replace(/\s/g, '');
      let result = '';
      // 尝试 2 字节 Unicode（Identity-H CJK 编码）
      if (hex.length >= 4 && hex.length % 4 === 0) {
        // 先尝试 4 字节解码
        for (let i = 0; i < hex.length; i += 4) {
          const code = parseInt(hex.substring(i, i + 4), 16);
          if (code >= 0x20) {
            result += String.fromCharCode(code);
          }
        }
        // 如果结果全为空/无效，回退到 2 字节
        if (result.replace(/\0/g, '').length === 0) {
          result = '';
          for (let i = 0; i < hex.length; i += 2) {
            const code = parseInt(hex.substring(i, i + 2), 16);
            result += String.fromCharCode(code);
          }
        }
      } else {
        // 单字节十六进制
        for (let i = 0; i < hex.length; i += 2) {
          const code = parseInt(hex.substring(i, i + 2), 16);
          result += String.fromCharCode(code);
        }
      }
      return result;
    }

    // 字面字符串 (...)
    if (raw[0] === '(' && raw[raw.length - 1] === ')') {
      const inner = raw.slice(1, -1);
      let result = '';
      let i = 0;
      while (i < inner.length) {
        if (inner[i] === '\\' && i + 1 < inner.length) {
          const next = inner[i + 1];
          switch (next) {
            case 'n': result += '\n'; break;
            case 'r': result += '\r'; break;
            case 't': result += '\t'; break;
            case 'b': result += '\b'; break;
            case 'f': result += '\f'; break;
            case '(': result += '('; break;
            case ')': result += ')'; break;
            case '\\': result += '\\'; break;
            default:
              // 八进制转义 \ddd
              if (next >= '0' && next <= '7') {
                let octal = next;
                if (i + 2 < inner.length && inner[i + 2] >= '0' && inner[i + 2] <= '7') {
                  octal += inner[i + 2];
                  if (i + 3 < inner.length && inner[i + 3] >= '0' && inner[i + 3] <= '7') {
                    octal += inner[i + 3];
                    i++;
                  }
                  i++;
                }
                result += String.fromCharCode(parseInt(octal, 8));
              } else {
                result += next;
              }
          }
          i += 2;
        } else {
          result += inner[i];
          i++;
        }
      }
      return result;
    }

    return raw;
  }

  /**
   * 解码 TJ 数组：[(text) kern (text) ...]
   */
  private decodeTJArray(raw: string): string {
    if (!raw || raw[0] !== '[' || raw[raw.length - 1] !== ']') return '';
    const inner = raw.slice(1, -1).trim();
    let result = '';
    let i = 0;

    while (i < inner.length) {
      // 跳过空白
      while (i < inner.length && /\s/.test(inner[i])) i++;
      if (i >= inner.length) break;

      if (inner[i] === '(') {
        // 字面字符串
        let depth = 1;
        const start = i;
        i++;
        while (i < inner.length && depth > 0) {
          if (inner[i] === '\\') { i += 2; continue; }
          if (inner[i] === '(') depth++;
          if (inner[i] === ')') depth--;
          i++;
        }
        result += this.decodePdfString(inner.substring(start, i));
      } else if (inner[i] === '<') {
        // 十六进制字符串
        const start = i;
        i++;
        while (i < inner.length && inner[i] !== '>') i++;
        i++; // skip >
        result += this.decodePdfString(inner.substring(start, i));
      } else {
        // 数字（字距调整值），跳过
        while (i < inner.length && !/[\s()<>[\]]/.test(inner[i])) i++;
      }
    }

    return result;
  }

  /**
   * 获取页面内容流原始字节
   */
  static getPageContentBytes(page: PDFPage): Uint8Array | null {
    try {
      const contents = page.node.Contents();
      if (!contents) return null;

      const context = page.node.context;

      if (contents instanceof PDFArray) {
        const parts: Uint8Array[] = [];
        for (let i = 0; i < contents.size(); i++) {
          const ref = contents.get(i);
          const stream = context.lookup(ref);
          if (stream instanceof PDFStream || stream instanceof PDFRawStream) {
            const decoded = ContentStreamParser.decodeStream(stream);
            if (decoded) parts.push(decoded);
          }
        }
        if (parts.length === 0) return null;
        if (parts.length === 1) return parts[0];

        const totalLen = parts.reduce((sum, p) => sum + p.length, 0);
        const result = new Uint8Array(totalLen + parts.length - 1);
        let offset = 0;
        for (let i = 0; i < parts.length; i++) {
          result.set(parts[i], offset);
          offset += parts[i].length;
          if (i < parts.length - 1) {
            result[offset] = 0x0A;
            offset++;
          }
        }
        return result;
      }

      const contentsObj = contents as unknown;
      if (contentsObj && typeof contentsObj === 'object' && ('getContents' in contentsObj || 'contents' in contentsObj || 'dict' in contentsObj)) {
        return ContentStreamParser.decodeStream(contentsObj as PDFStream | PDFRawStream);
      }

      try {
        const looked = context.lookup(contents);
        if (looked && typeof looked === 'object') {
          const lObj = looked as unknown as Record<string, unknown>;
          if ('getContents' in lObj || 'contents' in lObj || 'dict' in lObj) {
            return ContentStreamParser.decodeStream(looked as PDFStream | PDFRawStream);
          }
        }
      } catch {
        // not a ref
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * 解码 PDF 流
   */
  static decodeStream(stream: PDFStream | PDFRawStream): Uint8Array | null {
    try {
      if (stream instanceof PDFRawStream) {
        return decodePDFRawStream(stream).decode();
      }
      if (stream instanceof PDFStream) {
        const contents = (stream as unknown as Record<string, unknown>).contents;
        if (contents instanceof Uint8Array) return contents;
        if (typeof (stream as unknown as Record<string, () => Uint8Array>).getContents === 'function') {
          return (stream as unknown as Record<string, () => Uint8Array>).getContents();
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  private tokenize(raw: string): void {
    this.tokens = [];
    let i = 0;
    const len = raw.length;

    while (i < len) {
      if (this.isWhitespace(raw[i])) { i++; continue; }
      if (raw[i] === '%') {
        while (i < len && raw[i] !== '\n' && raw[i] !== '\r') i++;
        continue;
      }
      if (raw[i] === '(') {
        const start = i;
        let depth = 1;
        i++;
        while (i < len && depth > 0) {
          if (raw[i] === '\\') { i += 2; continue; }
          if (raw[i] === '(') depth++;
          if (raw[i] === ')') depth--;
          i++;
        }
        this.tokens.push({ value: raw.substring(start, i), offset: start });
        continue;
      }
      if (raw[i] === '<') {
        const start = i;
        if (raw[i + 1] === '<') {
          this.tokens.push({ value: '<<', offset: start });
          i += 2;
        } else {
          i++;
          while (i < len && raw[i] !== '>') i++;
          i++;
          this.tokens.push({ value: raw.substring(start, i), offset: start });
        }
        continue;
      }
      if (raw[i] === '>' && raw[i + 1] === '>') {
        this.tokens.push({ value: '>>', offset: i });
        i += 2;
        continue;
      }
      if (raw[i] === '[') {
        const start = i;
        let depth = 1;
        i++;
        while (i < len && depth > 0) {
          if (raw[i] === '[') depth++;
          if (raw[i] === ']') depth--;
          i++;
        }
        this.tokens.push({ value: raw.substring(start, i), offset: start });
        continue;
      }
      if (raw[i] === '/') {
        const start = i;
        i++;
        while (i < len && !this.isDelimiter(raw[i])) i++;
        this.tokens.push({ value: raw.substring(start, i), offset: start });
        continue;
      }
      const start = i;
      while (i < len && !this.isWhitespace(raw[i]) && !this.isDelimiter(raw[i])) i++;
      if (i > start) {
        this.tokens.push({ value: raw.substring(start, i), offset: start });
      }
    }
  }

  private isWhitespace(c: string): boolean {
    return c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\0';
  }

  private isDelimiter(c: string): boolean {
    return '()<>[]{}/%'.includes(c) || this.isWhitespace(c);
  }

  private isOperator(token: string): boolean {
    return /^[a-zA-Z'"*]+$/.test(token);
  }

  private transformBBox(
    bbox: { minX: number; minY: number; maxX: number; maxY: number },
    ctm: [number, number, number, number, number, number]
  ): { x: number; y: number; width: number; height: number } {
    const corners = [
      [bbox.minX, bbox.minY], [bbox.maxX, bbox.minY],
      [bbox.minX, bbox.maxY], [bbox.maxX, bbox.maxY],
    ];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [px, py] of corners) {
      const tx = ctm[0] * px + ctm[2] * py + ctm[4];
      const ty = ctm[1] * px + ctm[3] * py + ctm[5];
      minX = Math.min(minX, tx);
      minY = Math.min(minY, ty);
      maxX = Math.max(maxX, tx);
      maxY = Math.max(maxY, ty);
    }
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }
}
