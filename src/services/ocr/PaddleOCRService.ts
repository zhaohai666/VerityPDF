import type { OCRResult, OCRProgressCallback } from './OCRService';

/**
 * PaddleOCR 高精度 OCR 服务
 * 基于 @paddleocr/paddleocr-js (WebAssembly)
 * 提供比 Tesseract.js 更高的中文识别精度
 */
export class PaddleOCRService {
  private engine: any = null;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  /**
   * 初始化 PaddleOCR 引擎
   */
  async initialize(onProgress?: OCRProgressCallback): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      try {
        onProgress?.({ status: 'loading paddleocr core', progress: 0.1 });

        const { PaddleOCR } = await import('@paddleocr/paddleocr-js');

        onProgress?.({ status: 'initializing paddleocr', progress: 0.3 });

        this.engine = await PaddleOCR.create();

        this.initialized = true;
        onProgress?.({ status: 'paddleocr ready', progress: 1.0 });
      } catch (err) {
        console.error('[PaddleOCR] 初始化失败:', err);
        this.initPromise = null;
        throw new Error('PaddleOCR 初始化失败: ' + (err instanceof Error ? err.message : '未知错误'));
      }
    })();

    return this.initPromise;
  }

  /**
   * 识别图像中的文字
   */
  async recognizeImage(
    imageSource: HTMLCanvasElement | HTMLImageElement | string,
    onProgress?: OCRProgressCallback
  ): Promise<OCRResult> {
    if (!this.initialized) {
      await this.initialize(onProgress);
    }

    onProgress?.({ status: 'recognizing text', progress: 0.5 });

    try {
      // 将输入转为 canvas
      let canvas: HTMLCanvasElement;
      if (imageSource instanceof HTMLCanvasElement) {
        canvas = imageSource;
      } else if (imageSource instanceof HTMLImageElement) {
        canvas = document.createElement('canvas');
        canvas.width = imageSource.naturalWidth || imageSource.width;
        canvas.height = imageSource.naturalHeight || imageSource.height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(imageSource, 0, 0);
      } else {
        // URL string - 加载图片
        const img = new Image();
        img.src = imageSource;
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error('图片加载失败'));
        });
        canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
      }

      // PaddleOCR 识别
      const result = await this.engine.recognize(canvas);

      onProgress?.({ status: 'processing results', progress: 0.9 });

      // 解析 PaddleOCR 结果格式
      return this.parseResult(result);
    } catch (err) {
      console.error('[PaddleOCR] 识别失败:', err);
      throw new Error('PaddleOCR 识别失败: ' + (err instanceof Error ? err.message : '未知错误'));
    }
  }

  /**
   * 解析 PaddleOCR 结果
   */
  private parseResult(result: any): OCRResult {
    const words: OCRResult['words'] = [];
    let fullText = '';
    let totalConfidence = 0;
    let count = 0;

    if (result && Array.isArray(result)) {
      for (const item of result) {
        // PaddleOCR 返回格式: [{ text, confidence, box: [[x0,y0],[x1,y1],[x2,y2],[x3,y3]] }]
        const text = item.text || item.transcription || '';
        const confidence = (item.confidence || item.score || 0) * 100;

        if (text.trim()) {
          fullText += text + '\n';
          totalConfidence += confidence;
          count++;

          // 解析边界框
          let bbox = { x0: 0, y0: 0, x1: 0, y1: 0 };
          if (item.box && Array.isArray(item.box) && item.box.length >= 2) {
            bbox = {
              x0: item.box[0][0],
              y0: item.box[0][1],
              x1: item.box[2][0],
              y1: item.box[2][1],
            };
          }

          words.push({ text, confidence, bbox });
        }
      }
    }

    return {
      text: fullText.trim(),
      confidence: count > 0 ? totalConfidence / count : 0,
      words,
      language: 'chi_sim+eng',  // PaddleOCR 默认支持中英文
    };
  }

  /**
   * 检查 PaddleOCR 是否可用
   */
  isAvailable(): boolean {
    return this.initialized && !!this.engine;
  }

  /**
   * 销毁引擎释放资源
   */
  async destroy(): Promise<void> {
    if (this.engine) {
      try {
        if (typeof this.engine.dispose === 'function') {
          this.engine.dispose();
        }
      } catch { /* ignore */ }
      this.engine = null;
      this.initialized = false;
      this.initPromise = null;
    }
  }
}
