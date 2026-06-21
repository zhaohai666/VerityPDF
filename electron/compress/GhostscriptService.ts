import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { promisify } from 'util';
import { app } from 'electron';

const execFileAsync = promisify(execFile);

/** Ghostscript 压缩预设 */
export type GsPreset = 'minimum' | 'balanced' | 'highQuality';

/** Ghostscript 压缩选项 */
export interface GsCompressOptions {
  preset?: GsPreset;
  imageDpi?: number;
  imageQuality?: number;
  grayscale?: boolean;
  removeMetadata?: boolean;
  fontSubset?: boolean;
}

/** 压缩结果 */
export interface GsCompressResult {
  originalSize: number;
  compressedSize: number;
  ratio: number;
}

/** 预设参数映射 */
const PRESET_CONFIG: Record<GsPreset, {
  pdfSettings: string;
  colorDpi: number;
  grayDpi: number;
  monoDpi: number;
  jpegQuality: number;
}> = {
  minimum: {
    pdfSettings: '/screen',
    colorDpi: 72,
    grayDpi: 72,
    monoDpi: 150,
    jpegQuality: 30,
  },
  balanced: {
    pdfSettings: '/ebook',
    colorDpi: 150,
    grayDpi: 150,
    monoDpi: 300,
    jpegQuality: 60,
  },
  highQuality: {
    pdfSettings: '/printer',
    colorDpi: 300,
    grayDpi: 300,
    monoDpi: 600,
    jpegQuality: 85,
  },
};

/**
 * Ghostscript CLI 压缩服务
 *
 * 使用 Ghostscript 的 pdfwrite 设备实现真正的 PDF 压缩:
 * - 图片降采样 (DPI 控制)
 * - JPEG 重压缩 (质量控制)
 * - 字体子集化
 * - 元数据清除
 *
 * GS 命令格式:
 *   gs -sDEVICE=pdfwrite -dCompatibilityLevel=1.5 -dNOPAUSE -dQUIET -dBATCH
 *      -dPDFSETTINGS=/ebook -dDownsampleColorImages=true -dColorImageResolution=150
 *      -dSubsetFonts=true -dEmbedAllFonts=true
 *      -sOutputFile=output.pdf input.pdf
 */
export class GhostscriptService {
  private gsPath: string;
  private available: boolean | null = null;

  constructor() {
    this.gsPath = this.findGs();
  }

  /**
   * 查找 Ghostscript 可执行文件
   * 搜索顺序: vendor/gs/ (内置) -> 系统 PATH
   */
  private findGs(): string {
    const exeName = process.platform === 'win32' ? 'gswin64c.exe'
      : process.platform === 'darwin' ? 'gs' : 'gs';

    const candidates: string[] = [];

    if (app.isPackaged) {
      const resourcesPath = path.join(process.resourcesPath || '', 'vendor', 'gs');
      candidates.push(path.join(resourcesPath, exeName));
      candidates.push(path.join(resourcesPath, 'bin', exeName));
      // Windows 常见子目录
      candidates.push(path.join(resourcesPath, 'bin', 'gswin64c.exe'));
      candidates.push(path.join(resourcesPath, 'bin', 'gswin32c.exe'));
    }

    const devVendorPath = path.join(app.getAppPath(), 'vendor', 'gs');
    candidates.push(path.join(devVendorPath, exeName));
    candidates.push(path.join(devVendorPath, 'bin', exeName));
    candidates.push(path.join(devVendorPath, 'bin', 'gswin64c.exe'));
    candidates.push(path.join(devVendorPath, 'bin', 'gswin32c.exe'));

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    // 系统 PATH 回退
    return process.platform === 'win32' ? 'gswin64c.exe' : 'gs';
  }

  /** 检测 Ghostscript 是否可用 */
  async isAvailable(): Promise<{ available: boolean; version?: string }> {
    if (this.available === false) {
      return { available: false };
    }
    try {
      const { stdout, stderr } = await execFileAsync(this.gsPath, ['--version'], {
        timeout: 10000,
        windowsHide: true,
      });
      this.available = true;
      const version = (stdout || stderr).trim();
      return { available: true, version };
    } catch {
      this.available = false;
      return { available: false };
    }
  }

