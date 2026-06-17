import { ipcMain, dialog, BrowserWindow, app } from 'electron';
import fs from 'fs';
import path from 'path';

export function registerIpcHandlers(mainWindow: BrowserWindow): void {
  // 文件对话框
  ipcMain.handle('file:dialog', async (_event, options: { type: string; filters?: Array<{ name: string; extensions: string[] }>; defaultPath?: string }) => {
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

  // 读取文件
  ipcMain.handle('file:read', async (_event, { filePath }: { filePath: string }) => {
    if (!fs.existsSync(filePath)) return null;
    const buffer = fs.readFileSync(filePath);
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  });

  // 保存文件
  ipcMain.handle('file:save', async (_event, { data, defaultPath }: { data: string; defaultPath: string }) => {
    try {
      // 原子写入：先写临时文件再重命名
      const tmpPath = defaultPath + '.tmp';
      fs.writeFileSync(tmpPath, data, 'utf-8');
      fs.renameSync(tmpPath, defaultPath);
      return true;
    } catch {
      return false;
    }
  });

  // 应用信息
  ipcMain.on('app:getVersion', (event) => {
    event.returnValue = app.getVersion();
  });

  // 窗口控制
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
}
