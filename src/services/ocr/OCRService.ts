import { createWorker, type Worker } from 'tesseract.js';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

/** OCR 识别结果 */
export interface OCRResult {
  text: string;
  confidence: number;
  words: Array<{
    text: string;
    confidence: number;
    bbox: { x0: number; y0: number; x1: number; y1: number };
  }>;
  language: string;
}

/** OCR 进度回调 */
export type OCRProgressCallback = (progress: { status: string; progress: number }) => void;

/**
 * OCR 文字识别服务
 * 使用 Tesseract.js 在渲染进程中运行（Web Worker）
 */
export class OCRService {
  private worker: Worker | null = null;
  private currentLang = 'eng+chi_sim';

  /**
   * 初始化 OCR Worker
   */
  async initWorker(langs: string = 'eng+chi_sim', onProgress?: OCRProgressCallback): Promise<void> {
    if (this.worker) {
      // 检查是否需要切换语言
      if (this.currentLang === langs) return;
      await this.worker.reinitialize(langs);
      this.currentLang = langs;
      return;
    }

    this.worker = await createWorker(langs, undefined, {
      logger: (m) => {
        if (onProgress) {
          onProgress({
            status: m.status || 'processing',
            progress: m.progress || 0,
          });
        }
      },
    });

    this.currentLang = langs;
  }

  /**
   * 识别整页文字
   */
  async recognizeImage(
    imageSource: HTMLCanvasElement | HTMLImageElement | string,
    onProgress?: OCRProgressCallback
  ): Promise<OCRResult> {
    if (!this.worker) {
      await this.initWorker('eng+chi_sim', onProgress);
    }

    const result = await this.worker!.recognize(imageSource);

    // Tesseract.js 返回 words 在 lines 中
    const allWords: OCRResult['words'] = [];
    const data = result.data as unknown as Record<string, unknown>;
    if (data.lines && Array.isArray(data.lines)) {
      for (const line of data.lines as Array<{ words?: Array<{ text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } }> }>) {
        if (line.words) {
          allWords.push(...line.words);
        }
      }
    }

    return {
      text: result.data.text,
      confidence: result.data.confidence,
      words: allWords,
      language: this.currentLang,
    };
  }

  /**
   * 识别指定区域
   */
  async recognizeRegion(
    imageSource: HTMLCanvasElement | HTMLImageElement | string,
    region: { x: number; y: number; width: number; height: number },
    onProgress?: OCRProgressCallback
  ): Promise<OCRResult> {
    if (!this.worker) {
      await this.initWorker('eng+chi_sim', onProgress);
    }

    const result = await this.worker!.recognize(imageSource, {
      rectangle: { left: region.x, top: region.y, width: region.width, height: region.height },
    });

    const regionWords: OCRResult['words'] = [];
    const regionData = result.data as unknown as Record<string, unknown>;
    if (regionData.lines && Array.isArray(regionData.lines)) {
      for (const line of regionData.lines as Array<{ words?: Array<{ text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } }> }>) {
        if (line.words) {
          regionWords.push(...line.words);
        }
      }
    }

    return {
      text: result.data.text,
      confidence: result.data.confidence,
      words: regionWords,
      language: this.currentLang,
    };
  }

  /**
   * 从 PDF 页面截图进行 OCR
   * 将 PDF 页面渲染到临时 Canvas，然后进行识别
   */
  async recognizePage(
    pdfService: { renderPage: (page: number, canvas: HTMLCanvasElement, scale: number) => Promise<void> },
    pageNumber: number,
    scale: number = 2.0,
    onProgress?: OCRProgressCallback
  ): Promise<OCRResult> {
    // 创建临时 Canvas
    const canvas = document.createElement('canvas');
    await pdfService.renderPage(pageNumber, canvas, scale);

    try {
      return await this.recognizeImage(canvas, onProgress);
    } finally {
      canvas.remove();
    }
  }

  /**
   * 设置识别语言
   */
  async setLanguage(langs: string, onProgress?: OCRProgressCallback): Promise<void> {
    if (this.worker) {
      await this.worker.reinitialize(langs);
      this.currentLang = langs;
    } else {
      await this.initWorker(langs, onProgress);
    }
  }

  /**
   * 生成可搜索 PDF
   * 逐页渲染 + OCR + 叠加不可见文字层
   */
  async createSearchablePdf(
    pdfData: ArrayBuffer,
    pdfService: { renderPage: (page: number, canvas: HTMLCanvasElement, scale: number) => Promise<void>; getPageSize: (page: number) => Promise<{ width: number; height: number }> },
    pageCount: number,
    langs: string,
    onProgress?: OCRProgressCallback,
    signal?: AbortSignal
  ): Promise<ArrayBuffer> {
    await this.initWorker(langs, onProgress);

    // 创建独立副本用于 pdf-lib 编辑（避免修改原始数据）
    const pdfBytes = new Uint8Array(pdfData.slice(0));
    const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const scale = 2.0;

    for (let i = 0; i < pageCount; i++) {
      if (signal?.aborted) throw new Error('OCR 已取消');

      const pageNum = i + 1;
      onProgress?.({ status: 'recognizing text', progress: i / pageCount });

      // 渲染页面到 Canvas
      const canvas = document.createElement('canvas');
      await pdfService.renderPage(pageNum, canvas, scale);

      // OCR 识别
      const result = await this.worker!.recognize(canvas);
      canvas.remove();

      if (signal?.aborted) throw new Error('OCR 已取消');

      // 获取页面尺寸（PDF 点单位）
      const pageSize = await pdfService.getPageSize(pageNum);
      const pdfPage = pdfDoc.getPage(i);
      const canvasW = canvas.width || pageSize.width * scale;
      const canvasH = canvas.height || pageSize.height * scale;
      const scaleX = pageSize.width / canvasW;
      const scaleY = pageSize.height / canvasH;

      // 提取文字并叠加到 PDF 页面上
      const data = result.data as unknown as Record<string, unknown>;
      if (data.lines && Array.isArray(data.lines)) {
        for (const line of data.lines as Array<{
          text?: string;
          bbox?: { y0: number; y1: number };
          words?: Array<{ text: string; bbox: { x0: number; y0: number; x1: number; y1: number } }>;
        }>) {
          if (!line.words) continue;
          for (const word of line.words) {
            const text = word.text.trim();
            if (!text || text.length === 0) continue;

            const { x0, y0, y1 } = word.bbox;

            // Canvas 像素坐标 -> PDF 点坐标（Y 轴翻转）
            const pdfX = x0 * scaleX;
            const pdfY = pageSize.height - y1 * scaleY;
            const heightPt = (y1 - y0) * scaleY;

            // 字号约为 bbox 高度的 80%（补偿上升/下降部分）
            const fontSize = Math.max(4, heightPt * 0.8);

            try {
              pdfPage.drawText(text, {
                x: pdfX,
                y: pdfY,
                size: fontSize,
                font,
                color: rgb(1, 1, 1),   // 白色（在白底上不可见）
                opacity: 0.001,         // 近透明（保留可搜索性）
              });
            } catch {
              // 跳过无法嵌入的特殊字符
            }
          }
        }
      }
    }

    onProgress?.({ status: 'generating pdf', progress: 0.95 });
    const savedBytes = await pdfDoc.save();
    onProgress?.({ status: 'done', progress: 1 });
    return savedBytes.buffer.slice(savedBytes.byteOffset, savedBytes.byteOffset + savedBytes.byteLength) as ArrayBuffer;
  }

  /**
   * 销毁 Worker
   */
  async destroy(): Promise<void> {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
    }
  }
}
