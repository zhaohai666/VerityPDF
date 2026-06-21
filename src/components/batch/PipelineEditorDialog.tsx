import React, { useState, useCallback } from 'react';
import { useTaskStore } from '@/stores/taskStore';
import { useUIStore } from '@/stores/uiStore';
import type { PipelineStep, WorkflowTemplate } from '@/types/electron';

/** 可用步骤定义 */
const AVAILABLE_STEPS: Array<{
  type: PipelineStep['type'];
  icon: string;
  label: string;
  description: string;
  defaultOptions: Record<string, unknown>;
}> = [
  { type: 'watermark', icon: 'W', label: '添加水印', description: '文字/图片水印',
    defaultOptions: { type: 'text', content: 'CONFIDENTIAL', opacity: 0.3, rotation: -45 } },
  { type: 'encrypt', icon: '🔒', label: '加密', description: 'AES 加密与权限',
    defaultOptions: { userPassword: '', ownerPassword: '', permissions: { print: true, copy: true, modify: true } } },
  { type: 'compress', icon: '📦', label: '压缩', description: '减小文件体积',
    defaultOptions: { quality: 'medium', removeMetadata: true } },
  { type: 'convert', icon: '🔄', label: '格式转换', description: '转换为其他格式',
    defaultOptions: { targetFormat: 'docx' } },
  { type: 'rotate', icon: '↻', label: '旋转', description: '旋转所有页面',
    defaultOptions: { angle: 90 } },
  { type: 'pageNumbers', icon: '#', label: '添加页码', description: '页码标注',
    defaultOptions: { position: 'bottom-center', style: 'arabic', fontSize: 10, startIndex: 1 } },
];

/** 步骤参数编辑表单 */
const StepParamsEditor: React.FC<{
  step: PipelineStep;
  onChange: (options: Record<string, unknown>) => void;
}> = ({ step, onChange }) => {
  const opts = step.options;

  switch (step.type) {
    case 'watermark':
      return (
        <div className="pipeline-step-params">
          <label>水印文字: <input type="text" value={opts.content as string || ''} onChange={(e) => onChange({ ...opts, content: e.target.value })} /></label>
          <label>透明度: {Math.round((opts.opacity as number || 0.3) * 100)}%
            <input type="range" min="0.1" max="1" step="0.1" value={opts.opacity as number || 0.3} onChange={(e) => onChange({ ...opts, opacity: parseFloat(e.target.value) })} />
          </label>
          <label>旋转角度: <input type="number" value={opts.rotation as number || -45} onChange={(e) => onChange({ ...opts, rotation: parseInt(e.target.value) })} />°</label>
        </div>
      );
    case 'encrypt':
      return (
        <div className="pipeline-step-params">
          <label>打开密码: <input type="password" value={opts.userPassword as string || ''} onChange={(e) => onChange({ ...opts, userPassword: e.target.value })} /></label>
          <div className="encrypt-perms">
            <label><input type="checkbox" checked={!!(opts.permissions as Record<string, boolean>)?.print}
              onChange={(e) => onChange({ ...opts, permissions: { ...(opts.permissions as Record<string, boolean>), print: e.target.checked } })} /> 打印</label>
            <label><input type="checkbox" checked={!!(opts.permissions as Record<string, boolean>)?.copy}
              onChange={(e) => onChange({ ...opts, permissions: { ...(opts.permissions as Record<string, boolean>), copy: e.target.checked } })} /> 复制</label>
            <label><input type="checkbox" checked={!!(opts.permissions as Record<string, boolean>)?.modify}
              onChange={(e) => onChange({ ...opts, permissions: { ...(opts.permissions as Record<string, boolean>), modify: e.target.checked } })} /> 编辑</label>
          </div>
        </div>
      );
    case 'compress':
      return (
        <div className="pipeline-step-params">
          <label>压缩质量:
            <select value={opts.quality as string || 'medium'} onChange={(e) => onChange({ ...opts, quality: e.target.value })}>
              <option value="high">高质量</option>
              <option value="medium">中等</option>
              <option value="low">低质量(高压缩)</option>
            </select>
          </label>
          <label><input type="checkbox" checked={!!opts.removeMetadata}
            onChange={(e) => onChange({ ...opts, removeMetadata: e.target.checked })} /> 清除元数据</label>
        </div>
      );
    case 'convert':
      return (
        <div className="pipeline-step-params">
          <label>目标格式:
            <select value={opts.targetFormat as string || 'docx'} onChange={(e) => onChange({ ...opts, targetFormat: e.target.value })}>
              <option value="docx">Word</option>
              <option value="xlsx">Excel</option>
              <option value="pptx">PPT</option>
              <option value="png">PNG</option>
              <option value="jpg">JPEG</option>
            </select>
          </label>
        </div>
      );
    case 'rotate':
      return (
        <div className="pipeline-step-params">
          <label>旋转角度:
            <select value={opts.angle as number || 90} onChange={(e) => onChange({ ...opts, angle: parseInt(e.target.value) })}>
              <option value={90}>90° 顺时针</option>
              <option value={180}>180°</option>
              <option value={270}>270° 顺时针</option>
            </select>
          </label>
        </div>
      );
    case 'pageNumbers':
      return (
        <div className="pipeline-step-params">
          <label>位置:
            <select value={opts.position as string || 'bottom-center'} onChange={(e) => onChange({ ...opts, position: e.target.value })}>
              <option value="bottom-center">底部居中</option>
              <option value="bottom-right">右下角</option>
              <option value="bottom-left">左下角</option>
              <option value="top-center">顶部居中</option>
            </select>
          </label>
          <label>样式:
            <select value={opts.style as string || 'arabic'} onChange={(e) => onChange({ ...opts, style: e.target.value })}>
              <option value="arabic">阿拉伯数字</option>
              <option value="roman">罗马数字</option>
              <option value="of-total">第X页/共Y页</option>
            </select>
          </label>
        </div>
      );
    default:
      return null;
  }
};

