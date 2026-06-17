import { contextBridge, ipcRenderer } from 'electron';
import type { VerityAPI, FileDialogOptions } from '../src/types/electron';

const api: VerityAPI = {
  // 文件操作
  openFile: () => ipcRenderer.invoke('file:dialog', { type: 'open' }),
  saveFile: (data, defaultPath) => ipcRenderer.invoke('file:save', { data, defaultPath }),
  readFile: (filePath) => ipcRenderer.invoke('file:read', { filePath }),

  // 对话框
  showDialog: (options: FileDialogOptions) => ipcRenderer.invoke('file:dialog', options),

  // 应用信息
  getVersion: () => ipcRenderer.sendSync('app:getVersion'),
  getPlatform: () => process.platform,

  // 窗口控制
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  maximizeWindow: () => ipcRenderer.send('window:maximize'),
  closeWindow: () => ipcRenderer.send('window:close'),
  setWindowTitle: (title) => ipcRenderer.send('window:setTitle', title),

  // 事件监听
  onMenuAction: (callback) => {
    const handler = (_: Electron.IpcRendererEvent, action: string) => callback(action);
    ipcRenderer.on('menu:action', handler);
    return () => ipcRenderer.removeListener('menu:action', handler);
  },

  onFileOpen: (callback) => {
    const handler = (_: Electron.IpcRendererEvent, filePath: string) => callback(filePath);
    ipcRenderer.on('file:opened', handler);
    return () => ipcRenderer.removeListener('file:opened', handler);
  },

  onBeforeClose: (callback) => {
    const handler = (_: Electron.IpcRendererEvent) => {
      callback().then((canClose) => {
        ipcRenderer.send('app:canClose', canClose);
      });
    };
    ipcRenderer.on('app:beforeClose', handler);
    return () => ipcRenderer.removeListener('app:beforeClose', handler);
  },

  // 更新检查（占位）
  checkForUpdates: async () => ({ hasUpdate: false }),

  // 获取测试文件路径
  getTestFile: () => ipcRenderer.invoke('app:getTestFile'),
};

contextBridge.exposeInMainWorld('verityAPI', api);
