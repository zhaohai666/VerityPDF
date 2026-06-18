import { PDFService } from '@/services/pdf/PDFService';
import { Logger } from '@/utils';
import { parsePageRange } from './ExportService';

const logger = new Logger('ImageExportService');

/** 图片导出选项 */
export interface ImageExportOptions {
  /** 图片格式 */
  format: 'png' | 'jpeg';
  /** JPEG 质量 (0.1-1.0) */
  quality?: number;
  /** 输出 DPI */
  dpi: 150 | 300 | 72;
  /** 页码范围，如 "1-5,8"，空表示全部 */
  pageRange?: string;
  /** 总页数 */
  totalPages: number;
}

/** 导出进度 */
export interface ImageExportProgress {
  current: number;
  total: number;
  percent: number;
}

/** 单页导出结果 */
export interface ImagePageResult {
  pageNumber: number;
  dataUrl: string;
  width: number;
  height: number;
}

/**
 * PDF 转图片导出服务
 * 使用 PDF.js 渲染页面到离屏 Canvas，然后转为图片数据
 */
export class ImageExportService {
  /**
   * 渲染单页为图片 DataURL
   */
  async renderPageToImage(
    pdfService: PDFService,
    pageNumber: number,
    options: Pick<ImageExportOptions, 'format' | 'quality' | 'dpi'>
  ): Promise<ImagePageResult> {
    const dpiScale = options.dpi / 72;
    const pageSize = await pdfService.getPageSize(pageNumber);
    const scale = dpiScale;

    // 创建离屏 Canvas
    const canvas = document.createElement('canvas');
    const dpr = 1; // 使用 DPI scale 代替 devicePixelRatio
    const width = Math.ceil(pageSize.width * scale);
    const height = Math.ceil(pageSize.height * scale);
    canvas.width = width * dpr;
    canvas.height = height * dpr;

    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);

    // 白色背景（PNG 透明背景可选，但 PDF 页面通常有白色底）
    if (options.format === 'jpeg') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
    }

    // 使用 PDF.js 渲染
    const page = await pdfService.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);

    const ctx2 = canvas.getContext('2d')!;
    if (options.format === 'jpeg') {
      ctx2.fillStyle = '#ffffff';
      ctx2.fillRect(0, 0, canvas.width, canvas.height);
    }

    await page.render({ canvasContext: ctx2, viewport }).promise;

    // 转为 DataURL
    const mimeType = options.format === 'png' ? 'image/png' : 'image/jpeg';
    const quality = options.format === 'jpeg' ? (options.quality ?? 0.92) : undefined;
    const dataUrl = canvas.toDataURL(mimeType, quality);

    logger.debug(`Page ${pageNumber} rendered to ${options.format} (${canvas.width}x${canvas.height})`);

    return {
      pageNumber,
      dataUrl,
      width: canvas.width,
      height: canvas.height,
    };
  }

  /**
   * 批量导出页面为图片
   * 返回 Base64 编码的图片数据数组
   */
  async exportPages(
    pdfService: PDFService,
    options: ImageExportOptions,
    onProgress?: (progress: ImageExportProgress) => void
  ): Promise<Array<{ pageNumber: number; base64: string; format: string }>> {
    // 解析页码范围
    let pages: number[];
    if (options.pageRange) {
      const pageSet = parsePageRange(options.pageRange, options.totalPages);
      pages = pageSet.size > 0 ? Array.from(pageSet).sort((a, b) => a - b) : Array.from({ length: options.totalPages }, (_, i) => i + 1);
    } else {
      pages = Array.from({ length: options.totalPages }, (_, i) => i + 1);
    }

    const results: Array<{ pageNumber: number; base64: string; format: string }> = [];

    for (let i = 0; i < pages.length; i++) {
      const pageNum = pages[i];
      const result = await this.renderPageToImage(pdfService, pageNum, {
        format: options.format,
        quality: options.quality,
        dpi: options.dpi,
      });

      // 从 DataURL 提取 Base64 数据
      const base64 = result.dataUrl.split(',')[1] || '';
      results.push({
        pageNumber: pageNum,
        base64,
        format: options.format,
      });

      if (onProgress) {
        onProgress({
          current: i + 1,
          total: pages.length,
          percent: ((i + 1) / pages.length) * 100,
        });
      }
    }

    logger.info(`Exported ${results.length} pages as ${options.format} images`);
    return results;
  }
}
