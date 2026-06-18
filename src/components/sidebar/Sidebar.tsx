import React, { useRef, useEffect, memo } from 'react';
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
        const pdfService = window.__pdfService;
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
    <div
      className={`thumbnail-item ${isActive ? 'active' : ''}`}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      tabIndex={0}
      role="button"
      aria-label={`跳转到第 ${pageNumber} 页`}
      aria-current={isActive ? 'page' : undefined}
    >
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
    <aside className="sidebar" role="navigation" aria-label="侧边栏">
      <div className="sidebar-tabs" role="tablist">
        <button
          className={`sidebar-tab ${sidebarTab === 'thumbnails' ? 'active' : ''}`}
          onClick={() => setSidebarTab('thumbnails')}
          role="tab"
          aria-selected={sidebarTab === 'thumbnails'}
          aria-controls="sidebar-thumbnails"
          id="tab-thumbnails"
        >
          缩略图
        </button>
        <button
          className={`sidebar-tab ${sidebarTab === 'outline' ? 'active' : ''}`}
          onClick={() => setSidebarTab('outline')}
          role="tab"
          aria-selected={sidebarTab === 'outline'}
          aria-controls="sidebar-outline"
          id="tab-outline"
        >
          大纲
        </button>
        <button
          className={`sidebar-tab ${sidebarTab === 'annotations' ? 'active' : ''}`}
          onClick={() => setSidebarTab('annotations')}
          role="tab"
          aria-selected={sidebarTab === 'annotations'}
          aria-controls="sidebar-annotations"
          id="tab-annotations"
        >
          标注
        </button>
      </div>

      <div className="sidebar-content">
        {sidebarTab === 'thumbnails' && (
          <div id="sidebar-thumbnails" className="thumbnail-list" role="tabpanel" aria-labelledby="tab-thumbnails" aria-label="页面缩略图">
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
          <div id="sidebar-outline" className="outline-list" role="tabpanel" aria-labelledby="tab-outline" aria-label="文档大纲">
            {outline.length === 0 ? (
              <div className="empty-message">无大纲信息</div>
            ) : (
              outline.map((item, i) => (
                <button key={i} className="outline-item" onClick={() => setCurrentPage(item.pageNumber)} aria-label={`跳转到 ${item.title}，第 ${item.pageNumber} 页`}>
                  <span className="outline-title">{item.title}</span>
                  <span className="outline-page">{item.pageNumber}</span>
                </button>
              ))
            )}
          </div>
        )}

        {sidebarTab === 'annotations' && (
          <div id="sidebar-annotations" className="annotation-list" role="tabpanel" aria-labelledby="tab-annotations" aria-label="标注列表">
            {annotations.length === 0 ? (
              <div className="empty-message">暂无标注</div>
            ) : (
              annotations.map((ann) => (
                <div key={ann.id} className="annotation-item" role="listitem">
                  <span className="ann-type" aria-label={ann.type}>{ann.type}</span>
                  <span className="ann-page">P{ann.page}</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </aside>
  );
};
