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
  PDF_REPAIR: 'pdf:repair',

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
  ENCRYPT_DECRYPT: 'encrypt:decrypt',
  ENCRYPT_CHECK_QPDF: 'encrypt:checkQpdf',

  // 压缩
  COMPRESS_CHECK_GS: 'compress:checkGs',
  COMPRESS_SMART: 'compress:smart',

  // 密文擦除
  REDACT_APPLY: 'redact:apply',

  // 表单
  FORM_DETECT: 'form:detect',
  FORM_FILL: 'form:fill',
  FORM_FLATTEN: 'form:flatten',

  // 签名
  SIGNATURE_SIGN: 'signature:sign',
  SIGNATURE_VERIFY: 'signature:verify',
  SIGNATURE_LOAD_CERT: 'signature:loadCert',
  SIGNATURE_PADES: 'signature:signPades',
  SIGNATURE_VERIFY_PADES: 'signature:verifyPades',

  // 格式转换
  CONVERT_CHECK: 'convert:check',
  CONVERT_FILE: 'convert:file',
  CONVERT_BATCH: 'convert:batch',
  CONVERT_TO_PDF: 'convert:toPdf',
  CONVERT_SELECT_FILES: 'convert:selectFiles',

  // 批量页面操作
  BATCH_PAGE_OPERATE: 'batch:pageOperate',
  BATCH_DETECT_BLANK: 'batch:detectBlank',
  BATCH_CROP: 'batch:crop',
  BATCH_ADD_WATERMARK: 'batch:addWatermark',
  BATCH_ADD_PAGE_NUMBERS: 'batch:addPageNumbers',
  BATCH_ADD_HEADER_FOOTER: 'batch:addHeaderFooter',
  BATCH_PROGRESS: 'batch:progress',

  // 页面基础处理
  PDF_MULTI_MERGE: 'pdf:multiMerge',
  PDF_SPLIT: 'pdf:split',
  PDF_SELECT_FILES: 'pdf:selectFiles',

  // 任务队列
  TASK_SUBMIT: 'task:submit',
  TASK_CANCEL: 'task:cancel',
  TASK_CANCEL_ALL: 'task:cancelAll',
  TASK_RETRY: 'task:retry',
  TASK_GET_STATUS: 'task:getStatus',
  TASK_CLEAR_COMPLETED: 'task:clearCompleted',
  TASK_REMOVE: 'task:remove',
  TASK_PROGRESS: 'task:progress',
  TASK_COMPLETED: 'task:completed',
  TASK_SELECT_OUTPUT: 'task:selectOutput',
  TASK_SELECT_INPUTS: 'task:selectInputs',

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
  RENDERER_RECOVERED: 'app:rendererRecovered',
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
  onRendererRecovered(callback: (info: { crashReason: string; reloadAttempt: number }) => void): () => void;

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
  removeEncryption(pdfData: string, password?: string): Promise<ArrayBuffer>;
  decryptWithPassword(pdfData: string, password: string): Promise<ArrayBuffer>;
  checkQpdf(): Promise<{ available: boolean; version?: string }>;

  // 压缩
  checkGhostscript(): Promise<{ available: boolean; version?: string }>;
  smartCompress(pdfData: string, options: SmartCompressOptions): Promise<ArrayBuffer>;

  // 密文擦除
  redactPdf(pdfData: string, rects: RedactionRect[]): Promise<ArrayBuffer>;

  // 表单
  detectFormFields(pdfData: string): Promise<FormFieldInfo[]>;
  fillFormFields(pdfData: string, values: Record<string, string | boolean>): Promise<ArrayBuffer>;
  flattenForm(pdfData: string): Promise<ArrayBuffer>;

  // 签名
  signPDF(pdfData: string, options: SignatureOptions): Promise<unknown>;
  verifySignature(pdfData: string): Promise<unknown>;
  loadCertificate(p12Path: string, password: string): Promise<unknown>;
  signPades(pdfData: string, options: PadesSignOptions): Promise<SignatureResult>;
  verifyPades(pdfData: string): Promise<VerifyResult>;

  // 格式转换
  checkLibreOffice(): Promise<{ available: boolean; version?: string; path: string }>;
  convertFile(inputPath: string, options: ConvertOptions): Promise<ConvertResult>;
  batchConvert(inputPaths: string[], options: ConvertOptions): Promise<BatchConvertResult>;
  convertToPDF(inputPath: string, outputDir: string): Promise<ConvertResult>;
  selectConvertFiles(extensions: string[]): Promise<string[]>;

  // PDF 修复
  repairPDF(filePath: string): Promise<ArrayBuffer>;

  // 批量页面操作
  batchRotate(pdfData: string, options: BatchRotateOptions): Promise<ArrayBuffer>;
  detectBlankPages(filePath: string, threshold: number): Promise<{ blankIndices: number[]; totalChecked: number }>;
  batchCrop(pdfData: string, options: BatchCropOptions): Promise<ArrayBuffer>;

  // 水印/页码/页眉页脚
  addWatermark(pdfData: string, options: WatermarkOptions): Promise<ArrayBuffer>;
  addPageNumbers(pdfData: string, options: PageNumberOptions): Promise<ArrayBuffer>;
  addHeaderFooter(pdfData: string, options: HeaderFooterOptions): Promise<ArrayBuffer>;

  // 批量操作进度监听
  onBatchProgress(callback: (info: { progress: number; message: string }) => void): () => void;

  // 页面基础处理
  multiMergePdfs(filePaths: string[]): Promise<ArrayBuffer>;
  splitPdf(pdfData: string, ranges: string[], outputDir: string): Promise<string[]>;
  selectPdfFiles(): Promise<string[]>;

  // 任务队列
  submitTask(options: TaskSubmitOptions): Promise<string>;
  cancelTask(taskId: string): Promise<void>;
  cancelAllTasks(): Promise<void>;
  retryTask(taskId: string): Promise<string | null>;
  getTaskStatus(): Promise<TaskQueueStatus>;
  clearCompletedTasks(): Promise<void>;
  removeTask(taskId: string): Promise<void>;
  selectOutputDir(): Promise<string | null>;
  selectInputFiles(extensions: string[]): Promise<string[]>;
  onTaskProgress(callback: (task: TaskItemInfo) => void): () => void;
  onTaskCompleted(callback: (task: TaskItemInfo) => void): () => void;
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

