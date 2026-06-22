import React, { useState } from 'react';

interface Props {
  pdfData: string;
  onApply: (newPdfData: ArrayBuffer) => void;
  onClose: () => void;
}

export const PdfOverlayDialog: React.FC<Props> = ({ pdfData, onApply, onClose }) => {
  const [overlayFile, setOverlayFile] = useState<string | null>(null);
  const [overlayName, setOverlayName] = useState('');
  const [mode, setMode] = useState<'background' | 'foreground'>('foreground');
  const [opacity, setOpacity] = useState(1);
  const [scale, setScale] = useState<'fit' | 'stretch' | 'original'>('fit');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');

  const selectOverlayFile = async () => {
    const filePath = await window.verityAPI.showDialog({ type: 'open', filters: [{ name: 'PDF 文件', extensions: ['pdf'] }] });
    if (!filePath) return;
    setOverlayFile(filePath);
    setOverlayName(filePath.split(/[\\/]/).pop() || filePath);
  };

  const handleApply = async () => {
    if (!overlayFile) { setError('请选择叠加 PDF 文件'); return; }
    setProcessing(true); setError('');
    try {
      const overlayData = await window.verityAPI.readFile(overlayFile);
      const overlayBase64 = btoa(String.fromCharCode(...new Uint8Array(overlayData)));
      const result = await window.verityAPI.overlayPdfs(pdfData, overlayBase64, { mode, opacity, scale });
      onApply(result);
    } catch (e: any) { setError(e.message || '叠加失败'); }
    finally { setProcessing(false); }
  };

  return (
    <div className="dialog-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog-box" style={{ maxWidth: 480 }}>
        <div className="dialog-header">
          <h3>PDF 叠加（背景/水印模板）</h3>
          <button className="dialog-close" onClick={onClose}>&times;</button>
        </div>
        <div className="dialog-body">
          {error && <div className="error-msg">{error}</div>}

          <div className="form-group">
            <label>叠加 PDF 文件</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="form-input" value={overlayName} readOnly placeholder="点击选择..." />
              <button className="btn-secondary" onClick={selectOverlayFile}>浏览</button>
            </div>
          </div>

          <div className="form-group">
            <label>叠加模式</label>
            <div style={{ display: 'flex', gap: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input type="radio" checked={mode === 'foreground'} onChange={() => setMode('foreground')} /> 前景（覆盖在上方）
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input type="radio" checked={mode === 'background'} onChange={() => setMode('background')} /> 背景（置于底层）
              </label>
            </div>
          </div>

          <div className="form-group">
            <label>透明度: {Math.round(opacity * 100)}%</label>
            <input type="range" min="0.05" max="1" step="0.05" value={opacity}
              onChange={e => setOpacity(Number(e.target.value))} style={{ width: '100%' }} />
          </div>

          <div className="form-group">
            <label>缩放方式</label>
            <select className="form-input" value={scale} onChange={e => setScale(e.target.value as any)}>
              <option value="fit">适应页面</option>
              <option value="stretch">拉伸填满</option>
              <option value="original">原始尺寸</option>
            </select>
          </div>
        </div>
        <div className="dialog-footer">
          <button className="btn-secondary" onClick={onClose}>取消</button>
          <button className="btn-primary" onClick={handleApply} disabled={processing || !overlayFile}>
            {processing ? '处理中...' : '叠加'}
          </button>
        </div>
      </div>
    </div>
  );
};
