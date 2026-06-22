import React, { useState, useMemo } from 'react';
import type { BookletResult } from '@/types/electron';

interface Props {
  pdfData: string;
  onClose: () => void;
}

export const BookletDialog: React.FC<Props> = ({ pdfData, onClose }) => {
  const [binding, setBinding] = useState<'left' | 'right'>('left');
  const [pagesPerSheet, setPagesPerSheet] = useState<2 | 4>(2);
  const [addBlankPages, setAddBlankPages] = useState(true);
  const [result, setResult] = useState<BookletResult | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    setProcessing(true); setError('');
    try {
      const bookletResult = await window.verityAPI.createBooklet(pdfData, {
        binding, pagesPerSheet, addBlankPages,
      }) as BookletResult;
      setResult(bookletResult);
    } catch (e: any) {
      setError(e.message || '创建小册子失败');
    } finally {
      setProcessing(false);
    }
  };

  const handleSave = async () => {
    if (!result?.pdfData) return;
    try {
      const savePath = await window.verityAPI.showDialog({
        type: 'save', defaultPath: 'booklet.pdf',
        filters: [{ name: 'PDF 文件', extensions: ['pdf'] }],
      });
      if (savePath) {
        const bytes = new Uint8Array(result.pdfData);
        const binary = String.fromCharCode(...bytes);
        const CHUNK = 8192;
        let str = '';
        for (let i = 0; i < binary.length; i += CHUNK) {
          str += binary.substring(i, Math.min(i + CHUNK, binary.length));
        }
        await window.verityAPI.saveFile(btoa(str), savePath);
      }
      onClose();
    } catch (e: any) {
      setError(e.message || '保存失败');
    }
  };

  // 生成预览页序
  const previewOrder = useMemo(() => {
    if (!result) return null;
    return result.pageOrder;
  }, [result]);

  return (
    <div className="dialog-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog-box" style={{ maxWidth: 560 }}>
        <div className="dialog-header">
          <h3>小册子页序排列</h3>
          <button className="dialog-close" onClick={onClose}>&times;</button>
        </div>
        <div className="dialog-body">
          {error && <div className="error-msg">{error}</div>}

          <div className="form-group">
            <label>装订方向</label>
            <div style={{ display: 'flex', gap: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input type="radio" checked={binding === 'left'} onChange={() => setBinding('left')} />
                左翻（西文装订）
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input type="radio" checked={binding === 'right'} onChange={() => setBinding('right')} />
                右翻（中文/日文装订）
              </label>
            </div>
          </div>

          <div className="form-group">
            <label>每张纸页面数</label>
            <select className="form-input" value={pagesPerSheet} onChange={e => setPagesPerSheet(Number(e.target.value) as 2 | 4)}>
              <option value={2}>2 页/张（仅重排序，适合双面打印）</option>
              <option value={4}>4 页/张（缩放并排，直接装订）</option>
            </select>
          </div>

          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={addBlankPages} onChange={e => setAddBlankPages(e.target.checked)} />
              自动补空白页（使总页数为 4 的倍数）
            </label>
          </div>

          {!result && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 12 }}>
              <button className="btn-primary" onClick={handleCreate} disabled={processing}>
                {processing ? '生成中...' : '生成小册子页序'}
              </button>
            </div>
          )}

          {result && (
            <div style={{ marginTop: 8 }}>
              <div style={{ display: 'flex', gap: 16, marginBottom: 8, fontSize: 13 }}>
                <span>总页数: {result.totalPages}</span>
                <span>纸张数: {result.totalSheets}</span>
                {result.addedBlankPages > 0 && (
                  <span style={{ color: '#e65100' }}>补了 {result.addedBlankPages} 页空白</span>
                )}
              </div>

              <div className="form-group">
                <label>页序预览</label>
                <div style={{
                  display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4,
                  fontSize: 12, fontFamily: 'monospace',
                }}>
                  {previewOrder?.map((p, i) => (
                    <div key={i} style={{
                      padding: '4px 6px', textAlign: 'center', borderRadius: 3,
                      backgroundColor: p > 0 ? '#e8f5e9' : '#fff3e0',
                      border: '1px solid #ddd',
                    }}>
                      {i % 4 < 2 && i % 2 === 0 && (
                        <div style={{ fontSize: 10, color: '#999', gridColumn: '1 / -1', marginBottom: 2 }}>
                          纸 {(Math.floor(i / 4) * 2 + (i % 4 < 2 ? 1 : 2))} {i % 4 < 2 ? '正面' : '反面'}
                        </div>
                      )}
                      P{p > 0 ? p : '空白'}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="dialog-footer">
          <button className="btn-secondary" onClick={onClose}>{result ? '关闭' : '取消'}</button>
          {result && (
            <button className="btn-primary" onClick={handleSave}>
              保存并导出
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
