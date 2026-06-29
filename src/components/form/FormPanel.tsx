import React, { useEffect, useCallback, useState } from 'react';
import { useFormStore } from '@/stores/formStore';
import { usePdfStore } from '@/stores/pdfStore';
import { useUIStore } from '@/stores/uiStore';
import type { FormFieldInfo } from '@/services/form/FormService';
import type { EnhancedFormFieldInfo, XFADetectResult, FieldActionScripts } from '@/types/electron';
import { FieldScriptViewer } from './FieldScriptViewer';

/** 字段类型标签 */
const TYPE_LABELS: Record<string, string> = {
  text: '文本',
  checkbox: '复选框',
  dropdown: '下拉菜单',
  radio: '单选框',
  button: '按钮',
  optionList: '选项列表',
  signature: '签名',
  unknown: '未知',
};

/** 表单字段编辑器 */
const FormFieldEditor: React.FC<{
  field: FormFieldInfo;
  value: string | boolean;
  onChange: (value: string | boolean) => void;
}> = ({ field, value, onChange }) => {
  if (field.readOnly) {
    return (
      <div className="form-field-editor readonly">
        <span className="field-value-readonly">
          {typeof value === 'boolean' ? (value ? '✓' : '✗') : (value || '(空)')}
        </span>
        <span className="readonly-badge">只读</span>
      </div>
    );
  }

  switch (field.type) {
    case 'text':
      return (
        <textarea
          className="form-field-input"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          rows={2}
          placeholder="输入文本..."
        />
      );
    case 'checkbox':
      return (
        <label className="form-field-checkbox">
          <input
            type="checkbox"
            checked={typeof value === 'boolean' ? value : false}
            onChange={(e) => onChange(e.target.checked)}
          />
          <span>{value ? '已选中' : '未选中'}</span>
        </label>
      );
    case 'dropdown':
      return (
        <select
          className="form-field-select"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">-- 请选择 --</option>
          {field.options?.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      );
    case 'radio':
      return (
        <div className="form-field-radio-group">
          {field.options?.map((opt) => (
            <label key={opt} className="form-field-radio">
              <input
                type="radio"
                name={field.name}
                value={opt}
                checked={value === opt}
                onChange={() => onChange(opt)}
              />
              <span>{opt}</span>
            </label>
          ))}
        </div>
      );
    default:
      return <span className="field-unsupported">不支持此字段类型</span>;
  }
};

/** 表单面板（侧边栏内） */
export const FormPanel: React.FC = () => {
  const { fields, editedValues, isDetecting, setFields, setEditedValue, setIsDetecting } = useFormStore();
  const filePath = usePdfStore((s) => s.filePath);
  const showToast = useUIStore.getState().showToast;
  const [xfaInfo, setXfaInfo] = useState<XFADetectResult | null>(null);
  const [scriptViewerField, setScriptViewerField] = useState<string | null>(null);
  const [fieldActions, setFieldActions] = useState<Map<string, FieldActionScripts>>(new Map());

  // 检测表单字段
  const handleDetect = useCallback(async () => {
    if (!filePath) return;
    setIsDetecting(true);
    try {
      const data = await window.verityAPI.readFile(filePath);
      const base64 = btoa(String.fromCharCode(...new Uint8Array(data)));

      // 并行获取字段详情和 XFA 信息
      const [detected, xfa] = await Promise.all([
        window.verityAPI.getFormFieldDetails(base64).catch(() => null),
        window.verityAPI.detectFormXFA(base64).catch(() => null),
      ]);

      // 回退到基本检测
      const finalFields = (detected as FormFieldInfo[] | null) || (await window.verityAPI.detectFormFields(base64) as FormFieldInfo[]);
      setFields(finalFields || []);

      if (xfa) setXfaInfo(xfa);
      if (!finalFields || finalFields.length === 0) {
        showToast('未检测到表单字段', 'info');
      }

      // 收集有动作脚本的字段
      if (detected) {
        const actionsMap = new Map<string, FieldActionScripts>();
        for (const f of detected as EnhancedFormFieldInfo[]) {
          if (f.actions && (f.actions.validate || f.actions.calculate || f.actions.format || f.actions.keystroke)) {
            actionsMap.set(f.name, f.actions);
          }
        }
        setFieldActions(actionsMap);
      }
    } catch (err) {
      showToast('表单检测失败: ' + (err instanceof Error ? err.message : '未知错误'), 'error');
    } finally {
      setIsDetecting(false);
    }
  }, [filePath]);

  // 打开时自动检测
  useEffect(() => {
    if (filePath && fields.length === 0 && !isDetecting) {
      handleDetect();
    }
  }, [filePath]);

  // 应用填充
  const handleFill = useCallback(async () => {
    if (!filePath) return;
    try {
      const data = await window.verityAPI.readFile(filePath);
      const base64 = btoa(String.fromCharCode(...new Uint8Array(data)));
      const result = await window.verityAPI.fillFormFields(base64, editedValues);

      // 保存填充后的文件
      const savePath = await window.verityAPI.showDialog({
        type: 'save',
        filters: [{ name: 'PDF 文件', extensions: ['pdf'] }],
      });
      if (!savePath) return;

      const resultBase64 = btoa(String.fromCharCode(...new Uint8Array(result)));
      await window.verityAPI.saveFile(resultBase64, savePath);
      showToast('表单填充成功', 'success');
    } catch (err) {
      showToast('填充失败: ' + (err instanceof Error ? err.message : '未知错误'), 'error');
    }
  }, [filePath, editedValues]);

  // 扁平化
  const handleFlatten = useCallback(async () => {
    if (!filePath) return;
    try {
      const data = await window.verityAPI.readFile(filePath);
      const base64 = btoa(String.fromCharCode(...new Uint8Array(data)));
      const result = await window.verityAPI.flattenForm(base64);

      const savePath = await window.verityAPI.showDialog({
        type: 'save',
        filters: [{ name: 'PDF 文件', extensions: ['pdf'] }],
      });
      if (!savePath) return;

      const resultBase64 = btoa(String.fromCharCode(...new Uint8Array(result)));
      await window.verityAPI.saveFile(resultBase64, savePath);
      showToast('表单已扁平化', 'success');
    } catch (err) {
      showToast('扁平化失败: ' + (err instanceof Error ? err.message : '未知错误'), 'error');
    }
  }, [filePath]);

  return (
    <div className="form-panel">
      {/* XFA 警告 */}
      {xfaInfo?.hasXFA && (
        <div style={{
          padding: '8px 12px',
          background: '#fff3cd',
          border: '1px solid #ffc107',
          borderRadius: '4px',
          marginBottom: '8px',
          fontSize: '12px',
          color: '#856404',
        }}>
          <strong>XFA 表单</strong>
          <div style={{ marginTop: '4px' }}>{xfaInfo.warning}</div>
        </div>
      )}

      {/* 操作栏 */}
      <div className="form-panel-actions">
        <button
          className="btn-secondary btn-sm"
          onClick={handleDetect}
          disabled={isDetecting}
        >
          {isDetecting ? '检测中...' : '重新检测'}
        </button>
        {fields.length > 0 && (
          <>
            <button className="btn-primary btn-sm" onClick={handleFill}>
              保存填充
            </button>
            <button className="btn-secondary btn-sm" onClick={handleFlatten}>
              扁平化
            </button>
          </>
        )}
      </div>

      {/* 字段列表 */}
      {isDetecting ? (
        <div className="form-loading">
          <div className="loading-spinner" />
          <span>正在检测表单字段...</span>
        </div>
      ) : fields.length === 0 ? (
        <div className="empty-message">
          未检测到表单字段<br />
          <span className="hint">此 PDF 可能不包含可填写的表单</span>
        </div>
      ) : (
        <div className="form-field-list">
          <div className="form-field-count">
            检测到 {fields.length} 个字段
          </div>
          {fields.map((field) => {
            const enhanced = field as EnhancedFormFieldInfo;
            const hasActions = fieldActions.has(field.name);

            return (
              <div key={field.name} className={`form-field-item ${field.readOnly ? 'readonly' : ''}`}>
                <div className="field-header">
                  <span className="field-name" title={field.name}>{field.name}</span>
                  <span className="field-type">{TYPE_LABELS[field.type] || field.type}</span>
                  {field.readOnly && <span className="field-readonly-badge">只读</span>}
                  {enhanced.required && <span style={{ color: '#e53935', fontSize: '10px', marginLeft: '2px' }}>*</span>}
                </div>
                {/* 增强信息 */}
                <div style={{ fontSize: '10px', color: '#888', marginBottom: '4px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {enhanced.page > 0 && <span>第{enhanced.page}页</span>}
                  {enhanced.maxLength != null && <span>最大{enhanced.maxLength}字</span>}
                  {enhanced.multiline && <span>多行</span>}
                  {hasActions && (
                    <button
                      style={{ fontSize: '10px', color: '#1976d2', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
                      onClick={() => setScriptViewerField(field.name)}
                    >
                      查看脚本
                    </button>
                  )}
                </div>
                <div className="field-body">
                  <FormFieldEditor
                    field={field}
                    value={editedValues[field.name] ?? field.value}
                    onChange={(val) => setEditedValue(field.name, val)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 脚本查看器 */}
      {scriptViewerField && filePath && (
        <FieldScriptViewer
          pdfData=""
          fieldName={scriptViewerField}
          scripts={fieldActions.get(scriptViewerField)}
          onClose={() => setScriptViewerField(null)}
        />
      )}
    </div>
  );
};
