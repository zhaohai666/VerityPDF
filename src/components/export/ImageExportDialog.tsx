import React, { useState, useCallback } from 'react';
import { usePdfStore } from '@/stores/pdfStore';
import { useUIStore } from '@/stores/uiStore';
import { ImageExportService, type ImageExportOptions, type ImageExportProgress } from '@/services/export/ImageExportService';
import { validatePageRange } from '@/services/export/ExportService';

interface ImageExportDialogProps {
  open: boolean;
  onClose: () => void;
  pdfService: { getPage: (n: number) => Promise<unknown>; getPageSize: (n: number) => Promise<{ width: number; height: number }> } | null;
}

export const ImageExportDialog: React.FC<ImageExportDialogProps> = ({ open, onClose, pdfService }) => {
  const documentInfo = usePdfStore((s) => s.documentInfo);
  const showToast = useUIStore((s) => s.showToast);
  const totalPages = documentInfo?.pageCount ?? 0;

  const [format, setFormat] = useState<'png' | 'jpeg'>('png');
  const [dpi, setDpi] = useState<72 | 150 | 300>(150);
  const [quality, setQuality] = useState(0.92);
  const [pageRange, setPageRange] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState<ImageExportProgress | null>(null);

  const pageValidation = pageRange ? validatePageRange(pageRange, totalPages) : { valid: true, errors: [] };

  const handleExport = useCallback(async () => {
    if (!pdfService || isExporting) return;
    if (pageRange && !pageValidation.valid) {
      showToast(pageValidation.errors[0], 'error');
      return;
    }

    setIsExporting(true);
    setProgress({ current: 0, total: 0, percent: 0 });

    try {
      // 选择保存目录
      const dirPath = await window.verityAPI.showDialog({
        type: 'open',
        filters: [],
        defaultPath: '',
      });

      if (!dirPath) {
        setIsExporting(false);
        setProgress(null);
        return;
      }

      const imageService = new ImageExportService();
      const options: ImageExportOptions = {
        format,
        quality: format === 'jpeg' ? quality : undefined,
        dpi,
        pageRange: pageRange || undefined,
        totalPages,
      };

      const results = await imageService.exportPages(
        pdfService as never,
        options,
        (p) => setProgress(p)
      );

      // 通过 IPC 保存图片到磁盘
      const savedPaths = await window.verityAPI.exportImages(results, dirPath, documentInfo?.title || 'export');

      if (savedPaths && savedPaths.length > 0) {
        showToast(`成功导出 ${savedPaths.length} 张图片`, 'success');
        onClose();
      } else {
        showToast('导出已取消', 'info');
      }
    } catch (err) {
      console.error('Image export failed:', err);
      showToast(err instanceof Error ? err.message : '导出图片失败', 'error');
    } finally {
      setIsExporting(false);
      setProgress(null);
    }
  }, [pdfService, format, dpi, quality, pageRange, totalPages, isExporting, pageValidation, documentInfo, showToast, onClose]);

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="导出为图片">
        <div className="modal-header">
          <h3>导出为图片</h3>
          <button className="modal-close" onClick={onClose} aria-label="关闭">×</button>
        </div>

        <div className="modal-body">
          {isExporting && progress ? (
            <div className="export-progress">
              <p>正在导出... ({progress.current}/{progress.total})</p>
              <div className="loading-bar">
                <div className="loading-bar-fill" style={{ width: `${progress.percent}%` }} />
              </div>
              <p className="hint">{Math.round(progress.percent)}%</p>
            </div>
          ) : (
            <>
              {/* 格式选择 */}
              <div className="form-group">
                <label>图片格式</label>
                <div className="radio-group">
                  <label className="radio-label">
                    <input type="radio" name="imgFormat" value="png" checked={format === 'png'} onChange={() => setFormat('png')} />
                    PNG（无损）
                  </label>
                  <label className="radio-label">
                    <input type="radio" name="imgFormat" value="jpeg" checked={format === 'jpeg'} onChange={() => setFormat('jpeg')} />
                    JPEG（有损）
                  </label>
                </div>
              </div>

              {/* JPEG 质量 */}
              {format === 'jpeg' && (
                <div className="form-group">
                  <label>JPEG 质量: {Math.round(quality * 100)}%</label>
                  <input
                    type="range"
                    min="0.1"
                    max="1"
                    step="0.05"
                    value={quality}
                    onChange={(e) => setQuality(Number(e.target.value))}
                    className="style-range"
                  />
                </div>
              )}

              {/* DPI 选择 */}
              <div className="form-group">
                <label>输出分辨率 (DPI)</label>
                <div className="radio-group">
                  {[72, 150, 300].map((d) => (
                    <label key={d} className="radio-label">
                      <input type="radio" name="dpi" value={d} checked={dpi === d} onChange={() => setDpi(d as 72 | 150 | 300)} />
                      {d} DPI {d === 72 ? '(屏幕)' : d === 150 ? '(标准)' : '(高清)'}
                    </label>
                  ))}
                </div>
              </div>

              {/* 页码范围 */}
              <div className="form-group">
                <label>页码范围（留空表示全部）</label>
                <input
                  type="text"
                  className={`form-input ${pageValidation.valid ? '' : 'input-error'}`}
                  placeholder={`如 1-${Math.min(5, totalPages)}, 共 ${totalPages} 页`}
                  value={pageRange}
                  onChange={(e) => setPageRange(e.target.value)}
                />
                {!pageValidation.valid && (
                  <div className="form-error">{pageValidation.errors[0]}</div>
                )}
              </div>
            </>
          )}
        </div>

        {!isExporting && (
          <div className="modal-footer">
            <button className="btn-secondary" onClick={onClose}>取消</button>
            <button className="btn-primary" onClick={handleExport} disabled={!pdfService}>
              导出图片
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
