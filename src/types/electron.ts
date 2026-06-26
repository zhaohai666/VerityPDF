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

  // PDF 文本编辑
  PDF_EDIT_TEXT: 'pdf:editText',
  PDF_GET_TEXT_SEGMENTS: 'pdf:getTextSegments',

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

  // PDF 叠加
  PDF_OVERLAY: 'pdf:overlay',

  // 图片提取
  PDF_EXTRACT_IMAGES: 'pdf:extractImages',
  PDF_SAVE_EXTRACTED_IMAGES: 'pdf:saveExtractedImages',

  // 标注移除
  PDF_REMOVE_ANNOTATIONS: 'pdf:removeAnnotations',
  PDF_DETECT_ANNOTATIONS: 'pdf:detectAnnotations',

  // 元数据
  PDF_GET_METADATA: 'pdf:getMetadata',
  PDF_SET_METADATA: 'pdf:setMetadata',

  // 页面缩放
  PDF_RESIZE_PAGES: 'pdf:resizePages',

  // N-up
  PDF_NUP: 'pdf:nup',

  // 签名链验证
  SIGNATURE_VERIFY_CHAIN: 'signature:verifyChain',

  // PDF Diff
  PDF_DIFF: 'pdf:diff',

  // 敏感信息涂黑
  PDF_DETECT_SENSITIVE: 'pdf:detectSensitive',
  PDF_REDACT_SENSITIVE: 'pdf:redactSensitive',

  // 小册子
  PDF_BOOKLET: 'pdf:booklet',

  // 颜色替换
  PDF_DETECT_COLORS: 'pdf:detectColors',
  PDF_REPLACE_COLORS: 'pdf:replaceColors',

  // PDF 消毒
  PDF_SANITIZE: 'pdf:sanitize',

  // PDF/A 转换
  PDF_PDF_A_CONVERT: 'pdf:pdfaConvert',

  // 按书签拆分
  PDF_SPLIT_BOOKMARKS: 'pdf:splitBookmarks',

  // 反色处理
  PDF_INVERT_COLORS: 'pdf:invertColors',

  // 移除图片
  PDF_REMOVE_IMAGES: 'pdf:removeImages',

  // 附件管理
  PDF_LIST_ATTACHMENTS: 'pdf:listAttachments',
  PDF_ADD_ATTACHMENT: 'pdf:addAttachment',
  PDF_EXTRACT_ATTACHMENTS: 'pdf:extractAttachments',

  // PDF 信息 JSON
  PDF_INFO_JSON: 'pdf:infoJson',

  // 扫描件效果
  PDF_SCANNER_EFFECT: 'pdf:scannerEffect',

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

  // PDF 文本编辑
  editText(pdfData: string, options: EditTextOptions): Promise<ArrayBuffer>;
  getTextSegments(pdfData: string, page: number): Promise<PDFTextSegmentInfo[]>;

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

  // PDF 叠加
  overlayPdfs(basePdfData: string, overlayPdfData: string, options: OverlayOptions): Promise<ArrayBuffer>;

  // 图片提取
  extractImages(pdfData: string): Promise<ExtractedImageInfo[]>;
  saveExtractedImages(images: ExtractedImageInfo[], dirPath: string, baseName: string): Promise<string[]>;

  // 标注移除
  detectAnnotations(pdfData: string): Promise<AnnotationStatsInfo>;
  removeAnnotations(pdfData: string, options: RemoveAnnotationsOptions): Promise<RemoveAnnotationsResult>;

  // 元数据
  getPdfMetadata(pdfData: string): Promise<PdfMetadata>;
  setPdfMetadata(pdfData: string, metadata: PdfMetadata): Promise<ArrayBuffer>;

  // 页面缩放
  resizePages(pdfData: string, options: ResizePagesOptions): Promise<ArrayBuffer>;

  // N-up
  createNUp(pdfData: string, options: NUpOptions): Promise<ArrayBuffer>;

  // 签名链验证
  verifySignatureChain(pdfData: string): Promise<SignatureChainVerifyResult>;

  // PDF Diff
  diffPdfs(pdfDataA: string, pdfDataB: string): Promise<PdfDiffResult>;

  // 敏感信息涂黑
  detectSensitiveInfo(pdfData: string, rules: SensitiveRule[]): Promise<SensitiveDetectResult>;
  redactSensitiveInfo(pdfData: string, matches: SensitiveMatch[]): Promise<SensitiveRedactResult>;

  // 小册子
  createBooklet(pdfData: string, options: BookletOptions): Promise<BookletResult>;

  // 颜色替换
  detectColors(pdfData: string): Promise<ColorUsage[]>;
  replaceColors(pdfData: string, options: ColorReplaceOptions): Promise<ColorReplaceResult>;

  // PDF 消毒
  sanitizePdf(pdfData: string, options: SanitizeOptions): Promise<SanitizeResult>;

  // PDF/A 转换
  convertToPdfA(pdfData: string, options: PdfAConvertOptions): Promise<PdfAConvertResult>;

  // 按书签拆分
  splitByBookmarks(pdfData: string, options: SplitByBookmarksOptions): Promise<SplitByBookmarksResult>;

  // 反色处理
  invertColors(pdfData: string, options: InvertColorsOptions): Promise<InvertColorsResult>;

  // 移除图片
  removeImages(pdfData: string, options: RemoveImagesOptions): Promise<RemoveImagesResult>;

  // 附件管理
  listAttachments(pdfData: string): Promise<AttachmentInfo[]>;
  addAttachment(pdfData: string, options: AddAttachmentOptions): Promise<ArrayBuffer>;
  extractAttachments(pdfData: string, outputDir: string, names?: string[]): Promise<string[]>;

  // PDF 信息 JSON
  getPdfInfoJson(pdfData: string): Promise<PdfInfoJsonResult>;

  // 扫描件效果
  applyScannerEffect(pdfData: string, options: ScannerEffectOptions): Promise<ScannerEffectResult>;
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