export const PipelineEditorDialog: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { templates, saveTemplate, updateTemplate, deleteTemplate, loadTemplates } = useTaskStore();
  const showToast = useUIStore((s) => s.showToast);

  const [templateName, setTemplateName] = useState('');
  const [steps, setSteps] = useState<PipelineStep[]>([]);
  const [expandedStep, setExpandedStep] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [outputDir, setOutputDir] = useState('');

  // 加载模板
  React.useEffect(() => { loadTemplates(); }, [loadTemplates]);

  // 添加步骤
  const addStep = useCallback((def: typeof AVAILABLE_STEPS[number]) => {
    const newStep: PipelineStep = {
      type: def.type,
      label: def.label,
      options: { ...def.defaultOptions },
    };
    setSteps([...steps, newStep]);
    setExpandedStep(steps.length);
  }, [steps]);

  // 删除步骤
  const removeStep = useCallback((idx: number) => {
    setSteps(steps.filter((_, i) => i !== idx));
    if (expandedStep === idx) setExpandedStep(null);
    else if (expandedStep !== null && expandedStep > idx) setExpandedStep(expandedStep - 1);
  }, [steps, expandedStep]);

  // 移动步骤（上下拖拽）
  const moveStep = useCallback((from: number, to: number) => {
    if (to < 0 || to >= steps.length) return;
    const updated = [...steps];
    const [moved] = updated.splice(from, 1);
    updated.splice(to, 0, moved);
    setSteps(updated);
  }, [steps]);

  // 更新步骤参数
  const updateStepOptions = useCallback((idx: number, options: Record<string, unknown>) => {
    setSteps(steps.map((s, i) => i === idx ? { ...s, options } : s));
  }, [steps]);

  // 保存模板
  const handleSave = useCallback(() => {
    if (!templateName.trim()) {
      showToast('请输入模板名称', 'warning');
      return;
    }
    if (steps.length === 0) {
      showToast('请至少添加一个步骤', 'warning');
      return;
    }

    if (editingId) {
      updateTemplate(editingId, { name: templateName.trim(), steps });
      showToast('模板已更新', 'success');
    } else {
      saveTemplate({ name: templateName.trim(), steps });
      showToast('模板已保存', 'success');
    }
    setEditingId(null);
  }, [templateName, steps, editingId, saveTemplate, updateTemplate, showToast]);

  // 编辑已有模板
  const handleEditTemplate = useCallback((tpl: WorkflowTemplate) => {
    setTemplateName(tpl.name);
    setSteps([...tpl.steps]);
    setEditingId(tpl.id);
    setExpandedStep(null);
  }, []);

  // 删除模板
  const handleDeleteTemplate = useCallback((id: string) => {
    deleteTemplate(id);
    if (editingId === id) {
      setEditingId(null);
      setTemplateName('');
      setSteps([]);
    }
  }, [deleteTemplate, editingId]);

  // 新建
  const handleNew = useCallback(() => {
    setTemplateName('');
    setSteps([]);
    setEditingId(null);
    setExpandedStep(null);
  }, []);

  // 执行模板（提交到任务队列）
  const handleExecute = useCallback(async () => {
    if (steps.length === 0) {
      showToast('请先添加步骤', 'warning');
      return;
    }

    const files = await window.verityAPI.selectInputFiles(['pdf']);
    if (!files.length) return;

    const dir = outputDir || await window.verityAPI.selectOutputDir();
    if (!dir) {
      showToast('请选择输出目录', 'warning');
      return;
    }
    setOutputDir(dir);

    try {
      await window.verityAPI.submitTask({
        type: 'pipeline',
        filePaths: files,
        outputDir: dir,
        label: templateName || '工作流',
        pipelineSteps: steps,
      });
      showToast(`已提交 ${files.length} 个工作流任务`, 'success');
    } catch (err) {
      showToast(`提交失败: ${err instanceof Error ? err.message : String(err)}`, 'error');
    }
  }, [steps, templateName, outputDir, showToast]);

  return (
    <div className="dialog-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dialog pipeline-editor-dialog" style={{ width: 800, maxHeight: '85vh' }}>
        <div className="dialog-header">
          <h3>工作流模板编辑器</h3>
          <button className="dialog-close" onClick={onClose} aria-label="关闭">&times;</button>
        </div>

        <div className="dialog-body" style={{ padding: '16px', overflow: 'auto', display: 'flex', gap: '16px', minHeight: 400 }}>
          {/* 左侧：可用步骤 */}
          <div className="available-steps-panel">
            <h4>可用步骤</h4>
            {AVAILABLE_STEPS.map((def) => (
              <div key={def.type} className="available-step-item" onClick={() => addStep(def)}>
                <span className="available-step-icon">{def.icon}</span>
                <div>
                  <div className="available-step-label">{def.label}</div>
                  <div className="available-step-desc">{def.description}</div>
                </div>
                <span className="available-step-add">+</span>
              </div>
            ))}

            <h4 style={{ marginTop: '16px' }}>已保存模板</h4>
            <div className="template-list">
              {templates.length === 0 && <p className="template-list-empty">暂无模板</p>}
              {templates.map((tpl) => (
                <div key={tpl.id} className={`template-list-item ${editingId === tpl.id ? 'active' : ''}`}>
                  <span className="template-list-name" onClick={() => handleEditTemplate(tpl)}>
                    {tpl.name} ({tpl.steps.length}步)
                  </span>
                  <button className="template-list-delete" onClick={() => handleDeleteTemplate(tpl.id)} title="删除">&times;</button>
                </div>
              ))}
            </div>
          </div>

          {/* 右侧：步骤序列 */}
          <div className="pipeline-steps-editor">
            <div className="pipeline-template-header">
              <input
                type="text"
                className="pipeline-name-input"
                placeholder="模板名称"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
              />
              <button className="pipeline-new-btn" onClick={handleNew} title="新建">新建</button>
            </div>

            {steps.length === 0 && (
              <div className="pipeline-steps-empty">
                <p>从左侧点击添加步骤</p>
                <p className="pipeline-steps-empty-hint">步骤将按顺序执行</p>
              </div>
            )}

            <div className="pipeline-steps-list">
              {steps.map((step, idx) => (
                <React.Fragment key={idx}>
                  {idx > 0 && <div className="pipeline-step-arrow">↓</div>}
                  <div className={`pipeline-step-card ${expandedStep === idx ? 'expanded' : ''}`}>
                    <div className="pipeline-step-header" onClick={() => setExpandedStep(expandedStep === idx ? null : idx)}>
                      <span className="pipeline-step-index">{idx + 1}</span>
                      <span className="pipeline-step-name">{step.label}</span>
                      <div className="pipeline-step-actions">
                        <button onClick={(e) => { e.stopPropagation(); moveStep(idx, idx - 1); }} disabled={idx === 0} title="上移">↑</button>
                        <button onClick={(e) => { e.stopPropagation(); moveStep(idx, idx + 1); }} disabled={idx === steps.length - 1} title="下移">↓</button>
                        <button onClick={(e) => { e.stopPropagation(); removeStep(idx); }} title="删除" className="step-delete-btn">&times;</button>
                      </div>
                    </div>
                    {expandedStep === idx && (
                      <StepParamsEditor step={step} onChange={(opts) => updateStepOptions(idx, opts)} />
                    )}
                  </div>
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>

        <div className="dialog-footer" style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px' }}>
          <button onClick={handleSave} disabled={steps.length === 0}>
            {editingId ? '更新模板' : '保存模板'}
          </button>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={handleExecute} disabled={steps.length === 0}>
              执行 (选择文件)
            </button>
            <button onClick={onClose}>关闭</button>
          </div>
        </div>
      </div>
    </div>
  );
};
