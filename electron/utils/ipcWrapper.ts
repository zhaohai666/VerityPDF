import { ipcMain } from 'electron';

const IPC_TIMEOUT = 30000;
const APP_VERSION = '1.0.0';

export interface IpcRequest<T = unknown> {
  version: string;
  payload: T;
}

export interface IpcResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  /** 标准化错误码，供客户端分类处理 */
  errorCode?: string;
  version?: string;
}

export function withTimeout<T>(promise: Promise<T>, timeout: number = IPC_TIMEOUT): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('IPC timeout'));
    }, timeout);

    promise
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

export function registerIpcHandler<T, R>(
  channel: string,
  handler: (payload: T) => Promise<R>
): void {
  ipcMain.handle(channel, async (_event, request: IpcRequest<T>): Promise<IpcResponse<R>> => {
    try {
      if (request.version !== APP_VERSION) {
        return {
          success: false,
          error: `Version mismatch: expected ${APP_VERSION}, got ${request.version}`,
          version: APP_VERSION,
        };
      }

      const data = await withTimeout(handler(request.payload));
      return { success: true, data, version: APP_VERSION };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      // 标准化错误码：根据错误消息分类，供渲染进程统一处理
      const errorCode = classifyIpcError(errorMsg);
      return {
        success: false,
        error: errorMsg,
        errorCode,
        version: APP_VERSION,
      };
    }
  });
  // 记录已注册的 channel，便于清理时移除
  registeredChannels.push(channel);
}

/** 已注册的 IPC channel 列表，用于应用退出时统一清理 */
const registeredChannels: string[] = [];

/**
 * 移除所有已注册的 IPC 处理器，防止内存泄漏和重复注册
 */
export function removeAllIpcHandlers(): void {
  for (const channel of registeredChannels) {
    ipcMain.removeHandler(channel);
  }
  registeredChannels.length = 0;
}

export function getAppVersion(): string {
  return APP_VERSION;
}

/**
 * 根据错误消息分类，返回标准化错误码
 */
function classifyIpcError(message: string): string {
  if (message.includes('不存在') || message.includes('ENOENT')) return 'FILE_NOT_FOUND';
  if (message.includes('超过限制')) return 'FILE_TOO_LARGE';
  if (message.includes('不支持的文件类型')) return 'FILE_INVALID_TYPE';
  if (message.includes('不在允许') || message.includes('路径遍历')) return 'PATH_TRAVERSAL';
  if (message.includes('权限') || message.includes('EACCES')) return 'FILE_ACCESS_DENIED';
  if (message.includes('timeout')) return 'IPC_TIMEOUT';
  if (message.includes('Version mismatch')) return 'VERSION_MISMATCH';
  if (message.includes('导出') || message.includes('export')) return 'EXPORT_FAILED';
  return 'UNKNOWN';
}