import React, { useState, useRef, useCallback } from 'react';
import type { PdfDiffResult, DiffLine } from '@/types/electron';

interface Props {
  pdfData: string;
  onClose: () => void;
}

export const PdfDiffDialog: React.FC<Props> = ({ pdfData, onClose }) => {
  const [secondFile, setSecondFile] = useState<string | null>(null);
  const [secondName, setSecondName] = useState('');
  const [result, setResult] = useState<PdfDiffResult | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [currentDiffIdx, setCurrentDiffIdx] = useState(0);
  const diffListRef = useRef<HTMLDivElement>(null);

  const selectSecondFile = async () => {
    const filePath = await window.verityAPI.showDialog({ type: 'open', filters: [{ name: 'PDF 文件', extensions: ['pdf'] }] });
    if (!filePath) return;
    setSecondFile(filePath);
    setSecondName(filePath.split(/[\\/]/).pop() || filePath);
  };

  const handleCompare = async () => {
    if (!secondFile) { setError('请选择对比 PDF 文件'); return; }
    setProcessing(true); setError('');
    try {
      const data2 = await window.verityAPI.readFile(secondFile);
      const b64_2 = btoa(String.fromCharCode(...new Uint8Array(data2)));
      const diffResult = await window.verityAPI.diffPdfs(pdfData, b64_2) as PdfDiffResult;
      setResult(diffResult);
      setCurrentDiffIdx(0);
    } catch (e: any) {
      setError(e.message || '对比失败');
    } finally {
      setProcessing(false);
    }
  };

  const diffIndices = result
    ? result.diffs.reduce<number[]>((acc, d, i) => {
        if (d.type !== 'equal') acc.push(i);
        return acc;
      }, [])
    : [];

  const navigateDiff = useCallback((direction: 'prev' | 'next') => {
    if (diffIndices.length === 0) return;
    const currentPos = diffIndices.findIndex(i => i >= currentDiffIdx);
    let newIdx: number;
    if (direction === 'next') {
      newIdx = currentPos < diffIndices.length - 1 ? currentPos + 1 : 0;
    } else {
      newIdx = currentPos > 0 ? currentPos - 1 : diffIndices.length - 1;
    }
    setCurrentDiffIdx(diffIndices[newIdx]);

    // 滚动到对应位置
    if (diffListRef.current) {
      const el = diffListRef.current.querySelector(`[data-diff-idx="${diffIndices[newIdx]}"]`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [currentDiffIdx, diffIndices]);

  const getLineClass = (diff: DiffLine) => {
    switch (diff.type) {
      case 'added': return 'diff-added';
      case 'removed': return 'diff-removed';
      default: return 'diff-equal';
    }
  };

  return (
    <div className="dialog-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog-box" style={{ maxWidth: 900, width: '90vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
        <div className="dialog-header">
          <h3>PDF 文本对比</h3>
          <button className="dialog-close" onClick={onClose}>&times;</button>
        </div>
        <div className="dialog-body" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {error && <div className="error-msg">{error}</div>}

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 13, color: '#666' }}>当前文档 vs</span>
            <input className="form-input" value={secondName} readOnly placeholder="选择对比文件..." style={{ flex: 1 }} />
            <button className="btn-secondary" onClick={selectSecondFile}>浏览</button>
            <button className="btn-primary" onClick={handleCompare} disabled={processing || !secondFile}>
              {processing ? '对比中...' : '开始对比'}
            </button>
          </div>

          {result && (
            <>
              <div style={{ display: 'flex', gap: 16, marginBottom: 8, fontSize: 13, flexShrink: 0 }}>
                <span>A: {result.stats.totalLinesA} 行 ({result.pagesA} 页)</span>
                <span style={{ color: '#d32f2f' }}>- {result.stats.removedCount} 删除</span>
                <span style={{ color: '#2e7d32' }}>+ {result.stats.addedCount} 新增</span>
                <span style={{ color: '#666' }}>= {result.stats.equalCount} 相同</span>
                <span style={{ color: '#666' }}>变化率: {(result.stats.changeRatio * 100).toFixed(1)}%</span>
                <span style={{ flex: 1 }} />
                <button className="btn-secondary" style={{ padding: '2px 8px', fontSize: 12 }}
                  onClick={() => navigateDiff('prev')} disabled={diffIndices.length === 0}>
                  &uarr; 上一处
                </button>
                <button className="btn-secondary" style={{ padding: '2px 8px', fontSize: 12 }}
                  onClick={() => navigateDiff('next')} disabled={diffIndices.length === 0}>
                  &darr; 下一处
                </button>
                <span style={{ fontSize: 12, color: '#999' }}>
                  {diffIndices.length > 0 ? `${Math.min(currentDiffIdx + 1, diffIndices.length)}/${diffIndices.length}` : '0/0'}
                </span>
              </div>

              <div ref={diffListRef} style={{ flex: 1, overflow: 'auto', border: '1px solid #ddd', borderRadius: 4, fontFamily: 'monospace', fontSize: 12 }}>
                {result.diffs.map((diff, idx) => (
                  <div key={idx} data-diff-idx={idx} className={getLineClass(diff)}
                    style={{
                      display: 'flex', borderBottom: '1px solid #eee',
                      padding: '2px 8px', minHeight: 20, alignItems: 'center',
                      backgroundColor: diff.type === 'added' ? '#e6ffe6' : diff.type === 'removed' ? '#ffe6e6' : 'transparent',
                    }}>
                    <span style={{ width: 40, textAlign: 'right', color: '#999', flexShrink: 0, paddingRight: 8 }}>
                      {diff.lineA >= 0 ? diff.lineA + 1 : ''}
                    </span>
                    <span style={{ width: 40, textAlign: 'right', color: '#999', flexShrink: 0, paddingRight: 8 }}>
                      {diff.lineB >= 0 ? diff.lineB + 1 : ''}
                    </span>
                    <span style={{
                      width: 16, textAlign: 'center', fontWeight: 'bold', flexShrink: 0,
                      color: diff.type === 'added' ? '#2e7d32' : diff.type === 'removed' ? '#d32f2f' : '#999',
                    }}>
                      {diff.type === 'added' ? '+' : diff.type === 'removed' ? '-' : ' '}
                    </span>
                    <span style={{ flex: 1, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                      {diff.text}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="dialog-footer">
          <button className="btn-secondary" onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  );
};
