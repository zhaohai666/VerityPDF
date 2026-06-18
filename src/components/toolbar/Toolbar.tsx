import React, { useState, useRef, useCallback } from 'react';
import { useToolStore } from '@/stores/toolStore';
import { usePdfStore } from '@/stores/pdfStore';
import { useOCRStore } from '@/stores/ocrStore';
import { TOOL_LIST } from '@/types';
import type { ToolType } from '@/types';

/** SVG 工具图标 */
const ICONS: Record<string, React.ReactNode> = {
  select: <path d="M3 3l7 18 2-8 8-2L3 3z" fill="currentColor"/>,
  pan: <path d="M12 2a3 3 0 00-3 3v4.26A2 2 0 007 11v5a6 6 0 0012 0v-5a2 2 0 00-2-1.74V5a3 3 0 00-3-3h-2z" fill="none" stroke="currentColor" strokeWidth="1.5"/>,
  rect: <rect x="3" y="3" width="18" height="18" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5"/>,
  ellipse: <ellipse cx="12" cy="12" rx="9" ry="7" fill="none" stroke="currentColor" strokeWidth="1.5"/>,
  arrow: <><line x1="4" y1="20" x2="20" y2="4" stroke="currentColor" strokeWidth="1.5"/><polyline points="10,4 20,4 20,14" fill="none" stroke="currentColor" strokeWidth="1.5"/></>,
  line: <line x1="4" y1="20" x2="20" y2="4" stroke="currentColor" strokeWidth="2"/>,
  freehand: <path d="M3 17c3-4 6 2 9-2s6-6 9-2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>,
  text: <><line x1="6" y1="4" x2="18" y2="4" stroke="currentColor" strokeWidth="2"/><line x1="12" y1="4" x2="12" y2="20" stroke="currentColor" strokeWidth="2"/><line x1="8" y1="20" x2="16" y2="20" stroke="currentColor" strokeWidth="1.5"/></>,
  highlight: <><rect x="4" y="8" width="16" height="8" rx="1" fill="currentColor" opacity="0.3"/><line x1="4" y1="12" x2="20" y2="12" stroke="currentColor" strokeWidth="1"/></>,
  stickyNote: <><rect x="3" y="3" width="18" height="18" rx="2" fill="#FDE68A" stroke="currentColor" strokeWidth="1"/><line x1="7" y1="8" x2="17" y2="8" stroke="#666" strokeWidth="1"/><line x1="7" y1="12" x2="14" y2="12" stroke="#666" strokeWidth="1"/></>,
  stamp: <><circle cx="12" cy="10" r="6" fill="none" stroke="currentColor" strokeWidth="1.5"/><line x1="12" y1="16" x2="12" y2="20" stroke="currentColor" strokeWidth="2"/><line x1="8" y1="20" x2="16" y2="20" stroke="currentColor" strokeWidth="1.5"/></>,
  signature: <path d="M3 18c2-3 4 1 6-1s3-5 5-3 3 4 5 2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>,
  eraser: <><rect x="6" y="4" width="12" height="8" rx="1" fill="none" stroke="currentColor" strokeWidth="1.5" transform="rotate(-30 12 8)"/><line x1="3" y1="20" x2="21" y2="20" stroke="currentColor" strokeWidth="1.5"/></>,
  wavyLine: <path d="M3 12c2-4 4 4 6 0s4 4 6 0 4 4 6 0" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>,
  redaction: <><rect x="3" y="5" width="18" height="14" fill="currentColor" opacity="0.9"/><line x1="3" y1="5" x2="21" y2="19" stroke="currentColor" strokeWidth="1"/></>,
  measureDistance: <><line x1="4" y1="18" x2="20" y2="6" stroke="currentColor" strokeWidth="1.5"/><circle cx="4" cy="18" r="2" fill="currentColor"/><circle cx="20" cy="6" r="2" fill="currentColor"/><text x="8" y="15" fontSize="7" fill="currentColor">d</text></>,
  measureArea: <polygon points="4,18 12,4 20,18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>,
  measureAngle: <><line x1="4" y1="18" x2="12" y2="6" stroke="currentColor" strokeWidth="1.5"/><line x1="12" y1="6" x2="20" y2="18" stroke="currentColor" strokeWidth="1.5"/><path d="M9 10 A4 4 0 0 1 15 10" fill="none" stroke="currentColor" strokeWidth="1"/></>,
};

