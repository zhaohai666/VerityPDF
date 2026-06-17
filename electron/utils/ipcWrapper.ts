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
      return {
        success: false,
        error: errorMsg,
        version: APP_VERSION,
      };
    }
  });
}

export function getAppVersion(): string {
  return APP_VERSION;
}