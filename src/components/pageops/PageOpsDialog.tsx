import React, { useState, useCallback, useRef } from 'react';
import { usePdfStore } from '@/stores/pdfStore';
import { useUIStore } from '@/stores/uiStore';

interface PageOpsDialogProps {
  open: boolean;
  onClose: () => void;
}

type PageOpsTab = 'merge' | 'split' | 'extract';

interface MergeFile {
  id: string;
  filePath: string;
  fileName: string;
}

/** 解析页面范围字符串 */
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

export const PageOpsDialog: React.FC<PageOpsDialogProps> = ({ open, onClose }) => {
  const [activeTab, setActiveTab] = useState<PageOpsTab>('merge');
  const [isProcessing, setIsProcessing] = useState(false);

  // 合并相关
  const [mergeFiles, setMergeFiles] = useState<MergeFile[]>([]);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragItemRef = useRef<number | null>(null);

  // 拆分相关
  const [splitRanges, setSplitRanges] = useState('');
  const [splitOutputDir, setSplitOutputDir] = useState('');
  const [splitResults, setSplitResults] = useState<string[] | null>(null);

  // 提取相关
  const [extractRange, setExtractRange] = useState('');

  const { filePath, documentInfo } = usePdfStore();
  const showToast = useUIStore((s) => s.showToast);
  const totalPages = documentInfo?.pageCount ?? 0;

  // 获取 base64
  const getPdfBase64 = useCallback(async (): Promise<string> => {
    if (!filePath) throw new Error('未打开文件');
    const data = await window.verityAPI.readFile(filePath);
    const bytes = new Uint8Array(data);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }, [filePath]);

  // === 合并功能 ===
  const handleAddFiles = useCallback(async () => {
    try {
      const paths = await window.verityAPI.selectPdfFiles();
      if (!paths || paths.length === 0) return;
      const newFiles: MergeFile[] = paths.map((p) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        filePath: p,
        fileName: p.split(/[\\/]/).pop() || p,
      }));
      setMergeFiles((prev) => [...prev, ...newFiles]);
    } catch (err) {
      showToast('选择文件失败: ' + (err instanceof Error ? err.message : '未知错误'), 'error');
    }
  }, [showToast]);

  const handleRemoveFile = useCallback((id: string) => {
    setMergeFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  // 拖拽排序
  const handleDragStart = useCallback((index: number) => {
    dragItemRef.current = index;
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  }, []);

  const handleDrop = useCallback((index: number) => {
    if (dragItemRef.current === null || dragItemRef.current === index) {
      setDragOverIndex(null);
      return;
    }
    setMergeFiles((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragItemRef.current!, 1);
      next.splice(index, 0, moved);
      return next;
    });
    dragItemRef.current = null;
    setDragOverIndex(null);
  }, []);

  const handleMerge = useCallback(async () => {
    if (isProcessing || mergeFiles.length < 2) {
      showToast('至少需要两个 PDF 文件', 'warning');
      return;
    }
    setIsProcessing(true);
    try {
      const paths = mergeFiles.map((f) => f.filePath);
      const result = await window.verityAPI.multiMergePdfs(paths);

      const savePath = await window.verityAPI.showDialog({
        type: 'save',
        filters: [{ name: 'PDF 文件', extensions: ['pdf'] }],
        defaultPath: 'merged.pdf',
      });

      if (!savePath) {
        setIsProcessing(false);
        return;
      }

      const base64 = Buffer.from(result).toString('base64');
      await window.verityAPI.saveFile(base64, savePath);
      showToast(`成功合并 ${mergeFiles.length} 个文件`, 'success');
      setMergeFiles([]);
      onClose();
    } catch (err) {
      showToast('合并失败: ' + (err instanceof Error ? err.message : '未知错误'), 'error');
    } finally {
      setIsProcessing(false);
    }
  }, [isProcessing, mergeFiles, showToast, onClose]);

  // === 拆分功能 ===
  const handleSplit = useCallback(async () => {
    if (isProcessing || !filePath) return;
    const ranges = splitRanges.split('\n').map((l) => l.trim()).filter(Boolean);
    if (ranges.length === 0) {
      showToast('请输入拆分范围', 'warning');
      return;
    }
    setIsProcessing(true);
    setSplitResults(null);
    try {
      const base64 = await getPdfBase64();
      const outputDir = splitOutputDir || filePath.replace(/[\\/][^\\/]+$/, '');
      const results = await window.verityAPI.splitPdf(base64, ranges, outputDir);
      setSplitResults(results);
      showToast(`拆分完成，生成 ${results.length} 个文件`, 'success');
    } catch (err) {
      showToast('拆分失败: ' + (err instanceof Error ? err.message : '未知错误'), 'error');
    } finally {
      setIsProcessing(false);
    }
  }, [isProcessing, filePath, splitRanges, splitOutputDir, getPdfBase64, showToast]);

  // 快捷拆分
  const handleQuickSplit = useCallback((perPage: number) => {
    const ranges: string[] = [];
    for (let i = 0; i < totalPages; i += perPage) {
      const start = i + 1;
      const end = Math.min(i + perPage, totalPages);
      ranges.push(`${start}-${end}`);
    }
    setSplitRanges(ranges.join('\n'));
  }, [totalPages]);

  // 选择输出目录
  const handleSelectOutputDir = useCallback(async () => {
    const dir = await window.verityAPI.showDialog({ type: 'save', filters: [{ name: '文件夹', extensions: ['*'] }] });
    if (dir) {
      setSplitOutputDir(dir.replace(/[\\/][^\\/]*$/, ''));
    }
  }, []);

  // === 提取功能 ===
  const handleExtract = useCallback(async () => {
    if (isProcessing || !filePath) return;
    const indices = parsePageRange(extractRange, totalPages);
    if (indices.length === 0) {
      showToast('请输入有效的页面范围', 'warning');
      return;
    }
    setIsProcessing(true);
    try {
      const base64 = await getPdfBase64();
      const result = await window.verityAPI.extractPages(base64, indices);
      if (result) {
        showToast(`成功提取 ${indices.length} 页`, 'success');
        onClose();
      }
    } catch (err) {
      showToast('提取失败: ' + (err instanceof Error ? err.message : '未知错误'), 'error');
    } finally {
      setIsProcessing(false);
    }
  }, [isProcessing, filePath, extractRange, totalPages, getPdfBase64, showToast, onClose]);

  if (!open) return null;

  return (
    <div className="dialog-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dialog pageops-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h3>页面基础处理</h3>
          <button className="dialog-close" onClick={onClose} aria-label="关闭">&times;</button>
        </div>

        <div className="dialog-tabs">
          <button className={`tab-btn ${activeTab === 'merge' ? 'active' : ''}`} onClick={() => setActiveTab('merge')}>
            合并 PDF
          </button>
          <button className={`tab-btn ${activeTab === 'split' ? 'active' : ''}`} onClick={() => setActiveTab('split')}>
            拆分 PDF
          </button>
          <button className={`tab-btn ${activeTab === 'extract' ? 'active' : ''}`} onClick={() => setActiveTab('extract')}>
            提取页面
          </button>
        </div>

        <div className="dialog-body">
          {/* 合并标签页 */}
          {activeTab === 'merge' && (
            <div className="pageops-section">
              <div className="merge-actions">
                <button className="btn-secondary" onClick={handleAddFiles} disabled={isProcessing}>
                  + 添加文件
                </button>
                {mergeFiles.length > 0 && (
                  <button className="btn-text" onClick={() => setMergeFiles([])} disabled={isProcessing}>
                    清空列表
                  </button>
                )}
              </div>

              {mergeFiles.length > 0 && (
                <div className="merge-file-list">
                  {mergeFiles.map((file, index) => (
                    <div
                      key={file.id}
                      className={`merge-file-item ${dragOverIndex === index ? 'drag-over' : ''}`}
                      draggable
                      onDragStart={() => handleDragStart(index)}
                      onDragOver={(e) => handleDragOver(e, index)}
                      onDrop={() => handleDrop(index)}
                      onDragEnd={() => setDragOverIndex(null)}
                    >
                      <span className="drag-handle" title="拖拽排序">⠿</span>
                      <span className="file-index">{index + 1}</span>
                      <span className="file-name" title={file.filePath}>{file.fileName}</span>
                      <button
                        className="btn-remove"
                        onClick={() => handleRemoveFile(file.id)}
                        disabled={isProcessing}
                        title="移除"
                      >
                        &times;
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {mergeFiles.length > 0 && (
                <p className="form-hint">拖拽文件调整合并顺序，共 {mergeFiles.length} 个文件</p>
              )}
              {mergeFiles.length === 0 && (
                <p className="form-hint">点击"添加文件"选择多个 PDF，支持拖拽排序</p>
              )}
            </div>
          )}

          {/* 拆分标签页 */}
          {activeTab === 'split' && (
            <div className="pageops-section">
              <div className="form-group">
                <label>拆分范围（每行一个范围）</label>
                <textarea
                  className="form-input form-textarea"
                  value={splitRanges}
                  onChange={(e) => setSplitRanges(e.target.value)}
                  placeholder={`例如:\n1-5\n6-10\n11-${totalPages}`}
                  rows={6}
                  disabled={isProcessing}
                />
                <p className="form-hint">当前文档共 {totalPages} 页</p>
              </div>

              <div className="quick-split-btns">
                <button className="btn-small" onClick={() => handleQuickSplit(1)} disabled={isProcessing}>
                  按每页拆分
                </button>
                <button className="btn-small" onClick={() => handleQuickSplit(5)} disabled={isProcessing}>
                  每 5 页
                </button>
                <button className="btn-small" onClick={() => handleQuickSplit(10)} disabled={isProcessing}>
                  每 10 页
                </button>
              </div>

              <div className="form-group">
                <label>输出目录</label>
                <div className="input-with-btn">
                  <input
                    type="text"
                    className="form-input"
                    value={splitOutputDir}
                    onChange={(e) => setSplitOutputDir(e.target.value)}
                    placeholder="与源文件同目录"
                    disabled={isProcessing}
                  />
                  <button className="btn-secondary btn-small" onClick={handleSelectOutputDir} disabled={isProcessing}>
                    浏览
                  </button>
                </div>
              </div>

              {splitResults && splitResults.length > 0 && (
                <div className="split-results">
                  <p className="split-results-title">生成文件：</p>
                  <ul className="split-results-list">
                    {splitResults.map((p, i) => (
                      <li key={i} className="split-result-item" title={p}>
                        {p.split(/[\\/]/).pop()}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* 提取标签页 */}
          {activeTab === 'extract' && (
            <div className="pageops-section">
              <div className="form-group">
                <label>页面范围</label>
                <input
                  type="text"
                  className="form-input"
                  value={extractRange}
                  onChange={(e) => setExtractRange(e.target.value)}
                  placeholder={`例如: 1-5, 8, 10-20`}
                  disabled={isProcessing}
                />
                <p className="form-hint">
                  {extractRange
                    ? `将提取 ${parsePageRange(extractRange, totalPages).length} 页`
                    : `当前文档共 ${totalPages} 页`
                  }
                </p>
              </div>
              <p className="form-hint">提取的页面将保存为新的 PDF 文件</p>
            </div>
          )}
        </div>

        <div className="dialog-footer">
          <button className="btn-secondary" onClick={onClose} disabled={isProcessing}>取消</button>
          {activeTab === 'merge' && (
            <button
              className="btn-primary"
              onClick={handleMerge}
              disabled={isProcessing || mergeFiles.length < 2}
            >
              {isProcessing ? '合并中...' : `合并 (${mergeFiles.length} 个文件)`}
            </button>
          )}
          {activeTab === 'split' && (
            <button className="btn-primary" onClick={handleSplit} disabled={isProcessing || !splitRanges.trim()}>
              {isProcessing ? '拆分中...' : '执行拆分'}
            </button>
          )}
          {activeTab === 'extract' && (
            <button
              className="btn-primary"
              onClick={handleExtract}
              disabled={isProcessing || !extractRange.trim()}
            >
              {isProcessing ? '提取中...' : '提取页面'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