/** 智能压缩选项 */
export interface SmartCompressOptions {
  preset?: 'minimum' | 'balanced' | 'highQuality';
  imageDpi?: number;
  imageQuality?: number;
  grayscale?: boolean;
  removeMetadata?: boolean;
  fontSubset?: boolean;
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

/** PAdES 签名选项 */
export interface PadesSignOptions {
  signerName: string;
  reason: string;
  location: string;
  contactInfo?: string;
  p12Path?: string;
  p12Password?: string;
  visibleSignature?: {
    page: number;
    rect: { x: number; y: number; width: number; height: number };
    appearanceImage?: string;  // base64 PNG
    showTimestamp: boolean;
  };
}

/** 签名结果 */
export interface SignatureResult {
  signedPdf: ArrayBuffer;
  signatureInfo: {
    signer: string;
    timestamp: string;
    hashAlgorithm: string;
    certificateInfo: CertificateInfo;
  };
}

/** 证书信息 */
export interface CertificateInfo {
  subject: string;
  issuer: string;
  serialNumber: string;
  validFrom: string;
  validTo: string;
  fingerprint: string;
}

/** 签名验证结果 */
export interface VerifyResult {
  isSigned: boolean;
  isValid: boolean;
  signer?: string;
  timestamp?: string;
  certificateInfo?: CertificateInfo;
  documentIntact: boolean;
  message: string;
}

/** 擦除矩形（PDF 点坐标） */
export interface RedactionRect {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
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

/** 批量旋转选项 */
export interface BatchRotateOptions {
  pageIndices: number[];
  angle: 90 | 180 | 270;
}

/** 批量裁剪选项 */
export interface BatchCropOptions {
  pageIndices: number[];
  margin: { top: number; right: number; bottom: number; left: number };
}

/** 水印选项 */
export interface WatermarkOptions {
  type: 'text' | 'image';
  content: string;
  opacity: number;
  rotation: number;
  fontSize?: number;
  fontFamily?: string;
  color?: string;
  position?: 'center' | 'tile';
  tileSpacing?: number;
  pageIndices?: number[];
}

/** 页码选项 */
export interface PageNumberOptions {
  position: 'bottom-center' | 'bottom-right' | 'bottom-left' | 'top-center' | 'top-right' | 'top-left';
  style: 'arabic' | 'roman' | 'dash' | 'of-total';
  fontSize: number;
  fontFamily?: string;
  color?: string;
  startIndex: number;
  pageIndices?: number[];
}

/** 页眉页脚选项 */
export interface HeaderFooterOptions {
  headerText?: string;
  footerText?: string;
  fontSize: number;
  fontFamily?: string;
  color?: string;
  pageIndices?: number[];
}

// ========== 任务队列类型 ==========

/** 任务类型 */
export type TaskType = 'convert' | 'watermark' | 'encrypt' | 'compress' | 'pipeline';

/** 工作流步骤 */
export interface PipelineStep {
  type: 'watermark' | 'encrypt' | 'compress' | 'convert' | 'rotate' | 'pageNumbers';
  options: Record<string, unknown>;
  label: string;
}

/** 工作流模板 */
export interface WorkflowTemplate {
  id: string;
  name: string;
  steps: PipelineStep[];
  createdAt: number;
  updatedAt: number;
}

/** 提交任务参数 */
export interface TaskSubmitOptions {
  type: TaskType;
  filePaths: string[];
  outputDir: string;
  label: string;
  options?: Record<string, unknown>;
  pipelineSteps?: PipelineStep[];
}

/** 任务项信息 */
export interface TaskItemInfo {
  id: string;
  type: TaskType;
  label: string;
  filePath: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  message: string;
  error?: string;
  startTime?: number;
  endTime?: number;
}

/** 队列状态 */
export interface TaskQueueStatus {
  tasks: TaskItemInfo[];
  running: boolean;
  activeCount: number;
  completedCount: number;
  failedCount: number;
}
