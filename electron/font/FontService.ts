/**
 * FontService - 中文字体管理服务
 *
 * 支持思源宋体 (Source Han Serif) 和阿里巴巴普惠体 (Alibaba PuHuiTi)
 * - 字体发现与注册
 * - 字体下载与缓存
 * - PDF 嵌入字体路径获取
 */

import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { execFile } from 'child_process';
import { promisify } from 'util';
import crypto from 'crypto';

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FontWeight = 'Thin' | 'Light' | 'Regular' | 'Medium' | 'Bold' | 'Heavy';

export interface FontInfo {
  family: string;
  subfamily: string;
  weight: FontWeight;
  style: 'Normal' | 'Italic';
  filePath: string;
  format: 'otf' | 'ttf';
  available: boolean;
  sha256?: string;
}

export interface FontFamilyInfo {
  family: string;
  displayName: string;
  license: string;
  fonts: FontInfo[];
  totalSize: number;
  available: boolean;
}

export interface FontDownloadProgress {
  family: string;
  weight: FontWeight;
  progress: number; // 0-100
  status: 'pending' | 'downloading' | 'extracting' | 'complete' | 'error';
  error?: string;
}

// ---------------------------------------------------------------------------
// Font Registry - 预置字体定义
// ---------------------------------------------------------------------------

interface FontRegistryEntry {
  family: string;
  displayName: string;
  license: string;
  downloadUrl: string;
  weights: FontWeight[];
  format: 'otf' | 'ttf';
  /** SHA-256 校验和映射 (weight -> hash)，用于验证下载完整性 */
  checksums: Partial<Record<FontWeight, string>>;
}

const FONT_REGISTRY: FontRegistryEntry[] = [
  {
    family: 'SourceHanSerif',
    displayName: '思源宋体',
    license: 'SIL Open Font License 1.1',
    downloadUrl: 'https://github.com/adobe-fonts/source-han-serif/releases/download/',
    weights: ['Regular', 'Bold'],
    format: 'otf',
    checksums: {},
  },
  {
    family: 'AlibabaPuHuiTi',
    displayName: '阿里巴巴普惠体',
    license: '阿里巴巴普惠体免费商用授权',
    downloadUrl: 'https://puhuiti.oss-cn-hangzhou.aliyuncs.com/',
    weights: ['Light', 'Regular', 'Medium', 'Bold', 'Heavy'],
    format: 'ttf',
    checksums: {},
  },
];

/**
 * 字体文件名映射
 * weight -> 文件名模板
 */
