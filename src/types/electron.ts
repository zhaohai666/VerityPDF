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

  // 图片转PDF
  IMAGE_TO_PDF: 'image:toPdf',

  // CSV 导出
  PDF_CSV_EXPORT: 'pdf:csvExport',

  // 查看 JavaScript
  PDF_SHOW_JS: 'pdf:showJs',

  // 图片编辑
  IMAGE_EDIT_EXTRACT: 'image:extractPage',
  IMAGE_EDIT_REPLACE: 'image:replace',
  IMAGE_EDIT_LAYOUT: 'image:getLayout',

  // 超链接注释
  HYPERLINK_LIST: 'hyperlink:list',
  HYPERLINK_ADD: 'hyperlink:add',
  HYPERLINK_EDIT: 'hyperlink:edit',
  HYPERLINK_REMOVE: 'hyperlink:remove',

  // 书签编辑
  BOOKMARK_GET: 'bookmark:get',
  BOOKMARK_EDIT: 'bookmark:edit',
  BOOKMARK_SET: 'bookmark:set',

  // 图片编辑增强
  IMAGE_EDIT_ROTATE: 'image:rotate',
  IMAGE_EDIT_CROP: 'image:crop',
  IMAGE_EDIT_SCALE: 'image:scale',
  IMAGE_EDIT_FILTER: 'image:filter',
  IMAGE_EDIT_FILTER_ALL: 'image:filterAll',

  // 脚本引擎
  SCRIPT_EXECUTE: 'script:execute',
  SCRIPT_VALIDATE: 'script:validate',
  SCRIPT_STATS: 'script:stats',

  // 多人协作
  COLLAB_START: 'collab:start',
  COLLAB_STOP: 'collab:stop',
  COLLAB_STATUS: 'collab:status',
  COLLAB_CREATE_ROOM: 'collab:createRoom',
  COLLAB_DELETE_ROOM: 'collab:deleteRoom',
  COLLAB_LIST_ROOMS: 'collab:listRooms',
  COLLAB_GET_ROOM: 'collab:getRoom',
  COLLAB_JOIN_ROOM: 'collab:joinRoom',
  COLLAB_LEAVE_ROOM: 'collab:leaveRoom',
  COLLAB_ANNOTATE: 'collab:annotate',
  COLLAB_CURSOR: 'collab:cursor',
  COLLAB_SYNC: 'collab:sync',

  // REST API
  REST_API_START: 'rest-api:start',
  REST_API_STOP: 'rest-api:stop',
  REST_API_STATUS: 'rest-api:status',
  REST_API_CONFIG: 'rest-api:config',
  REST_API_UPDATE_CONFIG: 'rest-api:updateConfig',
  REST_API_GENERATE_KEY: 'rest-api:generateKey',
  REST_API_REVOKE_KEY: 'rest-api:revokeKey',
  REST_API_LIST_KEYS: 'rest-api:listKeys',

  // 字体管理
  FONT_LIST_FAMILIES: 'font:listFamilies',
  FONT_GET_INFO: 'font:getInfo',
  FONT_GET_PATH: 'font:getPath',
  FONT_REGISTER: 'font:register',
  FONT_REGISTER_FAMILY: 'font:registerFamily',
  FONT_VERIFY_INTEGRITY: 'font:verifyIntegrity',
  FONT_GET_AVAILABLE: 'font:getAvailable',
  FONT_EXPORT: 'font:export',

  // 审计日志
  AUDIT_INITIALIZE: 'audit:initialize',
  AUDIT_LOG: 'audit:log',
  AUDIT_QUERY: 'audit:query',
  AUDIT_VERIFY_INTEGRITY: 'audit:verifyIntegrity',
  AUDIT_GET_STATS: 'audit:getStats',
  AUDIT_EXPORT: 'audit:export',
  AUDIT_CLOSE: 'audit:close',

  // PDF/A 验证
  PDFA_VALIDATE: 'pdfa:validate',
  PDFA_CHECK_GS: 'pdfa:checkGs',
  PDFA_CHECK_VERAPDF: 'pdfa:checkVeraPdf',

  // 国密算法 (SM-crypto)
  SM2_GENERATE_KEY_PAIR: 'sm2:generateKeyPair',
  SM2_SIGN: 'sm2:sign',
  SM2_VERIFY: 'sm2:verify',
  SM2_ENCRYPT: 'sm2:encrypt',
  SM2_DECRYPT: 'sm2:decrypt',
  SM3_HASH: 'sm3:hash',
  SM4_GENERATE_KEY: 'sm4:generateKey',
  SM4_ENCRYPT: 'sm4:encrypt',
  SM4_DECRYPT: 'sm4:decrypt',
  SM4_ENCRYPT_FILE: 'sm4:encryptFile',
  SM4_DECRYPT_FILE: 'sm4:decryptFile',

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

  // 图片转PDF
  convertImageToPdf(options: ImageToPdfOptions): Promise<ImageToPdfResult>;

  // CSV 导出
    exportPdfToCsv(pdfData: string, options: {
        delimiter: string;
        detectHeaders: boolean;
        rowDetectionTolerance: number;
        columnDetectionMode: string;
        includePageNumber: boolean;
        includeCoordinates: boolean;
        pages: undefined | string
    }): Promise<CsvExportResult>;

  // 查看 JavaScript
  showPdfJavaScript(pdfData: string): Promise<ShowJsResult>;

  // 图片编辑
  extractPageImages(pdfData: string, pageIndex: number): Promise<PageImageInfo[]>;
  replacePageImage(pdfData: string, pageIndex: number, imageRef: string, newImageBase64: string, format: 'png' | 'jpeg'): Promise<ReplaceImageResult>;
  getPageImageLayout(pdfData: string, pageIndex: number): Promise<ImageLayoutItem[]>;

  // 超链接注释
  listHyperlinks(pdfData: string): Promise<HyperlinkAnnotationInfo[]>;
  addHyperlink(pdfData: string, link: HyperlinkAnnotation): Promise<ArrayBuffer>;
  editHyperlink(pdfData: string, pageIndex: number, annotIndex: number, updates: Partial<HyperlinkAnnotation>): Promise<ArrayBuffer>;
  removeHyperlink(pdfData: string, pageIndex: number, annotIndex: number): Promise<ArrayBuffer>;

  // 书签编辑
  getBookmarks(pdfData: string): Promise<BookmarkItem[]>;
  editBookmark(pdfData: string, edit: BookmarkEdit): Promise<ArrayBuffer>;
  setBookmarks(pdfData: string, bookmarks: BookmarkItem[]): Promise<ArrayBuffer>;

  // 图片编辑增强
  rotateImage(pdfData: string, pageIndex: number, imageRef: string, angle: number): Promise<ReplaceImageResult>;
  cropImage(pdfData: string, pageIndex: number, imageRef: string, cropRect: ImageCropRect): Promise<ReplaceImageResult>;
  scaleImage(pdfData: string, pageIndex: number, imageRef: string, scale: number): Promise<ReplaceImageResult>;
  applyImageFilter(pdfData: string, pageIndex: number, imageRef: string, filter: ImageFilterType, value?: number): Promise<ReplaceImageResult>;
  applyFilterToAllImages(pdfData: string, pageIndex: number, filter: ImageFilterType, value?: number): Promise<ReplaceImageResult>;

  // 脚本引擎
  executeScript(code: string, options?: ScriptOptions): Promise<ScriptResult>;
  validateScript(code: string): Promise<{ valid: boolean; error?: string }>;
  getScriptStats(): Promise<ScriptEngineStats>;

  // 多人协作
  startCollab(port?: number): Promise<number>;
  stopCollab(): Promise<void>;
  getCollabStatus(): Promise<CollabStatus>;
  createCollabRoom(name: string, documentHash?: string): Promise<CollabRoomInfo>;
  deleteCollabRoom(roomId: string): Promise<boolean>;
  listCollabRooms(): Promise<CollabRoomInfo[]>;
  getCollabRoom(roomId: string): Promise<CollabRoomDetail | null>;
  joinCollabRoom(options: CollabJoinOptions): Promise<CollabUser>;
  leaveCollabRoom(roomId: string, userId: string): Promise<boolean>;
  addCollabAnnotation(roomId: string, annotation: Omit<CollabAnnotation, 'id' | 'timestamp' | 'deleted'>): Promise<CollabAnnotation>;
  updateCollabCursor(cursor: CollabCursorPosition, userId: string, roomId: string): Promise<boolean>;
  syncCollabData(roomId: string): Promise<{ annotations: CollabAnnotation[]; users: CollabUser[] }>;

  // REST API
  startRestApi(config?: Partial<RestApiConfig>): Promise<number>;
  stopRestApi(): Promise<void>;
  getRestApiStatus(): Promise<RestApiStatus>;
  getRestApiConfig(): Promise<Readonly<RestApiConfig>>;
  updateRestApiConfig(updates: Partial<RestApiConfig>): Promise<void>;
  generateRestApiKey(label: string): Promise<ApiKeyInfo>;
  revokeRestApiKey(key: string): Promise<boolean>;
  listRestApiKeys(): Promise<ApiKeyInfo[]>;

  // 高级表单
  getFormFieldDetails(pdfData: string): Promise<EnhancedFormFieldInfo[]>;
  detectFormXFA(pdfData: string): Promise<XFADetectResult>;
  getFieldActions(pdfData: string, fieldName: string): Promise<FieldActionScripts>;

  // 国密算法 (SM-crypto)
  sm2GenerateKeyPair(): Promise<SM2KeyPair>;
  sm2Sign(data: string, privateKey: string, publicKey?: string, der?: boolean, userId?: string): Promise<SM2SignatureResult>;
  sm2Verify(data: string, signature: string, publicKey: string, der?: boolean, userId?: string): Promise<SM2VerifyResult>;
  sm2Encrypt(data: string, publicKey: string, cipherMode?: number): Promise<string>;
  sm2Decrypt(cipherText: string, privateKey: string, cipherMode?: number): Promise<string>;
  sm3Hash(data: string, key?: string): Promise<string>;
  sm4GenerateKey(): Promise<string>;
  sm4Encrypt(data: string, key: string, mode?: 'ecb' | 'cbc', iv?: string): Promise<string>;
  sm4Decrypt(cipherText: string, key: string, mode?: 'ecb' | 'cbc', iv?: string): Promise<string>;
  sm4EncryptFile(pdfData: string, key: string, iv?: string): Promise<string>;
  sm4DecryptFile(cipherText: string, key: string, iv?: string): Promise<string>;

  // 字体管理
  listFontFamilies(): Promise<FontFamilyInfo[]>;
  getFontInfo(family: string, weight: FontWeight): Promise<FontInfo>;
  getFontPath(family: string, weight: FontWeight): Promise<string | null>;
  registerFont(family: string, weight: FontWeight): Promise<boolean>;
  registerFontFamily(family: string): Promise<{ registered: number; failed: number }>;
  verifyFontIntegrity(family: string, weight: FontWeight): Promise<boolean>;
  getAvailableFonts(): Promise<FontInfo[]>;
  exportFonts(targetDir: string, family?: string): Promise<string[]>;

  // 审计日志
  initializeAuditLog(): Promise<void>;
  auditLog(action: AuditAction, options?: AuditLogOptions): Promise<AuditLogEntry>;
  queryAuditLog(query?: AuditLogQuery): Promise<AuditLogEntry[]>;
  verifyAuditIntegrity(): Promise<IntegrityCheckResult>;
  getAuditStats(): Promise<AuditLogStats>;
  exportAuditLogs(format?: 'json' | 'csv'): Promise<string>;
  closeAuditLog(): Promise<void>;

  // PDF/A 验证
  validatePdfA(pdfData: string, flavour?: '1b' | '2b' | '3b'): Promise<PdfAValidationResult>;
  checkPdfAGhostscript(): Promise<{ available: boolean; version?: string }>;
  checkPdfAVeraPdf(): Promise<{ available: boolean; version?: string }>;
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
  algorithm?: EncryptionAlgorithm;
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
  algorithm?: SignatureAlgorithm;
}

