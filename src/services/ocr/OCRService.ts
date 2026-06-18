import { createWorker, type Worker } from 'tesseract.js';

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
   * 销毁 Worker
   */
  async destroy(): Promise<void> {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
    }
  }
}
