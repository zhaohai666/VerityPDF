import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { promisify } from 'util';
import { app } from 'electron';

const execFileAsync = promisify(execFile);

/** 支持的导出目标格式 */
export type ConvertTargetFormat =
  | 'docx' | 'xlsx' | 'pptx' | 'html' | 'md'
  | 'png' | 'jpg' | 'tiff';

/** 支持的输入格式（转为 PDF） */
export type ConvertInputFormat =
  | 'docx' | 'doc' | 'xlsx' | 'xls' | 'pptx' | 'ppt'
  | 'html' | 'htm' | 'md' | 'txt' | 'rtf' | 'odt' | 'ods' | 'odp';

/** 格式显示标签 */
export const FORMAT_LABELS: Record<string, string> = {
  docx: 'Word (docx)', doc: 'Word (doc)',
  xlsx: 'Excel (xlsx)', xls: 'Excel (xls)',
  pptx: 'PowerPoint (pptx)', ppt: 'PowerPoint (ppt)',
  html: 'HTML 网页', htm: 'HTML 网页',
  md: 'Markdown', txt: '纯文本',
  png: 'PNG 高清图片', jpg: 'JPEG 图片', tiff: 'TIFF 图片',
  pdf: 'PDF', rtf: '富文本 (rtf)',
  odt: 'OpenDocument 文本', ods: 'OpenDocument 表格', odp: 'OpenDocument 演示',
};

/** 转换结果 */
export interface ConvertResult {
  outputPath: string;
  format: string;
  fileSize: number;
  success: boolean;
  message: string;
}

/** 批量转换结果 */
export interface BatchConvertResult {
  results: ConvertResult[];
  totalFiles: number;
  successCount: number;
  failCount: number;
}

/** 转换选项 */
export interface ConvertOptions {
  targetFormat: ConvertTargetFormat;
  outputDir: string;
  imageDpi?: number;
  jpegQuality?: number;
}

/**
 * LibreOffice 格式转换服务（主进程端）
 * 通过 soffice CLI 实现 PDF 与 Office/HTML/Markdown 双向转换及高清图片导出
 */
export class LibreOfficeService {
  private sofficePath: string;
  private detectedSource: 'portable' | 'system' | 'not-found' = 'not-found';

  constructor() {
    this.sofficePath = this.findSoffice();
  }

  /** 获取检测到的 LibreOffice 路径与来源 */
  getDetectedPath(): { path: string; source: 'portable' | 'system' | 'not-found' } {
    return { path: this.sofficePath, source: this.detectedSource };
  }

  /** 检测 LibreOffice 是否可用 */
  async isAvailable(): Promise<{ available: boolean; version?: string; path: string; source?: string }> {
    try {
      const { stdout } = await execFileAsync(this.sofficePath, ['--version'], {
        timeout: 10000,
        windowsHide: true,
      });
      return {
        available: true,
        version: stdout.trim(),
        path: this.sofficePath,
        source: this.detectedSource,
      };
    } catch {
      return { available: false, path: this.sofficePath, source: this.detectedSource };
    }
  }

