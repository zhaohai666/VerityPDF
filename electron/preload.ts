import { contextBridge, ipcRenderer } from 'electron';
import type { VerityAPI, FileDialogOptions } from '../src/types/electron';

const APP_VERSION = '1.0.0';

function wrapInvoke<T>(channel: string, payload: unknown): Promise<T> {
  return ipcRenderer.invoke(channel, { version: APP_VERSION, payload });
}

const api: VerityAPI = {
  openFile: () => wrapInvoke<string | null>('file:dialog', { type: 'open' }),
  saveFile: (data, defaultPath) => wrapInvoke<boolean>('file:save', { data, defaultPath }),
  readFile: (filePath) => wrapInvoke<ArrayBuffer>('file:read', { filePath }),

  showDialog: (options: FileDialogOptions) => wrapInvoke<string | null>('file:dialog', options),

  getVersion: () => APP_VERSION,
  getPlatform: () => process.platform,

  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  maximizeWindow: () => ipcRenderer.send('window:maximize'),
  closeWindow: () => ipcRenderer.send('window:close'),
  setWindowTitle: (title) => ipcRenderer.send('window:setTitle', title),

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

  checkForUpdates: async () => ({ hasUpdate: false }),

  getTestFile: () => wrapInvoke<string | null>('app:getTestFile', {}),

  exportPDF: (pdfData: string, annotations: unknown[], defaultName?: string) =>
    wrapInvoke<string | null>('export:merge', { pdfData, annotations, defaultName }),
};

contextBridge.exposeInMainWorld('verityAPI', api);
