import React, { useState, useEffect } from 'react';
import type { FieldActionScripts } from '@/types/electron';

interface FieldScriptViewerProps {
  pdfData: string;
  fieldName: string;
  scripts?: FieldActionScripts;
  onClose: () => void;
}

/**
 * 表单字段动作脚本查看器
 * 只读展示字段的验证/计算/格式化/按键脚本
 */
export const FieldScriptViewer: React.FC<FieldScriptViewerProps> = ({
  pdfData,
  fieldName,
  scripts: initialScripts,
  onClose,
}) => {
  const [scripts, setScripts] = useState<FieldActionScripts>(initialScripts || {});
  const [loading, setLoading] = useState(!initialScripts);

  useEffect(() => {
    if (initialScripts) return;

    const loadScripts = async () => {
      setLoading(true);
      try {
        const result = await window.verityAPI.getFieldActions(pdfData, fieldName);
        setScripts(result);
      } catch (err) {
        console.error('加载脚本失败:', err);
      } finally {
        setLoading(false);
      }
    };
    loadScripts();
  }, [pdfData, fieldName, initialScripts]);

  const scriptEntries = [
    { key: 'validate' as const, label: '验证脚本 (Validate)', description: '字段值改变时执行，用于验证输入' },
    { key: 'calculate' as const, label: '计算脚本 (Calculate)', description: '自动计算字段值' },
    { key: 'format' as const, label: '格式化脚本 (Format)', description: '格式化字段显示' },
    { key: 'keystroke' as const, label: '按键脚本 (Keystroke)', description: '每次按键时执行' },
  ];

  const hasAnyScript = scriptEntries.some(e => scripts[e.key]);

  return (
    <div className="dialog-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dialog-content" style={{ width: '600px', maxHeight: '80vh' }}>
        <div className="dialog-header">
          <h3>字段脚本 - {fieldName}</h3>
          <button className="dialog-close" onClick={onClose}>&times;</button>
        </div>

        <div className="dialog-body">
          {loading ? (
            <div style={{ textAlign: 'center', padding: '20px' }}>加载中...</div>
          ) : !hasAnyScript ? (
            <div style={{ textAlign: 'center', padding: '20px', color: '#888' }}>
              此字段没有关联的 JavaScript 脚本
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {scriptEntries.map((entry) => {
                const script = scripts[entry.key];
                if (!script) return null;

                return (
                  <div key={entry.key} style={{ border: '1px solid #ddd', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ padding: '8px 12px', background: '#f5f5f5', borderBottom: '1px solid #ddd' }}>
                      <strong style={{ fontSize: '13px' }}>{entry.label}</strong>
                      <div style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}>{entry.description}</div>
                    </div>
                    <pre style={{
                      margin: 0,
                      padding: '12px',
                      fontSize: '12px',
                      fontFamily: 'Monaco, Menlo, "Courier New", monospace',
                      background: '#fafafa',
                      overflow: 'auto',
                      maxHeight: '200px',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}>
                      {script}
                    </pre>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="dialog-footer">
          <button className="btn-secondary" onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  );
};

export default FieldScriptViewer;
