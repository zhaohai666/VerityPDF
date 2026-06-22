import React, { useState, useCallback, useEffect } from 'react';
import { usePdfStore } from '@/stores/pdfStore';
import { useUIStore } from '@/stores/uiStore';
import type { PDFTextSegmentInfo } from '@/types/electron';

interface EditTextDialogProps {
  onClose: () => void;
}

/**
 * PDF 文本编辑对话框
 * 显示指定页面的所有文本段，支持替换、删除、修改样式
 */
export const EditTextDialog: React.FC<EditTextDialogProps> = ({ onClose }) => {
  const currentPage = usePdfStore((s) => s.currentPage);
  const filePath = usePdfStore((s) => s.filePath);
  const showToast = useUIStore((s) => s.showToast);

  const [page, setPage] = useState(currentPage);
  const [segments, setSegments] = useState<PDFTextSegmentInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [newText, setNewText] = useState('');
  const [newFontSize, setNewFontSize] = useState<string>('');
  const [newColor, setNewColor] = useState('#000000');

  /** 加载页面文本段 */
  const loadSegments = useCallback(async (targetPage: number) => {
    if (!filePath) { showToast('未加载 PDF 文件', 'error'); return; }
    setLoading(true);
    try {
      const arrayBuffer = await window.verityAPI.readFile(filePath);
      const bytes = new Uint8Array(arrayBuffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      const pdfDataBase64 = btoa(binary);
      const segs = await window.verityAPI.getTextSegments(pdfDataBase64, targetPage);
      setSegments(segs);
    } catch (err) {
      console.error('Failed to load text segments:', err);
      showToast(`加载文本段失败: ${(err as Error).message}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [filePath, showToast]);

  useEffect(() => {
    loadSegments(page);
  }, [page, loadSegments]);

  /** 替换文本 */
  const handleReplace = useCallback(async (index: number) => {
    if (!filePath || !newText) return;
    try {
      showToast('正在替换...', 'info');
      const arrayBuffer = await window.verityAPI.readFile(filePath);
      const bytes = new Uint8Array(arrayBuffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      const pdfDataBase64 = btoa(binary);

      const newPdfData = await window.verityAPI.editText(pdfDataBase64, {
        action: 'replace', page, segmentIndex: index, newText,
      });

      // 保存
      const savedBytes = new Uint8Array(newPdfData);
      binary = '';
      for (let i = 0; i < savedBytes.length; i++) binary += String.fromCharCode(savedBytes[i]);
      await window.verityAPI.saveFile(atob(btoa(binary)), filePath);
      window.dispatchEvent(new CustomEvent('verity:reloadPdf'));
      showToast('替换成功', 'success');
      setEditingIndex(null);
      setNewText('');
      setTimeout(() => loadSegments(page), 1500);
    } catch (err) {
      showToast(`替换失败: ${(err as Error).message}`, 'error');
    }
  }, [filePath, page, newText, showToast, loadSegments]);

  /** 删除文本段 */
  const handleDelete = useCallback(async (index: number) => {
    if (!filePath) return;
    try {
      showToast('正在删除...', 'info');
      const arrayBuffer = await window.verityAPI.readFile(filePath);
      const bytes = new Uint8Array(arrayBuffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      const pdfDataBase64 = btoa(binary);

      const newPdfData = await window.verityAPI.editText(pdfDataBase64, {
        action: 'delete', page, segmentIndices: [index],
      });

      const savedBytes = new Uint8Array(newPdfData);
      binary = '';
      for (let i = 0; i < savedBytes.length; i++) binary += String.fromCharCode(savedBytes[i]);
      await window.verityAPI.saveFile(atob(btoa(binary)), filePath);
      window.dispatchEvent(new CustomEvent('verity:reloadPdf'));
      showToast('删除成功', 'success');
      setTimeout(() => loadSegments(page), 1500);
    } catch (err) {
      showToast(`删除失败: ${(err as Error).message}`, 'error');
    }
  }, [filePath, page, showToast, loadSegments]);

  /** 修改样式 */
  const handleModifyStyle = useCallback(async (index: number) => {
    if (!filePath) return;
    try {
      showToast('正在修改样式...', 'info');
      const arrayBuffer = await window.verityAPI.readFile(filePath);
      const bytes = new Uint8Array(arrayBuffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      const pdfDataBase64 = btoa(binary);

      const changes: { fontSize?: number; color?: string } = {};
      if (newFontSize) changes.fontSize = parseFloat(newFontSize);
      changes.color = newColor;

      const newPdfData = await window.verityAPI.editText(pdfDataBase64, {
        action: 'style', page, segmentIndex: index, ...changes,
      });

      const savedBytes = new Uint8Array(newPdfData);
      binary = '';
      for (let i = 0; i < savedBytes.length; i++) binary += String.fromCharCode(savedBytes[i]);
      await window.verityAPI.saveFile(atob(btoa(binary)), filePath);
      window.dispatchEvent(new CustomEvent('verity:reloadPdf'));
      showToast('样式修改成功', 'success');
      setTimeout(() => loadSegments(page), 1500);
    } catch (err) {
      showToast(`样式修改失败: ${(err as Error).message}`, 'error');
    }
  }, [filePath, page, newFontSize, newColor, showToast, loadSegments]);

  return (
    <div className="edit-text-dialog-overlay" onClick={onClose}>
      <div className="edit-text-dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="PDF 文本编辑">
        <div className="edit-text-header">
          <h3>PDF 文本编辑</h3>
          <button className="edit-text-close" onClick={onClose} aria-label="关闭">×</button>
        </div>

        <div className="edit-text-controls">
          <label>
            页码:
            <input
              type="number"
              min={1}
              value={page}
              onChange={(e) => setPage(Math.max(1, parseInt(e.target.value) || 1))}
              className="edit-text-page-input"
            />
          </label>
          <button className="edit-text-refresh" onClick={() => loadSegments(page)}>刷新</button>
        </div>

        {loading && <div className="edit-text-loading">加载中...</div>}

        <div className="edit-text-segment-list">
          {segments.length === 0 && !loading && (
            <p className="edit-text-empty">此页无可编辑的文本段</p>
          )}
          {segments.map((seg) => (
            <div key={seg.index} className="edit-text-segment">
              <div className="segment-info">
                <span className="segment-index">#{seg.index}</span>
                <span className="segment-font">{seg.fontName} {seg.fontSize}pt</span>
              </div>
              <div className="segment-text" title={seg.text}>
                {seg.text.length > 80 ? seg.text.substring(0, 80) + '...' : seg.text}
              </div>

              {editingIndex === seg.index ? (
                <div className="segment-edit-area">
                  <input
                    type="text"
                    className="segment-replace-input"
                    value={newText}
                    onChange={(e) => setNewText(e.target.value)}
                    placeholder="替换文本..."
                    autoFocus
                  />
                  <div className="segment-edit-actions">
                    <button onClick={() => handleReplace(seg.index)} disabled={!newText}>替换</button>
                    <button onClick={() => { setEditingIndex(null); setNewText(''); }}>取消</button>
                  </div>
                  <div className="segment-style-row">
                    <input
                      type="number"
                      className="segment-fontsize-input"
                      value={newFontSize}
                      onChange={(e) => setNewFontSize(e.target.value)}
                      placeholder={`字号(${seg.fontSize})`}
                      step="0.5"
                    />
                    <input
                      type="color"
                      value={newColor}
                      onChange={(e) => setNewColor(e.target.value)}
                      className="segment-color-input"
                    />
                    <button onClick={() => handleModifyStyle(seg.index)}>改样式</button>
                  </div>
                </div>
              ) : (
                <div className="segment-actions">
                  <button onClick={() => { setEditingIndex(seg.index); setNewText(seg.text); setNewFontSize(String(seg.fontSize)); }}>编辑</button>
                  <button className="segment-delete-btn" onClick={() => handleDelete(seg.index)}>删除</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
