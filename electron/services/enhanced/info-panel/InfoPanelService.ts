import { PDFDocument } from 'pdf-lib';
import fs from 'fs';
import pdfjsLib from 'pdfjs-dist';
import { execSync } from 'child_process';
import { BrowserWindow } from 'electron';

/**
 * PDF 信息面板服务
 * 提取 PDF 的详细信息，包括页面、尺寸、字体、图片、加密状态、元数据等
 */
export class InfoPanelService {
  private mainWindow: BrowserWindow | null = null;

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  private sendProgress(progress: number, message: string): void {
    if (this.mainWindow && this.mainWindow.webContents) {
      this.mainWindow.webContents.send('info-panel:progress', { progress, message });
    }
  }

  /**
   * 获取 PDF 的详细信息
   * @param filePath PDF 文件路径
   * @returns 包含页面、尺寸、字体、图片、加密状态、元数据等信息的对象
   */
  async getInfo(filePath: string): Promise<any> {
    // 验证文件路径
    if (!filePath || typeof filePath !== 'string') {
      throw new Error('无效的文件路径');
    }

    this.sendProgress?.(0, '开始读取 PDF 文件...');

    // 读取 PDF 文件
    const data = fs.readFileSync(filePath);

    this.sendProgress?.(10, '正在解析 PDF 结构...');

    // 使用 pdf-lib 加载 PDF
    const pdfDoc = await PDFDocument.load(data, { ignoreEncryption: true });
    const pageCount = pdfDoc.getPageCount();

    this.sendProgress?.(20, `PDF 解析完成，共 ${pageCount} 页`);

    // 获取第一页的尺寸（假设所有页面尺寸相同，实际应用中可能需要处理不同尺寸）
    const firstPage = pdfDoc.getPage(0);
    const { width, height } = firstPage.getSize();

    this.sendProgress?.(30, '正在分析字体和图片...');

    // 使用 pdfjs-dist 统计字体和图片
    const loadingTask = pdfjsLib.getDocument({ data });
    const pdf = await loadingTask.promise;

    let fonts = new Set<string>();
    let images = 0;

    // 遍历所有页面统计字体和图片
    for (let i = 1; i <= pageCount; i++) {
      const page = await pdf.getPage(i);
      const ops = await page.getOperatorList();

      for (let j = 0; j < ops.fnArray.length; j++) {
        const fn = ops.fnArray[j];
        if (fn === pdfjsLib.OPS.paintImageXObject) {
          images++;
        }
        if (fn === pdfjsLib.OPS.setFont) {
          const args = ops.argsArray[j];
          fonts.add(args[0]); // font name
        }
      }

      // 更新进度
      const progress = 30 + Math.round((i / pageCount) * 40); // 30% to 70%
      this.sendProgress?.(progress, `已分析 ${i}/${pageCount} 页...`);
    }

    this.sendProgress?.(70, '正在检查加密状态...');

    // 使用 qpdf 检查加密信息（如果可用）
    let encryption = null;
    try {
      const out = execSync(`qpdf --show-encryption "${filePath}"`).toString();
      encryption = out.includes('encrypted') ? { encrypted: true, details: out } : { encrypted: false };
    } catch (_) {
      // qpdf 不可用或文件未加密
      encryption = { encrypted: false };
    }

    this.sendProgress?.(80, '正在提取元数据...');

    // 提取元数据
    const metadata = {
      title: pdfDoc.getTitle() ?? '',
      author: pdfDoc.getAuthor() ?? '',
      subject: pdfDoc.getSubject() ?? '',
      keywords: pdfDoc.getKeywords() ?? '',
      creationDate: pdfDoc.getCreationDate()?.toISOString() ?? '',
      modificationDate: pdfDoc.getModificationDate()?.toISOString() ?? '',
      creator: pdfDoc.getCreator() ?? '',
      producer: pdfDoc.getProducer() ?? '',
    };

    this.sendProgress?.(90, '信息提取完成');

    // 清理资源
    // Note: pdf-lib doesn't require explicit cleanup in most cases
    loadingTask.destroy();

    return {
      pages: pageCount,
      size: { width, height },
      fonts: Array.from(fonts),
      images,
      encryption,
      metadata,
      fileSize: Buffer.byteLength(data),
      filePath: filePath
    };
  }
}