import { PDFService } from '@/services/pdf/PDFService';
import { Logger } from '@/utils';
import { SearchWorkerBridge } from './SearchWorkerBridge';

const logger = new Logger('SearchService');

/** Worker 桥接实例（懒初始化） */
let workerBridge: SearchWorkerBridge | null = null;

function getWorkerBridge(): SearchWorkerBridge {
  if (!workerBridge) {
    workerBridge = new SearchWorkerBridge();
  }
  return workerBridge;
}

/** 搜索结果项 */
export interface SearchResultItem {
  page: number;
  matchIndex: number; // 全局匹配序号
  text: string;      // 匹配周围的上下文文本
  startOffset: number;
  endOffset: number;
  /** 匹配文字在页面上的位置（归一化坐标） */
  rects: Array<{ x: number; y: number; width: number; height: number }>;
  /** 结果类型 */
  type?: 'pdf-text' | 'annotation' | 'comment';
  /** 标注/评论 ID */
  annotationId?: string;
  commentId?: string;
  /** 标注类型标签 */
  annotationType?: string;
}

/** 搜索选项 */
export interface SearchOptions {
  caseSensitive: boolean;
  wholeWord: boolean;
}

/**
 * 全文搜索服务
 */
export class SearchService {
  /**
   * 在所有页面中搜索关键词（优先使用 Web Worker）
   */
  async search(
    pdfService: PDFService,
    query: string,
    options: SearchOptions = { caseSensitive: false, wholeWord: false },
    onProgress?: (progress: number) => void
  ): Promise<SearchResultItem[]> {
    if (!query || !pdfService.isLoaded) return [];

    // 搜索 PDF 原文
    let pdfResults: SearchResultItem[] = [];
    try {
      const bridge = getWorkerBridge();
      pdfResults = await bridge.search(pdfService, query, options, onProgress);
    } catch (err) {
      logger.warn('Worker search failed, falling back to main thread:', err);
      pdfResults = await this.searchMainThread(pdfService, query, options, onProgress);
    }

    // 标记类型为 PDF 原文
    for (const r of pdfResults) {
      r.type = 'pdf-text';
    }

    return pdfResults;
  }

  /**
   * 搜索标注内容和评论
   */
  searchAnnotationsAndComments(
    query: string,
    annotations: Array<{ id: string; type: string; page: number; content?: string }> ,
    comments: Array<{ id: string; annotationId: string; author: string; text: string }>,
    options: SearchOptions = { caseSensitive: false, wholeWord: false }
  ): SearchResultItem[] {
    if (!query) return [];
    const results: SearchResultItem[] = [];
    let globalMatchIndex = 100000; // 从大数开始，避免与 PDF 结果冲突
    const searchStr = options.caseSensitive ? query : query.toLowerCase();

    // 搜索标注
    for (const ann of annotations) {
      const content = ann.content || '';
      if (!content) continue;
      const textToSearch = options.caseSensitive ? content : content.toLowerCase();
      const idx = this.findMatch(textToSearch, searchStr, options);
      if (idx >= 0) {
        const contextStart = Math.max(0, idx - 20);
        const contextEnd = Math.min(content.length, idx + query.length + 20);
        results.push({
          page: ann.page,
          matchIndex: globalMatchIndex++,
          text: content.slice(contextStart, contextEnd),
          startOffset: idx,
          endOffset: idx + query.length,
          rects: [],
          type: 'annotation',
          annotationId: ann.id,
          annotationType: ann.type,
        });
      }
    }

    // 搜索评论
    for (const comment of comments) {
      const commentText = options.caseSensitive ? comment.text : comment.text.toLowerCase();
      const idx = this.findMatch(commentText, searchStr, options);
      if (idx >= 0) {
        const contextStart = Math.max(0, idx - 20);
        const contextEnd = Math.min(comment.text.length, idx + query.length + 20);
        results.push({
          page: 0, // 评论不直接关联页面
          matchIndex: globalMatchIndex++,
          text: `${comment.author}: ${comment.text.slice(contextStart, contextEnd)}`,
          startOffset: idx,
          endOffset: idx + query.length,
          rects: [],
          type: 'comment',
          annotationId: comment.annotationId,
          commentId: comment.id,
        });
      }
    }

    return results;
  }

