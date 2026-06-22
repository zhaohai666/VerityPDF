import React, { useState } from 'react';

interface Props {
  pdfData: string;
  onApply: (newPdfData: ArrayBuffer) => void;
  onClose: () => void;
}

const PAPER_SIZES = [
  { label: 'A3 (297×420mm)', value: 'A3' },
  { label: 'A4 (210×297mm)', value: 'A4' },
  { label: 'A5 (148×210mm)', value: 'A5' },
  { label: 'Letter (8.5×11in)', value: 'Letter' },
  { label: 'Legal (8.5×14in)', value: 'Legal' },
  { label: 'B5 (176×250mm)', value: 'B5' },
  { label: '自定义', value: 'custom' },
];

export const PageResizeDialog: React.FC<Props> = ({ pdfData, onApply, onClose }) => {
  const [targetSize, setTargetSize] = useState('A4');
  const [customW, setCustomW] = useState(595.28);
  const [customH, setCustomH] = useState(841.89);
  const [scaleMode, setScaleMode] = useState<'fit' | 'stretch' | 'crop'>('fit');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');

  const handleApply = async () => {
    setProcessing(true); setError('');
    try {
      const size = targetSize === 'custom' ? { width: customW, height: customH } : targetSize;
      const result = await window.verityAPI.resizePages(pdfData, { targetSize: size, scaleMode });
      onApply(result);
    } catch (e: any) { setError(e.message || '缩放失败'); }
    finally { setProcessing(false); }
  };

  return (
    <div className="dialog-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog-box" style={{ maxWidth: 460 }}>
        <div className="dialog-header">
          <h3>页面尺寸缩放</h3>
          <button className="dialog-close" onClick={onClose}>&times;</button>
        </div>
        <div className="dialog-body">
          {error && <div className="error-msg">{error}</div>}
          <div className="form-group">
            <label>目标纸张尺寸</label>
            <select className="form-input" value={targetSize} onChange={e => setTargetSize(e.target.value)}>
              {PAPER_SIZES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          {targetSize === 'custom' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label>宽度 (pt)</label>
                <input className="form-input" type="number" value={customW} onChange={e => setCustomW(Number(e.target.value))} />
              </div>
              <div className="form-group">
                <label>高度 (pt)</label>
                <input className="form-input" type="number" value={customH} onChange={e => setCustomH(Number(e.target.value))} />
              </div>
            </div>
          )}
          <div className="form-group">
            <label>缩放模式</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {([['fit', '适应（保持比例）'], ['stretch', '拉伸'], ['crop', '裁剪适应']] as const).map(([v, label]) => (
                <label key={v} className="radio-label" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <input type="radio" name="scaleMode" value={v} checked={scaleMode === v} onChange={() => setScaleMode(v)} />
                  {label}
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="dialog-footer">
          <button className="btn-secondary" onClick={onClose}>取消</button>
          <button className="btn-primary" onClick={handleApply} disabled={processing}>
            {processing ? '处理中...' : '应用'}
          </button>
        </div>
      </div>
    </div>
  );
};
