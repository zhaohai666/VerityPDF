import { ipcMain, dialog, BrowserWindow } from 'electron';
import fs from 'fs';
import { exportPDF, type ExportAnnotation } from '../export/PDFExporter';
import { registerIpcHandler, getAppVersion } from '../utils/ipcWrapper';

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
    if (!fs.existsSync(filePath)) {
      throw new Error(`文件不存在: ${filePath}`);
    }
    const buffer = fs.readFileSync(filePath);
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
