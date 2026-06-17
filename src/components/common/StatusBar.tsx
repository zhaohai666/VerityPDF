import React from 'react';
import { usePdfStore } from '@/stores/pdfStore';
import { useAnnotationStore } from '@/stores/annotationStore';
import { useUIStore } from '@/stores/uiStore';

export const StatusBar: React.FC = () => {
  const { currentPage, documentInfo, effectiveZoom, rotation } = usePdfStore();
  const { annotations, saveStatus } = useAnnotationStore();
  const { theme, setTheme } = useUIStore();

  const saveStatusText = {
    saved: '已保存',
    saving: '保存中...',
    unsaved: '未保存',
    error: '保存失败',
  }[saveStatus];

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
        <span className="status-item">{saveStatusText}</span>
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
        >
          {theme === 'dark' ? '☀' : '☾'}
        </button>
      </div>
    </div>
  );
};
