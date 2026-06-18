import * as pdfjsLib from 'pdfjs-dist';
import { TextLayer } from 'pdfjs-dist';
import type { PDFDocumentInfo } from '@/types';
import { Logger } from '@/utils';

const logger = new Logger('PDFService');

// 配置 PDF.js Worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

export class PDFService {
  private pdfDocument: pdfjsLib.PDFDocumentProxy | null = null;
  private renderTasks = new Map<number, pdfjsLib.RenderTask>();
  // 页面文本内容缓存：getTextContent() 开销大，同页面只需取一次
  private textContentCache = new Map<number, Awaited<ReturnType<pdfjsLib.PDFPageProxy['getTextContent']>>>();

  /**
   * 加载 PDF 文档
   */
  async loadDocument(
    data: ArrayBuffer,
    options?: {
      password?: string;
      onProgress?: (progress: number) => void;
    }
  ): Promise<pdfjsLib.PDFDocumentProxy> {
    try {
      const loadingTask = pdfjsLib.getDocument({
        data: new Uint8Array(data),
        password: options?.password,
        cMapUrl: '/cmaps/',
        cMapPacked: true,
        standardFontDataUrl: '/standard_fonts/',
      });

      if (options?.onProgress) {
        loadingTask.onProgress = (progress: { loaded: number; total: number }) => {
          if (progress.total > 0) {
            options.onProgress!(progress.loaded / progress.total);
          }
        };
      }

      this.pdfDocument = await loadingTask.promise;
      logger.info(`PDF loaded: ${this.pdfDocument.numPages} pages`);
      return this.pdfDocument;
    } catch (err) {
      logger.error('Failed to load PDF:', err);
      throw err;
    }
  }

  /**
   * 获取页面代理
   */
  async getPage(pageNumber: number): Promise<pdfjsLib.PDFPageProxy> {
    if (!this.pdfDocument) throw new Error('PDF not loaded');
    return this.pdfDocument.getPage(pageNumber);
  }

  /**
   * 获取文档信息
   */
  async getDocumentInfo(filePath: string): Promise<PDFDocumentInfo | null> {
    if (!this.pdfDocument) return null;
    const metadata = await this.pdfDocument.getMetadata();
    const info = metadata.info as Record<string, string>;
    return {
      title: info?.Title,
      author: info?.Author,
      subject: info?.Subject,
      creator: info?.Creator,
      producer: info?.Producer,
      creationDate: info?.CreationDate,
      modificationDate: info?.ModDate,
      pageCount: this.pdfDocument.numPages,
      fileSize: 0, // Will be set by caller
      filePath,
    };
  }

  /**
   * 获取页面尺寸
   */
  async getPageSize(pageNumber: number): Promise<{ width: number; height: number }> {
    const page = await this.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1.0 });
    return { width: viewport.width, height: viewport.height };
  }

  /**
   * 渲染页面到 Canvas
   */
  async renderPage(
    pageNumber: number,
    canvas: HTMLCanvasElement,
    scale: number,
    rotation = 0
  ): Promise<void> {
    // 取消同一页面的上一次渲染
    const prevTask = this.renderTasks.get(pageNumber);
    if (prevTask) {
      prevTask.cancel();
    }

    try {
      const page = await this.getPage(pageNumber);
      const viewport = page.getViewport({ scale, rotation });

      const dpr = window.devicePixelRatio || 1;
      canvas.width = viewport.width * dpr;
      canvas.height = viewport.height * dpr;
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;

      const ctx = canvas.getContext('2d')!;
      ctx.setTransform(1, 0, 0, 1, 0, 0); // 重置变换
      ctx.scale(dpr, dpr);

      const renderTask = page.render({
        canvasContext: ctx,
        viewport,
      });
      this.renderTasks.set(pageNumber, renderTask);

      await renderTask.promise;
      logger.debug(`Page ${pageNumber} rendered at scale ${scale}`);
    } catch (err) {
      if (err instanceof Error && err.name === 'RenderingCancelledException') return;
      throw err;
    } finally {
      this.renderTasks.delete(pageNumber);
    }
  }

  /**
   * 渲染文本层
   */
  async renderTextLayer(
    pageNumber: number,
    container: HTMLElement,
    scale: number,
    rotation = 0
  ): Promise<void> {
    const page = await this.getPage(pageNumber);
    const viewport = page.getViewport({ scale, rotation });

    // 使用缓存的 textContent，避免每次重复调用昂贵的 API
    let textContent = this.textContentCache.get(pageNumber);
    if (!textContent) {
      textContent = await page.getTextContent();
      this.textContentCache.set(pageNumber, textContent);
    }

    container.innerHTML = '';
    container.style.width = `${viewport.width}px`;
    container.style.height = `${viewport.height}px`;

    // 创建 textLayer 包装器，pdfjs CSS 依赖 .textLayer 类名
    const textLayerDiv = document.createElement('div');
    textLayerDiv.classList.add('textLayer');
    textLayerDiv.style.width = `${viewport.width}px`;
    textLayerDiv.style.height = `${viewport.height}px`;
    container.appendChild(textLayerDiv);

    // pdfjs-dist v4 使用 TextLayer 类
    const textLayer = new TextLayer({
      textContentSource: textContent,
      container: textLayerDiv,
      viewport,
    });
    await textLayer.render();
  }

  /**
   * 获取页面文本内容（用于搜索）
   */
  async getPageText(pageNumber: number): Promise<string> {
    const page = await this.getPage(pageNumber);
    const textContent = await page.getTextContent();
    return textContent.items
      .map((item) => 'str' in item ? item.str : '')
      .join(' ');
  }

  /**
   * 获取大纲
   */
  async getOutline(): Promise<Array<{ title: string; pageNumber: number }> | null> {
    if (!this.pdfDocument) return null;
    const outline = await this.pdfDocument.getOutline();
    if (!outline) return null;
    return outline.map(item => ({
      title: item.title || '',
      pageNumber: typeof item.dest === 'number' ? item.dest : 1,
    }));
  }

  /**
   * 销毁文档
   */
  async destroy(): Promise<void> {
    if (this.pdfDocument) {
      await this.pdfDocument.destroy();
      this.pdfDocument = null;
      this.textContentCache.clear();
      this.renderTasks.clear();
      logger.info('PDF document destroyed');
    }
  }

  get numPages(): number {
    return this.pdfDocument?.numPages ?? 0;
  }

  get isLoaded(): boolean {
    return this.pdfDocument !== null;
  }
}