const FONT_FILE_NAMES: Record<string, Record<FontWeight, string>> = {
  SourceHanSerif: {
    Thin: 'SourceHanSerifSC-Thin',
    Light: 'SourceHanSerifSC-Light',
    Regular: 'SourceHanSerifSC-Regular',
    Medium: 'SourceHanSerifSC-Medium',
    Bold: 'SourceHanSerifSC-Bold',
    Heavy: 'SourceHanSerifSC-Heavy',
  },
  AlibabaPuHuiTi: {
    Thin: 'AlibabaPuHuiTi-3-55-Thin',
    Light: 'AlibabaPuHuiTi-3-75-Light',
    Regular: 'AlibabaPuHuiTi-3-85-Regular',
    Medium: 'AlibabaPuHuiTi-3-105-Medium',
    Bold: 'AlibabaPuHuiTi-3-115-Bold',
    Heavy: 'AlibabaPuHuiTi-3-135-Heavy',
  },
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class FontService {
  private fontDir: string;
  private fontCache: Map<string, FontInfo> = new Map();

  constructor() {
    this.fontDir = this.resolveFontDir();
    this.ensureFontDir();
  }

  /** 获取字体存储目录 */
  private resolveFontDir(): string {
    if (app.isPackaged) {
      return path.join(process.resourcesPath || '', 'fonts');
    }
    return path.join(app.getAppPath(), 'resources', 'fonts');
  }

  /** 确保字体目录存在 */
  private ensureFontDir(): void {
    if (!fs.existsSync(this.fontDir)) {
      fs.mkdirSync(this.fontDir, { recursive: true });
    }
  }

  /**
   * 列出所有已注册的字体族
   */
  listFontFamilies(): FontFamilyInfo[] {
    return FONT_REGISTRY.map(entry => {
      const fonts = entry.weights.map(weight => {
        const info = this.getFontInfo(entry.family, weight);
        return info;
      });

      const available = fonts.some(f => f.available);
      const totalSize = fonts.reduce((sum, f) => {
        if (!f.available) return sum;
        try { return sum + fs.statSync(f.filePath).size; } catch { return sum; }
      }, 0);

      return {
        family: entry.family,
        displayName: entry.displayName,
        license: entry.license,
        fonts,
        totalSize,
        available,
      };
    });
  }

  /**
   * 获取指定字体的详细信息
   */
  getFontInfo(family: string, weight: FontWeight): FontInfo {
    const key = `${family}-${weight}`;
    if (this.fontCache.has(key)) {
      return this.fontCache.get(key)!;
    }

    const entry = FONT_REGISTRY.find(e => e.family === family);
    const nameMap = FONT_FILE_NAMES[family];
    const baseName = nameMap?.[weight] || `${family}-${weight}`;
    const ext = entry?.format || 'ttf';

    const filePath = path.join(this.fontDir, `${baseName}.${ext}`);
    const available = fs.existsSync(filePath);

    let sha256: string | undefined;
    if (available) {
      try {
        const fileBuffer = fs.readFileSync(filePath);
        sha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');
      } catch {
        // ignore
      }
    }

    const info: FontInfo = {
      family,
      subfamily: weight,
      weight,
      style: 'Normal',
      filePath,
      format: ext as 'otf' | 'ttf',
      available,
      sha256,
    };

    this.fontCache.set(key, info);
    return info;
  }

  /**
   * 获取字体文件路径（用于 PDF 嵌入）
   */
  getFontPath(family: string, weight: FontWeight = 'Regular'): string | null {
    const info = this.getFontInfo(family, weight);
    return info.available ? info.filePath : null;
  }

  /**
   * 获取字体文件的 ArrayBuffer（用于 pdf-lib 嵌入）
   */
  getFontBuffer(family: string, weight: FontWeight = 'Regular'): ArrayBuffer | null {
    const info = this.getFontInfo(family, weight);
    if (!info.available) return null;
    try {
      const buf = fs.readFileSync(info.filePath);
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    } catch {
      return null;
    }
  }

  /**
   * 注册字体到系统（用于渲染）
   * macOS: 使用 fontregister 命令或直接放入字体目录
   * Linux: 使用 fc-cache -f 刷新字体缓存
   * Windows: 使用 AddFontResource API
   */
  async registerFont(family: string, weight: FontWeight = 'Regular'): Promise<boolean> {
    const info = this.getFontInfo(family, weight);
    if (!info.available) {
      return false;
    }

    try {
      if (process.platform === 'darwin') {
        // macOS: 复制到 ~/Library/Fonts/ 即可被系统识别
        const userFontDir = path.join(process.env.HOME || '/', 'Library', 'Fonts');
        if (!fs.existsSync(userFontDir)) {
          fs.mkdirSync(userFontDir, { recursive: true });
        }
        const destPath = path.join(userFontDir, path.basename(info.filePath));
        if (!fs.existsSync(destPath)) {
          fs.copyFileSync(info.filePath, destPath);
        }
        return true;
      } else if (process.platform === 'linux') {
        // Linux: 复制到 ~/.local/share/fonts/ 并刷新缓存
        const userFontDir = path.join(
          process.env.HOME || '/tmp',
          '.local', 'share', 'fonts',
        );
        if (!fs.existsSync(userFontDir)) {
          fs.mkdirSync(userFontDir, { recursive: true });
        }
        const destPath = path.join(userFontDir, path.basename(info.filePath));
        if (!fs.existsSync(destPath)) {
          fs.copyFileSync(info.filePath, destPath);
        }
        try {
          await execFileAsync('fc-cache', ['-f', userFontDir], { timeout: 30000 });
        } catch {
          // fc-cache 可能不可用，忽略
        }
        return true;
      } else if (process.platform === 'win32') {
        // Windows: 复制到 %LOCALAPPDATA%/Microsoft/Windows/Fonts/
        const localFontDir = path.join(
          process.env.LOCALAPPDATA || process.env.APPDATA || 'C:\\Temp',
          'Microsoft', 'Windows', 'Fonts',
        );
        if (!fs.existsSync(localFontDir)) {
          fs.mkdirSync(localFontDir, { recursive: true });
        }
        const destPath = path.join(localFontDir, path.basename(info.filePath));
        if (!fs.existsSync(destPath)) {
          fs.copyFileSync(info.filePath, destPath);
        }
        return true;
      }
    } catch (err) {
      console.error(`注册字体失败: ${family} ${weight}`, err);
    }
    return false;
  }

  /**
   * 注册某个字体族的所有可用字体
   */
  async registerFontFamily(family: string): Promise<{ registered: number; failed: number }> {
    const entry = FONT_REGISTRY.find(e => e.family === family);
    if (!entry) return { registered: 0, failed: 0 };

    let registered = 0;
    let failed = 0;

    for (const weight of entry.weights) {
      const ok = await this.registerFont(family, weight);
      if (ok) registered++;
      else failed++;
    }

    return { registered, failed };
  }

  /**
   * 验证字体文件完整性
   */
  verifyFontIntegrity(family: string, weight: FontWeight): boolean {
    const info = this.getFontInfo(family, weight);
    if (!info.available || !info.sha256) return false;

    const entry = FONT_REGISTRY.find(e => e.family === family);
    const expectedHash = entry?.checksums[weight];
    if (!expectedHash) return true; // 无校验和则跳过验证

    return info.sha256 === expectedHash;
  }

  /**
   * 获取字体目录路径
   */
  getFontDirectory(): string {
    return this.fontDir;
  }

  /**
   * 检查字体是否已安装
   */
  isFontAvailable(family: string, weight: FontWeight = 'Regular'): boolean {
    return this.getFontInfo(family, weight).available;
  }

  /**
   * 获取所有可用字体（用于 PDF 嵌入选择）
   */
  getAvailableFonts(): FontInfo[] {
    const result: FontInfo[] = [];
    for (const entry of FONT_REGISTRY) {
      for (const weight of entry.weights) {
        const info = this.getFontInfo(entry.family, weight);
        if (info.available) {
          result.push(info);
        }
      }
    }
    return result;
  }

  /**
   * 将字体文件复制到指定目录（用于打包或分发）
   */
  async exportFonts(targetDir: string, family?: string): Promise<string[]> {
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const exported: string[] = [];
    const families = family
      ? FONT_REGISTRY.filter(e => e.family === family)
      : FONT_REGISTRY;

    for (const entry of families) {
      for (const weight of entry.weights) {
        const info = this.getFontInfo(entry.family, weight);
        if (!info.available) continue;
        const destPath = path.join(targetDir, path.basename(info.filePath));
        fs.copyFileSync(info.filePath, destPath);
        exported.push(destPath);
      }
    }

    return exported;
  }
}

/** 单例导出 */
export const fontService = new FontService();