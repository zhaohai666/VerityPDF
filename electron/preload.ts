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

  exportImages: (images, dirPath, baseName) =>
    wrapInvoke<string[]>('export:images', { images, dirPath, baseName }),

  extractPages: (pdfData, pageIndices) =>
    wrapInvoke<string | null>('page:extract', { pdfData, pageIndices }),

  manipulatePages: (pdfData, operation) =>
    wrapInvoke<ArrayBuffer>('page:manipulate', { pdfData, operation: operation as Record<string, unknown> }),

  applyEncryption: (pdfData, options) =>
    wrapInvoke<ArrayBuffer>('encrypt:apply', { pdfData, options }),

  removeEncryption: (pdfData) =>
    wrapInvoke<ArrayBuffer>('encrypt:remove', { pdfData }),

  detectFormFields: (pdfData) =>
    wrapInvoke('form:detect', { pdfData }),

  fillFormFields: (pdfData, values) =>
    wrapInvoke<ArrayBuffer>('form:fill', { pdfData, values }),

  flattenForm: (pdfData) =>
    wrapInvoke<ArrayBuffer>('form:flatten', { pdfData }),

  signPDF: (pdfData, options) =>
    wrapInvoke('signature:sign', { pdfData, options }),

  verifySignature: (pdfData) =>
    wrapInvoke('signature:verify', { pdfData }),

  loadCertificate: (p12Path, password) =>
    wrapInvoke('signature:loadCert', { p12Path, password }),

  checkLibreOffice: () =>
    wrapInvoke('convert:check', {}),

  convertFile: (inputPath, options) =>
    wrapInvoke('convert:file', { inputPath, options }),

  batchConvert: (inputPaths, options) =>
    wrapInvoke('convert:batch', { inputPaths, options }),

  convertToPDF: (inputPath, outputDir) =>
    wrapInvoke('convert:toPdf', { inputPath, outputDir }),

  selectConvertFiles: (extensions) =>
    wrapInvoke<string[]>('convert:selectFiles', { extensions }),
};

contextBridge.exposeInMainWorld('verityAPI', api);
