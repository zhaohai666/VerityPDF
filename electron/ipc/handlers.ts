import { ipcMain, dialog, BrowserWindow, app } from 'electron';
import fs from 'fs';
import path from 'path';
import { exportPDF, type ExportAnnotation } from '../export/PDFExporter';
import { registerIpcHandler, getAppVersion } from '../utils/ipcWrapper';
import { PDFDocument } from 'pdf-lib';
import { EncryptionService } from '../encryption/EncryptionService';
import { FormService } from '../form/FormService';
import { SignatureService } from '../signature/SignatureService';
import { LibreOfficeService } from '../convert/LibreOfficeService';
import { PDFRepairService } from '../repair/PDFRepairService';
import { BatchPageService } from '../batch/BatchPageService';
import { WatermarkService } from '../batch/WatermarkService';
import { TaskQueueService, type PipelineStep } from '../batch/TaskQueueService';
import { CompressService } from '../batch/CompressService';
import { RedactionService } from '../redaction/RedactionService';
import { ContentStreamEditor } from '../pdf/ContentStreamEditor';
import { AnnotationRemoverService } from '../annotation/AnnotationRemoverService';
import { PageResizeService } from '../resize/PageResizeService';
import { PdfOverlayService } from '../overlay/PdfOverlayService';
import { NUpService } from '../nup/NUpService';
import { ImageExtractorService } from '../extract/ImageExtractorService';
import { BookletService } from '../booklet/BookletService';
import { ColorReplaceService } from '../color/ColorReplaceService';
import { SensitiveInfoRedactor } from '../redact/SensitiveInfoRedactor';
import { PdfDiffService } from '../diff/PdfDiffService';
import { BlankPageDetectionService } from '../services/enhanced/blank-page-detection/BlankPageDetectionService';
import { InfoPanelService } from '../services/enhanced/info-panel/InfoPanelService';
import { SmartRenameService } from '../services/enhanced/smart-rename/SmartRenameService';
import { StampLibraryService, StampConfig } from '../services/enhanced/stamp-library/StampLibraryService';
import { TextExportService } from '../services/enhanced/text-export/TextExportService';
import { SanitizeService } from '../sanitize/SanitizeService';
import { PdfAConversionService } from '../pdfa/PdfAConversionService';
import { SplitByBookmarksService } from '../split-bookmarks/SplitByBookmarksService';
import { InvertColorsService } from '../invert-colors/InvertColorsService';
import { RemoveImagesService } from '../remove-images/RemoveImagesService';
import { AttachmentService } from '../attachments/AttachmentService';
import { InfoJsonService } from '../info-json/InfoJsonService';
import { ScannerEffectService } from '../scanner-effect/ScannerEffectService';
import { ImageToPdfService } from '../image-to-pdf/ImageToPdfService';
import { CsvExportService } from '../csv-export/CsvExportService';
import { ShowJsService } from '../show-js/ShowJsService';

const MAX_FILE_SIZE = 500 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ['.pdf'];

/**
 * 验证文件路径安全性：
 * 1. 必须是绝对路径
 * 2. 规范化后不能包含 '..' 组件（防止路径遍历）
 * 3. 必须在允许的根目录下（用户目录、临时目录）
 * 4. 符号链接解析后仍须在允许范围内
 */
function validateFilePath(filePath: string): string {
  // 规范化路径，解析 '..' 和 '.'
  const normalizedPath = path.normalize(filePath);
  const resolvedPath = path.resolve(normalizedPath);

  // 必须是绝对路径
  if (!path.isAbsolute(resolvedPath)) {
    throw new Error('文件路径必须是绝对路径');
  }

  // 规范化后检查是否含有 '..' 组件（normalize 已解析，此处作为二次保障）
  const segments = resolvedPath.split(path.sep);
  if (segments.includes('..')) {
    throw new Error('非法文件路径：包含路径遍历组件');
  }

  // 允许的根目录白名单
  const allowedRoots: string[] = [
    app.getPath('home'),
    app.getPath('desktop'),
    app.getPath('documents'),
    app.getPath('downloads'),
    app.getPath('temp'),
    app.getPath('userData'),
  ];
  // macOS: 允许 /Volumes 下的挂载磁盘
  if (process.platform === 'darwin') {
    allowedRoots.push('/Volumes');
  }
  // Windows: 允许所有盘符根目录
  if (process.platform === 'win32') {
    for (let c = 65; c <= 90; c++) {
      allowedRoots.push(`${String.fromCharCode(c)}:\\`);
    }
  }

  const isInAllowedRoot = allowedRoots.some((root) => {
    const normalizedRoot = path.resolve(root);
    return resolvedPath.startsWith(normalizedRoot + path.sep) || resolvedPath === normalizedRoot;
  });

  if (!isInAllowedRoot) {
    throw new Error(`文件路径不在允许的访问范围内`);
  }

  // 符号链接检查：realpath 解析后仍须在允许范围内
  try {
    const realPath = fs.realpathSync(resolvedPath);
    const isRealPathSafe = allowedRoots.some((root) => {
      const normalizedRoot = path.resolve(root);
      return realPath.startsWith(normalizedRoot + path.sep) || realPath === normalizedRoot;
    });
    if (!isRealPathSafe) {
      throw new Error('文件路径通过符号链接指向非法位置');
    }
  } catch (err) {
    // realpathSync 在文件不存在时会抛出错误，此处忽略（后续存在性检查会处理）
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw err;
    }
  }

  return resolvedPath;
}

interface FileDialogOptions {
  type: string;
  filters?: Array<{ name: string; extensions: string[] }>;
  defaultPath?: string;
}

