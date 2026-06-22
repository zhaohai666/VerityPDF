import React, { useState, useEffect } from 'react';

interface ExtractedImage {
  pageIndex: number;
  imageIndex: number;
  width: number;
  height: number;
  bitsPerComponent: number;
  colorSpace: string;
  filter: string;
  format: 'jpeg' | 'png' | 'raw';
  data: string;
}

interface Props {
  pdfData: string;
  onClose: () => void;
}

export const ImageExtractDialog: React.FC<Props> = ({ pdfData, onClose }) => {
  const [images, setImages] = useState<ExtractedImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [outputFormat, setOutputFormat] = useState<'png' | 'jpeg'>('png');

  useEffect(() => { extract(); }, []);

  const extract = async () => {
    try {
      const data = await window.verityAPI.extractImages(pdfData);
      setImages(data as ExtractedImage[]);
      setSelected(new Set(data.map((_: ExtractedImage, i: number) => i)));
    } catch (e: any) { setError(e.message || '提取图片失败'); }
    finally { setLoading(false); }
  };

  const toggleSelect = (i: number) => {
    const next = new Set(selected);
    next.has(i) ? next.delete(i) : next.add(i);
    setSelected(next);
  };

  const selectAll = () => setSelected(new Set(images.map((_, i) => i)));
  const selectNone = () => setSelected(new Set());

  const handleSave = async () => {
    if (selected.size === 0) return;
    setSaving(true); setError('');
    try {
      const dirPath = await window.verityAPI.selectOutputDir();
      if (!dirPath) { setSaving(false); return; }
      const toSave = Array.from(selected).map(i => ({
        ...images[i],
        bitsPerComponent: images[i].bitsPerComponent || 8,
        filter: images[i].filter || '',
        format: outputFormat as 'jpeg' | 'png' | 'raw',
      }));
      const savedPaths = await window.verityAPI.saveExtractedImages(toSave, dirPath, 'extracted');
      alert(`已保存 ${savedPaths.length} 张图片到:\n${dirPath}`);
    } catch (e: any) { setError(e.message || '保存失败'); }
    finally { setSaving(false); }
  };

  return (
    <div className="dialog-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog-box" style={{ maxWidth: 600 }}>
        <div className="dialog-header">
          <h3>提取嵌入图片</h3>
          <button className="dialog-close" onClick={onClose}>&times;</button>
        </div>
        <div className="dialog-body">
          {error && <div className="error-msg">{error}</div>}
          {loading ? (
            <p>正在提取图片...</p>
          ) : images.length === 0 ? (
            <p>此 PDF 中未检测到嵌入图片。</p>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
                <button className="btn-secondary btn-sm" onClick={selectAll}>全选</button>
                <button className="btn-secondary btn-sm" onClick={selectNone}>取消全选</button>
                <span style={{ fontSize: 13, color: '#666' }}>共 {images.length} 张，已选 {selected.size} 张</span>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
                  <label>格式:</label>
                  <select value={outputFormat} onChange={e => setOutputFormat(e.target.value as any)}>
                    <option value="png">PNG</option>
                    <option value="jpeg">JPEG</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8, maxHeight: 360, overflowY: 'auto' }}>
                {images.map((img, i) => (
                  <div key={i} onClick={() => toggleSelect(i)}
                    style={{ cursor: 'pointer', border: selected.has(i) ? '2px solid #1890ff' : '1px solid #ddd', borderRadius: 4, padding: 4, textAlign: 'center' }}>
                    <img src={`data:image/${img.format === 'jpeg' ? 'jpeg' : 'png'};base64,${img.data}`}
                      alt={`p${img.pageIndex + 1}_${img.imageIndex + 1}`}
                      style={{ width: '100%', height: 80, objectFit: 'contain', background: '#f5f5f5', borderRadius: 2 }}
                      onError={e => { (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="%23eee"/><text x="40" y="45" text-anchor="middle" fill="%23999" font-size="10">无法预览</text></svg>'; }} />
                    <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>
                      P{img.pageIndex + 1} · {img.width}×{img.height}
                    </div>
                    <div style={{ fontSize: 10, color: '#999' }}>{img.format.toUpperCase()}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="dialog-footer">
          <button className="btn-secondary" onClick={onClose}>关闭</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving || selected.size === 0 || loading}>
            {saving ? '保存中...' : '保存到目录'}
          </button>
        </div>
      </div>
    </div>
  );
};
