import { ipcMain, dialog, BrowserWindow, app } from 'electron';
import fs from 'fs';
import path from 'path';
import { exportPDF, type ExportAnnotation } from '../export/PDFExporter';
import { registerIpcHandler, getAppVersion } from '../utils/ipcWrapper';

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
}
