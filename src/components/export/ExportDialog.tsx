import React, { useState, useMemo, useCallback, memo } from 'react';
import { useAnnotationStore } from '@/stores/annotationStore';
import { usePdfStore } from '@/stores/pdfStore';
import { useUIStore } from '@/stores/uiStore';
import { ExportService, validatePageRange } from '@/services/export/ExportService';

interface ExportDialogProps {
  open: boolean;
  onClose: () => void;
}

/** 支持的导出标注类型 */
const EXPORT_TYPES = [
  { key: 'rect', label: '矩形' },
  { key: 'ellipse', label: '椭圆' },
  { key: 'arrow', label: '箭头' },
  { key: 'line', label: '直线' },
  { key: 'freehand', label: '自由画笔' },
  { key: 'highlight', label: '高亮' },
  { key: 'text', label: '文本' },
  { key: 'stickyNote', label: '便签' },
  { key: 'signature', label: '签名' },
  { key: 'stamp', label: '印章' },
];

const exportService = new ExportService();

export const ExportDialog: React.FC<ExportDialogProps> = memo(({ open, onClose }) => {
  const annotations = useAnnotationStore((s) => s.annotations);
  const documentInfo = usePdfStore((s) => s.documentInfo);
  const filePath = usePdfStore((s) => s.filePath);

  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set(EXPORT_TYPES.map((t) => t.key)));
  const [pageRange, setPageRange] = useState('');
  const [exporting, setExporting] = useState(false);

  const totalPages = documentInfo?.pageCount ?? 0;

  // 页码范围验证
  const pageRangeValidation = useMemo(() => {
    if (!pageRange.trim()) return { valid: true, errors: [] as string[] };
    return validatePageRange(pageRange, totalPages);
  }, [pageRange, totalPages]);

  // 计算筛选后的标注数量
  const filteredCount = useMemo(() => {
    if (!pageRangeValidation.valid) return 0;
    return exportService.filterAnnotations(annotations, {
      includeTypes: Array.from(selectedTypes),
      pageRange,
      totalPages,
    }).length;
  }, [annotations, selectedTypes, pageRange, totalPages, pageRangeValidation.valid]);

  const toggleType = useCallback((type: string) => {
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedTypes(new Set(EXPORT_TYPES.map((t) => t.key)));
  }, []);

  const selectNone = useCallback(() => {
    setSelectedTypes(new Set());
  }, []);

  const handleExport = useCallback(async () => {
    if (!filePath || exporting) return;
    setExporting(true);

    try {
      const store = usePdfStore.getState();
      const pdfArrayBuffer = await window.verityAPI.readFile(store.filePath!);
      if (!pdfArrayBuffer) throw new Error('无法读取 PDF 文件');

      const pdfBytes = new Uint8Array(pdfArrayBuffer);
      let binary = '';
      for (let i = 0; i < pdfBytes.length; i++) binary += String.fromCharCode(pdfBytes[i]);
      const pdfBase64 = btoa(binary);

      // 应用筛选
      const filtered = exportService.filterAnnotations(annotations, {
        includeTypes: Array.from(selectedTypes),
        pageRange,
        totalPages,
      });

      const originalName = store.filePath!.split(/[\\/]/).pop()?.replace(/\.pdf$/i, '') || 'document';
      const defaultName = `${originalName}_annotated.pdf`;

      const savedPath = await window.verityAPI.exportPDF(pdfBase64, filtered as unknown[], defaultName);
      if (savedPath) {
        useUIStore.getState().showToast?.('导出成功', 'success');
      }
      onClose();
    } catch (err) {
      console.error('[ExportDialog] Export failed:', err);
      useUIStore.getState().showToast?.(err instanceof Error ? err.message : '导出失败', 'error');
    } finally {
      setExporting(false);
    }
  }, [filePath, annotations, selectedTypes, pageRange, totalPages, onClose, exporting]);

  if (!open) return null;

  return (
    <div className="export-dialog-overlay" onClick={onClose}>
      <div className="export-dialog" onClick={(e) => e.stopPropagation()}>
        <h3 className="export-dialog-title">导出选项</h3>

        {/* 标注类型选择 */}
        <div className="export-dialog-section">
          <div className="export-dialog-label">
            <span>标注类型</span>
            <div className="export-dialog-type-actions">
              <button className="export-dialog-link" onClick={selectAll}>全选</button>
              <button className="export-dialog-link" onClick={selectNone}>清除</button>
            </div>
          </div>
          <div className="export-dialog-types">
            {EXPORT_TYPES.map(({ key, label }) => (
              <label key={key} className="export-dialog-checkbox">
                <input
                  type="checkbox"
                  checked={selectedTypes.has(key)}
                  onChange={() => toggleType(key)}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* 页码范围 */}
        <div className="export-dialog-section">
          <label className="export-dialog-label">
            <span>页码范围</span>
          </label>
          <input
            className={`export-dialog-input ${!pageRangeValidation.valid ? 'input-error' : ''}`}
            type="text"
            value={pageRange}
            onChange={(e) => setPageRange(e.target.value)}
            placeholder={`全部页（共 ${totalPages} 页），例如：1-5,8,10-12`}
            aria-invalid={!pageRangeValidation.valid}
            aria-describedby={pageRangeValidation.errors.length > 0 ? 'page-range-error' : undefined}
          />
          {pageRangeValidation.errors.length > 0 ? (
            <p className="export-dialog-error" id="page-range-error" role="alert">
              {pageRangeValidation.errors[0]}
            </p>
          ) : (
            <p className="export-dialog-hint">留空表示导出全部页</p>
          )}
        </div>

        {/* 统计 */}
        <div className="export-dialog-stats">
          将导出 <strong>{filteredCount}</strong> 条标注（共 {annotations.length} 条）
        </div>

        {/* 操作按钮 */}
        <div className="export-dialog-actions">
          <button className="btn-secondary" onClick={onClose} disabled={exporting}>取消</button>
          <button
            className="btn-primary"
            onClick={handleExport}
            disabled={exporting || filteredCount === 0 || !pageRangeValidation.valid}
          >
            {exporting ? '导出中...' : `导出 PDF（${filteredCount} 条标注）`}
          </button>
        </div>
      </div>
    </div>
  );
});

ExportDialog.displayName = 'ExportDialog';
