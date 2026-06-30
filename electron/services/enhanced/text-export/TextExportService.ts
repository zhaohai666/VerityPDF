import * as fs from 'fs';
import { BrowserWindow } from 'electron';
import * as pdfjsLib from 'pdfjs-dist';
import { GlobalWorkerOptions } from 'pdfjs-dist';

/**
 * 文本导出服务
 * 使用 pdfjs-dist 提取 PDF 中的所有文本内容并保存为纯文本文件
 */
export class TextExportService {
  private mainWindow: BrowserWindow | null = null;

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  private sendProgress(progress: number, message: string, onProgress?: (progress: number, message: string) => void): void {
    if (onProgress) {
      onProgress(progress, message);
    } else if (this.mainWindow && this.mainWindow.webContents) {
      this.mainWindow.webContents.send('text-export:progress', { progress, message });
    }
  }

  /**
   * 导出 PDF 文本内容到文件
   * @param pdfPath PDF 文件路径
   * @param outputPath 输出文本文件路径
   * @param options 可选参数
   * @returns 输出文件路径
   */
  async exportText(
    pdfPath: string,
    outputPath: string,
    options: {
      includeFormatting?: boolean; // 是否尝试保留基本格式（如段落换行）
      onProgress?: (progress: number, message: string) => void;
    } = {}
  ): Promise<string> {
    // 验证文件路径
    if (!pdfPath || typeof pdfPath !== 'string') {
      throw new Error('无效的PDF文件路径');
    }

    if (!outputPath || typeof outputPath !== 'string') {
      throw new Error('无效的输出文件路径');
    }

    const { includeFormatting = true, onProgress } = options;
    this.sendProgress(0, '开始读取 PDF 文件...', onProgress);

    // 读取 PDF 文件
    const data = fs.readFileSync(pdfPath);

    this.sendProgress(10, '正在解析 PDF 文档...', onProgress);

    // 配置 pdfjs-dist worker
    GlobalWorkerOptions.workerSrc = `file://${__dirname}/../../../node_modules/pdfjs-dist/build/pdf.worker.entry.js`;

    // 使用 pdfjs-dist 加载 PDF
    const loadingTask = pdfjsLib.getDocument({ data });
    const pdfDoc = await loadingTask.promise;
    const totalPages = pdfDoc.numPages;

    this.sendProgress(20, `PDF 解析完成，共 ${totalPages} 页`, onProgress);

    // 提取所有页面的文本
    let fullText = '';

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      const page = await pdfDoc.getPage(pageNum);

      // 获取文本内容
      const textContent = await page.getTextContent();

      // 将文本项合并成字符串
      let pageText = textContent.items
        .map((item: any) => item.str)
        .join('');

      // 如果需要保留格式，可以尝试添加换行符
      if (includeFormatting) {
        // 简单实现通过检测文本项的 y 坐标变化来估计换行
        const items = textContent.items as any[];
        if (items.length > 0) {
          let lines: string[] = [];
          let currentLine = '';
          let lastY = items[0].transform[5]; // y translation

          for (const item of items) {
            const y = item.transform[5];
            // 如果 y 坐标变化超过一定阈值，认为是新行
            if (Math.abs(y - lastY) > 2) {
              lines.push(currentLine.trim());
              currentLine = '';
            }
            currentLine += ' ' + item.str;
            lastY = y;
          }
          if (currentLine.trim() !== '') {
            lines.push(currentLine.trim());
          }
          pageText = lines.join('\n');
        }
      }

      fullText += pageText;

      // 在页面之间添加分隔符（除非是最后一页）
      if (pageNum < totalPages) {
        // 添加两个换行符来分隔页面
        if (!fullText.endsWith('\n')) {
          fullText += '\n';
        }
        if (!fullText.endsWith('\n\n')) {
          fullText += '\n\n';
        }
      }

      // 更新进度
      const progress = 20 + Math.round((pageNum / totalPages) * 70); // 20% to 90%
      this.sendProgress(progress, `已提取 ${pageNum}/${totalPages} 页文本...`, onProgress);
    }

    this.sendProgress(90, '正在写入文本文件...', onProgress);

    // 写入文本文件
    fs.writeFileSync(outputPath, fullText, 'utf8');

    this.sendProgress(100, '文本导出完成', onProgress);

    // 清理资源
    // Note: pdfjs-dist doesn't have a destroy method on the document, but cleanup is recommended
    // @ts-ignore: cleanup method exists
    pdfDoc.cleanup();

    return outputPath;
  }
}