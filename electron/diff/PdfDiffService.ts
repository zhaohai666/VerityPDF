import { PDFDocument } from 'pdf-lib';
import { ContentStreamParser } from '../pdf/ContentStreamParser';

/** Diff 行类型 */
export type DiffLineType = 'equal' | 'added' | 'removed';

/** Diff 行结果 */
export interface DiffLine {
  type: DiffLineType;
  /** A 文件中的行号 (0-based, -1 if added) */
  lineA: number;
  /** B 文件中的行号 (0-based, -1 if removed) */
  lineB: number;
  /** 文本内容 */
  text: string;
}

/** Diff 统计 */
export interface DiffStats {
  totalLinesA: number;
  totalLinesB: number;
  addedCount: number;
  removedCount: number;
  equalCount: number;
  changeRatio: number;
}

/** PDF Diff 结果 */
export interface PdfDiffResult {
  diffs: DiffLine[];
  stats: DiffStats;
  pagesA: number;
  pagesB: number;
}

/** 提取的文本行（带页码信息） */
interface TextLine {
  text: string;
  pageIndex: number;
}

/**
 * 双 PDF 文本 Diff 服务
 * 提取两个 PDF 的全文文本，使用 LCS diff 算法对比差异
 */
export class PdfDiffService {
  private parser = new ContentStreamParser();

  /**
   * 从 PDF 中提取所有页面的文本，按行返回
   */
  async extractLines(pdfData: ArrayBuffer): Promise<{ lines: TextLine[]; pageCount: number }> {
    const doc = await PDFDocument.load(pdfData, { ignoreEncryption: true });
    const pages = doc.getPages();
    const allLines: TextLine[] = [];

    for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
      const page = pages[pageIdx];
      const contentBytes = ContentStreamParser.getPageContentBytes(page);
      if (!contentBytes) continue;

      const { textSegments } = this.parser.parse(contentBytes);

      // 按 Y 坐标分组为行（Y 值接近的归为同一行）
      const lineGroups = this.groupIntoLines(textSegments, pageIdx);
      allLines.push(...lineGroups);
    }

