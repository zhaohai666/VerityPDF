/**
 * 图像预处理选项
 */
export interface PreprocessOptions {
  denoise: boolean;
  denoiseStrength: number;   // 1-10
  deskew: boolean;
  contrastEnhance: boolean;
  binarize: boolean;
  sharpen: boolean;
}

/** 默认预处理选项 */
export const DEFAULT_PREPROCESS_OPTIONS: PreprocessOptions = {
  denoise: true,
  denoiseStrength: 5,
  deskew: true,
  contrastEnhance: true,
  binarize: false,
  sharpen: false,
};

/**
 * 图像预处理服务
 * 基于 OpenCV.js 实现去噪、倾斜校正、对比度增强等操作
 * 用于提升低质量扫描件的 OCR 识别准确率
 */
export class ImagePreprocessor {
  private cvReady = false;

  constructor() {
    this.cvReady = typeof window !== 'undefined' && !!window.__opencvReady;
    if (!this.cvReady && typeof window !== 'undefined') {
      window.addEventListener('opencv-ready', () => {
        this.cvReady = true;
      }, { once: true });
    }
  }

  /** 检查 OpenCV.js 是否可用 */
  isAvailable(): boolean {
    if (!this.cvReady) {
      this.cvReady = typeof window !== 'undefined' && !!window.__opencvReady;
    }
    return this.cvReady && typeof cv !== 'undefined';
  }

