import React, { useState, useEffect, useCallback } from 'react';
import { BookmarkItem, BookmarkEdit } from '@/types/electron';

interface BookmarkEditDialogProps {
  pdfData: string;
  onClose: () => void;
}

export const BookmarkEditDialog: React.FC<BookmarkEditDialogProps> = ({
  pdfData,
  onClose,
}) => {
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // 编辑状态
  const [editMode, setEditMode] = useState<'tree' | 'add' | 'edit'>('tree');
  const [editPath, setEditPath] = useState<number[]>([]);
  const [editTitle, setEditTitle] = useState('');
  const [editPageIndex, setEditPageIndex] = useState(0);
  const [editLevel, setEditLevel] = useState(0);
  const [addPosition, setAddPosition] = useState<'after' | 'child'>('after');

  const loadBookmarks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await window.verityAPI.getBookmarks(pdfData);
      setBookmarks(result || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load bookmarks');
    } finally {
      setLoading(false);
    }
  }, [pdfData]);

  useEffect(() => {
    loadBookmarks();
  }, [loadBookmarks]);

  const resetForm = () => {
    setEditTitle('');
    setEditPageIndex(0);
    setEditLevel(0);
    setEditPath([]);
    setAddPosition('after');
  };

  const handleAddRoot = () => {
    resetForm();
    setEditLevel(0);
    setEditPath([]);
    setEditMode('add');
  };

  const handleAddChild = (path: number[]) => {
    resetForm();
    setEditPath(path);
    setEditLevel(path.length + 1);
    setAddPosition('child');
    setEditMode('add');
  };

  const handleAddAfter = (path: number[], level: number) => {
    resetForm();
    setEditPath(path);
    setEditLevel(level);
    setAddPosition('after');
    setEditMode('add');
  };

  const handleEdit = (path: number[], item: BookmarkItem) => {
    setEditPath(path);
    setEditTitle(item.title);
    setEditPageIndex(item.pageIndex);
    setEditLevel(item.level);
    setEditMode('edit');
  };

  const handleDelete = async (path: number[]) => {
    setSaving(true);
    setError(null);
    try {
      const edit: BookmarkEdit = { action: 'delete', path };
      await window.verityAPI.editBookmark(pdfData, edit);
      await loadBookmarks();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete bookmark');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!editTitle.trim()) return;
    setSaving(true);
    setError(null);
    try {
      if (editMode === 'add') {
        const edit: BookmarkEdit = {
          action: 'add',
          title: editTitle.trim(),
          pageIndex: editPageIndex,
          path: addPosition === 'child' ? editPath : editPath.slice(0, -1),
          position: addPosition,
          parentPath: addPosition === 'child' ? editPath : undefined,
        };
        await window.verityAPI.editBookmark(pdfData, edit);
      } else if (editMode === 'edit') {
        const edit: BookmarkEdit = {
          action: 'edit',
          path: editPath,
          title: editTitle.trim(),
          pageIndex: editPageIndex,
        };
        await window.verityAPI.editBookmark(pdfData, edit);
      }
      await loadBookmarks();
      setEditMode('tree');
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save bookmark');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditMode('tree');
    resetForm();
  };

  // 递归渲染书签树
  const renderBookmarkTree = (items: BookmarkItem[], parentPath: number[] = [], level: number = 0) => {
    return items.map((item, index) => {
      const path = [...parentPath, index];
      return (
        <React.Fragment key={path.join('-')}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '6px 8px',
              paddingLeft: `${12 + level * 20}px`,
              borderBottom: '1px solid var(--border-color)',
              gap: '8px',
            }}
          >
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)', minWidth: '28px' }}>
              L{level}
            </span>
            <span style={{ flex: 1, fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.title}
            </span>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
              第 {item.pageIndex + 1} 页
            </span>
            <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
              <button
                onClick={() => handleAddChild(path)}
                className="btn-secondary"
                style={{ fontSize: '11px', padding: '2px 6px' }}
                title="添加子书签"
              >
                +子
              </button>
              <button
                onClick={() => handleAddAfter(path, level)}
                className="btn-secondary"
                style={{ fontSize: '11px', padding: '2px 6px' }}
                title="在此之后添加"
              >
                +后
              </button>
              <button
                onClick={() => handleEdit(path, item)}
                className="btn-secondary"
                style={{ fontSize: '11px', padding: '2px 6px' }}
              >
                编辑
              </button>
              <button
                onClick={() => handleDelete(path)}
                className="btn-secondary"
                style={{ fontSize: '11px', padding: '2px 6px', color: '#e74c3c' }}
              >
                删除
              </button>
            </div>
          </div>
          {item.children && item.children.length > 0 && renderBookmarkTree(item.children, path, level + 1)}
        </React.Fragment>
      );
    });
  };

  return (
    <div className="dialog-overlay">
      <div className="dialog-box" style={{ width: '680px' }}>
        <div className="dialog-header">
          <h2>书签编辑</h2>
          <button onClick={onClose} className="close-button">×</button>
        </div>

        <div className="dialog-body">
          {error && <div className="error-message">{error}</div>}

          {editMode === 'tree' && (
            <>
              <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>共 {bookmarks.length} 个顶级书签</span>
                <button onClick={handleAddRoot} className="btn-primary" style={{ fontSize: '13px' }}>
                  添加书签
                </button>
              </div>

              {loading ? (
                <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-secondary)' }}>
                  加载中...
                </div>
              ) : bookmarks.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-secondary)' }}>
                  此 PDF 中没有书签
                </div>
              ) : (
                <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                  {renderBookmarkTree(bookmarks)}
                </div>
              )}
            </>
          )}

          {(editMode === 'add' || editMode === 'edit') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="form-group">
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px' }}>书签标题</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="输入书签标题"
                  className="form-input"
                  style={{ width: '100%' }}
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px' }}>目标页面 (从1开始)</label>
                <input
                  type="number"
                  min="1"
                  value={editPageIndex + 1}
                  onChange={(e) => setEditPageIndex(Math.max(0, parseInt(e.target.value, 10) - 1 || 0))}
                  className="form-input"
                  style={{ width: '100%' }}
                />
              </div>

              {editMode === 'add' && (
                <div className="form-group">
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px' }}>添加位置</label>
                  <select
                    value={addPosition}
                    onChange={(e) => setAddPosition(e.target.value as 'after' | 'child')}
                    className="form-input"
                    style={{ width: '100%' }}
                  >
                    <option value="after">同级之后</option>
                    <option value="child">作为子书签</option>
                  </select>
                </div>
              )}

              {editPath.length > 0 && (
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  路径: [{editPath.join(', ')}] · 层级: {editLevel}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="dialog-footer">
          {editMode === 'tree' ? (
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
                disabled={saving || !editTitle.trim()}
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