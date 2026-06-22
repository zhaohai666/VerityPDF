import React, { useState, useEffect } from 'react';

interface Props {
  pdfData: string;
  onApply: (newPdfData: ArrayBuffer) => void;
  onClose: () => void;
}

const TYPE_LABELS: Record<string, string> = {
  Text: '文本', Highlight: '高亮', Underline: '下划线', StrikeOut: '删除线',
  Stamp: '印章', Link: '链接', Popup: '弹出', FreeText: '自由文本',
  Square: '矩形', Circle: '圆形', Line: '直线', Polygon: '多边形',
  PolyLine: '折线', Ink: '墨迹', FileAttachment: '附件', Sound: '声音',
  Widget: '控件', Screen: '屏幕', Caret: '插入符', Unknown: '未知',
};

export const RemoveAnnotationsDialog: React.FC<Props> = ({ pdfData, onApply, onClose }) => {
  const [stats, setStats] = useState<{ total: number; byType: Record<string, number>; byPage: Record<number, number> } | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  const [removeAll, setRemoveAll] = useState(true);

  useEffect(() => { loadStats(); }, []);

  const loadStats = async () => {
    try {
      const data = await window.verityAPI.detectAnnotations(pdfData);
      setStats(data);
      setSelectedTypes(new Set(Object.keys(data.byType)));
    } catch (e: any) { setError(e.message || '检测标注失败'); }
    finally { setLoading(false); }
  };

  const handleRemove = async () => {
    setProcessing(true); setError('');
    try {
      const result = await window.verityAPI.removeAnnotations(pdfData, {
        removeAll,
        types: removeAll ? undefined : Array.from(selectedTypes),
        preserveSignatures: true,
      });
      onApply(result.pdfData);
    } catch (e: any) { setError(e.message || '删除失败'); }
    finally { setProcessing(false); }
  };

  const toggleType = (type: string) => {
    const next = new Set(selectedTypes);
    next.has(type) ? next.delete(type) : next.add(type);
    setSelectedTypes(next);
  };

  if (loading) return <div className="dialog-overlay"><div className="dialog-box"><p>检测标注...</p></div></div>;

  return (
    <div className="dialog-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog-box" style={{ maxWidth: 480 }}>
        <div className="dialog-header">
          <h3>批量删除标注</h3>
          <button className="dialog-close" onClick={onClose}>&times;</button>
        </div>
        <div className="dialog-body">
          {error && <div className="error-msg">{error}</div>}

          {!stats || stats.total === 0 ? (
            <p>此 PDF 中未检测到标注。</p>
          ) : (
            <>
              <p>共检测到 <strong>{stats.total}</strong> 个标注：</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, margin: '12px 0' }}>
                {Object.entries(stats.byType).map(([type, count]) => (
                  <label key={type} className="checkbox-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input type="checkbox" checked={removeAll || selectedTypes.has(type)} disabled={removeAll}
                      onChange={() => toggleType(type)} />
                    {TYPE_LABELS[type] || type}: {count}
                  </label>
                ))}
              </div>

              <label className="checkbox-label" style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12 }}>
                <input type="checkbox" checked={removeAll} onChange={e => setRemoveAll(e.target.checked)} />
                删除所有类型
              </label>

              <div style={{ marginTop: 12, padding: '8px 12px', background: '#f5f5f5', borderRadius: 4, fontSize: 13, color: '#666' }}>
                签名标注将自动保留，不会被删除
              </div>
            </>
          )}
        </div>
        <div className="dialog-footer">
          <button className="btn-secondary" onClick={onClose}>取消</button>
          <button className="btn-danger" onClick={handleRemove} disabled={processing || !stats || stats.total === 0}>
            {processing ? '处理中...' : '删除'}
          </button>
        </div>
      </div>
    </div>
  );
};