/** PAdES 签名选项 */
export interface PadesSignOptions {
  signerName: string;
  reason: string;
  location: string;
  contactInfo?: string;
  p12Path?: string;
  p12Password?: string;
  algorithm?: SignatureAlgorithm;
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
    algorithm?: SignatureAlgorithm;
    sm2PublicKey?: string;
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
  algorithm?: SignatureAlgorithm;
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
  /** 优先使用 Ghostscript 引擎 */
  preferGhostscript?: boolean;
  /** ICC 配置文件路径 */
  iccProfilePath?: string;
}

/** PDF/A 转换结果 */
export interface PdfAConvertResult {
  pdfData: ArrayBuffer;
  conformance: string;
  message: string;
  /** 使用的转换引擎 */
  engine: 'ghostscript' | 'pdf-lib';
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

// ========== 新功能类型定义（第四批） ==========

/** 图片数据 */
export interface ImageData {
  data: string; // base64
  format: 'png' | 'jpeg';
  name: string;
}

/** 图片转PDF选项 */
export interface ImageToPdfOptions {
  images: ImageData[];
  pageSize: 'original' | 'a4' | 'letter' | 'fit';
  dpi: number;
  margin: number;
  fitMode: 'stretch' | 'contain' | 'cover';
}

/** 图片转PDF结果 */
export interface ImageToPdfResult {
  pdfData: ArrayBuffer;
  pageCount: number;
  totalImages: number;
}

/** CSV导出选项 */
export interface CsvExportOptions {
  pageIndices?: number[];
  delimiter: string;
  detectHeaders: boolean;
  rowDetectionTolerance: number;
  columnDetectionMode: 'auto' | 'tab' | 'fixed';
  includePageNumber: boolean;
  includeCoordinates: boolean;
}

/** CSV导出结果 */
export interface CsvExportResult {
  csv: string;
  rowCount: number;
  columnCount: number;
  pagesProcessed: number;
  tablesDetected: number;
}

/** JavaScript条目 */
export interface JsEntry {
  location: string;
  code: string;
  type: 'document' | 'page' | 'field' | 'named' | 'annotation';
}

/** ShowJavaScript结果 */
export interface ShowJsResult {
  scripts: JsEntry[];
  totalCount: number;
  pagesScanned: number;
}

// ========== 图片编辑类型 ==========

/** 页面图片信息 */
export interface PageImageInfo {
  ref: string;
  x: number;
  y: number;
  width: number;
  height: number;
  data: string;
  format: 'png' | 'jpeg';
  originalWidth: number;
  originalHeight: number;
}

/** 图片替换结果 */
export interface ReplaceImageResult {
  pdfData: ArrayBuffer;
  replacedCount: number;
}

/** 图片布局项 */
export interface ImageLayoutItem {
  ref: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

// ========== 高级表单类型 ==========

/** 增强表单字段信息 */
export interface EnhancedFormFieldInfo {
  name: string;
  type: 'text' | 'checkbox' | 'dropdown' | 'radio' | 'button' | 'optionList' | 'signature' | 'unknown';
  value: string | boolean;
  options?: string[];
  readOnly: boolean;
  required: boolean;
  page: number;
  rect?: { x: number; y: number; width: number; height: number };
  maxLength?: number;
  multiline?: boolean;
  actions?: FieldActionScripts;
}

/** 字段动作脚本 */
export interface FieldActionScripts {
  validate?: string;
  calculate?: string;
  format?: string;
  keystroke?: string;
}

/** XFA 检测结果 */
export interface XFADetectResult {
  hasXFA: boolean;
  warning?: string;
  fieldCount: number;
}

// ========== 超链接注释类型 ==========

/** 超链接类型 */
export type HyperlinkType = 'uri' | 'goto';

/** 超链接注释数据 */
export interface HyperlinkAnnotation {
  id?: string;
  type: HyperlinkType;
  /** 注释所在页面 (0-based) */
  pageIndex: number;
  /** 矩形区域 [x1, y1, x2, y2] (PDF 点坐标) */
  rect: [number, number, number, number];
  /** URI 链接 (type='uri' 时必填) */
  uri?: string;
  /** 目标页面索引 (type='goto' 时必填) */
  destPageIndex?: number;
  /** 目标页面缩放模式 */
  destZoom?: 'fit' | 'fitH' | 'fitV' | 'xyz';
  /** 高亮模式 */
  highlightMode?: 'none' | 'invert' | 'outline' | 'push';
  /** 边框颜色 [r, g, b] 0-1 */
  color?: [number, number, number];
}

/** 超链接注释查询结果 */
export interface HyperlinkAnnotationInfo {
  id: string;
  type: HyperlinkType;
  pageIndex: number;
  /** 注释在页面 Annots 数组中的索引 */
  annotIndex: number;
  rect: [number, number, number, number];
  uri?: string;
  destPageIndex?: number;
  highlightMode: string;
  color?: [number, number, number];
}

// ========== 书签编辑类型 ==========

/** 书签条目（树形结构） */
export interface BookmarkItem {
  title: string;
  /** 目标页面索引 (0-based) */
  pageIndex: number;
  /** 层级深度 (0 = 顶级) */
  level: number;
  /** 目标缩放模式 */
  zoom?: 'fit' | 'fitH' | 'fitV' | 'xyz';
  /** 子书签 */
  children?: BookmarkItem[];
}

/** 书签编辑操作 */
export interface BookmarkEdit {
  /** 操作类型 */
  action: 'add' | 'delete' | 'edit' | 'reorder';
  /** 目标书签路径 (如 [0, 1, 2] 表示第1个书签的第2个子书签的第3个子书签) */
  path?: number[];
  /** 新书签标题 (add/edit 时使用) */
  title?: string;
  /** 目标页面索引 (add/edit 时使用) */
  pageIndex?: number;
  /** 目标缩放模式 */
  zoom?: 'fit' | 'fitH' | 'fitV' | 'xyz';
  /** 添加位置: 'before' | 'after' | 'child' (add 时使用) */
  position?: 'before' | 'after' | 'child';
  /** 新排序顺序 (reorder 时使用) */
  newOrder?: number[];
  /** 作为子书签添加时的父路径 */
  parentPath?: number[];
}

// ========== 图片编辑增强类型 ==========

/** 图片滤镜类型 */
export type ImageFilterType = 'brightness' | 'contrast' | 'grayscale' | 'sepia' | 'invert' | 'blur' | 'sharpen';

/** 图片裁剪区域 */
export interface ImageCropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ========== 脚本引擎类型 ==========

/** 脚本执行结果 */
export interface ScriptResult {
  success: boolean;
  result?: unknown;
  error?: string;
  stdout: string[];
  stderr: string[];
  executionTime: number;
}

/** 脚本执行选项 */
export interface ScriptOptions {
  /** 最大执行时间 (ms), 默认 5000 */
  timeout?: number;
  /** 最大内存 (bytes), 默认 10MB */
  memoryLimit?: number;
  /** 传入脚本的上下文数据 */
  context?: Record<string, unknown>;
  /** 允许的模块列表 */
  allowedModules?: string[];
}

/** 脚本引擎统计信息 */
export interface ScriptEngineStats {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageExecutionTime: number;
}

// ========== 多人协作类型 ==========

/** 协作用户 */
export interface CollabUser {
  id: string;
  name: string;
  color: string;
  cursor?: { pageIndex: number; x: number; y: number };
  lastSeen: number;
}

/** 协作房间信息 */
export interface CollabRoomInfo {
  id: string;
  name: string;
  hostUserId: string;
  userCount: number;
  createdAt: number;
}

/** 协作房间详情 */
export interface CollabRoomDetail {
  id: string;
  name: string;
  hostUserId: string;
  users: CollabUser[];
  annotationCount: number;
  createdAt: number;
  documentHash?: string;
}

/** 协作标注 */
export interface CollabAnnotation {
  id: string;
  userId: string;
  pageIndex: number;
  type: 'highlight' | 'comment' | 'drawing' | 'stamp';
  data: unknown;
  timestamp: number;
  deleted: boolean;
}

/** 协作服务状态 */
export interface CollabStatus {
  running: boolean;
  port: number;
  roomCount: number;
  totalUsers: number;
}

/** 加入房间选项 */
export interface CollabJoinOptions {
  roomId: string;
  userName: string;
}

/** 光标位置 */
export interface CollabCursorPosition {
  roomId: string;
  pageIndex: number;
  x: number;
  y: number;
}

// ========== REST API 类型 ==========

/** REST API 配置 */
export interface RestApiConfig {
  port: number;
  host: string;
  authToken?: string;
  maxFileSize: number;
  corsEnabled: boolean;
}

/** REST API 状态 */
export interface RestApiStatus {
  running: boolean;
  port: number;
  host: string;
  requestCount: number;
  apiKeyCount: number;
  uptime: number;
}

/** API Key 信息 */
export interface ApiKeyInfo {
  key: string;
  label: string;
  createdAt: number;
  lastUsed: number;
  requestCount: number;
}

/** ========== 国密算法 (SM-crypto) 类型定义 ========== */

/** 签名算法类型 */
export type SignatureAlgorithm = 'RSA-SHA256' | 'SM2-SM3';

/** 加密算法类型 */
export type EncryptionAlgorithm = 'AES-256' | 'SM4';

/** SM2 密钥对 */
export interface SM2KeyPair {
  publicKey: string;
  privateKey: string;
}

/** SM2 签名结果 */
export interface SM2SignatureResult {
  signatureHex: string;
  publicKey: string;
  algorithm: 'SM2-SM3';
}

/** SM2 验签结果 */
export interface SM2VerifyResult {
  verified: boolean;
  algorithm: 'SM2-SM3';
}

/** SM2 加密选项 */
export interface SM2EncryptOptions {
  data: string;       // 明文
  publicKey: string;  // 16进制公钥
  cipherMode?: number; // 1=C1C3C2 (默认), 0=C1C2C3
}

/** SM2 解密选项 */
export interface SM2DecryptOptions {
  cipherText: string;  // 密文
  privateKey: string;  // 16进制私钥
  cipherMode?: number;
}

/** SM3 哈希选项 */
export interface SM3HashOptions {
  data: string;  // base64 编码的数据
  key?: string;  // HMAC 密钥（可选，提供则计算 HMAC-SM3）
}

/** SM4 加密选项 */
export interface SM4EncryptOptions {
  data: string;       // 明文
  key: string;        // 16进制密钥（128位 = 32 hex chars）
  mode?: 'ecb' | 'cbc';
  iv?: string;        // CBC 模式 IV（16 hex chars）
}

/** SM4 解密选项 */
export interface SM4DecryptOptions {
  cipherText: string;  // 密文
  key: string;         // 16进制密钥
  mode?: 'ecb' | 'cbc';
  iv?: string;
}

/** SM4 文件加密选项 */
export interface SM4FileEncryptOptions {
  pdfData: string;  // base64 编码的 PDF 数据
  key: string;      // 16进制密钥
  iv?: string;
}

/** SM4 文件解密选项 */
export interface SM4FileDecryptOptions {
  cipherText: string;  // 16进制密文
  key: string;
  iv?: string;
}

// ---------------------------------------------------------------------------
// 字体管理类型
// ---------------------------------------------------------------------------

/** 字体粗细 */
export type FontWeight = 'Thin' | 'Light' | 'Regular' | 'Medium' | 'Bold' | 'Heavy';

/** 字体信息 */
export interface FontInfo {
  family: string;
  subfamily: string;
  weight: FontWeight;
  style: 'Normal' | 'Italic';
  filePath: string;
  format: 'otf' | 'ttf';
  available: boolean;
  sha256?: string;
}

/** 字体族信息 */
export interface FontFamilyInfo {
  family: string;
  displayName: string;
  license: string;
  fonts: FontInfo[];
  totalSize: number;
  available: boolean;
}

// ---------------------------------------------------------------------------
// 审计日志类型
// ---------------------------------------------------------------------------

/** 审计操作类型 */
export type AuditAction =
  | 'document.open'
  | 'document.save'
  | 'document.export'
  | 'document.print'
  | 'document.close'
  | 'document.delete'
  | 'signature.sign'
  | 'signature.verify'
  | 'signature.pades'
  | 'signature.pades_verify'
  | 'encryption.encrypt'
  | 'encryption.decrypt'
  | 'encryption.remove'
  | 'redaction.apply'
  | 'redaction.sensitive_detect'
  | 'permission.change'
  | 'user.login'
  | 'user.logout'
  | 'system.startup'
  | 'system.shutdown'
  | 'config.change'
  | 'api.access'
  | 'collab.join'
  | 'collab.leave'
  | 'font.register'
  | 'pdfa.convert'
  | 'pdfa.validate';

/** 审计级别 */
export type AuditLevel = 'info' | 'warn' | 'error' | 'critical';

/** 审计日志条目 */
export interface AuditLogEntry {
  id: number;
  timestamp: string;
  action: AuditAction;
  level: AuditLevel;
  userId: string;
  resourceId: string;
  details: string;
  clientIp: string;
  sessionId: string;
  /** SM3 哈希值 = SM3(本条内容 + 前一条 hash) */
  hash: string;
  /** 前一条记录的 hash（用于链式验证） */
  prevHash: string;
}

/** 审计日志记录选项 */
export interface AuditLogOptions {
  level?: AuditLevel;
  userId?: string;
  resourceId?: string;
  details?: string;
  clientIp?: string;
  sessionId?: string;
}

/** 审计日志查询选项 */
export interface AuditLogQuery {
  action?: AuditAction;
  level?: AuditLevel;
  userId?: string;
  resourceId?: string;
  startTime?: string;
  endTime?: string;
  limit?: number;
  offset?: number;
}

/** 完整性校验结果 */
export interface IntegrityCheckResult {
  valid: boolean;
  totalRecords: number;
  brokenAt: number | null;
  brokenHash: string | null;
  expectedHash: string | null;
  message: string;
}

/** 审计日志统计 */
export interface AuditLogStats {
  totalRecords: number;
  byAction: Record<string, number>;
  byLevel: Record<string, number>;
  earliestTimestamp: string | null;
  latestTimestamp: string | null;
  integrityValid: boolean;
}

// ---------------------------------------------------------------------------
// PDF/A 验证类型
// ---------------------------------------------------------------------------

/** PDF/A 验证结果 */
export interface PdfAValidationResult {
  /** 是否合规 */
  compliant: boolean;
  /** 合规级别 (e.g. "PDF/A-2B") */
  conformanceLevel: string | null;
  /** 总检查数 */
  totalChecks: number;
  /** 失败检查数 */
  failedChecks: number;
  /** 失败详情 */
  failures: PdfAValidationFailure[];
  /** VeraPDF 原始输出 */
  rawOutput: string;
  /** 人类可读摘要 */
  message: string;
}

/** PDF/A 验证失败项 */
export interface PdfAValidationFailure {
  /** 失败规则 ID (e.g. "6.7.3-1") */
  ruleId: string;
  /** 测试描述 */
  test: string;
  /** 失败位置 */
  location: string;
  /** 详细错误信息 */
  message: string;
}