  /**
   * 压缩 PDF 文件（基于文件路径）
   */
  async compressFile(
    inputPath: string,
    outputPath: string,
    options: GsCompressOptions = {}
  ): Promise<GsCompressResult> {
    const check = await this.isAvailable();
    if (!check.available) {
      throw new Error('Ghostscript 不可用，无法执行压缩');
    }

    const preset = options.preset || 'balanced';
    const config = PRESET_CONFIG[preset];

    // 自定义参数覆盖预设
    const colorDpi = options.imageDpi ?? config.colorDpi;
    const grayDpi = options.imageDpi ?? config.grayDpi;
    const monoDpi = options.imageDpi ? options.imageDpi * 2 : config.monoDpi;
    const jpegQuality = options.imageQuality ?? config.jpegQuality;

    const originalSize = fs.statSync(inputPath).size;

    const args = this.buildArgs(inputPath, outputPath, {
      pdfSettings: config.pdfSettings,
      colorDpi,
      grayDpi,
      monoDpi,
      jpegQuality,
      grayscale: options.grayscale ?? false,
      removeMetadata: options.removeMetadata ?? true,
      fontSubset: options.fontSubset ?? true,
    });

    await execFileAsync(this.gsPath, args, {
      timeout: 300000, // 5 分钟超时（大文件压缩较慢）
      maxBuffer: 100 * 1024 * 1024,
      windowsHide: true,
    });

    if (!fs.existsSync(outputPath)) {
      throw new Error('Ghostscript 压缩完成但未找到输出文件');
    }

    const compressedSize = fs.statSync(outputPath).size;
    const ratio = originalSize > 0 ? Math.round((1 - compressedSize / originalSize) * 100) : 0;

    return { originalSize, compressedSize, ratio };
  }

  /**
   * 压缩 PDF（基于 ArrayBuffer）
   * 写临时文件 -> GS 压缩 -> 读回 -> 清理
   */
  async compress(
    pdfData: ArrayBuffer,
    options: GsCompressOptions = {}
  ): Promise<{ data: ArrayBuffer; result: GsCompressResult }> {
    const tmpDir = os.tmpdir();
    const id = `verity_gs_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const inputPath = path.join(tmpDir, `${id}_input.pdf`);
    const outputPath = path.join(tmpDir, `${id}_compressed.pdf`);

    try {
      fs.writeFileSync(inputPath, Buffer.from(pdfData));
      const result = await this.compressFile(inputPath, outputPath, options);

      const resultBuffer = fs.readFileSync(outputPath);
      const data = resultBuffer.buffer.slice(
        resultBuffer.byteOffset,
        resultBuffer.byteOffset + resultBuffer.byteLength
      ) as ArrayBuffer;

      return { data, result };
    } finally {
      this.cleanupFile(inputPath);
      this.cleanupFile(outputPath);
    }
  }

  /** 构建 Ghostscript 命令行参数 */
  private buildArgs(
    inputPath: string,
    outputPath: string,
    config: {
      pdfSettings: string;
      colorDpi: number;
      grayDpi: number;
      monoDpi: number;
      jpegQuality: number;
      grayscale: boolean;
      removeMetadata: boolean;
      fontSubset: boolean;
    }
  ): string[] {
    const args: string[] = [
      '-sDEVICE=pdfwrite',
      '-dCompatibilityLevel=1.5',
      '-dNOPAUSE',
      '-dQUIET',
      '-dBATCH',
      '-dSAFER',
      `-dPDFSETTINGS=${config.pdfSettings}`,

      // 图片降采样
      '-dDownsampleColorImages=true',
      `-dColorImageResolution=${config.colorDpi}`,
      '-dColorImageDownsampleType=/Bicubic',
      '-dDownsampleGrayImages=true',
      `-dGrayImageResolution=${config.grayDpi}`,
      '-dGrayImageDownsampleType=/Bicubic',
      '-dDownsampleMonoImages=true',
      `-dMonoImageResolution=${config.monoDpi}`,

      // JPEG 压缩控制
      '-dAutoFilterColorImages=false',
      '-dColorImageFilter=/DCTEncode',
      `-dColorImageQuality=${config.jpegQuality}`,
      '-dAutoFilterGrayImages=false',
      '-dGrayImageFilter=/DCTEncode',
      `-dGrayImageQuality=${config.jpegQuality}`,

      // 颜色策略
      config.grayscale
        ? '-dColorConversionStrategy=/Gray'
        : '-dColorConversionStrategy=/LeaveColorUnchanged',

      // 字体处理
      config.fontSubset ? '-dSubsetFonts=true' : '-dSubsetFonts=false',
      '-dEmbedAllFonts=true',
    ];

    // 元数据清除
    if (config.removeMetadata) {
      args.push('-dDOCINFO=/none');
    }

    // 输出文件
    args.push(`-sOutputFile=${outputPath}`);
    args.push(inputPath);

    return args;
  }

  /** 安全清理临时文件 */
  private cleanupFile(filePath: string): void {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch {
      // 忽略清理失败
    }
  }
}
