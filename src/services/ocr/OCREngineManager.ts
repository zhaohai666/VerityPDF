import { OCRService, type OCRResult, type OCRProgressCallback } from './OCRService';
import { PaddleOCRService } from './PaddleOCRService';
import type { PreprocessOptions } from './ImagePreprocessor';

/** OCR 引擎类型 */
export type OCREngineType = 'tesseract' | 'paddleocr' | 'auto';

/** OCR 引擎信息 */
export interface OCREngineInfo {
  type: OCREngineType;
  name: string;
  description: string;
  available: boolean;
}

/** 引擎比较结果 */
export interface EngineComparisonResult {
  tesseract: OCRResult | null;
  paddleocr: OCRResult | null;
  best: OCREngineType;
}

/**
 * OCR 引擎管理器
 * 协调 Tesseract.js 和 PaddleOCR 两个引擎
 * 支持自动选择、手动切换和结果对比模式
 */
export class OCREngineManager {
  private tesseract: OCRService;
  private paddleocr: PaddleOCRService;
  private currentEngine: OCREngineType = 'auto';

  constructor() {
    this.tesseract = new OCRService();
    this.paddleocr = new PaddleOCRService();
  }

  /**
   * 获取可用引擎列表
   */
  getAvailableEngines(): OCREngineInfo[] {
    return [
      {
        type: 'tesseract',
        name: 'Tesseract.js',
        description: '通用 OCR 引擎，支持 100+ 语言',
        available: true,
      },
      {
        type: 'paddleocr',
        name: 'PaddleOCR',
        description: '百度飞桨 OCR，中文识别精度更高',
        available: this.paddleocr.isAvailable(),
      },
      {
        type: 'auto',
        name: '自动选择',
        description: '根据语言和内容自动选择最佳引擎',
        available: true,
      },
    ];
  }

  /**
   * 设置当前引擎
   */
  setEngine(engine: OCREngineType): void {
    this.currentEngine = engine;
  }

  /**
   * 获取当前引擎类型
   */
  getEngine(): OCREngineType {
    return this.currentEngine;
  }

  /**
   * 根据语言自动选择引擎
   */
  private selectEngineForLanguage(language: string): OCREngineType {
    // 中文优先使用 PaddleOCR
    if (language.includes('chi') && this.paddleocr.isAvailable()) {
      return 'paddleocr';
    }
    return 'tesseract';
  }

  /**
   * 识别图像
   */
  async recognize(
    imageSource: HTMLCanvasElement | HTMLImageElement | string,
    language: string = 'eng+chi_sim',
    options?: { preprocess?: PreprocessOptions },
    onProgress?: OCRProgressCallback
  ): Promise<OCRResult> {
    const engineType = this.currentEngine === 'auto'
      ? this.selectEngineForLanguage(language)
      : this.currentEngine;

    if (engineType === 'paddleocr') {
      return this.paddleocr.recognizeImage(imageSource, onProgress);
    }

    return this.tesseract.recognizeImage(imageSource, options, onProgress);
  }

  /**
   * 对比模式：同时使用两个引擎识别并比较结果
   */
  async compare(
    imageSource: HTMLCanvasElement | HTMLImageElement | string,
    language: string = 'eng+chi_sim',
    options?: { preprocess?: PreprocessOptions },
    onProgress?: OCRProgressCallback
  ): Promise<EngineComparisonResult> {
    let tesseractResult: OCRResult | null = null;
    let paddleocrResult: OCRResult | null = null;

    try {
      // 确保 Tesseract 使用正确的语言
      await this.tesseract.initWorker(language, onProgress);

      // 并行执行两个引擎
      const [t, p] = await Promise.allSettled([
        this.tesseract.recognizeImage(imageSource, options, onProgress),
        this.paddleocr.recognizeImage(imageSource, onProgress),
      ]);

      if (t.status === 'fulfilled') tesseractResult = t.value;
      if (p.status === 'fulfilled') paddleocrResult = p.value;
    } catch (err) {
      console.error('[OCREngineManager] 对比识别失败:', err);
    }

    // 选择置信度更高的结果
    const best: OCREngineType =
      paddleocrResult && tesseractResult
        ? (paddleocrResult.confidence >= tesseractResult.confidence ? 'paddleocr' : 'tesseract')
        : paddleocrResult ? 'paddleocr' : 'tesseract';

    return { tesseract: tesseractResult, paddleocr: paddleocrResult, best };
  }

  /**
   * 初始化指定引擎
   */
  async initEngine(engine: OCREngineType, language?: string, onProgress?: OCRProgressCallback): Promise<void> {
    if (engine === 'tesseract' || engine === 'auto') {
      await this.tesseract.initWorker(language || 'eng+chi_sim', onProgress);
    }
    if (engine === 'paddleocr' || engine === 'auto') {
      try {
        await this.paddleocr.initialize(onProgress);
      } catch (err) {
        console.warn('[OCREngineManager] PaddleOCR 初始化失败，将使用 Tesseract:', err);
      }
    }
  }

  /**
   * 设置 Tesseract 语言
   */
  async setTesseractLanguage(language: string, onProgress?: OCRProgressCallback): Promise<void> {
    await this.tesseract.setLanguage(language, onProgress);
  }

  /**
   * 销毁所有引擎
   */
  async destroy(): Promise<void> {
    await this.tesseract.destroy();
    await this.paddleocr.destroy();
  }
}
