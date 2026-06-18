import React, { useMemo, useState, useCallback, memo } from 'react';
import { useAnnotationStore } from '@/stores/annotationStore';
import { generateSummary, getTypeLabel } from '@/services/export/SummaryService';

interface SummaryDialogProps {
  open: boolean;
  onClose: () => void;
}

export const SummaryDialog: React.FC<SummaryDialogProps> = memo(({ open, onClose }) => {
  const annotations = useAnnotationStore((s) => s.annotations);
  const comments = useAnnotationStore((s) => s.comments);
  const [expandedPage, setExpandedPage] = useState<number | null>(null);

  const report = useMemo(() => generateSummary(annotations, comments), [annotations, comments]);

  const togglePage = useCallback((page: number) => {
    setExpandedPage((prev) => (prev === page ? null : page));
  }, []);

  if (!open) return null;

  return (
    <div className="export-dialog-overlay" onClick={onClose}>
      <div className="export-dialog summary-dialog" onClick={(e) => e.stopPropagation()}>
        <h3 className="export-dialog-title">批注总结报告</h3>

        {/* 统计总览 */}
        <div className="summary-overview">
          <div className="summary-stat">
            <span className="summary-stat-value">{report.totalAnnotations}</span>
            <span className="summary-stat-label">标注总数</span>
          </div>
          <div className="summary-stat">
            <span className="summary-stat-value">{report.totalComments}</span>
            <span className="summary-stat-label">评论总数</span>
          </div>
          <div className="summary-stat">
            <span className="summary-stat-value">{report.totalPages}</span>
            <span className="summary-stat-label">涉及页数</span>
          </div>
        </div>

        {/* 类型分布 */}
        <div className="export-dialog-section">
          <div className="export-dialog-label"><span>类型分布</span></div>
          <div className="summary-type-list">
            {report.typeStats.map(({ type, label, count }) => (
              <div key={type} className="summary-type-item">
                <span className="summary-type-label">{label}</span>
                <span className="summary-type-bar" style={{ flex: count / report.totalAnnotations }} />
                <span className="summary-type-count">{count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 按页分组 */}
        <div className="export-dialog-section summary-pages">
          <div className="export-dialog-label"><span>按页明细</span></div>
          <div className="summary-page-list">
            {report.pages.map(({ page, annotations: anns, typeStats, commentCount }) => (
              <div key={page} className="summary-page-item">
                <button
                  className="summary-page-header"
                  onClick={() => togglePage(page)}
                  aria-expanded={expandedPage === page}
                >
                  <span>第 {page} 页</span>
                  <span className="summary-page-count">{anns.length} 标注{commentCount > 0 ? ` · ${commentCount} 评论` : ''}</span>
                  <span className="summary-page-arrow">{expandedPage === page ? '▼' : '▶'}</span>
                </button>
                {expandedPage === page && (
                  <div className="summary-page-detail">
                    {typeStats.map(({ type, label, count }) => (
                      <div key={type} className="summary-detail-row">
                        <span>{label}</span>
                        <span>×{count}</span>
                      </div>
                    ))}
                    {anns.filter((a) => a.type === 'text' || a.type === 'stickyNote').map((a) => (
                      <div key={a.id} className="summary-text-ann">
                        <span className="summary-ann-type">{getTypeLabel(a.type)}</span>
                        <span className="summary-ann-content">{a.content}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="export-dialog-actions">
          <button className="btn-secondary" onClick={onClose}>关闭</button>
          <button
            className="btn-primary"
            disabled={report.totalAnnotations === 0}
            onClick={() => {
              window.dispatchEvent(new CustomEvent('verity:exportSummary'));
              onClose();
            }}
          >
            导出总结 PDF
          </button>
        </div>
      </div>
    </div>
  );
});

SummaryDialog.displayName = 'SummaryDialog';
