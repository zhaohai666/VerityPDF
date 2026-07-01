import React, { useState, useEffect, useCallback } from 'react';
import {
  HyperlinkAnnotation,
  HyperlinkAnnotationInfo,
  HyperlinkType,
} from '@/types/electron';

interface HyperlinkEditDialogProps {
  pdfData: string;
  onClose: () => void;
}

export const HyperlinkEditDialog: React.FC<HyperlinkEditDialogProps> = ({
  pdfData,
  onClose,
}) => {
  const [links, setLinks] = useState<HyperlinkAnnotationInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState<'list' | 'add' | 'edit'>('list');
  const [editingLink, setEditingLink] = useState<HyperlinkAnnotationInfo | null>(null);

  // 表单状态
  const [formType, setFormType] = useState<HyperlinkType>('uri');
  const [formUri, setFormUri] = useState('');
  const [formPageIndex, setFormPageIndex] = useState(0);
  const [formRect, setFormRect] = useState<[number, number, number, number]>([0, 0, 100, 100]);
  const [formHighlightMode, setFormHighlightMode] = useState<string>('invert');
  const [formColor, setFormColor] = useState<[number, number, number]>([0, 0, 1]);
  const [saving, setSaving] = useState(false);

  const loadLinks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await window.verityAPI.listHyperlinks(pdfData);
      setLinks(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load hyperlinks');
    } finally {
      setLoading(false);
    }
  }, [pdfData]);

  useEffect(() => {
    loadLinks();
  }, [loadLinks]);

  const resetForm = () => {
    setFormType('uri');
    setFormUri('');
    setFormPageIndex(0);
    setFormRect([0, 0, 100, 100]);
    setFormHighlightMode('invert');
    setFormColor([0, 0, 1]);
    setEditingLink(null);
  };

  const handleAdd = () => {
    resetForm();
    setEditMode('add');
  };

  const handleEdit = (link: HyperlinkAnnotationInfo) => {
    setEditingLink(link);
    setFormType(link.type);
    setFormUri(link.uri || '');
    setFormPageIndex(link.destPageIndex || 0);
    setFormRect(link.rect);
    setFormHighlightMode(link.highlightMode);
    setFormColor(link.color || [0, 0, 1]);
    setEditMode('edit');
  };

  const handleDelete = async (link: HyperlinkAnnotationInfo) => {
    try {
      await window.verityAPI.removeHyperlink(pdfData, link.pageIndex, link.annotIndex);
      setLinks((prev) => prev.filter((l) => l !== link));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete hyperlink');
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const annotation: HyperlinkAnnotation = {
        type: formType,
        pageIndex: 0, // will be overridden by rect position
        rect: formRect,
        uri: formType === 'uri' ? formUri : undefined,
        destPageIndex: formType === 'goto' ? formPageIndex : undefined,
        highlightMode: formHighlightMode as HyperlinkAnnotation['highlightMode'],
        color: formColor,
      };

      if (editMode === 'add') {
        await window.verityAPI.addHyperlink(pdfData, annotation);
      } else if (editMode === 'edit' && editingLink) {
        const { type, uri, destPageIndex, highlightMode, color, rect } = annotation;
        await window.verityAPI.editHyperlink(pdfData, editingLink.pageIndex, editingLink.annotIndex, {
          type, uri, destPageIndex, highlightMode, color, rect,
        });
      }

      await loadLinks();
      setEditMode('list');
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save hyperlink');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditMode('list');
    resetForm();
  };

  return (
    <div className="dialog-overlay">
      <div className="dialog-box" style={{ width: '680px' }}>
        <div className="dialog-header">
          <h2>链接编辑</h2>
          <button onClick={onClose} className="close-button">×</button>
        </div>

        <div className="dialog-body">
          {error && <div className="error-message">{error}</div>}

          {editMode === 'list' && (
            <>
              <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>共 {links.length} 个链接</span>
                <button onClick={handleAdd} className="btn-primary" style={{ fontSize: '13px' }}>
                  添加链接
                </button>
              </div>

              {loading ? (
                <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-secondary)' }}>
                  加载中...
                </div>
              ) : links.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-secondary)' }}>
                  此 PDF 中没有链接
                </div>
              ) : (
                <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                  {links.map((link) => (
                    <div
                      key={link.id}
                      style={{
                        padding: '10px 12px',
                        borderBottom: '1px solid var(--border-color)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 500, fontSize: '13px' }}>
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              marginRight: '8px',
                              background: link.type === 'uri' ? 'var(--accent-color)' : 'var(--bg-tertiary)',
                              color: link.type === 'uri' ? '#fff' : 'var(--text-primary)',
                            }}
                          >
                            {link.type === 'uri' ? 'URL' : '页面跳转'}
                          </span>
                          {link.type === 'uri' ? link.uri : `第 ${(link.destPageIndex ?? 0) + 1} 页`}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                          页面 {link.pageIndex + 1} · 区域 [{link.rect.map((r) => r.toFixed(0)).join(', ')}]
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          onClick={() => handleEdit(link)}
                          className="btn-secondary"
                          style={{ fontSize: '12px', padding: '4px 10px' }}
                        >
                          编辑
                        </button>
                        <button
                          onClick={() => handleDelete(link)}
                          className="btn-secondary"
                          style={{ fontSize: '12px', padding: '4px 10px', color: '#e74c3c' }}
                        >
                          删除
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {(editMode === 'add' || editMode === 'edit') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="form-group">
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px' }}>链接类型</label>
                <select
                  value={formType}
                  onChange={(e) => setFormType(e.target.value as HyperlinkType)}
                  className="form-input"
                  style={{ width: '100%' }}
                >
                  <option value="uri">URL 链接</option>
                  <option value="goto">页面跳转</option>
                </select>
              </div>

              {formType === 'uri' ? (
                <div className="form-group">
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px' }}>URL 地址</label>
                  <input
                    type="text"
                    value={formUri}
                    onChange={(e) => setFormUri(e.target.value)}
                    placeholder="https://example.com"
                    className="form-input"
                    style={{ width: '100%' }}
                  />
                </div>
              ) : (
                <div className="form-group">
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px' }}>目标页面 (从1开始)</label>
                  <input
                    type="number"
                    min="1"
                    value={formPageIndex + 1}
                    onChange={(e) => setFormPageIndex(Math.max(0, parseInt(e.target.value, 10) - 1 || 0))}
                    className="form-input"
                    style={{ width: '100%' }}
                  />
                </div>
              )}

              <div className="form-group">
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px' }}>
                  矩形区域 [x1, y1, x2, y2]
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '8px' }}>
                  {formRect.map((val, i) => (
                    <input
                      key={i}
                      type="number"
                      value={val}
                      onChange={(e) => {
                        const newRect = [...formRect] as [number, number, number, number];
                        newRect[i] = parseFloat(e.target.value) || 0;
                        setFormRect(newRect);
                      }}
                      className="form-input"
                      placeholder={['x1', 'y1', 'x2', 'y2'][i]}
                    />
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px' }}>高亮模式</label>
                <select
                  value={formHighlightMode}
                  onChange={(e) => setFormHighlightMode(e.target.value)}
                  className="form-input"
                  style={{ width: '100%' }}
                >
                  <option value="none">无</option>
                  <option value="invert">反色</option>
                  <option value="outline">轮廓</option>
                  <option value="push">按压</option>
                </select>
              </div>

              <div className="form-group">
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px' }}>
                  边框颜色 [R, G, B] (0-1)
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                  {formColor.map((val, i) => (
                    <input
                      key={i}
                      type="number"
                      min="0"
                      max="1"
                      step="0.1"
                      value={val}
                      onChange={(e) => {
                        const newColor = [...formColor] as [number, number, number];
                        newColor[i] = Math.min(1, Math.max(0, parseFloat(e.target.value) || 0));
                        setFormColor(newColor);
                      }}
                      className="form-input"
                      placeholder={['R', 'G', 'B'][i]}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="dialog-footer">
          {editMode === 'list' ? (
            <button onClick={onClose} className="btn-secondary">
              关闭
            </button>
          ) : (
            <>
              <button onClick={handleCancel} className="btn-secondary">
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={saving || (formType === 'uri' && !formUri.trim())}
                className="btn-primary"
              >
                {saving ? '保存中...' : '保存'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};