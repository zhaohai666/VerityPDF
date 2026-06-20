import React, { useState, useEffect, useCallback } from 'react';
import { usePdfStore } from '@/stores/pdfStore';
import { useUIStore } from '@/stores/uiStore';

interface BatchPageDialogProps {
  open: boolean;
  onClose: () => void;
}

type BatchTab = 'rotate' | 'blank' | 'crop';

/** 解析页面范围字符串（如 "1-5, 8, 10-20"）为 0-based 索引数组 */
function parsePageRange(input: string, totalPages: number): number[] {
  const indices: Set<number> = new Set();
  const parts = input.split(',').map((s) => s.trim()).filter(Boolean);
  for (const part of parts) {
    const rangeMatch = part.match(/^(\d+)\s*-\s*(\d+)$/);
    if (rangeMatch) {
      const start = Math.max(1, parseInt(rangeMatch[1], 10));
      const end = Math.min(totalPages, parseInt(rangeMatch[2], 10));
      for (let i = start; i <= end; i++) indices.add(i - 1);
    } else {
      const num = parseInt(part, 10);
      if (num >= 1 && num <= totalPages) indices.add(num - 1);
    }
  }
  return Array.from(indices).sort((a, b) => a - b);
}

export const BatchPageDialog: React.FC<BatchPageDialogProps> = ({ open, onClose }) => {
  const [activeTab, setActiveTab] = useState<BatchTab>('rotate');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ value: 0, message: '' });

  // 旋转选项
  const [rotateRange, setRotateRange] = useState('');
  const [rotateAngle, setRotateAngle] = useState<90 | 180 | 270>(90);

  // 空白页检测选项
  const [blankThreshold, setBlankThreshold] = useState(0.02);
  const [blankResults, setBlankResults] = useState<{ blankIndices: number[]; totalChecked: number } | null>(null);

  // 裁剪选项
  const [cropRange, setCropRange] = useState('');
  const [cropMargin, setCropMargin] = useState({ top: 36, right: 36, bottom: 36, left: 36 });

  const { filePath, documentInfo } = usePdfStore();
  const showToast = useUIStore((s) => s.showToast);
  const totalPages = documentInfo?.pageCount ?? 0;

  // 监听进度事件
  useEffect(() => {
    if (!open) return;
    const unsub = window.verityAPI.onBatchProgress((info) => {
      setProgress({ value: info.progress, message: info.message });
    });
    return unsub;
  }, [open]);

  // 获取 base64
  const getPdfBase64 = useCallback(async (): Promise<string> => {
    if (!filePath) throw new Error('未打开文件');
    const data = await window.verityAPI.readFile(filePath);
    const bytes = new Uint8Array(data);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }, [filePath]);

  // 保存并重新加载
  const saveAndReload = useCallback(async (result: ArrayBuffer) => {
    if (!filePath) return;
    const base64 = Buffer.from(result).toString('base64');
    await window.verityAPI.saveFile(base64, filePath);
    window.dispatchEvent(new CustomEvent('verity:reloadPdf'));
    showToast('操作已应用', 'success');
  }, [filePath, showToast]);

  // 批量旋转
  const handleRotate = useCallback(async () => {
    if (isProcessing) return;
    const indices = parsePageRange(rotateRange || `1-${totalPages}`, totalPages);
    if (indices.length === 0) {
      showToast('请输入有效的页面范围', 'error');
      return;
    }
    setIsProcessing(true);
    setProgress({ value: 0, message: '开始旋转...' });
    try {
      const base64 = await getPdfBase64();
      const result = await window.verityAPI.batchRotate(base64, { pageIndices: indices, angle: rotateAngle });
      await saveAndReload(result);
      onClose();
    } catch (err) {
      showToast('批量旋转失败: ' + (err instanceof Error ? err.message : '未知错误'), 'error');
    } finally {
      setIsProcessing(false);
    }
  }, [isProcessing, rotateRange, rotateAngle, totalPages, getPdfBase64, saveAndReload, showToast, onClose]);

  // 空白页检测
  const handleDetectBlank = useCallback(async () => {
    if (isProcessing || !filePath) return;
    setIsProcessing(true);
    setProgress({ value: 0, message: '开始检测...' });
    setBlankResults(null);
    try {
      const result = await window.verityAPI.detectBlankPages(filePath, blankThreshold);
      setBlankResults(result);
      if (result.blankIndices.length === 0) {
        showToast('未检测到空白页', 'info');
      }
    } catch (err) {
      showToast('空白页检测失败: ' + (err instanceof Error ? err.message : '未知错误'), 'error');
    } finally {
      setIsProcessing(false);
    }
  }, [isProcessing, filePath, blankThreshold, showToast]);

  // 删除检测到的空白页
  const handleDeleteBlank = useCallback(async () => {
    if (isProcessing || !blankResults || blankResults.blankIndices.length === 0) return;
    setIsProcessing(true);
    setProgress({ value: 0, message: '删除空白页...' });
    try {
      const base64 = await getPdfBase64();
      // 使用 page:manipulate 的 delete 操作
      const result = await window.verityAPI.manipulatePages(base64, {
        type: 'delete',
        pageIndices: blankResults.blankIndices,
      });
      await saveAndReload(result);
      setBlankResults(null);
      onClose();
    } catch (err) {
      showToast('删除空白页失败: ' + (err instanceof Error ? err.message : '未知错误'), 'error');
    } finally {
      setIsProcessing(false);
    }
  }, [isProcessing, blankResults, getPdfBase64, saveAndReload, showToast, onClose]);

  // 批量裁剪
  const handleCrop = useCallback(async () => {
    if (isProcessing) return;
    const indices = parsePageRange(cropRange || `1-${totalPages}`, totalPages);
    if (indices.length === 0) {
      showToast('请输入有效的页面范围', 'error');
      return;
    }
    setIsProcessing(true);
    setProgress({ value: 0, message: '开始裁剪...' });
    try {
      const base64 = await getPdfBase64();
      const result = await window.verityAPI.batchCrop(base64, { pageIndices: indices, margin: cropMargin });
      await saveAndReload(result);
      onClose();
    } catch (err) {
      showToast('批量裁剪失败: ' + (err instanceof Error ? err.message : '未知错误'), 'error');
    } finally {
      setIsProcessing(false);
    }
  }, [isProcessing, cropRange, cropMargin, totalPages, getPdfBase64, saveAndReload, showToast, onClose]);

  if (!open) return null;

  return (
    <div className="dialog-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dialog batch-page-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h3>批量页面操作</h3>
          <button className="dialog-close" onClick={onClose} aria-label="关闭">&times;</button>
        </div>

        <div className="batch-tabs">
          <button className={`batch-tab ${activeTab === 'rotate' ? 'active' : ''}`} onClick={() => setActiveTab('rotate')}>批量旋转</button>
          <button className={`batch-tab ${activeTab === 'blank' ? 'active' : ''}`} onClick={() => setActiveTab('blank')}>空白页检测</button>
          <button className={`batch-tab ${activeTab === 'crop' ? 'active' : ''}`} onClick={() => setActiveTab('crop')}>页面裁剪</button>
        </div>

        <div className="dialog-body">
          {/* 批量旋转 */}
          {activeTab === 'rotate' && (
            <div className="batch-section">
              <div className="form-group">
                <label>页面范围</label>
                <input
                  type="text"
                  className="form-input"
                  value={rotateRange}
                  onChange={(e) => setRotateRange(e.target.value)}
                  placeholder={`例如: 1-${Math.min(5, totalPages)}, 8, 10-${totalPages}`}
                />
                <p className="form-hint">留空表示所有页面 ({totalPages} 页)</p>
              </div>
              <div className="form-group">
                <label>旋转角度</label>
                <div className="angle-options">
                  {([90, 180, 270] as const).map((angle) => (
                    <button
                      key={angle}
                      className={`angle-btn ${rotateAngle === angle ? 'active' : ''}`}
                      onClick={() => setRotateAngle(angle)}
                    >
                      {angle}°
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 空白页检测 */}
          {activeTab === 'blank' && (
            <div className="batch-section">
              <div className="form-group">
                <label>检测灵敏度: {(blankThreshold * 100).toFixed(1)}%</label>
                <input
                  type="range"
                  min="0.01"
                  max="0.1"
                  step="0.005"
                  value={blankThreshold}
                  onChange={(e) => setBlankThreshold(Number(e.target.value))}
                  className="form-range"
                />
                <p className="form-hint">较低值更严格（只检测纯白页），较高值更宽松</p>
              </div>

              {blankResults && (
                <div className="blank-results">
                  <p className="blank-summary">
                    检测了 {blankResults.totalChecked} 页，发现 <strong>{blankResults.blankIndices.length}</strong> 个空白页
                  </p>
                  {blankResults.blankIndices.length > 0 && (
                    <div className="blank-indices">
                      空白页: {blankResults.blankIndices.map((i) => i + 1).join(', ')}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 页面裁剪 */}
          {activeTab === 'crop' && (
            <div className="batch-section">
              <div className="form-group">
                <label>页面范围</label>
                <input
                  type="text"
                  className="form-input"
                  value={cropRange}
                  onChange={(e) => setCropRange(e.target.value)}
                  placeholder={`例如: 1-${totalPages}`}
                />
                <p className="form-hint">留空表示所有页面 ({totalPages} 页)</p>
              </div>
              <div className="form-group">
                <label>裁剪边距 (pt)</label>
                <div className="crop-margins">
                  <div className="crop-margin-item">
                    <span>上</span>
                    <input
                      type="number"
                      min="0"
                      max="300"
                      value={cropMargin.top}
                      onChange={(e) => setCropMargin((p) => ({ ...p, top: Number(e.target.value) }))}
                      className="form-input crop-input"
                    />
                  </div>
                  <div className="crop-margin-item">
                    <span>下</span>
                    <input
                      type="number"
                      min="0"
                      max="300"
                      value={cropMargin.bottom}
                      onChange={(e) => setCropMargin((p) => ({ ...p, bottom: Number(e.target.value) }))}
                      className="form-input crop-input"
                    />
                  </div>
                  <div className="crop-margin-item">
                    <span>左</span>
                    <input
                      type="number"
                      min="0"
                      max="300"
                      value={cropMargin.left}
                      onChange={(e) => setCropMargin((p) => ({ ...p, left: Number(e.target.value) }))}
                      className="form-input crop-input"
                    />
                  </div>
                  <div className="crop-margin-item">
                    <span>右</span>
                    <input
                      type="number"
                      min="0"
                      max="300"
                      value={cropMargin.right}
                      onChange={(e) => setCropMargin((p) => ({ ...p, right: Number(e.target.value) }))}
                      className="form-input crop-input"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 进度条 */}
          {isProcessing && (
            <div className="batch-progress">
              <div className="progress-bar">
                <div className="progress-bar-fill" style={{ width: `${Math.round(progress.value * 100)}%` }} />
              </div>
              <p className="progress-message">{progress.message}</p>
            </div>
          )}
        </div>

        <div className="dialog-footer">
          <button className="btn-secondary" onClick={onClose} disabled={isProcessing}>取消</button>
          {activeTab === 'rotate' && (
            <button className="btn-primary" onClick={handleRotate} disabled={isProcessing}>
              执行旋转
            </button>
          )}
          {activeTab === 'blank' && (
            <>
              <button className="btn-secondary" onClick={handleDetectBlank} disabled={isProcessing}>
                检测空白页
              </button>
              {blankResults && blankResults.blankIndices.length > 0 && (
                <button className="btn-primary btn-danger" onClick={handleDeleteBlank} disabled={isProcessing}>
                  删除空白页 ({blankResults.blankIndices.length})
                </button>
              )}
            </>
          )}
          {activeTab === 'crop' && (
            <button className="btn-primary" onClick={handleCrop} disabled={isProcessing}>
              执行裁剪
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
