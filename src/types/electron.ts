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
}