/** PDF 文本编辑选项 */
export type EditTextOptions =
  | { action: 'replace'; page: number; segmentIndex: number; newText: string }
  | { action: 'delete'; page: number; segmentIndices: number[] }
  | { action: 'style'; page: number; segmentIndex: number; fontSize?: number; color?: string };

/** PDF 文本段信息（前端显示用） */
export interface PDFTextSegmentInfo {
  index: number;
  text: string;
  fontName: string;
  fontSize: number;
  page: number;
  position: { x: number; y: number };
}

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

// ========== 新功能类型定义 ==========

/** PDF 叠加选项 */
export interface OverlayOptions {
  mode: 'background' | 'foreground';
  opacity: number;
  scale: 'fit' | 'stretch' | 'original';
  pageIndices?: number[];
}

/** 提取的图片信息 */
export interface ExtractedImageInfo {
  pageIndex: number;
  imageIndex: number;
  width: number;
  height: number;
  bitsPerComponent: number;
  colorSpace: string;
  filter: string;
  format: 'jpeg' | 'png' | 'raw';
  /** base64 编码的图片数据 */
  data: string;
}

/** 标注统计信息 */
export interface AnnotationStatsInfo {
  total: number;
  byType: Record<string, number>;
  byPage: Record<number, number>;
}

/** 删除标注选项 */
export interface RemoveAnnotationsOptions {
  removeAll: boolean;
  types?: string[];
  pageIndices?: number[];
  preserveSignatures?: boolean;
}

/** 删除标注结果 */
export interface RemoveAnnotationsResult {
  removedCount: number;
  remainingCount: number;
  pdfData: ArrayBuffer;
}

/** PDF 元数据 */
export interface PdfMetadata {
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string[];
  creator?: string;
  producer?: string;
  creationDate?: string;
  modificationDate?: string;
}

/** 页面缩放选项 */
export interface ResizePagesOptions {
  targetSize: string | { width: number; height: number };
  scaleMode: 'fit' | 'stretch' | 'crop';
  pageIndices?: number[];
}

/** N-up 选项 */
export interface NUpOptions {
  layout: '2x1' | '1x2' | '2x2' | '3x3' | '4x4';
  pageSize?: string | { width: number; height: number };
  margin?: number;
  border?: boolean;
  order?: 'row' | 'column';
}

/** 证书链项 */
export interface ChainCertInfo {
  subject: string;
  issuer: string;
  serialNumber: string;
  validFrom: string;
  validTo: string;
  fingerprint: string;
  isExpired: boolean;
  isSelfSigned: boolean;
  issuedByPrevious: boolean;
}

/** 签名链验证结果 */
export interface SignatureChainVerifyResult {
  isSigned: boolean;
  isValid: boolean;
  documentIntact: boolean;
  signatures: Array<{
    signer?: string;
    timestamp?: string;
    hashAlgorithm?: string;
    certificateChain: ChainCertInfo[];
    isValid: boolean;
    message: string;
  }>;
  overallMessage: string;
}

// ========== 新功能类型定义（第二批） ==========

/** Diff 行类型 */
export type DiffLineType = 'equal' | 'added' | 'removed';

/** Diff 行结果 */
export interface DiffLine {
  type: DiffLineType;
  lineA: number;
  lineB: number;
  text: string;
}

/** Diff 统计 */
export interface DiffStats {
  totalLinesA: number;
  totalLinesB: number;
  addedCount: number;
  removedCount: number;
  equalCount: number;
  changeRatio: number;
}

/** PDF Diff 结果 */
export interface PdfDiffResult {
  diffs: DiffLine[];
  stats: DiffStats;
  pagesA: number;
  pagesB: number;
}

