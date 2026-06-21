import React, { useState, useCallback, useMemo } from 'react';
import { useTaskStore } from '@/stores/taskStore';
import { useUIStore } from '@/stores/uiStore';
import type { TaskType, TaskItemInfo, WorkflowTemplate } from '@/types/electron';

/** 任务类型标签 */
const TYPE_LABELS: Record<TaskType, string> = {
  convert: '格式转换',
  watermark: '加水印',
  encrypt: '加密',
  compress: '压缩',
  pipeline: '工作流',
};

/** 状态标签样式 */
const STATUS_COLORS: Record<string, string> = {
  queued: '#999',
  running: '#1677ff',
  completed: '#52c41a',
  failed: '#ff4d4f',
  cancelled: '#faad14',
};

const STATUS_LABELS: Record<string, string> = {
  queued: '等待中',
  running: '处理中',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
};

/** 计算剩余时间预估 */
function formatETA(task: TaskItemInfo): string {
  if (task.status !== 'running' || !task.startTime || task.progress <= 0) return '';
  const elapsed = Date.now() - task.startTime;
  const totalEstimated = elapsed / (task.progress / 100);
  const remaining = Math.max(0, totalEstimated - elapsed);
  if (remaining < 1000) return '即将完成';
  if (remaining < 60000) return `${Math.ceil(remaining / 1000)}秒`;
  return `${Math.ceil(remaining / 60000)}分钟`;
}

