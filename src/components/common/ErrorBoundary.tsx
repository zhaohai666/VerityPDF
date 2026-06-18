import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** 降级 UI，默认显示错误信息和重启按钮 */
  fallback?: React.ReactNode | ((error: Error, reset: () => void) => React.ReactNode);
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * React 错误边界组件
 * 捕获子组件渲染错误，展示友好的降级 UI，避免整个应用崩溃
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[ErrorBoundary] Caught rendering error:', error);
    console.error('[ErrorBoundary] Component stack:', info.componentStack);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): React.ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    if (this.props.fallback) {
      if (typeof this.props.fallback === 'function') {
        return this.props.fallback(this.state.error!, this.handleReset);
      }
      return this.props.fallback;
    }

    // 默认降级 UI
    return (
      <div className="error-boundary-fallback">
        <div className="error-boundary-content">
          <h2>发生了一个错误</h2>
          <p className="error-boundary-message">
            {this.state.error?.message || '渲染组件时出现未知错误'}
          </p>
          <details className="error-boundary-details">
            <summary>错误详情</summary>
            <pre>{this.state.error?.stack}</pre>
          </details>
          <button className="btn-primary" onClick={this.handleReset}>
            重试
          </button>
        </div>
      </div>
    );
  }
}

/**
 * 标准化 IPC 错误类
 * 为不同类型的错误提供统一的错误码和用户友好消息
 */
export class IpcError extends Error {
  code: string;
  category: 'file' | 'pdf' | 'export' | 'network' | 'system' | 'unknown';

  constructor(code: string, message: string, category: IpcError['category'] = 'unknown') {
    super(message);
    this.name = 'IpcError';
    this.code = code;
    this.category = category;
  }

  /** 获取用户友好的显示消息 */
  getUserMessage(): string {
    const messages: Record<string, string> = {
      FILE_NOT_FOUND: '文件不存在，请检查路径后重试',
      FILE_TOO_LARGE: '文件过大（超过 500MB），请使用更小的 PDF 文件',
      FILE_ACCESS_DENIED: '没有权限访问该文件，请检查文件权限',
      FILE_INVALID_TYPE: '不支持的文件类型，请选择 PDF 文件',
      PATH_TRAVERSAL: '文件路径不合法，请选择正常路径的文件',
      PDF_CORRUPTED: 'PDF 文件损坏，无法解析',
      PDF_ENCRYPTED: 'PDF 文件已加密，需要密码才能打开',
      PDF_RENDER_FAILED: 'PDF 页面渲染失败，请尝试重新加载',
      EXPORT_FAILED: 'PDF 导出失败，请检查标注数据后重试',
      IPC_TIMEOUT: '操作超时，请稍后重试',
      VERSION_MISMATCH: '应用版本不匹配，请重启应用',
      UNKNOWN: '发生未知错误，请尝试重启应用',
    };
    return messages[this.code] || this.message;
  }
}

/**
 * 将原始错误转换为标准化 IpcError
 */
export function normalizeError(err: unknown): IpcError {
  if (err instanceof IpcError) return err;

  const message = err instanceof Error ? err.message : String(err);

  // 文件相关错误
  if (message.includes('文件不存在') || message.includes('ENOENT')) {
    return new IpcError('FILE_NOT_FOUND', message, 'file');
  }
  if (message.includes('文件大小超过限制')) {
    return new IpcError('FILE_TOO_LARGE', message, 'file');
  }
  if (message.includes('不支持的文件类型')) {
    return new IpcError('FILE_INVALID_TYPE', message, 'file');
  }
  if (message.includes('不在允许的访问范围') || message.includes('路径遍历')) {
    return new IpcError('PATH_TRAVERSAL', message, 'file');
  }
  if (message.includes('权限') || message.includes('EACCES') || message.includes('EPERM')) {
    return new IpcError('FILE_ACCESS_DENIED', message, 'file');
  }

  // PDF 相关错误
  if (message.includes('Invalid PDF') || message.includes('corrupted')) {
    return new IpcError('PDF_CORRUPTED', message, 'pdf');
  }
  if (message.includes('password') || message.includes('PasswordException')) {
    return new IpcError('PDF_ENCRYPTED', message, 'pdf');
  }
  if (message.includes('RenderingCancelled') || message.includes('render')) {
    return new IpcError('PDF_RENDER_FAILED', message, 'pdf');
  }

  // 导出错误
  if (message.includes('导出') || message.includes('export')) {
    return new IpcError('EXPORT_FAILED', message, 'export');
  }

  // IPC 错误
  if (message.includes('IPC timeout')) {
    return new IpcError('IPC_TIMEOUT', message, 'network');
  }
  if (message.includes('Version mismatch')) {
    return new IpcError('VERSION_MISMATCH', message, 'system');
  }

  return new IpcError('UNKNOWN', message, 'unknown');
}
