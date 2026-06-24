import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import { createCanvas } from 'canvas';
import * as fs from 'fs';
import { BrowserWindow } from 'electron';

export interface BlankPageDetectionOptions {
  /** 像素阈值 (0-255), 低于此值的像素视为非白色 */
  pixelThreshold?: number;
  /** 非白色像素占比阈值 (0-1), 超过此比例则视为非空白页 */
  nonWhiteRatioThreshold?: number;
  /** 进度回调 */
  onProgress?: (progress: number, message: string) => void;
}

/**
 * PDF 空白页检测服务
 * 使用 pdfjs-dist 渲染 PDF 页面到 Canvas，计算非白色像素比例来判断页面是否为空白
 */
export class BlankPageDetectionService {
  private mainWindow: BrowserWindow | null = null;

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  private sendProgress(progress: number, message: string, onProgress?: (progress: number, message: string) => void): void {
    if (onProgress) {
      onProgress(progress, message);
    } else if (this.mainWindow && this.mainWindow.webContents) {
      this.mainWindow.webContents.send('blank-page-detection:progress', { progress, message });
    }
  }

  /**
   * 检测 PDF 中的空白页面
   * @param filePath PDF 文件路径
   * @param options 检测选项
   * @returns 空白页码数组（从 1 开始的页码）和总检查页数
   */
  async detectBlankPages(
    filePath: string,
    options: BlankPageDetectionOptions = {}
  ): Promise<{ blankPages: number[]; totalChecked: number }> {
    // 验证文件路径
    if (!filePath || typeof filePath !== 'string') {
      throw new Error('无效的文件路径');
    }

    const {
      pixelThreshold = 240, // 默认阈值：接近白色的阈值 (0-255)
      nonWhiteRatioThreshold = 0.01, // 默认超过1%的非白色像素视为非空白
      onProgress
    } = options;

    this.sendProgress(0, '开始检测空白页...', onProgress);

    // 读取 PDF 文件
    const data = fs.readFileSync(filePath);

    // 配置 pdfjs-dist worker
    GlobalWorkerOptions.workerSrc = `file://${__dirname}/../../../node_modules/pdfjs-dist/build/pdf.worker.entry.js`;

    // 使用 pdfjs-dist 加载 PDF
    const loadingTask = getDocument({ data });
    const pdfDoc = await loadingTask.promise;
    const totalPages = pdfDoc.numPages;
    const blankPages: number[] = [];

    // 逐页检测
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      const page = await pdfDoc.getPage(pageNum);
      const isBlank = await this.isPageBlank(page, {
        pixelThreshold,
        nonWhiteRatioThreshold
      });

      if (isBlank) {
        blankPages.push(pageNum);
      }

      // 发送进度
      const progress = pageNum / totalPages;
      this.sendProgress(progress, `检测页面 ${pageNum}/${totalPages}...`, onProgress);
    }

    this.sendProgress(1, `检测完成，发现 ${blankPages.length} 个空白页`, onProgress);

    // 清理
    pdfDoc.cleanup();
    // Note: pdfjs-dist doesn't have a destroy method on the document, but cleanup is recommended

    return {
      blankPages,
      totalChecked: totalPages
    };
  }

  /**
   * 判断单页是否为空白页
   * @param page PDF 页面对象
   * @param options 检测选项
   * @returns 是否为空白页
   */
  private async isPageBlank(
    page: any, // PDFPageProxy from pdfjs-dist
    options: {
      pixelThreshold: number;
      nonWhiteRatioThreshold: number;
    }
  ): Promise<boolean> {
    const { pixelThreshold, nonWhiteRatioThreshold } = options;

    // 获取页面视口（使用默认缩放比例）
    const viewport = page.getViewport({ scale: 1.0 });

    // 创建离屏画布
    const canvas = createCanvas(viewport.width, viewport.height);
    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error('无法创建画布上下文');
    }

    // 渲染页面到画布
    const renderContext = {
      canvasContext: context,
      viewport: viewport
    };

    const renderTask = page.render(renderContext);
    await renderTask.promise;

    // 获取图像数据
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    // 计算非白色像素数量
    let nonWhiteCount = 0;
    const totalPixels = data.length / 4; // RGBA

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      // a = data[i + 3]; // 透明通道，暂时不考虑

      // 如果任意一个颜色通道小于阈值，则认为是非白色像素
      if (r < pixelThreshold || g < pixelThreshold || b < pixelThreshold) {
        nonWhiteCount++;
      }
    }

    // 计算非白色像素比例
    const nonWhiteRatio = nonWhiteCount / totalPixels;

    // 如果非白色像素比例超过阈值，则认为不是空白页
    return nonWhiteRatio <= nonWhiteRatioThreshold;
  }
}