export const TaskCenterDialog: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { tasks, templates, removeTaskFromStore } = useTaskStore();
  const showToast = useUIStore((s) => s.showToast);

  const [outputDir, setOutputDir] = useState<string>('');
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [configStep, setConfigStep] = useState<{
    type: TaskType;
    files: string[];
    options: Record<string, unknown>;
  } | null>(null);

  // 选择输出目录
  const handleSelectOutput = useCallback(async () => {
    const dir = await window.verityAPI.selectOutputDir();
    if (dir) setOutputDir(dir);
  }, []);

  // 选择输入文件
  const handleSelectFiles = useCallback(async (type: TaskType): Promise<string[]> => {
    const exts = type === 'convert' ? ['pdf', 'docx', 'xlsx', 'pptx'] : ['pdf'];
    return window.verityAPI.selectInputFiles(exts);
  }, []);

  // 开始添加任务（第一步：选文件）
  const handleStartAdd = useCallback(async (type: TaskType) => {
    setShowAddMenu(false);
    const files = await handleSelectFiles(type);
    if (!files.length) return;

    // 转换和压缩有额外配置步骤
    if (type === 'convert') {
      setConfigStep({ type, files, options: { targetFormat: 'docx' } });
    } else if (type === 'watermark') {
      setConfigStep({ type, files, options: { type: 'text', content: 'CONFIDENTIAL', opacity: 0.3, rotation: -45 } });
    } else if (type === 'encrypt') {
      setConfigStep({ type, files, options: { userPassword: '', ownerPassword: '', permissions: { print: true, copy: true, modify: true } } });
    } else if (type === 'compress') {
      setConfigStep({ type, files, options: { quality: 'medium', removeMetadata: true } });
    } else if (type === 'pipeline') {
      // 工作流：选择模板
      setConfigStep({ type, files, options: {} });
    }
  }, [handleSelectFiles]);

  // 提交任务
  const handleSubmit = useCallback(async () => {
    if (!configStep) return;
    if (!outputDir) {
      showToast('请先选择输出目录', 'warning');
      return;
    }

    const { type, files, options } = configStep;
    let pipelineSteps: WorkflowTemplate['steps'] | undefined;

    if (type === 'pipeline') {
      const tplId = options.templateId as string;
      const tpl = templates.find((t) => t.id === tplId);
      if (!tpl) {
        showToast('请选择工作流模板', 'warning');
        return;
      }
      pipelineSteps = tpl.steps;
    }

    try {
      await window.verityAPI.submitTask({
        type,
        filePaths: files,
        outputDir,
        label: TYPE_LABELS[type],
        options,
        pipelineSteps,
      });
      showToast(`已提交 ${files.length} 个任务`, 'success');
      setConfigStep(null);
    } catch (err) {
      showToast(`提交失败: ${err instanceof Error ? err.message : String(err)}`, 'error');
    }
  }, [configStep, outputDir, templates, showToast]);

  // 取消任务
  const handleCancel = useCallback(async (taskId: string) => {
    await window.verityAPI.cancelTask(taskId);
  }, []);

  // 重试任务
  const handleRetry = useCallback(async (taskId: string) => {
    const newId = await window.verityAPI.retryTask(taskId);
    if (newId) {
      removeTaskFromStore(taskId);
    }
  }, [removeTaskFromStore]);

  // 移除任务
  const handleRemove = useCallback(async (taskId: string) => {
    await window.verityAPI.removeTask(taskId);
    removeTaskFromStore(taskId);
  }, [removeTaskFromStore]);

  // 全部取消
  const handleCancelAll = useCallback(async () => {
    await window.verityAPI.cancelAllTasks();
  }, []);

  // 清除已完成
  const handleClearCompleted = useCallback(async () => {
    await window.verityAPI.clearCompletedTasks();
    // 同步更新 store
    const status = await window.verityAPI.getTaskStatus();
    useTaskStore.getState().setTasks(status.tasks);
  }, []);

  // 统计
  const stats = useMemo(() => {
    const total = tasks.length;
    const completed = tasks.filter((t) => t.status === 'completed').length;
    const failed = tasks.filter((t) => t.status === 'failed').length;
    const running = tasks.filter((t) => t.status === 'running').length;
    const queued = tasks.filter((t) => t.status === 'queued').length;
    return { total, completed, failed, running, queued };
  }, [tasks]);

  // 过滤后的任务（排除已取消/完成的旧任务，但保留最近的）
  const displayTasks = useMemo(() => {
    return [...tasks].reverse(); // 最新的在前
  }, [tasks]);

  return (
    <div className="dialog-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dialog task-center-dialog" style={{ width: 720, maxHeight: '80vh' }}>
        <div className="dialog-header">
          <h3>批量任务中心</h3>
          <button className="dialog-close" onClick={onClose} aria-label="关闭">&times;</button>
        </div>

        <div className="dialog-body" style={{ padding: '16px', overflow: 'auto' }}>
          {/* 操作栏 */}
          <div className="task-toolbar">
            <div className="task-toolbar-left">
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <button
                  className="task-add-btn"
                  onClick={() => setShowAddMenu(!showAddMenu)}
                  disabled={!!configStep}
                >
                  + 添加任务
                </button>
                {showAddMenu && (
                  <div className="task-add-menu">
                    <button onClick={() => handleStartAdd('convert')}>批量转换</button>
                    <button onClick={() => handleStartAdd('watermark')}>批量加水印</button>
                    <button onClick={() => handleStartAdd('encrypt')}>批量加密</button>
                    <button onClick={() => handleStartAdd('compress')}>批量压缩</button>
                    <button onClick={() => handleStartAdd('pipeline')}>执行工作流</button>
                  </div>
                )}
              </div>
            </div>
            <div className="task-toolbar-right">
              <span className="output-dir-label" title={outputDir}>
                {outputDir ? `输出: ...${outputDir.slice(-30)}` : '未选输出目录'}
              </span>
              <button className="task-select-dir-btn" onClick={handleSelectOutput}>
                选择目录
              </button>
            </div>
          </div>

          {/* 配置面板 */}
          {configStep && (
            <div className="task-config-panel">
              <div className="task-config-header">
                <span>配置: {TYPE_LABELS[configStep.type]} ({configStep.files.length} 个文件)</span>
                <button onClick={() => setConfigStep(null)} className="task-config-cancel">&times;</button>
              </div>

              {configStep.type === 'convert' && (
                <div className="task-config-form">
                  <label>
                    目标格式:
                    <select
                      value={configStep.options.targetFormat as string}
                      onChange={(e) => setConfigStep({ ...configStep, options: { ...configStep.options, targetFormat: e.target.value } })}
                    >
                      <option value="docx">Word (docx)</option>
                      <option value="xlsx">Excel (xlsx)</option>
                      <option value="pptx">PPT (pptx)</option>
                      <option value="png">PNG 图片</option>
                      <option value="jpg">JPEG 图片</option>
                      <option value="html">HTML</option>
                      <option value="md">Markdown</option>
                    </select>
                  </label>
                </div>
              )}

              {configStep.type === 'watermark' && (
                <div className="task-config-form">
                  <label>
                    水印文字:
                    <input
                      type="text"
                      value={configStep.options.content as string}
                      onChange={(e) => setConfigStep({ ...configStep, options: { ...configStep.options, content: e.target.value } })}
                    />
                  </label>
                  <label>
                    透明度: {Math.round((configStep.options.opacity as number) * 100)}%
                    <input
                      type="range" min="0.1" max="1" step="0.1"
                      value={configStep.options.opacity as number}
                      onChange={(e) => setConfigStep({ ...configStep, options: { ...configStep.options, opacity: parseFloat(e.target.value) } })}
                    />
                  </label>
                </div>
              )}

              {configStep.type === 'encrypt' && (
                <div className="task-config-form">
                  <label>
                    打开密码:
                    <input
                      type="password"
                      value={configStep.options.userPassword as string}
                      onChange={(e) => setConfigStep({ ...configStep, options: { ...configStep.options, userPassword: e.target.value } })}
                      placeholder="设置打开密码"
                    />
                  </label>
                  <div className="encrypt-perms">
                    <label><input type="checkbox" checked={!!(configStep.options.permissions as Record<string, boolean>)?.print}
                      onChange={(e) => setConfigStep({ ...configStep, options: { ...configStep.options, permissions: { ...(configStep.options.permissions as Record<string, boolean>), print: e.target.checked } } })}
                    /> 允许打印</label>
                    <label><input type="checkbox" checked={!!(configStep.options.permissions as Record<string, boolean>)?.copy}
                      onChange={(e) => setConfigStep({ ...configStep, options: { ...configStep.options, permissions: { ...(configStep.options.permissions as Record<string, boolean>), copy: e.target.checked } } })}
                    /> 允许复制</label>
                    <label><input type="checkbox" checked={!!(configStep.options.permissions as Record<string, boolean>)?.modify}
                      onChange={(e) => setConfigStep({ ...configStep, options: { ...configStep.options, permissions: { ...(configStep.options.permissions as Record<string, boolean>), modify: e.target.checked } } })}
                    /> 允许编辑</label>
                  </div>
                </div>
              )}

              {configStep.type === 'compress' && (
                <div className="task-config-form">
                  <label>
                    压缩质量:
                    <select
                      value={configStep.options.quality as string}
                      onChange={(e) => setConfigStep({ ...configStep, options: { ...configStep.options, quality: e.target.value } })}
                    >
                      <option value="high">高质量 (轻度压缩)</option>
                      <option value="medium">中等质量</option>
                      <option value="low">低质量 (高压缩)</option>
                    </select>
                  </label>
                  <label>
                    <input type="checkbox" checked={!!configStep.options.removeMetadata}
                      onChange={(e) => setConfigStep({ ...configStep, options: { ...configStep.options, removeMetadata: e.target.checked } })}
                    /> 清除元数据
                  </label>
                </div>
              )}

              {configStep.type === 'pipeline' && (
                <div className="task-config-form">
                  <label>
                    选择工作流模板:
                    <select
                      value={configStep.options.templateId as string || ''}
                      onChange={(e) => setConfigStep({ ...configStep, options: { ...configStep.options, templateId: e.target.value } })}
                    >
                      <option value="">-- 请选择 --</option>
                      {templates.map((tpl) => (
                        <option key={tpl.id} value={tpl.id}>
                          {tpl.name} ({tpl.steps.length} 步骤)
                        </option>
                      ))}
                    </select>
                  </label>
                  {templates.length === 0 && (
                    <p className="task-config-hint">暂无模板，请先在"工作流"中创建模板</p>
                  )}
                </div>
              )}

              <div className="task-config-actions">
                <button className="task-submit-btn" onClick={handleSubmit} disabled={!outputDir}>
                  提交 {configStep.files.length} 个任务
                </button>
                <button onClick={() => setConfigStep(null)}>取消</button>
              </div>
            </div>
          )}

          {/* 任务列表 */}
          <div className="task-list">
            {displayTasks.length === 0 && (
              <div className="task-list-empty">
                <p>暂无任务</p>
                <p className="task-list-empty-hint">点击"+ 添加任务"开始批量处理</p>
              </div>
            )}
            {displayTasks.map((task) => (
              <div key={task.id} className={`task-item task-item-${task.status}`}>
                <div className="task-item-main">
                  <span className="task-item-label" title={task.filePath}>{task.label}</span>
                  <span className="task-type-tag" style={{ background: STATUS_COLORS[task.status] || '#999' }}>
                    {TYPE_LABELS[task.type]}
                  </span>
                </div>

                {task.status === 'running' && (
                  <div className="task-progress-row">
                    <div className="task-progress-bar">
                      <div className="task-progress-fill" style={{ width: `${task.progress}%` }} />
                    </div>
                    <span className="task-progress-text">{task.progress}%</span>
                    <span className="task-eta">{formatETA(task)}</span>
                  </div>
                )}

                <div className="task-item-footer">
                  <span className="task-status-tag" style={{ color: STATUS_COLORS[task.status] }}>
                    {STATUS_LABELS[task.status]}
                  </span>
                  <span className="task-item-message">{task.message}</span>
                  <div className="task-item-actions">
                    {task.status === 'running' && (
                      <button className="task-action-btn task-action-cancel" onClick={() => handleCancel(task.id)} title="取消">
                        取消
                      </button>
                    )}
                    {task.status === 'failed' && (
                      <button className="task-action-btn task-action-retry" onClick={() => handleRetry(task.id)} title="重试">
                        重试
                      </button>
                    )}
                    {(task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') && (
                      <button className="task-action-btn task-action-remove" onClick={() => handleRemove(task.id)} title="移除">
                        移除
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 底部统计栏 */}
        <div className="task-footer">
          <span className="task-stats">
            总计 {stats.total} | 完成 {stats.completed} | 失败 {stats.failed} | 运行中 {stats.running} | 等待 {stats.queued}
          </span>
          <div className="task-footer-actions">
            <button onClick={handleClearCompleted} disabled={stats.completed === 0 && stats.failed === 0}>
              清除已完成
            </button>
            <button onClick={handleCancelAll} disabled={stats.running === 0 && stats.queued === 0}>
              全部取消
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
