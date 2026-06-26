import { contextBridge, ipcRenderer } from 'electron';
import type { VerityAPI, FileDialogOptions, TaskItemInfo } from '../src/types/electron';

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

  onRendererRecovered: (callback: (info: { crashReason: string; reloadAttempt: number }) => void) => {
    const handler = (_: Electron.IpcRendererEvent, info: { crashReason: string; reloadAttempt: number }) => callback(info);
    ipcRenderer.on('app:rendererRecovered', handler);
    return () => ipcRenderer.removeListener('app:rendererRecovered', handler);
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

  removeEncryption: (pdfData, password) =>
    wrapInvoke<ArrayBuffer>('encrypt:remove', { pdfData, password }),

  decryptWithPassword: (pdfData, password) =>
    wrapInvoke<ArrayBuffer>('encrypt:decrypt', { pdfData, password }),

  checkQpdf: () =>
    wrapInvoke<{ available: boolean; version?: string }>('encrypt:checkQpdf', {}),

  // 压缩
  checkGhostscript: () =>
    wrapInvoke<{ available: boolean; version?: string }>('compress:checkGs', {}),

  smartCompress: (pdfData, options) =>
    wrapInvoke<ArrayBuffer>('compress:smart', { pdfData, options }),

  // 密文擦除
  redactPdf: (pdfData, rects) =>
    wrapInvoke<ArrayBuffer>('redact:apply', { pdfData, rects }),

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

  signPades: (pdfData, options) =>
    wrapInvoke('signature:signPades', { pdfData, options }),

  verifyPades: (pdfData) =>
    wrapInvoke('signature:verifyPades', { pdfData }),

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

  repairPDF: (filePath) =>
    wrapInvoke<ArrayBuffer>('pdf:repair', { filePath }),

  // PDF 文本编辑
  editText: (pdfData, options) =>
    wrapInvoke<ArrayBuffer>('pdf:editText', { pdfData, options }),

  getTextSegments: (pdfData, page) =>
    wrapInvoke<Array<{ index: number; text: string; fontName: string; fontSize: number; page: number; position: { x: number; y: number } }>>('pdf:getTextSegments', { pdfData, page }),

  // 批量页面操作
  batchRotate: (pdfData, options) =>
    wrapInvoke<ArrayBuffer>('batch:pageOperate', { pdfData, options }),

  detectBlankPages: (filePath, threshold) =>
    wrapInvoke<{ blankIndices: number[]; totalChecked: number }>('batch:detectBlank', { filePath, threshold }),

  batchCrop: (pdfData, options) =>
    wrapInvoke<ArrayBuffer>('batch:crop', { pdfData, options }),

  // 水印/页码/页眉页脚
  addWatermark: (pdfData, options) =>
    wrapInvoke<ArrayBuffer>('batch:addWatermark', { pdfData, options }),

  addPageNumbers: (pdfData, options) =>
    wrapInvoke<ArrayBuffer>('batch:addPageNumbers', { pdfData, options }),

  addHeaderFooter: (pdfData, options) =>
    wrapInvoke<ArrayBuffer>('batch:addHeaderFooter', { pdfData, options }),

  // 页面基础处理
  multiMergePdfs: (filePaths) =>
    wrapInvoke<ArrayBuffer>('pdf:multiMerge', { filePaths }),

  splitPdf: (pdfData, ranges, outputDir) =>
    wrapInvoke<string[]>('pdf:split', { pdfData, ranges, outputDir }),

  selectPdfFiles: () =>
    wrapInvoke<string[]>('pdf:selectFiles', {}),

  // 批量操作进度监听
  onBatchProgress: (callback) => {
    const handler = (_: Electron.IpcRendererEvent, info: { progress: number; message: string }) => callback(info);
    ipcRenderer.on('batch:progress', handler);
    return () => ipcRenderer.removeListener('batch:progress', handler);
  },

  // 任务队列
  submitTask: (options) =>
    wrapInvoke<string>('task:submit', options),

  cancelTask: (taskId) =>
    wrapInvoke<void>('task:cancel', { taskId }),

  cancelAllTasks: () =>
    wrapInvoke<void>('task:cancelAll', {}),

  retryTask: (taskId) =>
    wrapInvoke<string | null>('task:retry', { taskId }),

  getTaskStatus: () =>
    wrapInvoke('task:getStatus', {}),

  clearCompletedTasks: () =>
    wrapInvoke<void>('task:clearCompleted', {}),

  removeTask: (taskId) =>
    wrapInvoke<void>('task:remove', { taskId }),

  selectOutputDir: () =>
    wrapInvoke<string | null>('task:selectOutput', {}),

  selectInputFiles: (extensions) =>
    wrapInvoke<string[]>('task:selectInputs', { extensions }),

  onTaskProgress: (callback) => {
    const handler = (_: Electron.IpcRendererEvent, task: TaskItemInfo) => callback(task);
    ipcRenderer.on('task:progress', handler);
    return () => ipcRenderer.removeListener('task:progress', handler);
  },

  onTaskCompleted: (callback) => {
    const handler = (_: Electron.IpcRendererEvent, task: TaskItemInfo) => callback(task);
    ipcRenderer.on('task:completed', handler);
    return () => ipcRenderer.removeListener('task:completed', handler);
  },

  // PDF 叠加
  overlayPdfs: (basePdfData, overlayPdfData, options) =>
    wrapInvoke<ArrayBuffer>('pdf:overlay', { basePdfData, overlayPdfData, options }),

  // 图片提取
  extractImages: (pdfData) =>
    wrapInvoke('pdf:extractImages', { pdfData }),

  saveExtractedImages: (images, dirPath, baseName) =>
    wrapInvoke<string[]>('pdf:saveExtractedImages', { images, dirPath, baseName }),

  // 标注移除
  detectAnnotations: (pdfData) =>
    wrapInvoke('pdf:detectAnnotations', { pdfData }),

  removeAnnotations: (pdfData, options) =>
    wrapInvoke('pdf:removeAnnotations', { pdfData, options }),

  // 元数据
  getPdfMetadata: (pdfData) =>
    wrapInvoke('pdf:getMetadata', { pdfData }),

  setPdfMetadata: (pdfData, metadata) =>
    wrapInvoke<ArrayBuffer>('pdf:setMetadata', { pdfData, metadata }),

  // 页面缩放
  resizePages: (pdfData, options) =>
    wrapInvoke<ArrayBuffer>('pdf:resizePages', { pdfData, options }),

  // N-up
  createNUp: (pdfData, options) =>
    wrapInvoke<ArrayBuffer>('pdf:nup', { pdfData, options }),

  // 签名链验证
  verifySignatureChain: (pdfData) =>
    wrapInvoke('signature:verifyChain', { pdfData }),

  // PDF Diff
  diffPdfs: (pdfDataA, pdfDataB) =>
    wrapInvoke('pdf:diff', { pdfDataA, pdfDataB }),

  // 敏感信息涂黑
  detectSensitiveInfo: (pdfData, rules) =>
    wrapInvoke('pdf:detectSensitive', { pdfData, rules }),

  redactSensitiveInfo: (pdfData, matches) =>
    wrapInvoke('pdf:redactSensitive', { pdfData, matches }),

  // 小册子
  createBooklet: (pdfData, options) =>
    wrapInvoke('pdf:booklet', { pdfData, options }),

  // 颜色替换
  detectColors: (pdfData) =>
    wrapInvoke('pdf:detectColors', { pdfData }),

  replaceColors: (pdfData, options) =>
    wrapInvoke('pdf:replaceColors', { pdfData, options }),

  // PDF 消毒
  sanitizePdf: (pdfData, options) =>
    wrapInvoke('pdf:sanitize', { pdfData, options }),

  // PDF/A 转换
  convertToPdfA: (pdfData, options) =>
    wrapInvoke('pdf:pdfaConvert', { pdfData, options }),

  // 按书签拆分
  splitByBookmarks: (pdfData, options) =>
    wrapInvoke('pdf:splitBookmarks', { pdfData, options }),

  // 反色处理
  invertColors: (pdfData, options) =>
    wrapInvoke('pdf:invertColors', { pdfData, options }),

  // 移除图片
  removeImages: (pdfData, options) =>
    wrapInvoke('pdf:removeImages', { pdfData, options }),

  // 附件管理
  listAttachments: (pdfData) =>
    wrapInvoke('pdf:listAttachments', { pdfData }),

  addAttachment: (pdfData, options) =>
    wrapInvoke('pdf:addAttachment', { pdfData, options }),

  extractAttachments: (pdfData, outputDir, names) =>
    wrapInvoke('pdf:extractAttachments', { pdfData, outputDir, names }),

  // PDF 信息 JSON
  getPdfInfoJson: (pdfData) =>
    wrapInvoke('pdf:infoJson', { pdfData }),

  // 扫描件效果
  applyScannerEffect: (pdfData, options) =>
    wrapInvoke('pdf:scannerEffect', { pdfData, options }),

  // 图片转PDF
  convertImageToPdf: (options) =>
    wrapInvoke('image:toPdf', { options }),

  // CSV 导出
  exportPdfToCsv: (pdfData, options) =>
    wrapInvoke('pdf:csvExport', { pdfData, options }),

  // 查看 JavaScript
  showPdfJavaScript: (pdfData) =>
    wrapInvoke('pdf:showJs', { pdfData }),
};

contextBridge.exposeInMainWorld('verityAPI', api);
