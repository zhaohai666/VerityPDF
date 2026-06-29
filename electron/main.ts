import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron';
import path from 'path';
import fs from 'fs';
import { createAppMenu } from './menu/appMenu';
import { registerIpcHandlers } from './ipc/handlers';
import { removeAllIpcHandlers } from './utils/ipcWrapper';

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

  // 渲染进程崩溃隔离：自动重载并通知用户
  let crashReloadCount = 0;
  const MAX_RELOAD_ATTEMPTS = 3;
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[Main] Render process gone:', details.reason, 'exitCode:', details.exitCode);
    if (crashReloadCount < MAX_RELOAD_ATTEMPTS) {
      crashReloadCount++;
      console.log(`[Main] Auto-reloading renderer (attempt ${crashReloadCount}/${MAX_RELOAD_ATTEMPTS})`);
      setTimeout(() => {
        mainWindow?.webContents.reload();
        // 重载后通知用户崩溃已恢复
        setTimeout(() => {
          mainWindow?.webContents.send('app:rendererRecovered', {
            crashReason: details.reason,
            reloadAttempt: crashReloadCount,
          });
        }, 1000);
      }, 500);
    } else {
      console.error('[Main] Max reload attempts reached, showing error dialog');
      dialog.showMessageBox(mainWindow!, {
        type: 'error',
        title: '渲染崩溃',
        message: '应用渲染进程多次崩溃，无法自动恢复。请重启应用。',
        buttons: ['重启应用'],
      }).then(({ response }) => {
        if (response === 0) {
          app.relaunch();
          app.exit(0);
        }
      });
    }
  });

  // 注册 IPC 处理器
  registerIpcHandlers(mainWindow);

  // 窗口关闭处理：检查未保存标注，提示用户确认
  let isClosing = false;
  mainWindow.on('close', (e) => {
    if (isClosing) return;
    e.preventDefault();
    mainWindow?.webContents.send('app:beforeClose');
  });

  ipcMain.on('app:canClose', (_event, canClose: boolean) => {
    if (canClose) {
      isClosing = true;
      mainWindow?.close();
    } else {
      const choice = dialog.showMessageBoxSync(mainWindow!, {
        type: 'warning',
        buttons: ['取消', '放弃保存并关闭'],
        defaultId: 0,
        cancelId: 0,
        title: '未保存的更改',
        message: '有未保存的标注更改，是否放弃保存并关闭？',
      });
      if (choice === 1) {
        isClosing = true;
        mainWindow?.close();
      }
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    // 窗口关闭后清理 IPC 处理器，避免内存泄漏
    removeAllIpcHandlers();
    ipcMain.removeHandler('app:getTestFile');
    ipcMain.removeAllListeners('app:getVersion');
    ipcMain.removeAllListeners('window:minimize');
    ipcMain.removeAllListeners('window:maximize');
    ipcMain.removeAllListeners('window:close');
    ipcMain.removeAllListeners('window:setTitle');
    ipcMain.removeAllListeners('app:canClose');
    console.log('[Main] IPC handlers cleaned up');
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
  ipcMain.handle('app:getTestFile', () => ({ success: true, data: testFile, version: '1.0.0' }));

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

// 应用退出前清理资源
app.on('before-quit', () => {
  // 清理所有 IPC 处理器和事件监听器
  removeAllIpcHandlers();
  ipcMain.removeHandler('app:getTestFile');
  ipcMain.removeAllListeners('app:getVersion');
  ipcMain.removeAllListeners('window:minimize');
  ipcMain.removeAllListeners('window:maximize');
  ipcMain.removeAllListeners('window:close');
  ipcMain.removeAllListeners('window:setTitle');
  ipcMain.removeAllListeners('app:canClose');
  console.log('[Main] All IPC handlers cleaned up before quit');
});

// 文件打开支持 (macOS)
app.on('open-file', (_event, filePath) => {
  if (mainWindow) {
    mainWindow.webContents.send('file:opened', filePath);
  }
});

export { mainWindow };
