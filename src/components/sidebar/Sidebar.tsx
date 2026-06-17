import React, { useRef, useEffect, memo, useCallback } from 'react';
import { useUIStore } from '@/stores/uiStore';
import { usePdfStore } from '@/stores/pdfStore';
import { useAnnotationStore } from '@/stores/annotationStore';

/** 缩略图渲染器 */
const ThumbnailItem = memo(({ pageNumber, isActive, onClick }: {
  pageNumber: number;
  isActive: boolean;
  onClick: () => void;
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderedRef = useRef(false);

  useEffect(() => {
    if (renderedRef.current || !canvasRef.current) return;
    // 延迟渲染以避免同时渲染所有缩略图
    const timer = setTimeout(async () => {
      if (!canvasRef.current || renderedRef.current) return;
      try {
        // 从 PDFViewer 的 pdfService 获取渲染（通过全局引用）
        const pdfService = (window as any).__pdfService;
        if (!pdfService) return;

        const pageSize = await pdfService.getPageSize(pageNumber);
        const scale = 160 / pageSize.width; // 缩略图宽度 160px
        const viewport = (await pdfService.getPage(pageNumber)).getViewport({ scale });

        const canvas = canvasRef.current;
        const dpr = 1; // 缩略图不需要高 DPI
        canvas.width = viewport.width * dpr;
        canvas.height = viewport.height * dpr;
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const page = await pdfService.getPage(pageNumber);
        await page.render({ canvasContext: ctx, viewport }).promise;
        renderedRef.current = true;
      } catch (err) {
        // 缩略图渲染失败，显示占位符
      }
    }, pageNumber * 100); // 逐页延迟

    return () => clearTimeout(timer);
  }, [pageNumber]);

  return (
    <div className={`thumbnail-item ${isActive ? 'active' : ''}`} onClick={onClick}>
      <canvas ref={canvasRef} className="thumbnail-canvas" />
      <div className="thumbnail-label">{pageNumber}</div>
    </div>
  );
});

ThumbnailItem.displayName = 'ThumbnailItem';

export const Sidebar: React.FC = () => {
  const { sidebarVisible, sidebarTab, setSidebarTab } = useUIStore();
  const { documentInfo, currentPage, setCurrentPage, outline } = usePdfStore();
  const annotations = useAnnotationStore((s) => s.annotations);

  if (!sidebarVisible) return null;

  return (
    <div className="sidebar">
      <div className="sidebar-tabs">
        <button
          className={`sidebar-tab ${sidebarTab === 'thumbnails' ? 'active' : ''}`}
          onClick={() => setSidebarTab('thumbnails')}
        >
          缩略图
        </button>
        <button
          className={`sidebar-tab ${sidebarTab === 'outline' ? 'active' : ''}`}
          onClick={() => setSidebarTab('outline')}
        >
          大纲
        </button>
        <button
          className={`sidebar-tab ${sidebarTab === 'annotations' ? 'active' : ''}`}
          onClick={() => setSidebarTab('annotations')}
        >
          标注
        </button>
      </div>

      <div className="sidebar-content">
        {sidebarTab === 'thumbnails' && (
          <div className="thumbnail-list">
            {documentInfo && Array.from({ length: documentInfo.pageCount }, (_, i) => (
              <ThumbnailItem
                key={i + 1}
                pageNumber={i + 1}
                isActive={currentPage === i + 1}
                onClick={() => setCurrentPage(i + 1)}
              />
            ))}
          </div>
        )}

        {sidebarTab === 'outline' && (
          <div className="outline-list">
            {outline.length === 0 ? (
              <div className="empty-message">无大纲信息</div>
            ) : (
              outline.map((item, i) => (
                <div key={i} className="outline-item" onClick={() => setCurrentPage(item.pageNumber)}>
                  <span className="outline-title">{item.title}</span>
                  <span className="outline-page">{item.pageNumber}</span>
                </div>
              ))
            )}
          </div>
        )}

        {sidebarTab === 'annotations' && (
          <div className="annotation-list">
            {annotations.length === 0 ? (
              <div className="empty-message">暂无标注</div>
            ) : (
              annotations.map((ann) => (
                <div key={ann.id} className="annotation-item">
                  <span className="ann-type">{ann.type}</span>
                  <span className="ann-page">P{ann.page}</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};