  /** 单文件转换 */
  async convertFile(inputPath: string, options: ConvertOptions): Promise<ConvertResult> {
    if (!fs.existsSync(options.outputDir)) {
      fs.mkdirSync(options.outputDir, { recursive: true });
    }

    const ext = path.extname(inputPath).toLowerCase().replace('.', '');
    const isImageTarget = ['png', 'jpg', 'tiff'].includes(options.targetFormat);
    const isInputPdf = ext === 'pdf';

    let filterName: string;
    let outputExt: string;

    if (isImageTarget) {
      filterName = this.getImageFilter(options.targetFormat as 'png' | 'jpg' | 'tiff');
      outputExt = options.targetFormat === 'jpg' ? 'jpg' : options.targetFormat;
    } else if (options.targetFormat === 'md') {
      filterName = 'HTML (StarWriter)';
      outputExt = 'html';
    } else if (isInputPdf) {
      filterName = this.getPdfExportFilter(options.targetFormat);
      outputExt = options.targetFormat;
    } else {
      filterName = this.getImportToPdfFilter(ext);
      outputExt = 'pdf';
    }

    try {
      const convertArg = filterName ? `${outputExt}:${filterName}` : outputExt;
      const args = [
        '--headless', '--norestore', '--safe-mode',
        '--convert-to', convertArg,
        '--outdir', options.outputDir,
        inputPath,
      ];

      const { stderr } = await execFileAsync(this.sofficePath, args, {
        timeout: 120000,
        maxBuffer: 10 * 1024 * 1024,
        windowsHide: true,
      });

      if (stderr && !stderr.includes('javaldx:') && !stderr.includes('no suitable image')) {
        if (stderr.includes('Error') || stderr.includes('error:')) {
          throw new Error(`LibreOffice 错误: ${stderr.trim()}`);
        }
      }

      const baseName = path.basename(inputPath, path.extname(inputPath));
      let outputFile = path.join(options.outputDir, `${baseName}.${outputExt}`);

      if (options.targetFormat === 'md') {
        const htmlFile = path.join(options.outputDir, `${baseName}.html`);
        const mdFile = path.join(options.outputDir, `${baseName}.md`);
        if (fs.existsSync(htmlFile)) {
          fs.copyFileSync(htmlFile, mdFile);
          fs.unlinkSync(htmlFile);
          outputFile = mdFile;
        }
      }

      if (!fs.existsSync(outputFile)) {
        throw new Error(`转换完成但未找到输出文件: ${outputFile}`);
      }

      const stat = fs.statSync(outputFile);
      return {
        outputPath: outputFile,
        format: options.targetFormat,
        fileSize: stat.size,
        success: true,
        message: `成功转换为 ${FORMAT_LABELS[options.targetFormat] || options.targetFormat}`,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        outputPath: '', format: options.targetFormat, fileSize: 0,
        success: false, message: `转换失败: ${msg}`,
      };
    }
  }

  /** 批量转换 */
  async batchConvert(
    inputPaths: string[],
    options: ConvertOptions,
    onProgress?: (current: number, total: number, file: string) => void
  ): Promise<BatchConvertResult> {
    const results: ConvertResult[] = [];
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < inputPaths.length; i++) {
      const filePath = inputPaths[i];
      if (onProgress) onProgress(i + 1, inputPaths.length, path.basename(filePath));
      const result = await this.convertFile(filePath, options);
      results.push(result);
      if (result.success) successCount++; else failCount++;
    }

