import React, { useRef, useEffect, memo, useState, useCallback, useMemo } from 'react';
import { useUIStore } from '@/stores/uiStore';
import { usePdfStore } from '@/stores/pdfStore';
import { useAnnotationStore } from '@/stores/annotationStore';
import type { AnnotationType } from '@/types';
import { PageManager } from './PageManager';
import { FormPanel } from '@/components/form/FormPanel';

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

/** 标注类型标签映射 */
const TYPE_LABELS: Record<AnnotationType, string> = {
  rect: '矩形', ellipse: '椭圆', arrow: '箭头', line: '直线',
  freehand: '画笔', text: '文本', highlight: '高亮', stickyNote: '便签',
  stamp: '印章', signature: '签名', redaction: '涂黑', wavyLine: '波浪线',
  measureDistance: '距离', measureArea: '面积', measureAngle: '角度',
};

const ALL_ANNOTATION_TYPES = Object.keys(TYPE_LABELS) as AnnotationType[];

/** 标注搜索与过滤面板 */
const AnnotationFilterPanel: React.FC = () => {
  const { filterOptions, setFilterOptions, getFilteredAnnotations } = useAnnotationStore();
  const setCurrentPage = usePdfStore((s) => s.setCurrentPage);
  const selectAnnotation = useAnnotationStore((s) => s.selectAnnotation);
  const [showFilters, setShowFilters] = useState(false);
  const [typeFilter, setTypeFilter] = useState<Set<AnnotationType>>(new Set<AnnotationType>());

  const filteredAnnotations = useMemo(() => getFilteredAnnotations(), [
    getFilteredAnnotations, filterOptions,
  ]);

  const handleQueryChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setFilterOptions({ ...filterOptions, query: e.target.value || undefined });
  }, [filterOptions, setFilterOptions]);

  const handleTypeToggle = useCallback((type: AnnotationType) => {
    setTypeFilter((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type); else next.add(type);
      setFilterOptions({ ...filterOptions, types: next.size > 0 ? Array.from(next) as AnnotationType[] : undefined });
      return next;
    });
  }, [filterOptions, setFilterOptions]);

  const handleSortChange = useCallback((sortBy: 'page' | 'type' | 'createdAt') => {
    setFilterOptions({ ...filterOptions, sortBy });
  }, [filterOptions, setFilterOptions]);

  const handlePageRangeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setFilterOptions({ ...filterOptions, pageRange: e.target.value || undefined });
  }, [filterOptions, setFilterOptions]);

  const handleLockedChange = useCallback((locked: boolean | undefined) => {
    setFilterOptions({ ...filterOptions, locked });
  }, [filterOptions, setFilterOptions]);

  const handleClick = useCallback((ann: { id: string; page: number }) => {
    setCurrentPage(ann.page);
    selectAnnotation(ann.id);
  }, [setCurrentPage, selectAnnotation]);

  const highlightMatch = useCallback((text: string, query?: string) => {
    if (!query) return text;
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <mark className="search-highlight">{text.slice(idx, idx + query.length)}</mark>
        {text.slice(idx + query.length)}
      </>
    );
  }, []);

  return (
    <div className="annotation-filter-panel">
      {/* 搜索框 */}
      <div className="annotation-search">
        <input
          type="text"
          className="annotation-search-input"
          placeholder="搜索标注..."
          value={filterOptions.query || ''}
          onChange={handleQueryChange}
          aria-label="搜索标注"
        />
        {filterOptions.query && (
          <button className="search-clear" onClick={() => setFilterOptions({ ...filterOptions, query: undefined })} aria-label="清除搜索">×</button>
        )}
      </div>

      {/* 过滤器切换 */}
      <div className="annotation-filter-actions">
        <button
          className={`filter-toggle-btn ${showFilters ? 'active' : ''}`}
          onClick={() => setShowFilters(!showFilters)}
          aria-label="切换过滤器"
        >
          筛选 {typeFilter.size > 0 && `(${typeFilter.size})`}
        </button>
        <div className="sort-group">
          <select
            className="sort-select"
            value={filterOptions.sortBy || 'page'}
            onChange={(e) => handleSortChange(e.target.value as 'page' | 'type' | 'createdAt')}
            aria-label="排序方式"
          >
            <option value="page">按页码</option>
            <option value="type">按类型</option>
            <option value="createdAt">按时间</option>
          </select>
          <button
            className="sort-dir-btn"
            onClick={() => setFilterOptions({ ...filterOptions, sortDir: filterOptions.sortDir === 'desc' ? 'asc' : 'desc' })}
            title={filterOptions.sortDir === 'desc' ? '降序' : '升序'}
          >
            {filterOptions.sortDir === 'desc' ? '↓' : '↑'}
          </button>
        </div>
      </div>

      {/* 过滤器面板 */}
      {showFilters && (
        <div className="annotation-filters">
          <div className="filter-section">
            <label className="filter-label">类型</label>
            <div className="type-chips">
              {ALL_ANNOTATION_TYPES.map((type) => (
                <button
                  key={type}
                  className={`type-chip ${typeFilter.has(type) ? 'active' : ''}`}
                  onClick={() => handleTypeToggle(type)}
                >
                  {TYPE_LABELS[type]}
                </button>
              ))}
            </div>
          </div>
          <div className="filter-section">
            <label className="filter-label">页码范围</label>
            <input
              type="text"
              className="filter-input"
              placeholder="如 1-5,8"
              value={filterOptions.pageRange || ''}
              onChange={handlePageRangeChange}
            />
          </div>
          <div className="filter-section">
            <label className="filter-label">状态</label>
            <div className="filter-row">
              <button
                className={`filter-btn ${filterOptions.locked === undefined ? 'active' : ''}`}
                onClick={() => handleLockedChange(undefined)}
              >全部</button>
              <button
                className={`filter-btn ${filterOptions.locked === false ? 'active' : ''}`}
                onClick={() => handleLockedChange(false)}
              >未锁定</button>
              <button
                className={`filter-btn ${filterOptions.locked === true ? 'active' : ''}`}
                onClick={() => handleLockedChange(true)}
              >已锁定</button>
            </div>
          </div>
        </div>
      )}

      {/* 结果计数 */}
      <div className="filter-result-count">
        {filteredAnnotations.length} 条标注
      </div>

      {/* 标注列表 */}
      <div className="annotation-filtered-list">
        {filteredAnnotations.length === 0 ? (
          <div className="empty-message">无匹配的标注</div>
        ) : (
          filteredAnnotations.map((ann) => (
            <div
              key={ann.id}
              className="annotation-item"
              role="listitem"
              tabIndex={0}
              onClick={() => handleClick(ann)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleClick(ann); }}
            >
              <span className="ann-type">{TYPE_LABELS[ann.type] || ann.type}</span>
              <span className="ann-page">P{ann.page}</span>
              {ann.content && (
                <span className="ann-content">
                  {highlightMatch(ann.content.length > 40 ? ann.content.slice(0, 40) + '...' : ann.content, filterOptions.query)}
                </span>
              )}
              {ann.metadata.locked && <span className="ann-locked" title="已锁定">🔒</span>}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export const Sidebar: React.FC = () => {
  const { sidebarVisible, sidebarTab, setSidebarTab } = useUIStore();
  const { documentInfo, currentPage, setCurrentPage, outline } = usePdfStore();

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
        <button
          className={`sidebar-tab ${sidebarTab === 'pages' ? 'active' : ''}`}
          onClick={() => setSidebarTab('pages')}
          role="tab"
          aria-selected={sidebarTab === 'pages'}
          aria-controls="sidebar-pages"
          id="tab-pages"
        >
          页面
        </button>
        <button
          className={`sidebar-tab ${sidebarTab === 'forms' ? 'active' : ''}`}
          onClick={() => setSidebarTab('forms')}
          role="tab"
          aria-selected={sidebarTab === 'forms'}
          aria-controls="sidebar-forms"
          id="tab-forms"
        >
          表单
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
            <AnnotationFilterPanel />
          </div>
        )}

        {sidebarTab === 'pages' && (
          <div id="sidebar-pages" className="page-manager-panel" role="tabpanel" aria-labelledby="tab-pages" aria-label="页面管理">
            <PageManager />
          </div>
        )}

        {sidebarTab === 'forms' && (
          <div id="sidebar-forms" className="form-panel-wrapper" role="tabpanel" aria-labelledby="tab-forms" aria-label="表单">
            <FormPanel />
          </div>
        )}
      </div>
    </aside>
  );
};