export function registerIpcHandlers(mainWindow: BrowserWindow): void {
  registerIpcHandler<FileDialogOptions, string | null>('file:dialog', async (options) => {
    const filters = options.filters || [
      { name: 'PDF 文件', extensions: ['pdf'] },
      { name: '所有文件', extensions: ['*'] },
    ];

    if (options.type === 'open') {
      const result = await dialog.showOpenDialog(mainWindow, {
        filters,
        properties: ['openFile'],
      });
      return result.canceled ? null : result.filePaths[0];
    } else {
      const result = await dialog.showSaveDialog(mainWindow, {
        filters,
        defaultPath: options.defaultPath,
      });
      return result.canceled ? null : result.filePath;
    }
  });

  registerIpcHandler<{ filePath: string }, ArrayBuffer>('file:read', async ({ filePath }) => {
    if (!filePath || typeof filePath !== 'string') {
      throw new Error('无效的文件路径');
    }

    // 安全路径验证（防止路径遍历和符号链接攻击）
    const safePath = validateFilePath(filePath);
    const ext = path.extname(safePath).toLowerCase();

    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      throw new Error(`不支持的文件类型: ${ext}`);
    }

    if (!fs.existsSync(safePath)) {
      throw new Error(`文件不存在: ${filePath}`);
    }

    const stat = fs.statSync(safePath);
    if (!stat.isFile()) {
      throw new Error('路径不是文件');
    }

    if (stat.size > MAX_FILE_SIZE) {
      throw new Error(`文件大小超过限制 (${MAX_FILE_SIZE / 1024 / 1024}MB)`);
    }

    const buffer = fs.readFileSync(safePath);
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  });

  registerIpcHandler<{ data: string; defaultPath: string }, boolean>('file:save', async ({ data, defaultPath }) => {
    const tmpPath = defaultPath + '.tmp';
    fs.writeFileSync(tmpPath, data, 'utf-8');
    fs.renameSync(tmpPath, defaultPath);
    return true;
  });

  ipcMain.on('app:getVersion', (event) => {
    event.returnValue = getAppVersion();
  });

  ipcMain.on('window:minimize', () => mainWindow.minimize());
  ipcMain.on('window:maximize', () => {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  });
  ipcMain.on('window:close', () => mainWindow.close());
  ipcMain.on('window:setTitle', (_event, title: string) => {
    mainWindow.setTitle(title);
  });

  registerIpcHandler<{ pdfData: string; annotations: unknown[]; defaultName?: string }, string | null>('export:merge', async ({ pdfData, annotations, defaultName }) => {
    if (!pdfData || typeof pdfData !== 'string') {
      throw new Error('无效的 PDF 数据');
    }

    const binary = Buffer.from(pdfData, 'base64');
    const arrayBuffer = binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength);

    const exportedBytes = await exportPDF(arrayBuffer as ArrayBuffer, annotations as ExportAnnotation[]);

    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      defaultPath: defaultName || 'exported.pdf',
      filters: [{ name: 'PDF 文件', extensions: ['pdf'] }],
    });

    if (canceled || !filePath) return null;

    fs.writeFileSync(filePath, exportedBytes);
    return filePath;
  });

  // 图片导出 IPC
  registerIpcHandler<{
    images: Array<{ pageNumber: number; base64: string; format: string }>;
    dirPath: string;
    baseName: string;
  }, string[]>('export:images', async ({ images, dirPath, baseName }) => {
    if (!images || images.length === 0) {
      throw new Error('没有可导出的图片');
    }
    // 验证目录路径
    const safeDir = path.resolve(dirPath);
    if (!fs.existsSync(safeDir)) {
      fs.mkdirSync(safeDir, { recursive: true });
    }

    const savedPaths: string[] = [];
    for (const img of images) {
      const ext = img.format === 'jpeg' ? '.jpg' : '.png';
      const fileName = `${baseName}_page${String(img.pageNumber).padStart(3, '0')}${ext}`;
      const filePath = path.join(safeDir, fileName);
      const buffer = Buffer.from(img.base64, 'base64');
      fs.writeFileSync(filePath, buffer);
      savedPaths.push(filePath);
    }

    return savedPaths;
  });

  // 页面提取 IPC
  registerIpcHandler<{ pdfData: string; pageIndices: number[] }, string | null>('page:extract', async ({ pdfData, pageIndices }) => {
    if (!pdfData || !pageIndices || pageIndices.length === 0) {
      throw new Error('无效的参数');
    }

    const binary = Buffer.from(pdfData, 'base64');
    const srcDoc = await PDFDocument.load(binary, { ignoreEncryption: true });
    const newDoc = await PDFDocument.create();
    const copiedPages = await newDoc.copyPages(srcDoc, pageIndices);
    copiedPages.forEach((page) => newDoc.addPage(page));

    const newBytes = await newDoc.save();

    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      defaultPath: 'extracted_pages.pdf',
      filters: [{ name: 'PDF 文件', extensions: ['pdf'] }],
    });

    if (canceled || !filePath) return null;
    fs.writeFileSync(filePath, newBytes);
    return filePath;
  });

  // 加密 IPC
  const encryptionService = new EncryptionService();
  const formService = new FormService();
  const signatureService = new SignatureService();
  const libreOfficeService = new LibreOfficeService();

  registerIpcHandler<{
    pdfData: string;
    options: {
      userPassword: string;
      ownerPassword: string;
      permissions: {
        print: boolean; copy: boolean; modify: boolean;
        annotate: boolean; fillForms: boolean; extract: boolean;
      };
    };
  }, ArrayBuffer>('encrypt:apply', async ({ pdfData, options }) => {
    if (!pdfData) throw new Error('无效的 PDF 数据');
    const binary = Buffer.from(pdfData, 'base64');
    const arrayBuffer = binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength) as ArrayBuffer;
    return encryptionService.applyEncryption(arrayBuffer, options);
  });

  registerIpcHandler<{ pdfData: string; password?: string }, ArrayBuffer>('encrypt:remove', async ({ pdfData, password }) => {
    if (!pdfData) throw new Error('无效的 PDF 数据');
    const binary = Buffer.from(pdfData, 'base64');
    const arrayBuffer = binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength) as ArrayBuffer;
    return encryptionService.removeEncryption(arrayBuffer, password);
  });

  // 已知密码解密
  registerIpcHandler<{ pdfData: string; password: string }, ArrayBuffer>('encrypt:decrypt', async ({ pdfData, password }) => {
    if (!pdfData) throw new Error('无效的 PDF 数据');
    if (!password) throw new Error('请输入密码');
    const binary = Buffer.from(pdfData, 'base64');
    const arrayBuffer = binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength) as ArrayBuffer;
    return encryptionService.removeEncryption(arrayBuffer, password);
  });

  // 检测 QPDF 可用性
  registerIpcHandler<{}, { available: boolean; version?: string }>('encrypt:checkQpdf', async () => {
    return encryptionService.isQpdfAvailable();
  });

  // 压缩 IPC
  const compressService = new CompressService();
  compressService.setMainWindow(mainWindow);

  registerIpcHandler<{}, { available: boolean; version?: string }>('compress:checkGs', async () => {
    return compressService.isGhostscriptAvailable();
  });

  registerIpcHandler<{
    pdfData: string;
    options: {
      preset?: 'minimum' | 'balanced' | 'highQuality';
      imageDpi?: number;
      imageQuality?: number;
      grayscale?: boolean;
      removeMetadata?: boolean;
      fontSubset?: boolean;
    };
  }, ArrayBuffer>('compress:smart', async ({ pdfData, options }) => {
    if (!pdfData) throw new Error('无效的 PDF 数据');
    const binary = Buffer.from(pdfData, 'base64');
    const arrayBuffer = binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength) as ArrayBuffer;
    return compressService.compress(arrayBuffer, {
      quality: 'medium',  // 默认值，被 preset 覆盖
      ...options,
    });
  });

  // 表单 IPC
  registerIpcHandler<{ pdfData: string }, unknown[]>('form:detect', async ({ pdfData }) => {
    if (!pdfData) throw new Error('无效的 PDF 数据');
    const binary = Buffer.from(pdfData, 'base64');
    const arrayBuffer = binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength) as ArrayBuffer;
    return formService.detectFields(arrayBuffer);
  });

  registerIpcHandler<{ pdfData: string; values: Record<string, string | boolean> }, ArrayBuffer>('form:fill', async ({ pdfData, values }) => {
    if (!pdfData) throw new Error('无效的 PDF 数据');
    const binary = Buffer.from(pdfData, 'base64');
    const arrayBuffer = binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength) as ArrayBuffer;
    return formService.fillFields(arrayBuffer, values);
  });

  registerIpcHandler<{ pdfData: string }, ArrayBuffer>('form:flatten', async ({ pdfData }) => {
    if (!pdfData) throw new Error('无效的 PDF 数据');
    const binary = Buffer.from(pdfData, 'base64');
    const arrayBuffer = binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength) as ArrayBuffer;
    return formService.flattenForm(arrayBuffer);
  });

  // 签名 IPC
  registerIpcHandler<{
    pdfData: string;
    options: { signerName: string; reason: string; location: string; p12Path?: string; p12Password?: string };
  }, unknown>('signature:sign', async ({ pdfData, options }) => {
    if (!pdfData) throw new Error('无效的 PDF 数据');
    const binary = Buffer.from(pdfData, 'base64');
    const arrayBuffer = binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength) as ArrayBuffer;
    return signatureService.signPDF(arrayBuffer, options);
  });

  registerIpcHandler<{ pdfData: string }, unknown>('signature:verify', async ({ pdfData }) => {
    if (!pdfData) throw new Error('无效的 PDF 数据');
    const binary = Buffer.from(pdfData, 'base64');
    const arrayBuffer = binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength) as ArrayBuffer;
    return signatureService.verifySignature(arrayBuffer);
  });

  registerIpcHandler<{ p12Path: string; password: string }, unknown>('signature:loadCert', async ({ p12Path, password }) => {
    if (!p12Path) throw new Error('无效的证书路径');
    return signatureService.loadP12(p12Path, password);
  });

  // PAdES 签名
  registerIpcHandler<{
    pdfData: string;
    options: {
      signerName: string; reason: string; location: string; contactInfo?: string;
      p12Path?: string; p12Password?: string;
      visibleSignature?: {
        page: number; rect: { x: number; y: number; width: number; height: number };
        appearanceImage?: string; showTimestamp: boolean;
      };
    };
  }, unknown>('signature:signPades', async ({ pdfData, options }) => {
    if (!pdfData) throw new Error('无效的 PDF 数据');
    const binary = Buffer.from(pdfData, 'base64');
    const arrayBuffer = binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength) as ArrayBuffer;
    return signatureService.signPades(arrayBuffer, options as any);
  });

  registerIpcHandler<{ pdfData: string }, unknown>('signature:verifyPades', async ({ pdfData }) => {
    if (!pdfData) throw new Error('无效的 PDF 数据');
    const binary = Buffer.from(pdfData, 'base64');
    const arrayBuffer = binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength) as ArrayBuffer;
    return signatureService.verifyPades(arrayBuffer);
  });

  // 密文擦除 IPC
  const redactionService = new RedactionService();

  registerIpcHandler<{
    pdfData: string;
    rects: Array<{ page: number; x: number; y: number; width: number; height: number }>;
  }, ArrayBuffer>('redact:apply', async ({ pdfData, rects }) => {
    if (!pdfData) throw new Error('无效的 PDF 数据');
    if (!rects || rects.length === 0) throw new Error('没有擦除区域');
    const binary = Buffer.from(pdfData, 'base64');
    const arrayBuffer = binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength) as ArrayBuffer;
    const result = await redactionService.redact(arrayBuffer, rects);
    return result.data;
  });

  // 页面操作 IPC（删除/重排/插入/合并）
  registerIpcHandler<{ pdfData: string; operation: {
    type: string;
    pageIndices?: number[];
    afterIndex?: number;
    count?: number;
    width?: number;
    height?: number;
    secondPdfData?: string;
  } }, ArrayBuffer>('page:manipulate', async ({ pdfData, operation }) => {
    if (!pdfData) throw new Error('无效的 PDF 数据');

    const binary = Buffer.from(pdfData, 'base64');
    const doc = await PDFDocument.load(binary, { ignoreEncryption: true });

    switch (operation.type) {
      case 'delete': {
        const indices = (operation.pageIndices || []).sort((a, b) => b - a); // 从后往前删
        for (const idx of indices) {
          if (idx >= 0 && idx < doc.getPageCount()) {
            doc.removePage(idx);
          }
        }
        break;
      }
      case 'reorder': {
        const newOrder = operation.pageIndices || [];
        if (newOrder.length !== doc.getPageCount()) {
          throw new Error('重排页码数量不匹配');
        }
        // 创建新文档并按新顺序复制页面
        const newDoc = await PDFDocument.create();
        const copiedPages = await newDoc.copyPages(doc, newOrder);
        copiedPages.forEach((page) => newDoc.addPage(page));
        const bytes = await newDoc.save();
        return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      }
      case 'insertBlank': {
        const afterIdx = operation.afterIndex ?? -1;
        const count = operation.count ?? 1;
        const w = operation.width ?? 612;
        const h = operation.height ?? 792;
        for (let i = 0; i < count; i++) {
          const insertAt = afterIdx + 1 + i;
          doc.insertPage(insertAt, [w, h]);
        }
        break;
      }
      case 'merge': {
        if (!operation.secondPdfData) throw new Error('缺少第二个 PDF 数据');
        const secondBinary = Buffer.from(operation.secondPdfData, 'base64');
        const secondDoc = await PDFDocument.load(secondBinary, { ignoreEncryption: true });
        const secondPages = await doc.copyPages(secondDoc, secondDoc.getPageIndices());
        const insertAt = (operation.afterIndex ?? -1) + 1;
        secondPages.forEach((page, i) => {
          doc.insertPage(insertAt + i, page);
        });
        break;
      }
      default:
        throw new Error(`未知操作类型: ${operation.type}`);
    }

    const resultBytes = await doc.save();
    return resultBytes.buffer.slice(resultBytes.byteOffset, resultBytes.byteOffset + resultBytes.byteLength) as ArrayBuffer;
  });

  // LibreOffice 格式转换 IPC
  registerIpcHandler<unknown, { available: boolean; version?: string; path: string }>('convert:check', async () => {
    return libreOfficeService.isAvailable();
  });

  registerIpcHandler<{
    inputPath: string;
    options: { targetFormat: string; outputDir: string; imageDpi?: number; jpegQuality?: number };
  }, { outputPath: string; format: string; fileSize: number; success: boolean; message: string }>('convert:file', async ({ inputPath, options }) => {
    if (!inputPath) throw new Error('无效的输入文件路径');
    return libreOfficeService.convertFile(inputPath, options as Parameters<typeof libreOfficeService.convertFile>[1]);
  });

  registerIpcHandler<{
    inputPaths: string[];
    options: { targetFormat: string; outputDir: string; imageDpi?: number; jpegQuality?: number };
  }, { results: unknown[]; totalFiles: number; successCount: number; failCount: number }>('convert:batch', async ({ inputPaths, options }) => {
    if (!inputPaths || inputPaths.length === 0) throw new Error('没有输入文件');
    return libreOfficeService.batchConvert(inputPaths, options as Parameters<typeof libreOfficeService.convertFile>[1]);
  });

  registerIpcHandler<{
    inputPath: string;
    outputDir: string;
  }, { outputPath: string; format: string; fileSize: number; success: boolean; message: string }>('convert:toPdf', async ({ inputPath, outputDir }) => {
    if (!inputPath) throw new Error('无效的输入文件路径');
    return libreOfficeService.convertToPDF(inputPath, outputDir);
  });

  registerIpcHandler<{
    extensions: string[];
  }, string[]>('convert:selectFiles', async ({ extensions }) => {
    const filters = [{
      name: '支持的文档格式',
      extensions: extensions || ['docx', 'xlsx', 'pptx', 'html', 'md', 'doc', 'xls', 'ppt', 'rtf', 'odt', 'ods', 'odp'],
    }];
    const result = await dialog.showOpenDialog(mainWindow, {
      filters,
      properties: ['openFile', 'multiSelections'],
    });
    return result.canceled ? [] : result.filePaths;
  });

  // PDF 修复
  const pdfRepairService = new PDFRepairService();
  registerIpcHandler<{
    filePath: string;
  }, ArrayBuffer>('pdf:repair', async ({ filePath }) => {
    if (!filePath) throw new Error('无效的文件路径');
    return pdfRepairService.repair(filePath);
  });

  // PDF 文本编辑
  const contentStreamEditor = new ContentStreamEditor();

  registerIpcHandler<{
    pdfData: string;
    page: number;
  }, Array<{ index: number; text: string; fontName: string; fontSize: number; page: number; position: { x: number; y: number } }>>('pdf:getTextSegments', async ({ pdfData, page }) => {
    if (!pdfData) throw new Error('无效的 PDF 数据');
    const binary = Buffer.from(pdfData, 'base64');
    const arrayBuffer = binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength) as ArrayBuffer;
    return contentStreamEditor.getTextSegments(arrayBuffer, page);
  });

  registerIpcHandler<{
    pdfData: string;
    options: {
      action: string;
      page: number;
      segmentIndex?: number;
      segmentIndices?: number[];
      newText?: string;
      fontSize?: number;
      color?: string;
    };
  }, ArrayBuffer>('pdf:editText', async ({ pdfData, options }) => {
    if (!pdfData) throw new Error('无效的 PDF 数据');
    const binary = Buffer.from(pdfData, 'base64');
    const arrayBuffer = binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength) as ArrayBuffer;

    switch (options.action) {
      case 'replace':
        if (options.segmentIndex === undefined || !options.newText) throw new Error('缺少替换参数');
        return contentStreamEditor.replaceText(arrayBuffer, options.page, options.segmentIndex, options.newText);
      case 'delete':
        if (!options.segmentIndices || options.segmentIndices.length === 0) throw new Error('缺少删除目标');
        return contentStreamEditor.deleteText(arrayBuffer, options.page, options.segmentIndices);
      case 'style':
        if (options.segmentIndex === undefined) throw new Error('缺少样式目标');
        return contentStreamEditor.modifyStyle(arrayBuffer, options.page, options.segmentIndex, {
          fontSize: options.fontSize,
          color: options.color,
        });
      default:
        throw new Error(`未知的编辑操作: ${options.action}`);
    }
  });

  // 批量页面操作
  const batchPageService = new BatchPageService();
  batchPageService.setMainWindow(mainWindow);
  const watermarkService = new WatermarkService();
  watermarkService.setMainWindow(mainWindow);

  registerIpcHandler<{
    pdfData: string;
    options: { pageIndices: number[]; angle: number };
  }, ArrayBuffer>('batch:pageOperate', async ({ pdfData, options }) => {
    if (!pdfData) throw new Error('无效的 PDF 数据');
    const binary = Buffer.from(pdfData, 'base64');
    const arrayBuffer = binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength) as ArrayBuffer;
    return batchPageService.batchRotate(arrayBuffer, options);
  });

  registerIpcHandler<{
    filePath: string;
    threshold: number;
  }, { blankIndices: number[]; totalChecked: number }>('batch:detectBlank', async ({ filePath, threshold }) => {
    if (!filePath) throw new Error('无效的文件路径');
    return batchPageService.detectBlankPages(filePath, threshold);
  });

  registerIpcHandler<{
    pdfData: string;
    options: { pageIndices: number[]; margin: { top: number; right: number; bottom: number; left: number } };
  }, ArrayBuffer>('batch:crop', async ({ pdfData, options }) => {
    if (!pdfData) throw new Error('无效的 PDF 数据');
    const binary = Buffer.from(pdfData, 'base64');
    const arrayBuffer = binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength) as ArrayBuffer;
    return batchPageService.batchCrop(arrayBuffer, options);
  });

  registerIpcHandler<{
    pdfData: string;
    options: {
      type: 'text' | 'image'; content: string; opacity: number; rotation: number;
      fontSize?: number; fontFamily?: string; color?: string;
      position?: 'center' | 'tile'; tileSpacing?: number; pageIndices?: number[];
    };
  }, ArrayBuffer>('batch:addWatermark', async ({ pdfData, options }) => {
    if (!pdfData) throw new Error('无效的 PDF 数据');
    const binary = Buffer.from(pdfData, 'base64');
    const arrayBuffer = binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength) as ArrayBuffer;
    return watermarkService.addWatermark(arrayBuffer, options);
  });

  registerIpcHandler<{
    pdfData: string;
    options: {
      position: string; style: string; fontSize: number;
      fontFamily?: string; color?: string; startIndex: number; pageIndices?: number[];
    };
  }, ArrayBuffer>('batch:addPageNumbers', async ({ pdfData, options }) => {
    if (!pdfData) throw new Error('无效的 PDF 数据');
    const binary = Buffer.from(pdfData, 'base64');
    const arrayBuffer = binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength) as ArrayBuffer;
    return watermarkService.addPageNumbers(arrayBuffer, options as Parameters<typeof watermarkService.addPageNumbers>[1]);
  });

  registerIpcHandler<{
    pdfData: string;
    options: {
      headerText?: string; footerText?: string; fontSize: number;
      fontFamily?: string; color?: string; pageIndices?: number[];
    };
  }, ArrayBuffer>('batch:addHeaderFooter', async ({ pdfData, options }) => {
    if (!pdfData) throw new Error('无效的 PDF 数据');
    const binary = Buffer.from(pdfData, 'base64');
    const arrayBuffer = binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength) as ArrayBuffer;
    return watermarkService.addHeaderFooter(arrayBuffer, options);
  });

  // 页面基础处理：多文件合并
  registerIpcHandler<{
    filePaths: string[];
  }, ArrayBuffer>('pdf:multiMerge', async ({ filePaths }) => {
    if (!filePaths || filePaths.length < 2) throw new Error('至少需要两个 PDF 文件');
    const newDoc = await PDFDocument.create();
    for (const fp of filePaths) {
      const safePath = validateFilePath(fp);
      if (!fs.existsSync(safePath)) throw new Error(`文件不存在: ${fp}`);
      const data = fs.readFileSync(safePath);
      const srcDoc = await PDFDocument.load(data, { ignoreEncryption: true });
      const pages = await newDoc.copyPages(srcDoc, srcDoc.getPageIndices());
      pages.forEach((p) => newDoc.addPage(p));
    }
    const bytes = await newDoc.save();
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  });

  // 页面基础处理：按范围拆分
  registerIpcHandler<{
    pdfData: string;
    ranges: string[];
    outputDir: string;
  }, string[]>('pdf:split', async ({ pdfData, ranges, outputDir }) => {
    if (!pdfData) throw new Error('无效的 PDF 数据');
    if (!ranges || ranges.length === 0) throw new Error('请指定拆分范围');
    const safeDir = path.resolve(outputDir);
    if (!fs.existsSync(safeDir)) fs.mkdirSync(safeDir, { recursive: true });

    const binary = Buffer.from(pdfData, 'base64');
    const srcDoc = await PDFDocument.load(binary, { ignoreEncryption: true });
    const totalPages = srcDoc.getPageCount();
    const outputPaths: string[] = [];

    for (let r = 0; r < ranges.length; r++) {
      const rangeStr = ranges[r].trim();
      if (!rangeStr) continue;
      const indices: number[] = [];
      const parts = rangeStr.split(',').map((s) => s.trim());
      for (const part of parts) {
        const m = part.match(/^(\d+)\s*-\s*(\d+)$/);
        if (m) {
          const start = Math.max(1, parseInt(m[1], 10));
          const end = Math.min(totalPages, parseInt(m[2], 10));
          for (let p = start; p <= end; p++) indices.push(p - 1);
        } else {
          const n = parseInt(part, 10);
          if (n >= 1 && n <= totalPages) indices.push(n - 1);
        }
      }
      if (indices.length === 0) continue;

      const partDoc = await PDFDocument.create();
      const copiedPages = await partDoc.copyPages(srcDoc, indices);
      copiedPages.forEach((p) => partDoc.addPage(p));
      const partBytes = await partDoc.save();
      const fileName = `part_${r + 1}_pages_${rangeStr.replace(/[,\s]/g, '_')}.pdf`;
      const filePath = path.join(safeDir, fileName);
      fs.writeFileSync(filePath, partBytes);
      outputPaths.push(filePath);
    }

    return outputPaths;
  });

  // 页面基础处理：选择多个 PDF 文件
  registerIpcHandler<{
    extensions?: string[];
  }, string[]>('pdf:selectFiles', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      filters: [{ name: 'PDF 文件', extensions: ['pdf'] }],
      properties: ['openFile', 'multiSelections'],
    });
    return result.canceled ? [] : result.filePaths;
  });

  // ========== 新功能 ==========

  // PDF 叠加
  const overlayService = new PdfOverlayService();
  registerIpcHandler<{
    basePdfData: string;
    overlayPdfData: string;
    options: { mode: 'background' | 'foreground'; opacity: number; scale: 'fit' | 'stretch' | 'original'; pageIndices?: number[] };
  }, ArrayBuffer>('pdf:overlay', async ({ basePdfData, overlayPdfData, options }) => {
    if (!basePdfData) throw new Error('无效的基底 PDF 数据');
    if (!overlayPdfData) throw new Error('无效的叠加 PDF 数据');
    const baseBinary = Buffer.from(basePdfData, 'base64');
    const overlayBinary = Buffer.from(overlayPdfData, 'base64');
    const baseAB = baseBinary.buffer.slice(baseBinary.byteOffset, baseBinary.byteOffset + baseBinary.byteLength) as ArrayBuffer;
    const overlayAB = overlayBinary.buffer.slice(overlayBinary.byteOffset, overlayBinary.byteOffset + overlayBinary.byteLength) as ArrayBuffer;
    return overlayService.overlayPdfs(baseAB, overlayAB, options);
  });

  // 图片提取
  const imageExtractor = new ImageExtractorService();
  registerIpcHandler<{ pdfData: string }, Array<{
    pageIndex: number; imageIndex: number; width: number; height: number;
    bitsPerComponent: number; colorSpace: string; filter: string; format: 'jpeg' | 'png' | 'raw'; data: string;
  }>>('pdf:extractImages', async ({ pdfData }) => {
    if (!pdfData) throw new Error('无效的 PDF 数据');
    const binary = Buffer.from(pdfData, 'base64');
    const ab = binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength) as ArrayBuffer;
    const images = await imageExtractor.extractImages(ab);
    // 将 Uint8Array 转为 base64
    return images.map(img => ({
      pageIndex: img.pageIndex,
      imageIndex: img.imageIndex,
      width: img.width,
      height: img.height,
      bitsPerComponent: img.bitsPerComponent,
      colorSpace: img.colorSpace,
      filter: img.filter,
      format: img.format,
      data: Buffer.from(img.data).toString('base64'),
    }));
  });

  registerIpcHandler<{
    images: Array<{ pageIndex: number; imageIndex: number; format: string; data: string }>;
    dirPath: string;
    baseName: string;
  }, string[]>('pdf:saveExtractedImages', async ({ images, dirPath, baseName }) => {
    if (!images || images.length === 0) throw new Error('没有可保存的图片');
    const safeDir = path.resolve(dirPath);
    if (!fs.existsSync(safeDir)) fs.mkdirSync(safeDir, { recursive: true });
    const savedPaths: string[] = [];
    for (const img of images) {
      const ext = img.format === 'jpeg' ? '.jpg' : '.png';
      const fileName = `${baseName}_p${img.pageIndex + 1}_${img.imageIndex + 1}${ext}`;
      const filePath = path.join(safeDir, fileName);
      fs.writeFileSync(filePath, Buffer.from(img.data, 'base64'));
      savedPaths.push(filePath);
    }
    return savedPaths;
  });

  // 标注移除
  const annotationRemover = new AnnotationRemoverService();
  registerIpcHandler<{ pdfData: string }, { total: number; byType: Record<string, number>; byPage: Record<number, number> }>('pdf:detectAnnotations', async ({ pdfData }) => {
    if (!pdfData) throw new Error('无效的 PDF 数据');
    const binary = Buffer.from(pdfData, 'base64');
    const ab = binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength) as ArrayBuffer;
    return annotationRemover.detectAnnotations(ab);
  });

  registerIpcHandler<{
    pdfData: string;
    options: { removeAll: boolean; types?: string[]; pageIndices?: number[]; preserveSignatures?: boolean };
  }, { removedCount: number; remainingCount: number; pdfData: ArrayBuffer }>('pdf:removeAnnotations', async ({ pdfData, options }) => {
    if (!pdfData) throw new Error('无效的 PDF 数据');
    const binary = Buffer.from(pdfData, 'base64');
    const ab = binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength) as ArrayBuffer;
    return annotationRemover.removeAnnotations(ab, options);
  });

  // 元数据
  registerIpcHandler<{ pdfData: string }, {
    title?: string; author?: string; subject?: string;
    keywords?: string[]; creator?: string; producer?: string;
    creationDate?: string; modificationDate?: string;
  }>('pdf:getMetadata', async ({ pdfData }) => {
    if (!pdfData) throw new Error('无效的 PDF 数据');
    const binary = Buffer.from(pdfData, 'base64');
    const doc = await PDFDocument.load(binary, { ignoreEncryption: true });
    return {
      title: doc.getTitle() || undefined,
      author: doc.getAuthor() || undefined,
      subject: doc.getSubject() || undefined,
      keywords: doc.getKeywords()?.split(',').map(k => k.trim()).filter(Boolean) || [],
      creator: doc.getCreator() || undefined,
      producer: doc.getProducer() || undefined,
      creationDate: doc.getCreationDate()?.toISOString() || undefined,
      modificationDate: doc.getModificationDate()?.toISOString() || undefined,
    };
  });

  registerIpcHandler<{
    pdfData: string;
    metadata: {
      title?: string; author?: string; subject?: string;
      keywords?: string[]; creator?: string; producer?: string;
      creationDate?: string;
    };
  }, ArrayBuffer>('pdf:setMetadata', async ({ pdfData, metadata }) => {
    if (!pdfData) throw new Error('无效的 PDF 数据');
    const binary = Buffer.from(pdfData, 'base64');
    const doc = await PDFDocument.load(binary, { ignoreEncryption: true });
    if (metadata.title !== undefined) doc.setTitle(metadata.title);
    if (metadata.author !== undefined) doc.setAuthor(metadata.author);
    if (metadata.subject !== undefined) doc.setSubject(metadata.subject);
    if (metadata.keywords) doc.setKeywords(metadata.keywords);
    if (metadata.creator !== undefined) doc.setCreator(metadata.creator);
    if (metadata.producer !== undefined) doc.setProducer(metadata.producer);
    if (metadata.creationDate) doc.setCreationDate(new Date(metadata.creationDate));
    const bytes = await doc.save();
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  });

  // 页面缩放
  const resizeService = new PageResizeService();
  registerIpcHandler<{
    pdfData: string;
    options: { targetSize: string | { width: number; height: number }; scaleMode: 'fit' | 'stretch' | 'crop'; pageIndices?: number[] };
  }, ArrayBuffer>('pdf:resizePages', async ({ pdfData, options }) => {
    if (!pdfData) throw new Error('无效的 PDF 数据');
    const binary = Buffer.from(pdfData, 'base64');
    const ab = binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength) as ArrayBuffer;
    return resizeService.resizePages(ab, options);
  });

  // N-up
  const nupService = new NUpService();
  registerIpcHandler<{
    pdfData: string;
    options: { layout: '2x1' | '1x2' | '2x2' | '3x3' | '4x4'; pageSize?: string | { width: number; height: number }; margin?: number; border?: boolean; order?: 'row' | 'column' };
  }, ArrayBuffer>('pdf:nup', async ({ pdfData, options }) => {
    if (!pdfData) throw new Error('无效的 PDF 数据');
    const binary = Buffer.from(pdfData, 'base64');
    const ab = binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength) as ArrayBuffer;
    return nupService.createNUp(ab, options);
  });

  // 签名链验证
  registerIpcHandler<{ pdfData: string }, unknown>('signature:verifyChain', async ({ pdfData }) => {
    if (!pdfData) throw new Error('无效的 PDF 数据');
    const binary = Buffer.from(pdfData, 'base64');
    const ab = binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength) as ArrayBuffer;
    return signatureService.verifySignatureChain(ab);
  });

  // ========== 第二批新功能 ==========

  // PDF Diff
  const diffService = new PdfDiffService();
  registerIpcHandler<{
    pdfDataA: string;
    pdfDataB: string;
  }, unknown>('pdf:diff', async ({ pdfDataA, pdfDataB }) => {
    if (!pdfDataA) throw new Error('无效的基底 PDF 数据');
    if (!pdfDataB) throw new Error('无效的对比 PDF 数据');
    const binA = Buffer.from(pdfDataA, 'base64');
    const binB = Buffer.from(pdfDataB, 'base64');
    const abA = binA.buffer.slice(binA.byteOffset, binA.byteOffset + binA.byteLength) as ArrayBuffer;
    const abB = binB.buffer.slice(binB.byteOffset, binB.byteOffset + binB.byteLength) as ArrayBuffer;
    return diffService.diffPdfs(abA, abB);
  });

  // 敏感信息检测
  const sensitiveRedactor = new SensitiveInfoRedactor();
  registerIpcHandler<{
    pdfData: string;
    rules: Array<{ name: string; pattern: string; enabled: boolean; description?: string }>;
  }, unknown>('pdf:detectSensitive', async ({ pdfData, rules }) => {
    if (!pdfData) throw new Error('无效的 PDF 数据');
    const binary = Buffer.from(pdfData, 'base64');
    const ab = binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength) as ArrayBuffer;
    return sensitiveRedactor.detectSensitiveInfo(ab, rules);
  });

  // 敏感信息涂黑
  registerIpcHandler<{
    pdfData: string;
    matches: Array<{ id: string; page: number; text: string; ruleName: string; rect: { x: number; y: number; width: number; height: number } }>;
  }, unknown>('pdf:redactSensitive', async ({ pdfData, matches }) => {
    if (!pdfData) throw new Error('无效的 PDF 数据');
    if (!matches || matches.length === 0) throw new Error('没有要涂黑的匹配项');
    const binary = Buffer.from(pdfData, 'base64');
    const ab = binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength) as ArrayBuffer;
    return sensitiveRedactor.redactSensitiveInfo(ab, matches);
  });

  // 小册子
  const bookletService = new BookletService();
  registerIpcHandler<{
    pdfData: string;
    options: { binding: 'left' | 'right'; pagesPerSheet: 2 | 4; addBlankPages: boolean };
  }, unknown>('pdf:booklet', async ({ pdfData, options }) => {
    if (!pdfData) throw new Error('无效的 PDF 数据');
    const binary = Buffer.from(pdfData, 'base64');
    const ab = binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength) as ArrayBuffer;
    return bookletService.createBooklet(ab, options);
  });

  // 颜色检测
  const colorService = new ColorReplaceService();
  registerIpcHandler<{ pdfData: string }, unknown>('pdf:detectColors', async ({ pdfData }) => {
    if (!pdfData) throw new Error('无效的 PDF 数据');
    const binary = Buffer.from(pdfData, 'base64');
    const ab = binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength) as ArrayBuffer;
    return colorService.detectColors(ab);
  });

  // 颜色替换
  registerIpcHandler<{
    pdfData: string;
    options: {
      rules: Array<{ oldColor: string; newColor: string; colorSpace: string; tolerance: number }>;
      tolerance: number;
      pageIndices?: number[];
    };
  }, unknown>('pdf:replaceColors', async ({ pdfData, options }) => {
    if (!pdfData) throw new Error('无效的 PDF 数据');
    if (!options.rules || options.rules.length === 0) throw new Error('没有颜色替换规则');
    const binary = Buffer.from(pdfData, 'base64');
    const ab = binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength) as ArrayBuffer;
    return colorService.replaceColors(ab, options as any);
  });

  // ========== 任务队列 ==========
  const taskQueueService = new TaskQueueService();
  taskQueueService.setMainWindow(mainWindow);

  // ========== 新增服务 ==========
  // 空白页检测服务
  const blankPageDetectionService = new BlankPageDetectionService();
  blankPageDetectionService.setMainWindow(mainWindow);

  // 信息面板服务
  const infoPanelService = new InfoPanelService();
  infoPanelService.setMainWindow(mainWindow);

  // 预设印章库服务
  const stampLibraryService = new StampLibraryService();
  stampLibraryService.setMainWindow(mainWindow);

  // 文本导出服务
  const textExportService = new TextExportService();
  textExportService.setMainWindow(mainWindow);

  // 智能重命名服务
  const smartRenameService = new SmartRenameService();
  smartRenameService.setMainWindow(mainWindow);

  registerIpcHandler<{
    type: string;
    filePaths: string[];
    outputDir: string;
    label: string;
    options?: Record<string, unknown>;
    pipelineSteps?: Array<{ type: string; options: Record<string, unknown>; label: string }>;
  }, string>('task:submit', async (args) => {
    if (!args.filePaths || args.filePaths.length === 0) throw new Error('未选择文件');
    if (!args.outputDir) throw new Error('未选择输出目录');

    const steps = args.pipelineSteps as PipelineStep[] | undefined;

    // 为每个文件创建独立任务
    const firstTaskId = taskQueueService.submitTask({
      type: args.type as 'convert' | 'watermark' | 'encrypt' | 'compress' | 'pipeline',
      label: args.label || args.filePaths[0].split(/[\\/]/).pop() || '任务',
      filePath: args.filePaths[0],
      outputDir: args.outputDir,
      options: args.options || {},
      pipelineSteps: steps,
    });

    // 批量提交其余文件
    for (let i = 1; i < args.filePaths.length; i++) {
      const fileName = args.filePaths[i].split(/[\\/]/).pop() || `文件 ${i + 1}`;
      taskQueueService.submitTask({
        type: args.type as 'convert' | 'watermark' | 'encrypt' | 'compress' | 'pipeline',
        label: fileName,
        filePath: args.filePaths[i],
        outputDir: args.outputDir,
        options: args.options || {},
        pipelineSteps: steps,
      });
    }

    return firstTaskId;
  });

  registerIpcHandler<{ taskId: string }, void>('task:cancel', async ({ taskId }) => {
    taskQueueService.cancelTask(taskId);
  });

  registerIpcHandler<{}, void>('task:cancelAll', async () => {
    taskQueueService.cancelAll();
  });

  registerIpcHandler<{ taskId: string }, string | null>('task:retry', async ({ taskId }) => {
    return taskQueueService.retryTask(taskId);
  });

  registerIpcHandler<{}, {
    tasks: unknown[];
    running: boolean;
    activeCount: number;
    completedCount: number;
    failedCount: number;
  }>('task:getStatus', async () => {
    return taskQueueService.getQueueStatus();
  });

  registerIpcHandler<{}, void>('task:clearCompleted', async () => {
    taskQueueService.clearCompleted();
  });

  registerIpcHandler<{ taskId: string }, void>('task:remove', async ({ taskId }) => {
    taskQueueService.removeTask(taskId);
  });

  registerIpcHandler<{}, string | null>('task:selectOutput', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory'],
      title: '选择输出目录',
    });
    return result.canceled ? null : result.filePaths[0];
  });

  registerIpcHandler<{ extensions: string[] }, string[]>('task:selectInputs', async ({ extensions }) => {
    const exts = extensions && extensions.length > 0 ? extensions : ['pdf'];
    const result = await dialog.showOpenDialog(mainWindow, {
      filters: [{ name: '支持的文件', extensions: exts }],
      properties: ['openFile', 'multiSelections'],
    });
    return result.canceled ? [] : result.filePaths;
  });

  // ========== 新增 IPC ==========
  // 空白页检测 IPC
  registerIpcHandler<{
    filePath: string;
    options?: {
      pixelThreshold?: number;
      nonWhiteRatioThreshold?: number;
    };
  }, { blankPages: number[]; totalChecked: number }>('blank-page-detection:analyze', async ({ filePath, options }) => {
    if (!filePath) throw new Error('无效的文件路径');
    return blankPageDetectionService.detectBlankPages(filePath, options);
  });

  // PDF 信息面板 IPC
  registerIpcHandler<{ filePath: string }, unknown>('info-panel:get-info', async ({ filePath }) => {
    if (!filePath) throw new Error('无效的文件路径');
    return infoPanelService.getInfo(filePath);
  });

  // 预设印章库 IPC
  registerIpcHandler<{}, StampConfig[]>('stamp-library:get-all', async () => {
    return stampLibraryService.getAllStamps();
  });

  registerIpcHandler<{ id: string }, StampConfig | null>('stamp-library:get-by-id', async ({ id }) => {
    if (!id) throw new Error('印章ID不能为空');
    return stampLibraryService.getStampById(id);
  });

  registerIpcHandler<{}, string>('stamp-library:get-date-text', async () => {
    return stampLibraryService.getDateStampText();
  });

  // 文本导出 IPC
  registerIpcHandler<{
    filePath: string;
    outputPath: string;
    options?: {
      includeFormatting?: boolean;
      onProgress?: (progress: number, message: string) => void;
    };
  }, string>('text-export:export', async ({ filePath, outputPath, options }) => {
    if (!filePath) throw new Error('无效的文件路径');
    if (!outputPath) throw new Error('无效的输出路径');
    return textExportService.exportText(filePath, outputPath, options);
  });

  // 智能重命名 IPC
  registerIpcHandler<{
    filePath: string;
    options?: {
      template?: string;
      priority?: 'metadata' | 'content' | 'hybrid';
    };
  }, string>('smart-rename:suggest', async ({ filePath, options }) => {
    if (!filePath) throw new Error('无效的文件路径');
    return smartRenameService.generateRenameSuggestions(filePath, options);
  });

  // ========== 新功能 IPC ==========

  // PDF 消毒
  const sanitizeService = new SanitizeService();
  registerIpcHandler<{
    pdfData: string;
    options: {
      removeMetadata: boolean;
      removeJavaScript: boolean;
      removeEmbeddedFiles: boolean;
      removeXmp: boolean;
      removeDocumentInfo: boolean;
    };
  }, unknown>('pdf:sanitize', async ({ pdfData, options }) => {
    if (!pdfData) throw new Error('无效的 PDF 数据');
    const binary = Buffer.from(pdfData, 'base64');
    const ab = binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength) as ArrayBuffer;
    return sanitizeService.sanitize(ab, options);
  });

  // PDF/A 转换
  const pdfaService = new PdfAConversionService();
  registerIpcHandler<{
    pdfData: string;
    options: { conformance: 'pdfa-1b' | 'pdfa-2b' | 'pdfa-3b'; includeXmp: boolean };
  }, unknown>('pdf:pdfaConvert', async ({ pdfData, options }) => {
    if (!pdfData) throw new Error('无效的 PDF 数据');
    const binary = Buffer.from(pdfData, 'base64');
    const ab = binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength) as ArrayBuffer;
    return pdfaService.convertToPdfA(ab, options);
  });

  // 按书签拆分
  const splitBookmarksService = new SplitByBookmarksService();
  registerIpcHandler<{
    pdfData: string;
    options: { level: 'top' | 'all'; outputDir: string };
  }, unknown>('pdf:splitBookmarks', async ({ pdfData, options }) => {
    if (!pdfData) throw new Error('无效的 PDF 数据');
    const binary = Buffer.from(pdfData, 'base64');
    const ab = binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength) as ArrayBuffer;
    return splitBookmarksService.splitByBookmarks(ab, options);
  });

  // 反色处理
  const invertColorsService = new InvertColorsService();
  registerIpcHandler<{
    pdfData: string;
    options: { pageIndices?: number[] };
  }, unknown>('pdf:invertColors', async ({ pdfData, options }) => {
    if (!pdfData) throw new Error('无效的 PDF 数据');
    const binary = Buffer.from(pdfData, 'base64');
    const ab = binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength) as ArrayBuffer;
    return invertColorsService.invertColors(ab, options);
  });

  // 移除图片
  const removeImagesService = new RemoveImagesService();
  registerIpcHandler<{
    pdfData: string;
    options: { pageIndices?: number[] };
  }, unknown>('pdf:removeImages', async ({ pdfData, options }) => {
    if (!pdfData) throw new Error('无效的 PDF 数据');
    const binary = Buffer.from(pdfData, 'base64');
    const ab = binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength) as ArrayBuffer;
    return removeImagesService.removeImages(ab, options);
  });

  // 附件管理
  const attachmentService = new AttachmentService();

  registerIpcHandler<{ pdfData: string }, unknown>('pdf:listAttachments', async ({ pdfData }) => {
    if (!pdfData) throw new Error('无效的 PDF 数据');
    const binary = Buffer.from(pdfData, 'base64');
    const ab = binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength) as ArrayBuffer;
    return attachmentService.listAttachments(ab);
  });

  registerIpcHandler<{
    pdfData: string;
    options: { name: string; data: string; description?: string };
  }, unknown>('pdf:addAttachment', async ({ pdfData, options }) => {
    if (!pdfData) throw new Error('无效的 PDF 数据');
    const binary = Buffer.from(pdfData, 'base64');
    const ab = binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength) as ArrayBuffer;
    return attachmentService.addAttachment(ab, options);
  });

  registerIpcHandler<{
    pdfData: string;
    outputDir: string;
    names?: string[];
  }, string[]>('pdf:extractAttachments', async ({ pdfData, outputDir, names }) => {
    if (!pdfData) throw new Error('无效的 PDF 数据');
    const binary = Buffer.from(pdfData, 'base64');
    const ab = binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength) as ArrayBuffer;
    return attachmentService.extractAttachments(ab, outputDir, names);
  });

  // PDF 信息 JSON
  const infoJsonService = new InfoJsonService();
  registerIpcHandler<{ pdfData: string }, unknown>('pdf:infoJson', async ({ pdfData }) => {
    if (!pdfData) throw new Error('无效的 PDF 数据');
    const binary = Buffer.from(pdfData, 'base64');
    const ab = binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength) as ArrayBuffer;
    return infoJsonService.getInfoJson(ab);
  });

  // 扫描件效果
  const scannerEffectService = new ScannerEffectService();
  registerIpcHandler<{
    pdfData: string;
    options: { dpi: number; grayscale: boolean; contrast: number; brightness: number; addNoise: boolean; deskew: boolean };
  }, unknown>('pdf:scannerEffect', async ({ pdfData, options }) => {
    if (!pdfData) throw new Error('无效的 PDF 数据');
    const binary = Buffer.from(pdfData, 'base64');
    const ab = binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength) as ArrayBuffer;
    return scannerEffectService.applyEffect(ab, options);
  });

  // 图片转PDF
  const imageToPdfService = new ImageToPdfService();
  registerIpcHandler<{
    options: {
      images: Array<{ data: string; format: 'png' | 'jpeg'; name: string }>;
      pageSize: 'original' | 'a4' | 'letter' | 'fit';
      dpi: number;
      margin: number;
      fitMode: 'stretch' | 'contain' | 'cover';
    };
  }, unknown>('image:toPdf', async ({ options }) => {
    if (!options.images || options.images.length === 0) throw new Error('没有图片数据');
    return imageToPdfService.convertToPdf(options);
  });

  // CSV 导出
  const csvExportService = new CsvExportService();
  registerIpcHandler<{
    pdfData: string;
    options: {
      pageIndices?: number[];
      delimiter: string;
      detectHeaders: boolean;
      rowDetectionTolerance: number;
      columnDetectionMode: 'auto' | 'tab' | 'fixed';
      includePageNumber: boolean;
      includeCoordinates: boolean;
    };
  }, unknown>('pdf:csvExport', async ({ pdfData, options }) => {
    if (!pdfData) throw new Error('无效的 PDF 数据');
    const binary = Buffer.from(pdfData, 'base64');
    const ab = binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength) as ArrayBuffer;
    return csvExportService.exportToCsv(ab, options);
  });

  // 查看 JavaScript
  const showJsService = new ShowJsService();
  registerIpcHandler<{ pdfData: string }, unknown>('pdf:showJs', async ({ pdfData }) => {
    if (!pdfData) throw new Error('无效的 PDF 数据');
    const binary = Buffer.from(pdfData, 'base64');
    const ab = binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength) as ArrayBuffer;
    return showJsService.extractJavaScript(ab);
  });
}