    return { lines: allLines, pageCount: pages.length };
  }

  /**
   * 将文本段按 Y 坐标分组为行
   */
  private groupIntoLines(
    segments: Array<{ text: string; position: { x: number; y: number }; fontSize: number }>,
    pageIndex: number
  ): TextLine[] {
    if (segments.length === 0) return [];

    // 按 Y 坐标降序排序（PDF 坐标系中 Y 从上到下递减）
    const sorted = [...segments]
      .filter(s => s.text.trim().length > 0)
      .sort((a, b) => b.position.y - a.position.y);

    const lines: TextLine[] = [];
    let currentLine: Array<typeof sorted[0]> = [];
    let currentY = sorted[0]?.position.y ?? 0;

    for (const seg of sorted) {
      // Y 坐标差在字号的一半以内视为同一行
      const threshold = Math.max(seg.fontSize * 0.5, 3);
      if (Math.abs(seg.position.y - currentY) <= threshold) {
        currentLine.push(seg);
      } else {
        // 输出当前行
        if (currentLine.length > 0) {
          // 按 X 坐标排序
          currentLine.sort((a, b) => a.position.x - b.position.x);
          const lineText = currentLine.map(s => s.text).join(' ');
          if (lineText.trim()) {
            lines.push({ text: lineText, pageIndex });
          }
        }
        currentLine = [seg];
        currentY = seg.position.y;
      }
    }

    // 处理最后一行
    if (currentLine.length > 0) {
      currentLine.sort((a, b) => a.position.x - b.position.x);
      const lineText = currentLine.map(s => s.text).join(' ');
      if (lineText.trim()) {
        lines.push({ text: lineText, pageIndex });
      }
    }

    return lines;
  }

  /**
   * 对比两个 PDF 的文本
   */
  async diffPdfs(pdfDataA: ArrayBuffer, pdfDataB: ArrayBuffer): Promise<PdfDiffResult> {
    const [resultA, resultB] = await Promise.all([
      this.extractLines(pdfDataA),
      this.extractLines(pdfDataB),
    ]);

    const linesA = resultA.lines.map(l => l.text);
    const linesB = resultB.lines.map(l => l.text);

    const diffs = this.computeDiff(linesA, linesB);

    const addedCount = diffs.filter(d => d.type === 'added').length;
    const removedCount = diffs.filter(d => d.type === 'removed').length;
    const equalCount = diffs.filter(d => d.type === 'equal').length;

    return {
      diffs,
      stats: {
        totalLinesA: linesA.length,
        totalLinesB: linesB.length,
        addedCount,
        removedCount,
        equalCount,
        changeRatio: linesA.length + linesB.length > 0
          ? (addedCount + removedCount) / (linesA.length + linesB.length)
          : 0,
      },
      pagesA: resultA.pageCount,
      pagesB: resultB.pageCount,
    };
  }

  /**
   * 基于 LCS (最长公共子序列) 的 Diff 算法
   * 使用动态规划计算两个文本数组的差异
   */
  computeDiff(linesA: string[], linesB: string[]): DiffLine[] {
    const n = linesA.length;
    const m = linesB.length;

    // 优化：对于大文件，使用 patience diff 或限制搜索范围
    if (n + m > 10000) {
      return this.simpleDiff(linesA, linesB);
    }

    // 标准 LCS 动态规划
    const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));

    for (let i = 1; i <= n; i++) {
      for (let j = 1; j <= m; j++) {
        if (linesA[i - 1] === linesB[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }

    // 回溯生成 diff
    const diffs: DiffLine[] = [];
    let i = n;
    let j = m;

    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && linesA[i - 1] === linesB[j - 1]) {
        diffs.push({ type: 'equal', lineA: i - 1, lineB: j - 1, text: linesA[i - 1] });
        i--;
        j--;
      } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
        diffs.push({ type: 'added', lineA: -1, lineB: j - 1, text: linesB[j - 1] });
        j--;
      } else {
        diffs.push({ type: 'removed', lineA: i - 1, lineB: -1, text: linesA[i - 1] });
        i--;
      }
    }

    // 反转（因为是从后往前的）
    diffs.reverse();
    return diffs;
  }

  /**
   * 简单 diff 算法（用于大文件），基于贪心匹配
   */
  private simpleDiff(linesA: string[], linesB: string[]): DiffLine[] {
    const diffs: DiffLine[] = [];
    const lineSetB = new Map<string, number[]>();

    // 建立 B 的行索引
    for (let j = 0; j < linesB.length; j++) {
      const key = linesB[j];
      if (!lineSetB.has(key)) lineSetB.set(key, []);
      lineSetB.get(key)!.push(j);
    }

    let i = 0;
    let j = 0;

    while (i < linesA.length || j < linesB.length) {
      if (i >= linesA.length) {
        // A 已耗尽，B 剩余的都是新增
        while (j < linesB.length) {
          diffs.push({ type: 'added', lineA: -1, lineB: j, text: linesB[j] });
          j++;
        }
        break;
      }
      if (j >= linesB.length) {
        // B 已耗尽，A 剩余的都是删除
        while (i < linesA.length) {
          diffs.push({ type: 'removed', lineA: i, lineB: -1, text: linesA[i] });
          i++;
        }
        break;
      }

      if (linesA[i] === linesB[j]) {
        diffs.push({ type: 'equal', lineA: i, lineB: j, text: linesA[i] });
        i++;
        j++;
      } else {
        // 尝试在 B 中找到 A[i]
        const foundInB = lineSetB.get(linesA[i]);
        const bIdx = foundInB ? foundInB.find(bi => bi >= j) : undefined;

        if (bIdx !== undefined && bIdx - j < 10) {
          // B 中在附近找到了，先把中间的标记为新增
          while (j < bIdx) {
            diffs.push({ type: 'added', lineA: -1, lineB: j, text: linesB[j] });
            j++;
          }
          diffs.push({ type: 'equal', lineA: i, lineB: j, text: linesA[i] });
          i++;
          j++;
        } else {
          // A[i] 在 B 中找不到或太远，标记为删除
          diffs.push({ type: 'removed', lineA: i, lineB: -1, text: linesA[i] });
          i++;
        }
      }
    }

    return diffs;
  }
}