    return { results, totalFiles: inputPaths.length, successCount, failCount };
  }

  /** 其他格式 → PDF */
  async convertToPDF(inputPath: string, outputDir: string): Promise<ConvertResult> {
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    const ext = path.extname(inputPath).toLowerCase().replace('.', '');
    const filterName = this.getImportToPdfFilter(ext);

    try {
      const convertArg = filterName ? `pdf:${filterName}` : 'pdf';
      const args = [
        '--headless', '--norestore', '--safe-mode',
        '--convert-to', convertArg,
        '--outdir', outputDir, inputPath,
      ];

      const { stderr } = await execFileAsync(this.sofficePath, args, {
        timeout: 120000, maxBuffer: 10 * 1024 * 1024, windowsHide: true,
      });

      if (stderr && stderr.includes('Error')) throw new Error(stderr.trim());

      const baseName = path.basename(inputPath, path.extname(inputPath));
      const outputFile = path.join(outputDir, `${baseName}.pdf`);
      if (!fs.existsSync(outputFile)) throw new Error(`转换完成但未找到输出文件`);

      const stat = fs.statSync(outputFile);
      return { outputPath: outputFile, format: 'pdf', fileSize: stat.size, success: true, message: '成功转换为 PDF' };
    } catch (err) {
      return { outputPath: '', format: 'pdf', fileSize: 0, success: false, message: `转换失败: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  /** 查找 soffice 可执行文件（优先便携版，回退系统安装） */
  private findSoffice(): string {
    // 便携版候选路径（优先级最高）
    const portablePaths: string[] = [];

    if (process.platform === 'win32') {
      // vendor/libreoffice/program/soffice.exe
      const appPath = app.getAppPath();
      portablePaths.push(path.join(appPath, 'vendor', 'libreoffice', 'program', 'soffice.exe'));
      // resources/LibreOffice/program/soffice.exe (打包后)
      if (app.isPackaged) {
        portablePaths.push(path.join(process.resourcesPath || '', 'LibreOffice', 'program', 'soffice.exe'));
      }
      // 开发环境: 项目根/resources/LibreOffice/
      portablePaths.push(path.join(appPath, 'resources', 'LibreOffice', 'program', 'soffice.exe'));
    } else if (process.platform === 'darwin') {
      const appPath = app.getAppPath();
      portablePaths.push(path.join(appPath, 'vendor', 'LibreOffice.app', 'Contents', 'MacOS', 'soffice'));
      if (app.isPackaged) {
        portablePaths.push(path.join(process.resourcesPath || '', 'LibreOffice.app', 'Contents', 'MacOS', 'soffice'));
      }
    } else {
      // Linux
      const appPath = app.getAppPath();
      portablePaths.push(path.join(appPath, 'vendor', 'libreoffice', 'program', 'soffice'));
      if (app.isPackaged) {
        portablePaths.push(path.join(process.resourcesPath || '', 'libreoffice', 'program', 'soffice'));
      }
    }

    for (const p of portablePaths) {
      if (fs.existsSync(p)) {
        this.detectedSource = 'portable';
        return p;
      }
    }

    // 系统安装路径
    if (process.platform === 'win32') {
      const candidates = [
        'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
        'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
        path.join(os.homedir(), 'LibreOffice', 'program', 'soffice.exe'),
      ];
      const pf = process.env['ProgramFiles'];
      const pf86 = process.env['ProgramFiles(x86)'];
      if (pf) candidates.push(path.join(pf, 'LibreOffice', 'program', 'soffice.exe'));
      if (pf86) candidates.push(path.join(pf86, 'LibreOffice', 'program', 'soffice.exe'));
      for (const c of candidates) {
        if (fs.existsSync(c)) {
          this.detectedSource = 'system';
          return c;
        }
      }
      this.detectedSource = 'not-found';
      return 'soffice.exe';
    } else if (process.platform === 'darwin') {
      const mac = '/Applications/LibreOffice.app/Contents/MacOS/soffice';
      if (fs.existsSync(mac)) {
        this.detectedSource = 'system';
        return mac;
      }
      this.detectedSource = 'not-found';
      return 'soffice';
    }
    this.detectedSource = 'not-found';
    return 'soffice';
  }

  private getPdfExportFilter(fmt: ConvertTargetFormat): string {
    switch (fmt) {
      case 'docx': return 'MS Word 2007 XML';
      case 'xlsx': return 'Calc MS Excel 2007 XML';
      case 'pptx': return 'Impress MS PowerPoint 2007 XML';
      case 'html': return 'HTML (StarWriter)';
      default: return '';
    }
  }

  private getImportToPdfFilter(ext: string): string {
    switch (ext) {
      case 'doc': case 'docx': case 'rtf': case 'odt': case 'txt': case 'md':
        return 'writer_pdf_Export';
      case 'xls': case 'xlsx': case 'ods':
        return 'calc_pdf_Export';
      case 'ppt': case 'pptx': case 'odp':
        return 'impress_pdf_Export';
      case 'html': case 'htm':
        return 'writer_pdf_Export';
      default: return 'writer_pdf_Export';
    }
  }

  private getImageFilter(fmt: 'png' | 'jpg' | 'tiff'): string {
    switch (fmt) {
      case 'png':  return 'draw_png_Export';
      case 'jpg':  return 'draw_jpg_Export';
      case 'tiff': return 'draw_tif_Export';
    }
  }
}