  /** 等待 OpenCV.js 加载完成 */
  waitForReady(timeoutMs = 10000): Promise<void> {
    if (this.isAvailable()) return Promise.resolve();

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('OpenCV.js 加载超时'));
      }, timeoutMs);

      const check = () => {
        if (this.isAvailable()) {
          clearTimeout(timer);
          resolve();
        } else {
          window.addEventListener('opencv-ready', () => {
            clearTimeout(timer);
            this.cvReady = true;
            resolve();
          }, { once: true });
        }
      };
      check();
    });
  }

  /**
   * 对 Canvas 图像执行预处理管线
   * @returns 预处理后的新 Canvas（原 Canvas 不变）
   */
  preprocess(source: HTMLCanvasElement, options: PreprocessOptions): HTMLCanvasElement {
    if (!this.isAvailable()) {
      // OpenCV 不可用，直接返回原 Canvas
      return source;
    }

    let src: any = null;
    let current: any = null;

    try {
      src = cv.imread(source);
      current = src;

      // 1. 去噪
      if (options.denoise) {
        current = this.denoise(current, options.denoiseStrength);
      }

      // 2. 倾斜校正
      if (options.deskew) {
        const result = this.detectAndCorrectSkew(current);
        current = result.mat;
      }

      // 3. 对比度增强 (CLAHE)
      if (options.contrastEnhance) {
        current = this.enhanceContrast(current);
      }

      // 4. 锐化
      if (options.sharpen) {
        current = this.sharpenMat(current);
      }

      // 5. 二值化 (OTSU) - 最后执行
      if (options.binarize) {
        current = this.binarizeOTSU(current);
      }

      // 输出到新的 Canvas
      const outputCanvas = document.createElement('canvas');
      outputCanvas.width = source.width;
      outputCanvas.height = source.height;
      cv.imshow(outputCanvas, current);

      return outputCanvas;
    } catch (err) {
      console.warn('[ImagePreprocessor] Preprocessing failed, returning original:', err);
      return source;
    } finally {
      // 清理 OpenCV Mat 对象（避免 WASM 内存泄漏）
      if (src && src !== current) src.delete();
      if (current && current !== src) current.delete();
    }
  }

  /**
   * 去噪：fastNlMeansDenoisingColored
   * strength 1-10 映射到 h 参数 3-30
   */
  private denoise(mat: any, strength: number): any {
    const dst = new cv.Mat();
    const h = Math.max(3, Math.min(30, strength * 3));
    const templateSize = 7;
    const searchSize = 21;
    cv.fastNlMeansDenoisingColored(mat, dst, h, h, templateSize, searchSize);
    return dst;
  }

  /**
   * 倾斜检测与校正
   * 灰度化 -> Canny 边缘检测 -> HoughLinesP -> 计算主角度 -> warpAffine 旋转
   */
  private detectAndCorrectSkew(mat: any): { mat: any; angle: number } {
    const gray = new cv.Mat();
    const edges = new cv.Mat();
    const lines = new cv.Mat();

    try {
      // 灰度化
      cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY);

      // 边缘检测
      cv.Canny(gray, edges, 50, 150);

      // 霍夫直线检测
      cv.HoughLinesP(edges, lines, 1, Math.PI / 180, 100, 50, 10);

      // 计算主要角度
      const angle = this.calculateDominantAngle(lines);

      if (Math.abs(angle) < 0.5) {
        // 倾斜角度过小，无需校正
        return { mat: mat.clone(), angle: 0 };
      }

      // 旋转校正
      const center = new cv.Point(mat.cols / 2, mat.rows / 2);
      const M = cv.getRotationMatrix2D(center, angle, 1.0);
      const dst = new cv.Mat();
      const size = new cv.Size(mat.cols, mat.rows);
      cv.warpAffine(mat, dst, M, size);

      return { mat: dst, angle };
    } finally {
      gray.delete();
      edges.delete();
      lines.delete();
    }
  }

  /**
   * 从 HoughLinesP 结果计算主要文本行角度
   */
  private calculateDominantAngle(lines: any): number {
    if (!lines || lines.rows === 0) return 0;

    const angles: number[] = [];

    for (let i = 0; i < lines.rows; i++) {
      const data = lines.data32S;
      const x1 = data[i * 4];
      const y1 = data[i * 4 + 1];
      const x2 = data[i * 4 + 2];
      const y2 = data[i * 4 + 3];

      const dx = x2 - x1;
      const dy = y2 - y1;
      if (Math.abs(dx) < 10) continue; // 跳过近垂直线

      const angle = Math.atan2(dy, dx) * (180 / Math.PI);
      // 只考虑接近水平的线（文本行）
      if (Math.abs(angle) < 45) {
        angles.push(angle);
      }
    }

    if (angles.length === 0) return 0;

    // 取中位数角度（抗噪声）
    angles.sort((a, b) => a - b);
    return angles[Math.floor(angles.length / 2)];
  }

  /**
   * 对比度增强：CLAHE (Contrast Limited Adaptive Histogram Equalization)
   */
  private enhanceContrast(mat: any): any {
    const lab = new cv.Mat();

    try {
      // 转换到 LAB 色彩空间
      cv.cvtColor(mat, lab, cv.COLOR_RGBA2RGB);
      const labMat = new cv.Mat();
      cv.cvtColor(lab, labMat, cv.COLOR_RGB2GRAY);

      // CLAHE 处理
      const clahe = cv.createCLAHE(2.0, new cv.Size(8, 8));
      const enhanced = new cv.Mat();
      clahe.apply(labMat, enhanced);

      // 简单的灰度增强方式：直接对原图各通道做线性拉伸
      // 使用增强后的灰度图作为亮度参考
      const result = mat.clone();
      const srcData = mat.data;
      const dstData = result.data;
      const enhData = enhanced.data;

      for (let i = 0; i < enhData.length; i++) {
        const grayOrig = srcData[i * 4] * 0.299 + srcData[i * 4 + 1] * 0.587 + srcData[i * 4 + 2] * 0.114;
        const ratio = grayOrig > 0 ? enhData[i] / grayOrig : 1;
        const clampedRatio = Math.max(0.5, Math.min(2.0, ratio));

        dstData[i * 4] = Math.min(255, Math.round(srcData[i * 4] * clampedRatio));
        dstData[i * 4 + 1] = Math.min(255, Math.round(srcData[i * 4 + 1] * clampedRatio));
        dstData[i * 4 + 2] = Math.min(255, Math.round(srcData[i * 4 + 2] * clampedRatio));
      }

      return result;
    } catch {
      // 回退：直接返回原图
      return mat.clone();
    } finally {
      lab.delete();
    }
  }

  /**
   * OTSU 二值化
   */
  private binarizeOTSU(mat: any): any {
    const gray = new cv.Mat();
    const binary = new cv.Mat();
    const dst = new cv.Mat();

    try {
      cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY);
      cv.threshold(gray, binary, 0, 255, cv.THRESH_BINARY | cv.THRESH_OTSU);

      // 转回 RGBA
      cv.cvtColor(binary, dst, cv.COLOR_GRAY2RGBA);
      return dst;
    } finally {
      gray.delete();
      binary.delete();
    }
  }

  /**
   * 锐化：Laplacian 卷积核
   */
  private sharpenMat(mat: any): any {
    const kernel = cv.MatFromArray(3, 3, cv.CV_32F, [
      0, -1, 0,
      -1, 5, -1,
      0, -1, 0,
    ]);
    const dst = new cv.Mat();

    try {
      cv.filter2D(mat, dst, cv.CV_8UC4, kernel);
      return dst;
    } finally {
      kernel.delete();
    }
  }
}
