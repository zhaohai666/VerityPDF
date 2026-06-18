/** Electron IPC 通道定义 */
export const IPC_CHANNELS = {
  // 文件操作
  FILE_OPEN: 'file:open',
  FILE_SAVE: 'file:save',
  FILE_READ: 'file:read',
  FILE_DIALOG: 'file:dialog',
  FILE_RECENT: 'file:recent',

  // PDF 操作
  PDF_LOAD: 'pdf:load',
  PDF_GET_INFO: 'pdf:getInfo',

  // 标注操作
  ANNOTATION_SAVE: 'annotation:save',
  ANNOTATION_LOAD: 'annotation:load',

  // 导出
  EXPORT_MERGE: 'export:merge',
  EXPORT_IMAGES: 'export:images',

  // 页面管理
  PAGE_EXTRACT: 'page:extract',
  PAGE_MANIPULATE: 'page:manipulate',

  // 加密
  ENCRYPT_APPLY: 'encrypt:apply',
  ENCRYPT_REMOVE: 'encrypt:remove',

  // 表单
  FORM_DETECT: 'form:detect',
  FORM_FILL: 'form:fill',
  FORM_FLATTEN: 'form:flatten',

  // 签名
  SIGNATURE_SIGN: 'signature:sign',
  SIGNATURE_VERIFY: 'signature:verify',
  SIGNATURE_LOAD_CERT: 'signature:loadCert',

  // 格式转换
  CONVERT_CHECK: 'convert:check',
  CONVERT_FILE: 'convert:file',
  CONVERT_BATCH: 'convert:batch',
  CONVERT_TO_PDF: 'convert:toPdf',
  CONVERT_SELECT_FILES: 'convert:selectFiles',

  // 应用
  APP_VERSION: 'app:getVersion',
  APP_PLATFORM: 'app:getPlatform',

  // 窗口
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_MAXIMIZE: 'window:maximize',
  WINDOW_CLOSE: 'window:close',
  WINDOW_TITLE: 'window:setTitle',

  // 更新
  UPDATE_CHECK: 'update:check',

  // 菜单事件 (Main → Renderer)
  MENU_ACTION: 'menu:action',
  FILE_OPENED: 'file:opened',
  BEFORE_CLOSE: 'app:beforeClose',
} as const;

/** IPC 通道类型 */
export type IPCChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

/** 文件对话框参数 */
export interface FileDialogOptions {
  type: 'open' | 'save';
  filters?: Array<{ name: string; extensions: string[] }>;
  defaultPath?: string;
}

/** 更新信息 */
export interface UpdateInfo {
  hasUpdate: boolean;
  version?: string;
  releaseNotes?: string;
}

/** Preload 暴露的安全 API */
export interface VerityAPI {
  // 文件操作
  openFile(): Promise<string | null>;
  saveFile(data: string, defaultPath: string): Promise<boolean>;
  readFile(filePath: string): Promise<ArrayBuffer>;

  // 对话框
  showDialog(options: FileDialogOptions): Promise<string | null>;

  // 应用信息
  getVersion(): string;
  getPlatform(): string;

  // 窗口控制
  minimizeWindow(): void;
  maximizeWindow(): void;
  closeWindow(): void;
  setWindowTitle(title: string): void;

  // 事件监听
  onMenuAction(callback: (action: string) => void): () => void;
  onFileOpen(callback: (filePath: string) => void): () => void;
  onBeforeClose(callback: () => Promise<boolean>): () => void;

  // 更新
  checkForUpdates(): Promise<UpdateInfo>;

  // 获取测试文件路径
  getTestFile(): Promise<string | null>;

  // PDF 导出（带标注）
  exportPDF(pdfData: string, annotations: unknown[], defaultName?: string): Promise<string | null>;

  // 图片导出
  exportImages(images: Array<{ pageNumber: number; base64: string; format: string }>, dirPath: string, baseName: string): Promise<string[]>;

  // 页面管理
  extractPages(pdfData: string, pageIndices: number[]): Promise<string | null>;
  manipulatePages(pdfData: string, operation: PageOperation): Promise<ArrayBuffer>;

  // 加密
  applyEncryption(pdfData: string, options: EncryptionOptions): Promise<ArrayBuffer>;
  removeEncryption(pdfData: string): Promise<ArrayBuffer>;

  // 表单
  detectFormFields(pdfData: string): Promise<FormFieldInfo[]>;
  fillFormFields(pdfData: string, values: Record<string, string | boolean>): Promise<ArrayBuffer>;
  flattenForm(pdfData: string): Promise<ArrayBuffer>;

  // 签名
  signPDF(pdfData: string, options: SignatureOptions): Promise<unknown>;
  verifySignature(pdfData: string): Promise<unknown>;
  loadCertificate(p12Path: string, password: string): Promise<unknown>;

  // 格式转换
  checkLibreOffice(): Promise<{ available: boolean; version?: string; path: string }>;
  convertFile(inputPath: string, options: ConvertOptions): Promise<ConvertResult>;
  batchConvert(inputPaths: string[], options: ConvertOptions): Promise<BatchConvertResult>;
  convertToPDF(inputPath: string, outputDir: string): Promise<ConvertResult>;
  selectConvertFiles(extensions: string[]): Promise<string[]>;
}

/** 页面操作类型 */
export type PageOperation =
  | { type: 'delete'; pageIndices: number[] }
  | { type: 'reorder'; pageIndices: number[] }
  | { type: 'insertBlank'; afterIndex: number; count: number; width?: number; height?: number }
  | { type: 'merge'; secondPdfData: string; insertAfterIndex: number };

/** 加密选项 */
export interface EncryptionOptions {
  userPassword: string;
  ownerPassword: string;
  permissions: {
    print: boolean;
    copy: boolean;
    modify: boolean;
    annotate: boolean;
    fillForms: boolean;
    extract: boolean;
  };
}

/** 表单字段信息 */
export interface FormFieldInfo {
  name: string;
  type: 'text' | 'checkbox' | 'dropdown' | 'radio' | 'unknown';
  value: string | boolean;
  options?: string[];
  readOnly: boolean;
  required: boolean;
  page: number;
  rect?: { x: number; y: number; width: number; height: number };
}

/** 签名选项 */
export interface SignatureOptions {
  signerName: string;
  reason: string;
  location: string;
  p12Path?: string;
  p12Password?: string;
}

/** 格式转换选项 */
export interface ConvertOptions {
  targetFormat: string;
  outputDir: string;
  imageDpi?: number;
  jpegQuality?: number;
}

/** 转换结果 */
export interface ConvertResult {
  outputPath: string;
  format: string;
  fileSize: number;
  success: boolean;
  message: string;
}

/** 批量转换结果 */
export interface BatchConvertResult {
  results: ConvertResult[];
  totalFiles: number;
  successCount: number;
  failCount: number;
}