/** 敏感信息规则 */
export interface SensitiveRule {
  name: string;
  pattern: string;
  enabled: boolean;
  description?: string;
}

/** 敏感信息匹配 */
export interface SensitiveMatch {
  id: string;
  page: number;
  text: string;
  ruleName: string;
  rect: { x: number; y: number; width: number; height: number };
}

/** 敏感信息检测结果 */
export interface SensitiveDetectResult {
  matches: SensitiveMatch[];
  rulesUsed: string[];
  pagesScanned: number;
}

/** 敏感信息涂黑结果 */
export interface SensitiveRedactResult {
  pdfData: ArrayBuffer;
  redactedCount: number;
}

/** 小册子选项 */
export interface BookletOptions {
  binding: 'left' | 'right';
  pagesPerSheet: 2 | 4;
  addBlankPages: boolean;
}

/** 小册子结果 */
export interface BookletResult {
  pdfData: ArrayBuffer;
  totalPages: number;
  totalSheets: number;
  addedBlankPages: number;
  pageOrder: number[];
}

/** 颜色使用情况 */
export interface ColorUsage {
  colorSpace: 'rgb' | 'cmyk' | 'gray';
  values: number[];
  count: number;
  pages: number[];
  usage: 'f' | 's' | 'b';
  hex: string;
}

/** 颜色替换规则 */
export interface ColorReplaceRule {
  oldColor: string;
  newColor: string;
  colorSpace: 'rgb' | 'cmyk' | 'gray';
  tolerance: number;
}

/** 颜色替换选项 */
export interface ColorReplaceOptions {
  rules: ColorReplaceRule[];
  tolerance: number;
  pageIndices?: number[];
}

/** 颜色替换结果 */
export interface ColorReplaceResult {
  pdfData: ArrayBuffer;
  replacedCount: number;
  pagesProcessed: number;
}

// ========== 新功能类型定义（第三批） ==========

/** PDF 消毒选项 */
export interface SanitizeOptions {
  removeMetadata: boolean;
  removeJavaScript: boolean;
  removeEmbeddedFiles: boolean;
  removeXmp: boolean;
  removeDocumentInfo: boolean;
}

/** PDF 消毒结果 */
export interface SanitizeResult {
  pdfData: ArrayBuffer;
  removedItems: string[];
  cleanedCount: number;
}

/** PDF/A 转换选项 */
export interface PdfAConvertOptions {
  conformance: 'pdfa-1b' | 'pdfa-2b' | 'pdfa-3b';
  includeXmp: boolean;
}

/** PDF/A 转换结果 */
export interface PdfAConvertResult {
  pdfData: ArrayBuffer;
  conformance: string;
  message: string;
}

/** 按书签拆分选项 */
export interface SplitByBookmarksOptions {
  /** 拆分级别: 'top' = 仅顶级书签, 'all' = 所有书签 */
  level: 'top' | 'all';
  /** 输出目录路径 */
  outputDir: string;
}

/** 书签条目 */
export interface BookmarkEntry {
  title: string;
  pageIndex: number;
  level: number;
}

/** 按书签拆分结果 */
export interface SplitByBookmarksResult {
  outputFiles: string[];
  bookmarks: BookmarkEntry[];
  splitCount: number;
}

/** 反色处理选项 */
export interface InvertColorsOptions {
  /** 要反色的页面索引，不指定则全部 */
  pageIndices?: number[];
}

/** 反色处理结果 */
export interface InvertColorsResult {
  pdfData: ArrayBuffer;
  processedPages: number;
}

/** 移除图片选项 */
export interface RemoveImagesOptions {
  /** 要处理的页面索引，不指定则全部 */
  pageIndices?: number[];
}

/** 移除图片结果 */
export interface RemoveImagesResult {
  pdfData: ArrayBuffer;
  removedCount: number;
  pagesProcessed: number;
}

/** 附件信息 */
export interface AttachmentInfo {
  name: string;
  description: string;
  size: number;
  creationDate?: string;
  modificationDate?: string;
}

/** 添加附件选项 */
export interface AddAttachmentOptions {
  name: string;
  data: string; // base64
  description?: string;
}

/** PDF 信息 JSON 结果 */
export interface PdfInfoJsonResult {
  info: Record<string, unknown>;
  metadata: Record<string, unknown>;
  pageCount: number;
  bookmarks: BookmarkEntry[];
  attachments: AttachmentInfo[];
  fonts: string[];
  images: number;
  formFields: number;
}

/** 扫描件效果选项 */
export interface ScannerEffectOptions {
  dpi: number;
  grayscale: boolean;
  contrast: number;
  brightness: number;
  addNoise: boolean;
  deskew: boolean;
}

/** 扫描件效果结果 */
export interface ScannerEffectResult {
  pdfData: ArrayBuffer;
  processedPages: number;
}