  /** 查找匹配位置 */
  private findMatch(text: string, searchStr: string, options: SearchOptions): number {
    if (options.wholeWord) {
      let pos = 0;
      while (pos < text.length) {
        const found = text.indexOf(searchStr, pos);
        if (found === -1) return -1;
        const before = found > 0 ? text[found - 1] : ' ';
        const after = found + searchStr.length < text.length ? text[found + searchStr.length] : ' ';
        if (/\W/.test(before) && /\W/.test(after)) return found;
        pos = found + 1;
      }
      return -1;
    }
    return text.indexOf(searchStr);
  }

  /**
   * 主线程搜索（Worker 失败时的回退方案）
   */
  private async searchMainThread(
    pdfService: PDFService,
    query: string,
    options: SearchOptions = { caseSensitive: false, wholeWord: false },
    onProgress?: (progress: number) => void
  ): Promise<SearchResultItem[]> {
    if (!query || !pdfService.isLoaded) return [];

    const results: SearchResultItem[] = [];
    const totalPages = pdfService.numPages;
    const searchStr = options.caseSensitive ? query : query.toLowerCase();
    let globalMatchIndex = 0;

    for (let page = 1; page <= totalPages; page++) {
      try {
        const text = await pdfService.getPageText(page);

        // 获取页面文字位置信息（用于高亮）
        let textItems: Array<{ str: string; x: number; y: number; width: number; height: number }> = [];
        try {
          textItems = await pdfService.getPageTextItems(page);
        } catch {
          // 如果获取位置失败，仍然返回文本结果，只是没有位置高亮
        }

        const pageText = options.caseSensitive ? text : text.toLowerCase();
        const pagePageSize = await pdfService.getPageSize(page);
        let searchStart = 0;

        while (searchStart < pageText.length) {
          let idx: number;
          if (options.wholeWord) {
            // 全词匹配
            idx = -1;
            let pos = searchStart;
            while (pos < pageText.length) {
              const found = pageText.indexOf(searchStr, pos);
              if (found === -1) break;
              const before = found > 0 ? pageText[found - 1] : ' ';
              const after = found + searchStr.length < pageText.length ? pageText[found + searchStr.length] : ' ';
              if (/\W/.test(before) && /\W/.test(after)) {
                idx = found;
                break;
              }
              pos = found + 1;
            }
          } else {
            idx = pageText.indexOf(searchStr, searchStart);
          }

          if (idx === -1) break;

          // 获取上下文文本
          const contextStart = Math.max(0, idx - 30);
          const contextEnd = Math.min(text.length, idx + query.length + 30);
          const contextText = text.slice(contextStart, contextEnd);

          // 尝试获取匹配文字在页面上的位置
          const rects = this.findTextRects(text, textItems, idx, query.length, pagePageSize);

          results.push({
            page,
            matchIndex: globalMatchIndex++,
            text: contextText,
            startOffset: idx,
            endOffset: idx + query.length,
            rects,
          });

          searchStart = idx + Math.max(1, query.length);
        }
      } catch (err) {
        logger.warn(`Search error on page ${page}:`, err);
      }

      if (onProgress) onProgress(page / totalPages);
    }

    logger.info(`Found ${results.length} matches for "${query}"`);
    return results;
  }

  /**
   * 在文字位置信息中查找匹配文字的矩形区域
   */
  private findTextRects(
    _fullText: string,
    textItems: Array<{ str: string; x: number; y: number; width: number; height: number }>,
    startOffset: number,
    matchLength: number,
    pageSize: { width: number; height: number }
  ): Array<{ x: number; y: number; width: number; height: number }> {
    if (textItems.length === 0) return [];

    // 简单的近似：构建字符累积位置映射
    let charIndex = 0;
    const rects: Array<{ x: number; y: number; width: number; height: number }> = [];
    const endOffset = startOffset + matchLength;

    for (const item of textItems) {
      const itemStart = charIndex;
      const itemEnd = charIndex + item.str.length;

      if (itemEnd > startOffset && itemStart < endOffset) {
        // 此项与匹配区域重叠
        const overlapStart = Math.max(itemStart, startOffset) - itemStart;
        const overlapEnd = Math.min(itemEnd, endOffset) - itemStart;
        const charWidth = item.str.length > 0 ? item.width / item.str.length : item.width;

        rects.push({
          x: (item.x + overlapStart * charWidth) / pageSize.width,
          y: item.y / pageSize.height,
          width: ((overlapEnd - overlapStart) * charWidth) / pageSize.width,
          height: item.height / pageSize.height,
        });
      }

      charIndex = itemEnd;
      // 加上单词间的空格
      charIndex += 1;
    }

    return rects;
  }
}
