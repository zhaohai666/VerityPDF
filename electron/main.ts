import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import { createAppMenu } from './menu/appMenu';
import { registerIpcHandlers } from './ipc/handlers';

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'VerityPDF',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // 安全策略
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // 加载应用
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    // 延迟打开 DevTools，避免 Autofill.enable 协议警告
    mainWindow.webContents.once('did-finish-load', () => {
      mainWindow?.webContents.openDevTools({ mode: 'detach' });
    });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // 设置菜单
  createAppMenu(mainWindow);

  // 转发渲染进程控制台日志到终端（开发调试用）
  mainWindow.webContents.on('console-message', (_event, level, message) => {
    const prefix = level === 0 ? '[Renderer:LOG]' : level === 1 ? '[Renderer:WARN]' : '[Renderer:ERR]';
    console.log(`${prefix} ${message}`);
  });

  // 注册 IPC 处理器
  registerIpcHandlers(mainWindow);

  // 窗口关闭处理
  mainWindow.on('close', (e) => {
    // 可以在这里添加未保存提示
    void e;
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// 解析命令行参数或环境变量中的文件路径
function getTestFilePath(): string | null {
  // 优先检查环境变量
  const envPath = process.env.TEST_PDF_PATH;
  if (envPath && fs.existsSync(envPath)) {
    return path.resolve(envPath);
  }
  // 其次检查命令行参数
  const args = process.argv.slice(1);
  const pdfArg = args.find((arg) => arg.endsWith('.pdf'));
  if (pdfArg && fs.existsSync(pdfArg)) {
    return path.resolve(pdfArg);
  }
  return null;
}

// 开发模式下启用远程调试端口
if (process.env.VITE_DEV_SERVER_URL) {
  app.commandLine.appendSwitch('remote-debugging-port', '9222');
}

// 应用就绪后创建窗口
app.whenReady().then(() => {
  createWindow();

  // 检查是否有测试文件参数
  const testFile = getTestFilePath();
  if (testFile) {
    console.log('[Main] Test file available:', testFile);
  }

  // 注册获取测试文件的 IPC 处理器（渲染进程启动后主动拉取）
  ipcMain.handle('app:getTestFile', () => testFile);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// 所有窗口关闭时退出（macOS 除外）
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// 文件打开支持 (macOS)
app.on('open-file', (_event, filePath) => {
  if (mainWindow) {
    mainWindow.webContents.send('file:opened', filePath);
  }
});

export { mainWindow };
