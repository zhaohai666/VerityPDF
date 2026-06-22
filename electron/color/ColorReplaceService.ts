import { PDFDocument, PDFName } from 'pdf-lib';
import { ContentStreamParser } from '../pdf/ContentStreamParser';

/** 颜色使用情况 */
export interface ColorUsage {
  /** 颜色空间: rgb, cmyk, gray */
  colorSpace: 'rgb' | 'cmyk' | 'gray';
  /** 颜色分量值 (0-1) */
  values: number[];
  /** 出现次数 */
  count: number;
  /** 出现在哪些页面 (0-based) */
  pages: number[];
  /** 用于填充还是描边 (f=fill, s=stroke, b=both) */
  usage: 'f' | 's' | 'b';
  /** 十六进制显示色（用于前端预览） */
  hex: string;
}

/** 颜色替换规则 */
export interface ColorReplaceRule {
  /** 旧颜色十六进制 (如 "#FF0000") */
  oldColor: string;
  /** 新颜色十六进制 */
  newColor: string;
  /** 颜色空间 */
  colorSpace: 'rgb' | 'cmyk' | 'gray';
  /** 容差 (0-1) */
  tolerance: number;
}

/** 颜色替换选项 */
export interface ColorReplaceOptions {
  rules: ColorReplaceRule[];
  /** 全局容差 */
  tolerance: number;
  pageIndices?: number[];
}

/** 颜色替换结果 */
export interface ColorReplaceResult {
  pdfData: ArrayBuffer;
  replacedCount: number;
  pagesProcessed: number;
}

/**
 * 批量颜色替换服务
 * 扫描 PDF 内容流中的颜色指令，将指定颜色替换为新颜色
 */
export class ColorReplaceService {
  /**
   * 检测 PDF 中使用的所有颜色
   */
  async detectColors(pdfData: ArrayBuffer): Promise<ColorUsage[]> {
    const doc = await PDFDocument.load(pdfData, { ignoreEncryption: true });
    const pages = doc.getPages();
    const colorMap = new Map<string, ColorUsage>();

    for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
      const page = pages[pageIdx];
      const contentBytes = ContentStreamParser.getPageContentBytes(page);
      if (!contentBytes) continue;

      const raw = new TextDecoder('latin1').decode(contentBytes);
      this.extractColorsFromContent(raw, pageIdx, colorMap);
    }

