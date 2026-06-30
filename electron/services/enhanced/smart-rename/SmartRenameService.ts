import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import * as fs from 'fs';
import { BrowserWindow } from 'electron';

/**
 * 智能重命名服务
 * 基于 PDF 元数据和内容自动生成有意义的文件名建议
 */
export class SmartRenameService {
  private mainWindow: BrowserWindow | null = null;

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  private sendProgress(progress: number, message: string): void {
    if (this.mainWindow && this.mainWindow.webContents) {
      this.mainWindow.webContents.send('smart-rename:progress', { progress, message });
    }
  }

  /**
   * 生成文件名建议
   * @param filePath PDF 文件路径
   * @param options 重命名选项
   * @returns 建议的文件名
   */
  async generateRenameSuggestions(
    filePath: string,
    options?: {
      template?: string; // 模板，如 "{title}_{date}"
      priority?: 'metadata' | 'content' | 'hybrid'; // 提取策略
    }
  ): Promise<string> {
    // 验证文件路径
    if (!filePath || typeof filePath !== 'string') {
      throw new Error('无效的文件路径');
    }

    this.sendProgress(0, '开始分析 PDF 文件...');

    // 读取 PDF 文件
    const data = fs.readFileSync(filePath);

    this.sendProgress(10, '正在读取元数据...');

    // 使用 pdf-lib 加载 PDF
    const pdfDoc = await PDFDocument.load(data, { ignoreEncryption: true });

    // 提取元数据
    const metadata = {
      title: pdfDoc.getTitle() || '',
      author: pdfDoc.getAuthor() || '',
      subject: pdfDoc.getSubject() || '',
      keywords: pdfDoc.getKeywords() || '',
      creationDate: pdfDoc.getCreationDate() || new Date(),
      modificationDate: pdfDoc.getModificationDate() || new Date(),
      creator: pdfDoc.getCreator() || '',
      producer: pdfDoc.getProducer() || '',
    };

    this.sendProgress(30, '正在分析文本内容...');

    // 使用 pdfjs-dist 提取文本内容
    const loadingTask = pdfjsLib.getDocument({ data });
    const pdf = await loadingTask.promise;
    const totalPages = pdf.numPages;

    // 提取第一页的文本内容作为关键词源
    let firstPageContent = '';
    if (totalPages > 0) {
      const firstPage = await pdf.getPage(1);
      const textContent = await firstPage.getTextContent();
      firstPageContent = textContent.items
        .filter(item => {
          return 'str' in item && typeof (item as any).str === 'string';
        })
        .map(item => (item as any).str)
        .join(' ');
    }

    loadingTask.destroy();

    this.sendProgress(70, '正在生成文件名...');

    // 根据模板或策略生成文件名
    const suggestions = this.createSuggestions(metadata, firstPageContent, options);

    this.sendProgress(100, '文件名生成完成');

    // 清理资源
    pdf.cleanup();

    // 返回建议的文件名（取第一个）
    return suggestions[0] || this.generateDefaultFileName(filePath, metadata);
  }

  /**
   * 生成多个文件名建议
   */
  private createSuggestions(
    metadata: {
      title: string;
      author: string;
      subject: string;
      keywords: string;
      creationDate: Date;
      modificationDate: Date;
      creator: string;
      producer: string;
    },
    content: string,
    options?: { template?: string; priority?: 'metadata' | 'content' | 'hybrid' }
  ): string[] {
    const { template, priority = 'hybrid' } = options || {};

    // 基础信息
    const dateStr = this.formatDate(metadata.creationDate);
    const authorSafe = this.sanitizeFileName(metadata.author || 'Unknown');
    const titleSafe = this.sanitizeFileName(metadata.title || 'Untitled');

    // 从内容中提取关键词
    const keywords = this.extractKeywords(content, 3);

    const suggestions: string[] = [];

    // 策略 1: 元数据优先
    if (priority === 'metadata' || priority === 'hybrid') {
      if (template) {
        // 使用自定义模板
        let fileName = template
          .replace('{title}', titleSafe)
          .replace('{author}', authorSafe)
          .replace('{date}', dateStr)
          .replace('{keywords}', keywords.join('_'))
          .replace('{prefix}', this.getPrefixFromContent(content));

        // 如果模板中还有未替换的占位符，替换为空
        fileName = fileName.replace(/\{[^}]+\}/g, '');
        fileName = this.sanitizeFileName(fileName);

        suggestions.push(fileName || `${titleSafe}_${dateStr}`);
      } else {
        // 默认模板：{title}_{author}_{date}
        const baseName = `${titleSafe}_${authorSafe}_${dateStr}`;
        suggestions.push(this.sanitizeFileName(baseName));
      }
    }