const PRESET_COLORS = [
  '#FF0000', '#FF6600', '#FFCC00', '#33CC00', '#0099FF',
  '#6633CC', '#FF3399', '#000000', '#666666', '#FFFFFF',
];

/** 样式面板 */
const StylePanel: React.FC = () => {
  const { toolStyle, setToolStyle } = useToolStore();
  const [open, setOpen] = useState(false);

  return (
    <div className="style-panel-wrapper">
      <button className="style-panel-toggle" onClick={() => setOpen(!open)} title="标注样式">
        <span className="style-color-preview" style={{ background: toolStyle.stroke }} />
        <span className="style-label">样式</span>
      </button>
      {open && (
        <div className="style-panel-dropdown">
          <div className="style-section">
            <label>描边颜色</label>
            <div className="color-grid">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  className={`color-swatch ${toolStyle.stroke === c ? 'active' : ''}`}
                  style={{ background: c }}
                  onClick={() => setToolStyle({ stroke: c })}
                />
              ))}
            </div>
            <input
              type="color"
              value={toolStyle.stroke}
              onChange={(e) => setToolStyle({ stroke: e.target.value })}
              className="color-input"
            />
          </div>
          <div className="style-section">
            <label>填充颜色</label>
            <div className="color-grid">
              <button
                className={`color-swatch ${toolStyle.fill === 'transparent' ? 'active' : ''}`}
                style={{ background: 'repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%) 50% / 8px 8px' }}
                onClick={() => setToolStyle({ fill: 'transparent' })}
              />
              {PRESET_COLORS.map((c) => (
                <button
                  key={`f-${c}`}
                  className={`color-swatch ${toolStyle.fill === c ? 'active' : ''}`}
                  style={{ background: c }}
                  onClick={() => setToolStyle({ fill: c })}
                />
              ))}
            </div>
          </div>
          <div className="style-section">
            <label>线宽: {toolStyle.strokeWidth}px</label>
            <input
              type="range" min="1" max="10" step="0.5"
              value={toolStyle.strokeWidth}
              onChange={(e) => setToolStyle({ strokeWidth: Number(e.target.value) })}
              className="style-range"
            />
          </div>
          <div className="style-section">
            <label>透明度: {Math.round(toolStyle.opacity * 100)}%</label>
            <input
              type="range" min="0.1" max="1" step="0.05"
              value={toolStyle.opacity}
              onChange={(e) => setToolStyle({ opacity: Number(e.target.value) })}
              className="style-range"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export const Toolbar: React.FC = () => {
  const activeTool = useToolStore((s) => s.activeTool);
  const setActiveTool = useToolStore((s) => s.setActiveTool);
  const { zoomIn, zoomOut, currentPage, documentInfo, zoomMode, setZoomMode, effectiveZoom, isLoaded } = usePdfStore();
  const ocrPanelVisible = useOCRStore((s) => s.panelVisible);
  const setOcrPanelVisible = useOCRStore((s) => s.setPanelVisible);
  const isDrawTool = ['rect', 'ellipse', 'arrow', 'line', 'freehand', 'text', 'highlight', 'stickyNote', 'wavyLine', 'redaction', 'measureDistance', 'measureArea', 'measureAngle'].includes(activeTool);
  const toolbarRef = useRef<HTMLDivElement>(null);

  // 工具栏方向键导航（roving tabindex 模式）
  const handleToolbarKeyDown = useCallback((e: React.KeyboardEvent) => {
    const toolbar = toolbarRef.current;
    if (!toolbar) return;
    const buttons = Array.from(toolbar.querySelectorAll<HTMLButtonElement>('.toolbar-btn:not([disabled])'));
    const currentIndex = buttons.indexOf(e.target as HTMLButtonElement);
    if (currentIndex === -1) return;

    let nextIndex = -1;
    if (e.key === 'ArrowRight') {
      nextIndex = (currentIndex + 1) % buttons.length;
    } else if (e.key === 'ArrowLeft') {
      nextIndex = (currentIndex - 1 + buttons.length) % buttons.length;
    } else if (e.key === 'Home') {
      nextIndex = 0;
    } else if (e.key === 'End') {
      nextIndex = buttons.length - 1;
    }

    if (nextIndex >= 0) {
      e.preventDefault();
      buttons[nextIndex].focus();
    }
  }, []);

  // 触发导出（发送菜单事件）
  const handleExport = () => {
    // 通过自定义事件触发，PDFViewer 监听
    window.dispatchEvent(new CustomEvent('verity:export'));
  };

  return (
    <div className="toolbar" role="toolbar" aria-label="工具栏" aria-orientation="horizontal" ref={toolbarRef} onKeyDown={handleToolbarKeyDown}>
      <div className="toolbar-drag-area" />
      <div className="toolbar-content">
        <div className="toolbar-group toolbar-tools" role="group" aria-label="标注工具">
          {TOOL_LIST.map((tool) => (
            <button
              key={tool.type}
              className={`toolbar-btn ${activeTool === tool.type ? 'active' : ''}`}
              onClick={() => setActiveTool(tool.type as ToolType)}
              title={`${tool.label}${tool.shortcut ? ` (${tool.shortcut})` : ''}`}
              aria-label={tool.label}
              aria-pressed={activeTool === tool.type}
            >
              <svg className="toolbar-icon-svg" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                {ICONS[tool.type] || <text x="4" y="18" fontSize="16" fill="currentColor">{tool.icon[0]}</text>}
              </svg>
              <span className="toolbar-label">{tool.label}</span>
            </button>
          ))}
        </div>

        {isDrawTool && <StylePanel />}

        <div className="toolbar-divider" />

        <div className="toolbar-group toolbar-zoom" role="group" aria-label="缩放控制">
          <button className="toolbar-btn" onClick={zoomOut} title="缩小 (Ctrl+-)" aria-label="缩小">−</button>
          <span className="zoom-display" role="status" aria-live="polite">{Math.round(effectiveZoom * 100)}%</span>
          <button className="toolbar-btn" onClick={zoomIn} title="放大 (Ctrl++)" aria-label="放大">+</button>
          <div className="zoom-mode-group" role="group" aria-label="缩放模式">
            <button className={`zoom-mode-btn ${zoomMode === 'fitWidth' ? 'active' : ''}`}
              onClick={() => setZoomMode('fitWidth')} title="适配宽度" aria-label="适配宽度" aria-pressed={zoomMode === 'fitWidth'}>宽</button>
            <button className={`zoom-mode-btn ${zoomMode === 'fitPage' ? 'active' : ''}`}
              onClick={() => setZoomMode('fitPage')} title="适配页面" aria-label="适配页面" aria-pressed={zoomMode === 'fitPage'}>页</button>
          </div>
        </div>

        <div className="toolbar-divider" />

        <div className="toolbar-group toolbar-page" role="group" aria-label="页面导航">
          <button className="toolbar-btn" onClick={() => usePdfStore.getState().prevPage()} title="上一页" disabled={currentPage <= 1} aria-label="上一页">◀</button>
          <span className="page-display" role="status" aria-live="polite">{currentPage} / {documentInfo?.pageCount ?? 0}</span>
          <button className="toolbar-btn" onClick={() => usePdfStore.getState().nextPage()} title="下一页" disabled={currentPage >= (documentInfo?.pageCount ?? 0)} aria-label="下一页">▶</button>
        </div>

        <div className="toolbar-divider" />

        <div className="toolbar-group toolbar-actions">
          <button
            className="toolbar-btn comment-toggle-btn"
            onClick={() => window.dispatchEvent(new CustomEvent('verity:toggleComments'))}
            disabled={!isLoaded}
            title="评论"
            aria-label="打开评论面板"
          >
            <svg className="toolbar-icon-svg" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z" fill="none" stroke="currentColor" strokeWidth="1.5"/>
            </svg>
            <span className="toolbar-label">评论</span>
          </button>
          <button
            className="toolbar-btn summary-btn"
            onClick={() => window.dispatchEvent(new CustomEvent('verity:exportSummary'))}
            disabled={!isLoaded}
            title="批注总结报告"
            aria-label="查看批注总结报告"
          >
            <svg className="toolbar-icon-svg" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" fill="none" stroke="currentColor" strokeWidth="1.5"/>
              <line x1="9" y1="12" x2="15" y2="12" stroke="currentColor" strokeWidth="1.5"/>
              <line x1="9" y1="16" x2="13" y2="16" stroke="currentColor" strokeWidth="1.5"/>
            </svg>
            <span className="toolbar-label">总结</span>
          </button>
          <button
            className="toolbar-btn export-btn"
            onClick={handleExport}
            disabled={!isLoaded}
            title="导出带标注的 PDF (Ctrl+E)"
            aria-label="导出带标注的 PDF"
          >
            <svg className="toolbar-icon-svg" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path d="M12 16l-5-5h3V4h4v7h3l-5 5z" fill="currentColor"/>
              <path d="M20 18H4v2h16v-2z" fill="currentColor"/>
            </svg>
            <span className="toolbar-label">导出</span>
          </button>
          <button
            className="toolbar-btn image-export-btn"
            onClick={() => window.dispatchEvent(new CustomEvent('verity:exportImages'))}
            disabled={!isLoaded}
            title="导出为图片"
            aria-label="导出为图片"
          >
            <svg className="toolbar-icon-svg" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5"/>
              <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"/>
              <path d="M21 15l-5-5L5 21" fill="none" stroke="currentColor" strokeWidth="1.5"/>
            </svg>
            <span className="toolbar-label">图片</span>
          </button>
          <button
            className="toolbar-btn encrypt-btn"
            onClick={() => window.dispatchEvent(new CustomEvent('verity:encrypt'))}
            disabled={!isLoaded}
            title="加密与权限设置"
            aria-label="加密与权限设置"
          >
            <svg className="toolbar-icon-svg" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <rect x="5" y="11" width="14" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M8 11V7a4 4 0 118 0v4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <span className="toolbar-label">加密</span>
          </button>
          <button
            className={`toolbar-btn ocr-btn ${ocrPanelVisible ? 'active' : ''}`}
            onClick={() => setOcrPanelVisible(!ocrPanelVisible)}
            disabled={!isLoaded}
            title="OCR 文字识别"
            aria-label="OCR 文字识别"
          >
            <svg className="toolbar-icon-svg" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5"/>
              <text x="6" y="16" fontSize="10" fontWeight="bold" fill="currentColor">Aa</text>
            </svg>
            <span className="toolbar-label">OCR</span>
          </button>
          <button
            className="toolbar-btn signature-btn"
            onClick={() => window.dispatchEvent(new CustomEvent('verity:signature'))}
            disabled={!isLoaded}
            title="数字签名"
            aria-label="数字签名"
          >
            <svg className="toolbar-icon-svg" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path d="M3 18c2-3 4 1 6-1s3-5 5-3 3 4 5 2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <line x1="3" y1="21" x2="21" y2="21" stroke="currentColor" strokeWidth="1.5"/>
            </svg>
            <span className="toolbar-label">签名</span>
          </button>
          <button
            className="toolbar-btn convert-btn"
            onClick={() => window.dispatchEvent(new CustomEvent('verity:convert'))}
            disabled={!isLoaded}
            title="格式转换 (LibreOffice)"
            aria-label="格式转换"
          >
            <svg className="toolbar-icon-svg" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4z" fill="none" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M17 14v3h3M17 17l3-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <span className="toolbar-label">转换</span>
          </button>
        </div>
      </div>
    </div>
  );
};
