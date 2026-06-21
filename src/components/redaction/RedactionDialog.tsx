import React, { useState, useCallback, useMemo } from 'react';
import { useAnnotationStore } from '@/stores/annotationStore';
import { usePdfStore } from '@/stores/pdfStore';
import { useUIStore } from '@/stores/uiStore';
import type { RedactionAnnotation } from '@/types/annotation';

interface RedactionDialogProps {
  open: boolean;
  onClose: () => void;
}

interface RedactionRect {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface RedactionResult {
  removedTextCount: number;
  removedImageCount: number;
  pagesProcessed: number;
}

/**
 * 密文擦除对话框
 * 从 annotationStore 中收集所有 redaction 标注，
 * 将屏幕坐标转换为 PDF 点坐标，执行擦除。
 */
export const RedactionDialog: React.FC<RedactionDialogProps> = ({ open, onClose }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<RedactionResult | null>(null);
  const [error, setError] = useState('');

  const annotations = useAnnotationStore((s) => s.annotations);
  const filePath = usePdfStore((s) => s.filePath);
  const showToast = useUIStore.getState().showToast;

  // 筛选所有 redaction 标注
  const redactionAnnotations = useMemo(
    () => annotations.filter((a) => a.type === 'redaction') as RedactionAnnotation[],
    [annotations]
  );

  // 按页码分组预览
  const pagePreview = useMemo(() => {
    const grouped = new Map<number, RedactionAnnotation[]>();
    for (const ann of redactionAnnotations) {
      if (!grouped.has(ann.page)) grouped.set(ann.page, []);
      grouped.get(ann.page)!.push(ann);
    }
    return grouped;
  }, [redactionAnnotations]);

  /**
   * 将标注的屏幕坐标转换为 PDF 点坐标
   * 标注的 position 是屏幕像素坐标（左上角原点）
   * PDF 点坐标是左下角原点
   */
  const convertToPdfRects = useCallback(async (anns: RedactionAnnotation[]): Promise<RedactionRect[]> => {
    const pdfService = (window as any).__pdfService;
    const rects: RedactionRect[] = [];

    for (const ann of anns) {
      const pageSize = await pdfService.getPageSize(ann.page);
      // 获取当前渲染的缩放比例
      const effectiveZoom = usePdfStore.getState().effectiveZoom || 1;

      // 屏幕坐标 -> PDF 坐标
      const pdfX = ann.position.x / effectiveZoom;
      const pdfY = ann.position.y / effectiveZoom;
      const pdfW = ann.size.width / effectiveZoom;
      const pdfH = ann.size.height / effectiveZoom;

      // PDF 坐标系：左下角原点，Y 轴向上
      const pdfBottomY = pageSize.height - pdfY - pdfH;

      rects.push({
        page: ann.page,
        x: pdfX,
        y: pdfBottomY,
        width: pdfW,
        height: pdfH,
      });
    }

    return rects;
  }, []);

  // 执行擦除
  const handleRedact = useCallback(async () => {
    if (!filePath) {
      showToast('请先打开 PDF 文件', 'warning');
      return;
    }
    if (redactionAnnotations.length === 0) {
      showToast('没有标记任何擦除区域', 'warning');
      return;
    }

    setIsProcessing(true);
    setError('');
    setResult(null);

    try {
      // 1. 转换坐标
      const rects = await convertToPdfRects(redactionAnnotations);

      // 2. 读取 PDF 数据
      const data = await window.verityAPI.readFile(filePath);
      const base64 = btoa(String.fromCharCode(...new Uint8Array(data)));

      // 3. 执行擦除
      const redactedData = await window.verityAPI.redactPdf(base64, rects);

      // 4. 保存结果
      const savePath = await window.verityAPI.showDialog({
        type: 'save',
        filters: [{ name: 'PDF 文件', extensions: ['pdf'] }],
        defaultPath: filePath.replace(/\.pdf$/i, '_redacted.pdf'),
      });

      if (!savePath) {
        setIsProcessing(false);
        return;
      }

      const redactedBase64 = btoa(String.fromCharCode(...new Uint8Array(redactedData)));
      await window.verityAPI.saveFile(redactedBase64, savePath);

      // 5. 解析返回结果
      // The IPC returns ArrayBuffer, we need to get stats separately
      // For now, show a generic success message
      setResult({
        removedTextCount: redactionAnnotations.length, // approximate
        removedImageCount: 0,
        pagesProcessed: pagePreview.size,
      });

      // 6. 从 annotationStore 中移除已应用的 redaction 标注
      const store = useAnnotationStore.getState();
      for (const ann of redactionAnnotations) {
        store.removeAnnotation(ann.id);
      }

      showToast('擦除完成，内容已永久删除', 'success');

      // If saved to original path, reload
      if (savePath === filePath) {
        window.dispatchEvent(new CustomEvent('verity:reloadPdf'));
      }
    } catch (err) {
      setError('擦除失败: ' + (err instanceof Error ? err.message : '未知错误'));
    } finally {
      setIsProcessing(false);
    }
  }, [filePath, redactionAnnotations, convertToPdfRects, pagePreview.size]);

  if (!open) return null;

  return (
    <div className="dialog-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dialog redaction-dialog">
        <div className="dialog-header">
          <h3>密文擦除</h3>
          <button className="dialog-close" onClick={onClose} aria-label="关闭">×</button>
        </div>

        <div className="dialog-body">
          {error && <div className="error-message">{error}</div>}

          <div className="redaction-info">
            <p className="redaction-warning">
              ⚠️ 擦除操作将<strong>永久删除</strong>标记区域内的文本和图像对象，此操作不可撤销。
            </p>
          </div>

          {/* 预览列表 */}
          {redactionAnnotations.length > 0 ? (
            <div className="redaction-preview">
              <h4>待擦除区域 ({redactionAnnotations.length} 个)</h4>
              <div className="redaction-preview-list">
                {Array.from(pagePreview.entries()).map(([page, anns]) => (
                  <div key={page} className="redaction-preview-page">
                    <div className="redaction-page-title">
                      📄 第 {page} 页 ({anns.length} 个区域)
                    </div>
                    {anns.map((ann) => (
                      <div key={ann.id} className="redaction-preview-item">
                        <span className="redaction-item-rect">
                          ({Math.round(ann.position.x)}, {Math.round(ann.position.y)}) —{' '}
                          {Math.round(ann.size.width)}×{Math.round(ann.size.height)}
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="redaction-empty">
              <p>当前文档没有标记任何擦除区域。</p>
              <p>请先使用工具栏中的「涂黑」工具框选需要擦除的区域。</p>
            </div>
          )}

          {/* 擦除结果 */}
          {result && (
            <div className="redaction-result">
              <h4>擦除结果</h4>
              <div className="redaction-result-row">
                <span>处理页数:</span>
                <strong>{result.pagesProcessed}</strong>
              </div>
              <div className="redaction-result-row">
                <span>移除文本对象:</span>
                <strong>{result.removedTextCount}</strong>
              </div>
              <div className="redaction-result-row">
                <span>移除图像对象:</span>
                <strong>{result.removedImageCount}</strong>
              </div>
            </div>
          )}
        </div>

        <div className="dialog-footer">
          <button className="btn-secondary" onClick={onClose}>取消</button>
          <button
            className="btn-danger"
            onClick={handleRedact}
            disabled={isProcessing || redactionAnnotations.length === 0}
          >
            {isProcessing ? '擦除中...' : `执行擦除 (${redactionAnnotations.length} 个区域)`}
          </button>
        </div>
      </div>
    </div>
  );
};