    // 策略 2: 内容优先
    if (priority === 'content' || priority === 'hybrid') {
      const prefix = this.getPrefixFromContent(content);
      if (prefix && prefix !== titleSafe) {
        const contentBasedName = this.sanitizeFileName(`${prefix}_${dateStr}`);
        if (contentBasedName && !suggestions.includes(contentBasedName)) {
          suggestions.push(contentBasedName);
        }
      }
    }

    // 策略 3: 纯日期命名（兜底）
    const dateOnlyName = this.sanitizeFileName(dateStr);
    if (dateOnlyName && !suggestions.includes(dateOnlyName)) {
      suggestions.push(dateOnlyName);
    }

    // 如果没有建议，使用默认命名
    if (suggestions.length === 0) {
      suggestions.push(this.generateDefaultFileName('', metadata));
    }

    return suggestions;
  }

  /**
   * 生成默认文件名
   */
  private generateDefaultFileName(_filePath: string, metadata: any): string {
    const dateStr = this.formatDate(metadata.creationDate || new Date());
    const defaultName = `PDF_${dateStr}`;
    return this.sanitizeFileName(defaultName);
  }

  /**
   * 从内容中提取前缀（如项目编号、合同编号等）
   */
  private getPrefixFromContent(content: string): string {
    // 尝试匹配常见的模式
    const patterns = [
      /(?:合同|Contract)[:\s]*([A-Z0-9\-]{3,})/i,
      /(?:编号|Number)[:\s]*([A-Z0-9\-]{3,})/i,
      /(?:项目|Project)[:\s]*([A-Z0-9\-]{3,})/i,
      /(?:发票|Invoice)[:\s]*([A-Z0-9\-]{5,})/i,
      /(?:订单|Order)[:\s]*([A-Z0-9\-]{5,})/i,
      /\b([A-Z]{2,4}\d{4,8})\b/, // 如 ABCD12345678
    ];

    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match && match[1]) {
        return this.sanitizeFileName(match[1].substring(0, 20));
      }
    }

    // 如果没有匹配到，返回第一个长单词
    const words = content.split(/\s+/).filter(w => w.length > 5);
    if (words.length > 0) {
      return this.sanitizeFileName(words[0].substring(0, 20));
    }

    return '';
  }

  /**
   * 从内容中提取关键词
   */
  private extractKeywords(text: string, count: number = 5): string[] {
    // 移除常见停用词
    const stopwords = new Set([
      '的', '了', '在', '是', '和', '与', '或', '被', '对', '就', '都',
      'an', 'a', 'the', 'is', 'are', 'was', 'were', 'in', 'on', 'at',
      'and', 'or', 'but', 'if', 'then', 'else', 'when', 'where', 'which',
    ]);

    // 提取所有单词
    const words = text
      .replace(/[0-9]/g, ' ') // 移除数字
      .match(/\b[a-zA-Z]{4,20}\b/g) || [];

    // 统计词频
    const wordFreq = new Map<string, number>();
    for (const word of words) {
      const lowerWord = word.toLowerCase();
      if (!stopwords.has(lowerWord)) {
        wordFreq.set(lowerWord, (wordFreq.get(lowerWord) || 0) + 1);
      }
    }

    // 按频率排序，取前 N 个
    const sortedWords = Array.from(wordFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, count)
      .map(entry => entry[0]);

    return sortedWords;
  }

  /**
   * 格式化日期
   */
  private formatDate(date: Date | string | undefined): string {
    if (!date) {
      date = new Date();
    }
    if (typeof date === 'string') {
      date = new Date(date);
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  /**
   * 清理文件名（去除非法字符）
   */
  private sanitizeFileName(name: string): string {
    // 去除或替换非法字符
    // Windows 和 macOS 不允许的字符: \ / : * ? " < > |
    let cleaned = name
      .replace(/[\\/:*?"<>|]/g, '-')
      .replace(/\s+/g, '_') // 空格替换为下划线
      .replace(/[_]+/g, '_') // 多个下划线合并
      .replace(/^_+/, '') // 去除开头下划线
      .replace(/_+$/, '') // 去除结尾下划线
      .substring(0, 100); // 限制长度

    // 如果清理后为空，使用默认值
    if (!cleaned || cleaned.length === 0) {
      cleaned = 'untitled';
    }

    return cleaned;
  }
}