    return Array.from(colorMap.values());
  }

  /**
   * 从内容流文本中提取颜色信息
   */
  private extractColorsFromContent(
    raw: string,
    pageIdx: number,
    colorMap: Map<string, ColorUsage>
  ): void {
    const lines = raw.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();

      // RGB fill: r g b rg
      const rgbFill = trimmed.match(/^([\d.eE+-]+)\s+([\d.eE+-]+)\s+([\d.eE+-]+)\s+rg$/);
      if (rgbFill) {
        const values = [parseFloat(rgbFill[1]), parseFloat(rgbFill[2]), parseFloat(rgbFill[3])];
        this.addColor(colorMap, 'rgb', values, pageIdx, 'f');
        continue;
      }

      // RGB stroke: r g b RG
      const rgbStroke = trimmed.match(/^([\d.eE+-]+)\s+([\d.eE+-]+)\s+([\d.eE+-]+)\s+RG$/);
      if (rgbStroke) {
        const values = [parseFloat(rgbStroke[1]), parseFloat(rgbStroke[2]), parseFloat(rgbStroke[3])];
        this.addColor(colorMap, 'rgb', values, pageIdx, 's');
        continue;
      }

      // CMYK fill: c m y k k
      const cmykFill = trimmed.match(/^([\d.eE+-]+)\s+([\d.eE+-]+)\s+([\d.eE+-]+)\s+([\d.eE+-]+)\s+k$/);
      if (cmykFill) {
        const values = [parseFloat(cmykFill[1]), parseFloat(cmykFill[2]), parseFloat(cmykFill[3]), parseFloat(cmykFill[4])];
        this.addColor(colorMap, 'cmyk', values, pageIdx, 'f');
        continue;
      }

      // CMYK stroke: c m y k K
      const cmykStroke = trimmed.match(/^([\d.eE+-]+)\s+([\d.eE+-]+)\s+([\d.eE+-]+)\s+([\d.eE+-]+)\s+K$/);
      if (cmykStroke) {
        const values = [parseFloat(cmykStroke[1]), parseFloat(cmykStroke[2]), parseFloat(cmykStroke[3]), parseFloat(cmykStroke[4])];
        this.addColor(colorMap, 'cmyk', values, pageIdx, 's');
        continue;
      }

      // Gray fill: g g (single number followed by lowercase g)
      const grayFill = trimmed.match(/^([\d.eE+-]+)\s+g$/);
      if (grayFill) {
        const values = [parseFloat(grayFill[1])];
        this.addColor(colorMap, 'gray', values, pageIdx, 'f');
        continue;
      }

      // Gray stroke: g G (single number followed by uppercase G)
      const grayStroke = trimmed.match(/^([\d.eE+-]+)\s+G$/);
      if (grayStroke) {
        const values = [parseFloat(grayStroke[1])];
        this.addColor(colorMap, 'gray', values, pageIdx, 's');
        continue;
      }
    }
  }

  /**
   * 添加颜色到 map
   */
  private addColor(
    colorMap: Map<string, ColorUsage>,
    colorSpace: 'rgb' | 'cmyk' | 'gray',
    values: number[],
    pageIdx: number,
    usage: 'f' | 's'
  ): void {
    const hex = this.valuesToHex(colorSpace, values);
    const key = `${colorSpace}:${hex}:${usage}`;

    if (colorMap.has(key)) {
      const existing = colorMap.get(key)!;
      existing.count++;
      if (!existing.pages.includes(pageIdx)) {
        existing.pages.push(pageIdx);
      }
      // 合并 usage
      if (existing.usage !== usage && existing.usage !== 'b') {
        existing.usage = 'b';
      }
    } else {
      colorMap.set(key, {
        colorSpace,
        values: [...values],
        count: 1,
        pages: [pageIdx],
        usage,
        hex,
      });
    }
  }

  /**
   * 颜色分量转十六进制
   */
  private valuesToHex(colorSpace: string, values: number[]): string {
    if (colorSpace === 'rgb') {
      const r = Math.round(Math.max(0, Math.min(1, values[0])) * 255);
      const g = Math.round(Math.max(0, Math.min(1, values[1])) * 255);
      const b = Math.round(Math.max(0, Math.min(1, values[2])) * 255);
      return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`.toUpperCase();
    }
    if (colorSpace === 'cmyk') {
      // CMYK 转 RGB 近似
      const c = values[0], m = values[1], y = values[2], k = values[3];
      const r = Math.round(255 * (1 - c) * (1 - k));
      const g = Math.round(255 * (1 - m) * (1 - k));
      const b = Math.round(255 * (1 - y) * (1 - k));
      return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`.toUpperCase();
    }
    // gray
    const v = Math.round(Math.max(0, Math.min(1, values[0])) * 255);
    return `#${v.toString(16).padStart(2, '0')}${v.toString(16).padStart(2, '0')}${v.toString(16).padStart(2, '0')}`.toUpperCase();
  }

  /**
   * 十六进制转 RGB 分量 (0-1)
   */
  private hexToRgbValues(hex: string): number[] {
    const clean = hex.replace('#', '');
    const r = parseInt(clean.substring(0, 2), 16) / 255;
    const g = parseInt(clean.substring(2, 4), 16) / 255;
    const b = parseInt(clean.substring(4, 6), 16) / 255;
    return [r, g, b];
  }

  /**
   * 计算两个 RGB 颜色的欧氏距离
   */
  private colorDistance(a: number[], b: number[]): number {
    let sum = 0;
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
      sum += (a[i] - b[i]) ** 2;
    }
    return Math.sqrt(sum);
  }

  /**
   * 批量替换颜色
   */
  async replaceColors(pdfData: ArrayBuffer, options: ColorReplaceOptions): Promise<ColorReplaceResult> {
    const doc = await PDFDocument.load(pdfData, { ignoreEncryption: true });
    const pages = doc.getPages();
    const totalPages = pages.length;
    let replacedCount = 0;
    let pagesProcessed = 0;

    const targetIndices = options.pageIndices && options.pageIndices.length > 0
      ? options.pageIndices.filter(i => i >= 0 && i < totalPages)
      : Array.from({ length: totalPages }, (_, i) => i);

    // 预计算每条规则的旧颜色分量
    const ruleValues = options.rules.map(rule => ({
      oldValues: this.hexToRgbValues(rule.oldColor),
      newColor: rule.newColor,
      tolerance: rule.tolerance || options.tolerance || 0.05,
      colorSpace: rule.colorSpace,
    }));

    for (const pageIdx of targetIndices) {
      const page = pages[pageIdx];
      const contentBytes = ContentStreamParser.getPageContentBytes(page);
      if (!contentBytes) continue;

      pagesProcessed++;
      const raw = new TextDecoder('latin1').decode(contentBytes);
      let modified = false;
      let newContent = raw;

      // 替换 RGB fill: r g b rg
      newContent = newContent.replace(
        /([\d.eE+-]+)\s+([\d.eE+-]+)\s+([\d.eE+-]+)\s+rg/g,
        (match, r, g, b) => {
          const values = [parseFloat(r), parseFloat(g), parseFloat(b)];
          for (const rule of ruleValues) {
            if (this.colorDistance(values, rule.oldValues) <= rule.tolerance) {
              const nv = this.hexToRgbValues(rule.newColor);
              replacedCount++;
              modified = true;
              return `${nv[0].toFixed(4)} ${nv[1].toFixed(4)} ${nv[2].toFixed(4)} rg`;
            }
          }
          return match;
        }
      );

      // 替换 RGB stroke: r g b RG
      newContent = newContent.replace(
        /([\d.eE+-]+)\s+([\d.eE+-]+)\s+([\d.eE+-]+)\s+RG/g,
        (match, r, g, b) => {
          const values = [parseFloat(r), parseFloat(g), parseFloat(b)];
          for (const rule of ruleValues) {
            if (this.colorDistance(values, rule.oldValues) <= rule.tolerance) {
              const nv = this.hexToRgbValues(rule.newColor);
              replacedCount++;
              modified = true;
              return `${nv[0].toFixed(4)} ${nv[1].toFixed(4)} ${nv[2].toFixed(4)} RG`;
            }
          }
          return match;
        }
      );

      // 替换 Gray fill: val g
      newContent = newContent.replace(
        /([\d.eE+-]+)\s+g(?![\w])/g,
        (match, grayVal) => {
          const val = parseFloat(grayVal);
          const grayRgb = [val, val, val];
          for (const rule of ruleValues) {
            if (this.colorDistance(grayRgb, rule.oldValues) <= rule.tolerance) {
              const nv = this.hexToRgbValues(rule.newColor);
              // 转回灰度：取亮度
              const newGray = 0.299 * nv[0] + 0.587 * nv[1] + 0.114 * nv[2];
              replacedCount++;
              modified = true;
              return `${newGray.toFixed(4)} g`;
            }
          }
          return match;
        }
      );

      // 替换 Gray stroke: val G
      newContent = newContent.replace(
        /([\d.eE+-]+)\s+G(?![\w])/g,
        (match, grayVal) => {
          const val = parseFloat(grayVal);
          const grayRgb = [val, val, val];
          for (const rule of ruleValues) {
            if (this.colorDistance(grayRgb, rule.oldValues) <= rule.tolerance) {
              const nv = this.hexToRgbValues(rule.newColor);
              const newGray = 0.299 * nv[0] + 0.587 * nv[1] + 0.114 * nv[2];
              replacedCount++;
              modified = true;
              return `${newGray.toFixed(4)} G`;
            }
          }
          return match;
        }
      );

      if (modified) {
        const newStreamBytes = new TextEncoder().encode(newContent);
        const context = doc.context;
        const newStream = context.flateStream(newStreamBytes);
        page.node.set(PDFName.of('Contents'), context.register(newStream));
      }
    }

    const bytes = await doc.save();
    const resultData = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

    return {
      pdfData: resultData,
      replacedCount,
      pagesProcessed,
    };
  }
}
