import React from 'react';
import { usePdfStore } from '@/stores/pdfStore';
import { useAnnotationStore } from '@/stores/annotationStore';
import { useUIStore } from '@/stores/uiStore';

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

export const StatusBar: React.FC = () => {
  const { currentPage, documentInfo, effectiveZoom, rotation } = usePdfStore();
  const { annotations, saveStatus, lastSavedTime } = useAnnotationStore();
  const { theme, setTheme } = useUIStore();

  const getSaveStatusText = () => {
    switch (saveStatus) {
      case 'saved':
        return lastSavedTime ? `已保存 ${formatTime(lastSavedTime)}` : '已保存';
      case 'saving':
        return '保存中...';
      case 'unsaved':
        return '未保存';
      case 'error':
        return '保存失败';
      default:
        return '';
    }
  };

  return (
    <div className="status-bar">
      <div className="status-left">
        {documentInfo && (
          <>
            <span className="status-item">{documentInfo.title || '未命名文档'}</span>
            <span className="status-separator">|</span>
            <span className="status-item">
              第 {currentPage} / {documentInfo.pageCount} 页
            </span>
          </>
        )}
      </div>

      <div className="status-center">
        <span className="status-item">{getSaveStatusText()}</span>
        {annotations.length > 0 && (
          <>
            <span className="status-separator">|</span>
            <span className="status-item">{annotations.length} 个标注</span>
          </>
        )}
      </div>

      <div className="status-right">
        <span className="status-item">{Math.round(effectiveZoom * 100)}%</span>
        {rotation !== 0 && (
          <>
            <span className="status-separator">|</span>
            <span className="status-item">{rotation}°</span>
          </>
        )}
        <span className="status-separator">|</span>
        <button
          className="theme-toggle"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          aria-label={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
        >
          {theme === 'dark' ? '☀' : '☾'}
        </button>
      </div>
    </div>
  );
};
