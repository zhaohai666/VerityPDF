import React, { useState } from 'react';

interface Props {
  pdfData: string;
  onApply: (newPdfData: ArrayBuffer) => void;
  onClose: () => void;
}

const LAYOUTS = [
  { value: '2x1', label: '2×1（2页合一）' },
  { value: '1x2', label: '1×2（2页竖排）' },
  { value: '2x2', label: '2×2（4页合一）' },
  { value: '3x3', label: '3×3（9页合一）' },
  { value: '4x4', label: '4×4（16页合一）' },
];

const PAPER_SIZES = [
  { label: 'A4', value: 'A4' },
  { label: 'A3', value: 'A3' },
  { label: 'Letter', value: 'Letter' },
  { label: '与原页相同', value: '' },
];

export const NUpDialog: React.FC<Props> = ({ pdfData, onApply, onClose }) => {
  const [layout, setLayout] = useState<'2x1' | '1x2' | '2x2' | '3x3' | '4x4'>('2x2');
  const [pageSize, setPageSize] = useState('');
  const [margin, setMargin] = useState(10);
  const [border, setBorder] = useState(true);
  const [order, setOrder] = useState<'row' | 'column'>('row');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');

  const handleApply = async () => {
    setProcessing(true); setError('');
    try {
      const result = await window.verityAPI.createNUp(pdfData, {
        layout,
        pageSize: pageSize || undefined,
        margin,
        border,
        order,
      });
      onApply(result);
    } catch (e: any) { setError(e.message || 'N-up 处理失败'); }
    finally { setProcessing(false); }
  };

  return (
    <div className="dialog-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog-box" style={{ maxWidth: 460 }}>
        <div className="dialog-header">
          <h3>N-up 多页合一</h3>
          <button className="dialog-close" onClick={onClose}>&times;</button>
        </div>
        <div className="dialog-body">
          {error && <div className="error-msg">{error}</div>}

          <div className="form-group">
            <label>布局</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {LAYOUTS.map(l => (
                <button key={l.value} className={`btn-chip ${layout === l.value ? 'active' : ''}`}
                  onClick={() => setLayout(l.value as any)}>{l.label}</button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label>输出纸张尺寸</label>
            <select className="form-input" value={pageSize} onChange={e => setPageSize(e.target.value)}>
              {PAPER_SIZES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label>边距 (pt): {margin}</label>
            <input type="range" min="0" max="50" step="2" value={margin}
              onChange={e => setMargin(Number(e.target.value))} style={{ width: '100%' }} />
          </div>

          <div style={{ display: 'flex', gap: 24 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={border} onChange={e => setBorder(e.target.checked)} />
              显示边框
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              排列顺序：
              <select value={order} onChange={e => setOrder(e.target.value as any)}>
                <option value="row">横向优先</option>
                <option value="column">纵向优先</option>
              </select>
            </label>
          </div>
        </div>
        <div className="dialog-footer">
          <button className="btn-secondary" onClick={onClose}>取消</button>
          <button className="btn-primary" onClick={handleApply} disabled={processing}>
            {processing ? '处理中...' : '生成'}
          </button>
        </div>
      </div>
    </div>
  );
};
