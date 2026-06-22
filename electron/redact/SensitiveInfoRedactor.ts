import { PDFDocument } from 'pdf-lib';
import { ContentStreamParser } from '../pdf/ContentStreamParser';
import { RedactionService, type RedactionRect } from '../redaction/RedactionService';

/** 预定义敏感信息规则 */
export const DEFAULT_SENSITIVE_RULES: SensitiveRule[] = [
  {
    name: '手机号',
    pattern: '1[3-9]\\d{9}',
    enabled: true,
    description: '中国大陆手机号码',
  },
  {
    name: '身份证号',
    pattern: '[1-9]\\d{5}(?:19|20)\\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\\d|3[01])\\d{3}[\\dXx]',
    enabled: true,
    description: '18位身份证号码',
  },
  {
    name: '邮箱地址',
    pattern: '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}',
    enabled: true,
    description: '电子邮件地址',
  },
  {
    name: '银行卡号',
    pattern: '\\d{16,19}',
    enabled: false,
    description: '银行卡号（16-19位数字）',
  },
  {
    name: 'IPv4地址',
    pattern: '(?:25[0-5]|2[0-4]\\d|[01]?\\d\\d?)\\.(?:25[0-5]|2[0-4]\\d|[01]?\\d\\d?)\\.(?:25[0-5]|2[0-4]\\d|[01]?\\d\\d?)\\.(?:25[0-5]|2[0-4]\\d|[01]?\\d\\d?)',
    enabled: false,
    description: 'IPv4 地址',
  },
  {
    name: '车牌号',
    pattern: '[京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤川青藏琼宁][A-Z][A-HJ-NP-Z0-9]{4,5}[A-HJ-NP-Z0-9挂学警港澳]',
    enabled: false,
    description: '中国车牌号',
  },
  {
    name: '固定电话',
    pattern: '(?:0\\d{2,3})?[- ]?\\d{7,8}',
    enabled: false,
    description: '固定电话（含区号）',
  },
];

/** 敏感信息规则 */
export interface SensitiveRule {
  name: string;
  pattern: string;
  enabled: boolean;
  description?: string;
}

/** 敏感信息匹配结果 */
export interface SensitiveMatch {
  /** 匹配 ID（用于前端选择/取消选择） */
  id: string;
  /** 页面号 (1-based) */
  page: number;
  /** 匹配的文本 */
  text: string;
  /** 匹配到的规则名称 */
  ruleName: string;
  /** 涂黑区域 (PDF 坐标系, 左下角原点) */
  rect: { x: number; y: number; width: number; height: number };
}

/** 检测结果 */
export interface SensitiveDetectResult {
  matches: SensitiveMatch[];
  rulesUsed: string[];
  pagesScanned: number;
}

/** 涂黑结果 */
export interface SensitiveRedactResult {
  pdfData: ArrayBuffer;
  redactedCount: number;
}

/**
 * 敏感信息自动检测和涂黑服务
 * 使用正则表达式在 PDF 文本中查找敏感信息，自动定位并涂黑
 */
export class SensitiveInfoRedactor {
  private parser = new ContentStreamParser();
  private redactionService = new RedactionService();

  /**
   * 检测 PDF 中的敏感信息
   */
  async detectSensitiveInfo(
    pdfData: ArrayBuffer,
    rules: SensitiveRule[]
  ): Promise<SensitiveDetectResult> {
    const doc = await PDFDocument.load(pdfData, { ignoreEncryption: true });
    const pages = doc.getPages();
    const matches: SensitiveMatch[] = [];
    const rulesUsed = new Set<string>();
    let matchId = 0;

    // 编译启用的规则
    const compiledRules = rules
      .filter(r => r.enabled)
      .map(r => ({
        name: r.name,
        regex: new RegExp(r.pattern, 'g'),
      }));

    if (compiledRules.length === 0) {
      return { matches: [], rulesUsed: [], pagesScanned: 0 };
    }

    for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
      const page = pages[pageIdx];
      const contentBytes = ContentStreamParser.getPageContentBytes(page);
      if (!contentBytes) continue;

      const { textSegments } = this.parser.parse(contentBytes);

      for (const segment of textSegments) {
        if (!segment.text.trim()) continue;

        for (const rule of compiledRules) {
          // 重置 regex 状态
          rule.regex.lastIndex = 0;
          let match: RegExpExecArray | null;

          while ((match = rule.regex.exec(segment.text)) !== null) {
            const matchedText = match[0];
            if (!matchedText || matchedText.length < 2) continue;

            // 计算匹配在文本中的相对位置
            const matchStart = match.index;
            const charWidth = segment.fontSize * 0.5;
            const matchWidth = matchedText.length * charWidth;
            const matchOffsetX = matchStart * charWidth;

            // PDF 坐标系：左下角为原点
            // textSegment.position 是文本起始点（左下角）
            const x = segment.position.x + matchOffsetX;
            const y = segment.position.y;
            const width = matchWidth;
            const height = segment.fontSize * 1.2;

            matches.push({
              id: `match_${matchId++}`,
              page: pageIdx + 1,
              text: matchedText,
              ruleName: rule.name,
              rect: {
                x: Math.max(0, x - 1),
                y: Math.max(0, y - 1),
                width: width + 2,
                height: height + 2,
              },
            });

            rulesUsed.add(rule.name);
          }
        }
      }
    }

    return {
      matches,
      rulesUsed: Array.from(rulesUsed),
      pagesScanned: pages.length,
    };
  }

  /**
   * 涂黑选中的敏感信息
   */
  async redactSensitiveInfo(
    pdfData: ArrayBuffer,
    matches: SensitiveMatch[]
  ): Promise<SensitiveRedactResult> {
    if (!matches || matches.length === 0) {
      return {
        pdfData: pdfData.slice(0),
        redactedCount: 0,
      };
    }

    // 将匹配转为 RedactionRect 格式
    const rects: RedactionRect[] = matches.map(m => ({
      page: m.page,
      x: m.rect.x,
      y: m.rect.y,
      width: m.rect.width,
      height: m.rect.height,
    }));

    const result = await this.redactionService.redact(pdfData, rects);

    return {
      pdfData: result.data,
      redactedCount: matches.length,
    };
  }
}
