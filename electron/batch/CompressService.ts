import { PDFDocument } from 'pdf-lib';
import type { BrowserWindow } from 'electron';
import { GhostscriptService, type GsPreset } from '../compress/GhostscriptService';

/** 压缩选项（兼容旧接口 + 新预设接口） */
export interface CompressOptions {
  quality: 'low' | 'medium' | 'high';
  preset?: GsPreset;
  imageDpi?: number;
  imageQuality?: number;
  grayscale?: boolean;
  removeMetadata?: boolean;
  fontSubset?: boolean;
}

/** 质量到预设的映射 */
const QUALITY_TO_PRESET: Record<string, GsPreset> = {
  low: 'minimum',
  medium: 'balanced',
  high: 'highQuality',
};

/**
 * PDF 压缩服务（双轨策略）
 *
 * 优先使用 Ghostscript 实现真正的分级压缩:
 * - 图片降采样 (DPI 控制)
 * - JPEG 重压缩
 * - 字体子集化
 * - 元数据清除
 *
 * Ghostscript 不可用时回退到 pdf-lib object streams 优化。
 */
export class CompressService {
  private mainWindow: BrowserWindow | null = null;
  private gsService: GhostscriptService;

  constructor() {
    this.gsService = new GhostscriptService();
  }

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  private sendProgress(progress: number, message: string): void {
    this.mainWindow?.webContents.send('batch:progress', { progress, message });
  }

  /** 检测 Ghostscript 是否可用 */
  async isGhostscriptAvailable(): Promise<{ available: boolean; version?: string }> {
    return this.gsService.isAvailable();
  }

  /**
   * 压缩 PDF 文件
   *
   * 优先尝试 Ghostscript，不可用时回退到 pdf-lib 优化保存。
   */
  async compress(pdfData: ArrayBuffer, options: CompressOptions): Promise<ArrayBuffer> {
    // 尝试 Ghostscript
    const gsCheck = await this.gsService.isAvailable();
    if (gsCheck.available) {
      try {
        return await this.compressWithGhostscript(pdfData, options);
      } catch (err) {
        console.warn('[CompressService] Ghostscript compression failed, falling back to pdf-lib:', err);
      }
    }

    // 回退: pdf-lib 优化保存
    return this.compressWithPdfLib(pdfData, options);
  }

  /**
   * Ghostscript 压缩（高质量）
   */
  private async compressWithGhostscript(
    pdfData: ArrayBuffer,
    options: CompressOptions
  ): Promise<ArrayBuffer> {
    this.sendProgress(10, '使用 Ghostscript 压缩引擎...');

    const preset = options.preset || QUALITY_TO_PRESET[options.quality] || 'balanced';

    const { data, result } = await this.gsService.compress(pdfData, {
      preset,
      imageDpi: options.imageDpi,
      imageQuality: options.imageQuality,
      grayscale: options.grayscale,
      removeMetadata: options.removeMetadata ?? true,
      fontSubset: options.fontSubset ?? true,
    });

    this.sendProgress(100, `压缩完成 (减小 ${result.ratio}%, ${this.formatSize(result.originalSize)} -> ${this.formatSize(result.compressedSize)})`);

    return data;
  }

  /**
   * pdf-lib 优化保存（回退方案）
   */
  private async compressWithPdfLib(
    pdfData: ArrayBuffer,
    options: CompressOptions
  ): Promise<ArrayBuffer> {
    this.sendProgress(10, '解析 PDF 文档...');

    const doc = await PDFDocument.load(pdfData, {
      ignoreEncryption: true,
      updateMetadata: false,
    });

    this.sendProgress(30, '处理页面资源...');

    const pages = doc.getPages();
    const totalPages = pages.length;

    for (let i = 0; i < totalPages; i++) {
      this.sendProgress(
        30 + Math.round(((i + 1) / totalPages) * 40),
        `处理页面 ${i + 1}/${totalPages}...`
      );
    }

    // 清除元数据（可选）
    if (options.removeMetadata) {
      doc.setTitle('');
      doc.setAuthor('');
      doc.setSubject('');
      doc.setKeywords([]);
      doc.setProducer('');
      doc.setCreator('');
    }

    this.sendProgress(80, '保存压缩结果...');

    const bytes = await doc.save({
      useObjectStreams: true,
      addDefaultPage: false,
    });

    this.sendProgress(100, '压缩完成 (pdf-lib 结构优化)');

    return bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength
    ) as ArrayBuffer;
  }

  /** 格式化文件大小 */
  private formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}
