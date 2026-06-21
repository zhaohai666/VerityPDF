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

  // ========== 任务队列 ==========
  const taskQueueService = new TaskQueueService();
  taskQueueService.setMainWindow(mainWindow);

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
}
