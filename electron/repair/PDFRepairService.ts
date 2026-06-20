import { PDFDocument } from 'pdf-lib';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';

const execFileAsync = promisify(execFile);

/**
 * PDF 修复服务
 * 尝试使用 pdf-lib 重新解析并重建文档结构
 * 如 pdf-lib 失败，尝试调用系统 QPDF（如已安装）
 */
export class PDFRepairService {
  /**
   * 修复损坏的 PDF 文件
   * @param filePath PDF 文件路径
   * @returns 修复后的文件数据（ArrayBuffer），失败则抛出错误
   */
  async repair(filePath: string): Promise<ArrayBuffer> {
    // 方案 1：pdf-lib 重新解析
    try {
      const result = await this.repairWithPdfLib(filePath);
      return result;
    } catch (err) {
      console.log('[PDFRepair] pdf-lib repair failed:', err);
    }

    // 方案 2：QPDF 命令行工具（如已安装）
    try {
      const result = await this.repairWithQPDF(filePath);
      return result;
    } catch (err) {
      console.log('[PDFRepair] QPDF repair failed:', err);
    }

    throw new Error('PDF 修复失败：pdf-lib 和 QPDF 均无法处理此文件');
  }

  /**
   * 使用 pdf-lib 重新解析并重建 PDF 结构
   */
  private async repairWithPdfLib(filePath: string): Promise<ArrayBuffer> {
    const data = fs.readFileSync(filePath);

    // 尝试加载（忽略加密和结构错误）
    const pdfDoc = await PDFDocument.load(data, {
      ignoreEncryption: true,
      updateMetadata: false,
    });

    // 重建文档：创建新 PDF 并逐页复制
    const newPdf = await PDFDocument.create();
    const pages = await newPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());

    for (const page of pages) {
      newPdf.addPage(page);
    }

    // 复制元数据
    try {
      const title = pdfDoc.getTitle();
      const author = pdfDoc.getAuthor();
      const subject = pdfDoc.getSubject();
      if (title) newPdf.setTitle(title);
      if (author) newPdf.setAuthor(author);
      if (subject) newPdf.setSubject(subject);
    } catch {
      // 元数据读取失败不影响修复
    }

    const bytes = await newPdf.save();
    return bytes.buffer as ArrayBuffer;
  }

  /**
   * 使用 QPDF 命令行工具修复（如已安装）
   */
  private async repairWithQPDF(filePath: string): Promise<ArrayBuffer> {
    // 检查 QPDF 是否可用
    const qpdfPath = this.findQPDF();
    if (!qpdfPath) {
      throw new Error('QPDF 未安装');
    }

    const tmpOutput = filePath.replace(/\.pdf$/i, '.repaired.pdf');

    try {
      await execFileAsync(qpdfPath, [
        '--linearize', // 线性化（可修复部分结构问题）
        filePath,
        tmpOutput,
      ], { timeout: 60_000 });

      const data = fs.readFileSync(tmpOutput);
      return data.buffer as ArrayBuffer;
    } finally {
      // 清理临时文件
      try {
        if (fs.existsSync(tmpOutput)) {
          fs.unlinkSync(tmpOutput);
        }
      } catch {
        // 忽略清理错误
      }
    }
  }

  /**
   * 查找 QPDF 可执行文件路径
   */
  private findQPDF(): string | null {
    // 常见安装路径
    const candidates = [
      'qpdf', // PATH 中
      'C:\\Program Files\\QPDF\\bin\\qpdf.exe',
      'C:\\Program Files (x86)\\QPDF\\bin\\qpdf.exe',
      '/usr/bin/qpdf',
      '/usr/local/bin/qpdf',
    ];

    for (const candidate of candidates) {
      try {
        if (candidate === 'qpdf' || fs.existsSync(candidate)) {
          return candidate;
        }
      } catch {
        continue;
      }
    }

    return null;
  }
}
