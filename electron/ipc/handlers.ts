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

  registerIpcHandler<{ pdfData: string }, ArrayBuffer>('encrypt:remove', async ({ pdfData }) => {
    if (!pdfData) throw new Error('无效的 PDF 数据');
    const binary = Buffer.from(pdfData, 'base64');
    const arrayBuffer = binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength) as ArrayBuffer;
    return encryptionService.removeEncryption(arrayBuffer);
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
}
