import React, { useState, useEffect } from 'react';

interface PdfMetadata {
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string[];
  creator?: string;
  producer?: string;
  creationDate?: string;
  modificationDate?: string;
}

interface Props {
  pdfData: string;
  onApply: (newPdfData: ArrayBuffer) => void;
  onClose: () => void;
}

export const MetadataEditorDialog: React.FC<Props> = ({ pdfData, onApply, onClose }) => {
  const [metadata, setMetadata] = useState<PdfMetadata>({});
  const [keywordInput, setKeywordInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadMetadata();
  }, []);

  const loadMetadata = async () => {
    try {
      const data = await window.verityAPI.getPdfMetadata(pdfData);
      setMetadata(data);
    } catch (e: any) {
      setError(e.message || '读取元数据失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const result = await window.verityAPI.setPdfMetadata(pdfData, metadata);
      onApply(result);
    } catch (e: any) {
      setError(e.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const addKeyword = () => {
    const kw = keywordInput.trim();
    if (kw && !metadata.keywords?.includes(kw)) {
      setMetadata({ ...metadata, keywords: [...(metadata.keywords || []), kw] });
    }
    setKeywordInput('');
  };

  const removeKeyword = (kw: string) => {
    setMetadata({ ...metadata, keywords: metadata.keywords?.filter(k => k !== kw) || [] });
  };

  if (loading) return <div className="dialog-overlay"><div className="dialog-box"><p>读取元数据...</p></div></div>;

  return (
    <div className="dialog-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog-box" style={{ maxWidth: 500 }}>
        <div className="dialog-header">
          <h3>PDF 元数据编辑</h3>
          <button className="dialog-close" onClick={onClose}>&times;</button>
        </div>
        <div className="dialog-body">
          {error && <div className="error-msg">{error}</div>}

          <div className="form-group">
            <label>标题</label>
            <input className="form-input" value={metadata.title || ''} onChange={e => setMetadata({ ...metadata, title: e.target.value })} />
          </div>
          <div className="form-group">
            <label>作者</label>
            <input className="form-input" value={metadata.author || ''} onChange={e => setMetadata({ ...metadata, author: e.target.value })} />
          </div>
          <div className="form-group">
            <label>主题</label>
            <input className="form-input" value={metadata.subject || ''} onChange={e => setMetadata({ ...metadata, subject: e.target.value })} />
          </div>
          <div className="form-group">
            <label>关键词</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
              {(metadata.keywords || []).map(kw => (
                <span key={kw} className="tag-chip">
                  {kw}
                  <button onClick={() => removeKeyword(kw)}>&times;</button>
                </span>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <input className="form-input" value={keywordInput} onChange={e => setKeywordInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addKeyword())} placeholder="输入关键词回车添加" />
              <button className="btn-secondary" onClick={addKeyword}>添加</button>
            </div>
          </div>
          <div className="form-group">
            <label>创建者</label>
            <input className="form-input" value={metadata.creator || ''} onChange={e => setMetadata({ ...metadata, creator: e.target.value })} />
          </div>
          <div className="form-group">
            <label>生成器</label>
            <input className="form-input" value={metadata.producer || ''} onChange={e => setMetadata({ ...metadata, producer: e.target.value })} />
          </div>
          <div className="form-group">
            <label>创建日期</label>
            <input className="form-input" type="datetime-local" value={metadata.creationDate?.slice(0, 16) || ''}
              onChange={e => setMetadata({ ...metadata, creationDate: e.target.value ? new Date(e.target.value).toISOString() : undefined })} />
          </div>
          {metadata.modificationDate && (
            <div className="form-group">
              <label>修改日期（只读）</label>
              <input className="form-input" disabled value={new Date(metadata.modificationDate).toLocaleString()} />
            </div>
          )}
        </div>
        <div className="dialog-footer">
          <button className="btn-secondary" onClick={onClose}>取消</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
};
