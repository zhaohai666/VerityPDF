import { PDFService } from '@/services/pdf/PDFService';
import type { SearchResultItem, SearchOptions } from './SearchService';
import { Logger } from '@/utils';

const logger = new Logger('SearchWorkerBridge');

/**
 * Worker 桥接层：将文本提取和搜索操作委托给 Web Worker
 * 主线程提取序列化数据后发送到 Worker，Worker 完成计算密集型搜索
 */
export class SearchWorkerBridge {
  private worker: Worker | null = null;
  private pendingResolve: ((value: SearchResultItem[]) => void) | null = null;
  private pendingProgressCallback: ((progress: number) => void) | null = null;

  /**
   * 初始化 Worker（延迟创建，首次搜索时实例化）
   */
  private ensureWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(
        new URL('../../workers/textExtract.worker.ts', import.meta.url),
        { type: 'module' }
      );
      this.worker.onmessage = (event) => this.handleMessage(event);
      this.worker.onerror = (err) => {
        logger.error('Worker error:', err);
        // 如果 Worker 出错，reject 当前挂起的 Promise
        if (this.pendingResolve) {
          this.pendingResolve([]);
          this.pendingResolve = null;
        }
      };
    }
    return this.worker;
  }

  private handleMessage(event: MessageEvent): void {
    const data = event.data;

    if (data.type === 'progress') {
      if (this.pendingProgressCallback) {
        this.pendingProgressCallback(data.progress);
      }
    } else if (data.type === 'searchResult') {
      if (this.pendingResolve) {
        this.pendingResolve(data.results);
        this.pendingResolve = null;
      }
    }
  }

  /**
   * 通过 Worker 执行全文搜索
   */
  async search(
    pdfService: PDFService,
    query: string,
    options: SearchOptions,
    onProgress?: (progress: number) => void
  ): Promise<SearchResultItem[]> {
    const worker = this.ensureWorker();
    this.pendingProgressCallback = onProgress ?? null;

    // 主线程提取所有页面文本（需要 PDF.js API，只能在主线程）
    const totalPages = pdfService.numPages;
    const pages: Array<{ page: number; text: string }> = [];
    const pageItems: Array<{
      page: number;
      items: Array<{ str: string; x: number; y: number; width: number; height: number }>;
      pageSize: { width: number; height: number };
    }> = [];

    for (let page = 1; page <= totalPages; page++) {
      try {
        const text = await pdfService.getPageText(page);
        pages.push({ page, text });

        let items: Array<{ str: string; x: number; y: number; width: number; height: number }> = [];
        try {
          items = await pdfService.getPageTextItems(page);
        } catch {
          // 位置信息获取失败时继续（无高亮但有结果）
        }

        const pageSize = await pdfService.getPageSize(page);
        pageItems.push({ page, items, pageSize });
      } catch {
        logger.warn(`Failed to extract text for page ${page}`);
      }
    }

    // 发送数据到 Worker 进行搜索
    return new Promise<SearchResultItem[]>((resolve) => {
      this.pendingResolve = resolve;
      worker.postMessage({
        type: 'search',
        pages,
        pageItems,
        query,
        options,
      });
    });
  }

  /**
   * 销毁 Worker
   */
  destroy(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      this.pendingResolve = null;
      this.pendingProgressCallback = null;
    }
  }
}
