import React, { useState } from 'react';
import { ScriptResult, ScriptOptions, ScriptEngineStats } from '@/types/electron';

interface ScriptExecuteDialogProps {
  pdfData: string;
  onClose: () => void;
}

const DEFAULT_SCRIPT = `// 可用上下文:
// context.pdfData - PDF base64 数据
// context.pageCount - 页数
// console.log() - 输出到控制台

// 示例: 输出 PDF 信息
console.log("PDF 数据长度:", context.pdfData.length);
`;

export const ScriptExecuteDialog: React.FC<ScriptExecuteDialogProps> = ({
  pdfData,
  onClose,
}) => {
  const [script, setScript] = useState(DEFAULT_SCRIPT);
  const [timeout, setTimeout_] = useState(5000);
  const [memoryLimit, setMemoryLimit] = useState(10);
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<ScriptResult | null>(null);
  const [stats, setStats] = useState<ScriptEngineStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showStats, setShowStats] = useState(false);

  const handleExecute = async () => {
    if (!script.trim()) return;
    setExecuting(true);
    setError(null);
    setResult(null);
    try {
      const options: ScriptOptions = {
        timeout,
        memoryLimit: memoryLimit * 1024 * 1024, // MB to bytes
        context: {
          pdfData,
          pageCount: 0, // 可由后端填充
        },
      };
      const execResult = await window.verityAPI.executeScript(script, options);
      setResult(execResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Script execution failed');
    } finally {
      setExecuting(false);
    }
  };

  const handleValidate = async () => {
    if (!script.trim()) return;
    setError(null);
    try {
      const result = await window.verityAPI.validateScript(script);
      if (result.valid) {
        setError(null);
        setResult({ success: true, stdout: ['脚本语法验证通过'], stderr: [], executionTime: 0 });
      } else {
        setError(result.error || '脚本语法验证失败');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Validation failed');
    }
  };

  const handleLoadStats = async () => {
    try {
      const engineStats = await window.verityAPI.getScriptStats();
      setStats(engineStats);
      setShowStats(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load stats');
    }
  };

  return (
    <div className="dialog-overlay">
      <div className="dialog-box" style={{ width: '720px' }}>
        <div className="dialog-header">
          <h2>脚本执行</h2>
          <button onClick={onClose} className="close-button">×</button>
        </div>

        <div className="dialog-body">
          {error && <div className="error-message">{error}</div>}

          {/* 脚本编辑区 */}
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: 500 }}>
              JavaScript 脚本
            </label>
            <textarea
              value={script}
              onChange={(e) => setScript(e.target.value)}
              style={{
                width: '100%',
                minHeight: '180px',
                fontFamily: 'monospace',
                fontSize: '13px',
                padding: '10px',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                resize: 'vertical',
                lineHeight: '1.5',
              }}
              placeholder="输入 JavaScript 脚本..."
              spellCheck={false}
            />
          </div>

          {/* 执行选项 */}
          <div style={{ display: 'flex', gap: '16px', marginBottom: '12px' }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px' }}>
                超时 (ms)
              </label>
              <input
                type="number"
                min="1000"
                max="60000"
                step="1000"
                value={timeout}
                onChange={(e) => setTimeout_(parseInt(e.target.value, 10) || 5000)}
                className="form-input"
                style={{ width: '100%' }}
              />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px' }}>
                内存限制 (MB)
              </label>
              <input
                type="number"
                min="1"
                max="100"
                value={memoryLimit}
                onChange={(e) => setMemoryLimit(parseInt(e.target.value, 10) || 10)}
                className="form-input"
                style={{ width: '100%' }}
              />
            </div>
          </div>

          {/* 执行结果 */}
          {result && (
            <div style={{ marginBottom: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: 500 }}>
                  执行结果 {result.success ? '✓' : '✗'}
                </label>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                  耗时: {result.executionTime}ms
                </span>
              </div>
              <div
                style={{
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  padding: '10px',
                  maxHeight: '150px',
                  overflowY: 'auto',
                  fontFamily: 'monospace',
                  fontSize: '12px',
                }}
              >
                {result.stdout.length > 0 && (
                  <div style={{ color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>
                    {result.stdout.map((line, i) => (
                      <div key={i}>{line}</div>
                    ))}
                  </div>
                )}
                {result.stderr.length > 0 && (
                  <div style={{ color: '#e74c3c', whiteSpace: 'pre-wrap', marginTop: result.stdout.length > 0 ? '8px' : 0 }}>
                    {result.stderr.map((line, i) => (
                      <div key={i}>{line}</div>
                    ))}
                  </div>
                )}
                {result.error && (
                  <div style={{ color: '#e74c3c', marginTop: '4px' }}>
                    错误: {result.error}
                  </div>
                )}
                {result.result !== undefined && (
                  <div style={{ color: 'var(--accent-color)', marginTop: '4px' }}>
                    返回值: {JSON.stringify(result.result, null, 2)}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 引擎统计 */}
          {showStats && stats && (
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 500 }}>
                引擎统计
              </label>
              <div
                style={{
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  padding: '10px',
                  fontSize: '12px',
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '6px',
                }}
              >
                <span>总执行次数: {stats.totalExecutions}</span>
                <span>成功次数: {stats.successfulExecutions}</span>
                <span>失败次数: {stats.failedExecutions}</span>
                <span>平均耗时: {stats.averageExecutionTime.toFixed(1)}ms</span>
              </div>
            </div>
          )}
        </div>

        <div className="dialog-footer">
          <button onClick={onClose} className="btn-secondary">
            关闭
          </button>
          <button onClick={() => setShowStats(!showStats)} className="btn-secondary">
            {showStats ? '隐藏统计' : '引擎统计'}
          </button>
          {!showStats && (
            <button onClick={handleLoadStats} className="btn-secondary">
              加载统计
            </button>
          )}
          <button
            onClick={handleValidate}
            disabled={!script.trim()}
            className="btn-secondary"
          >
            验证语法
          </button>
          <button
            onClick={handleExecute}
            disabled={executing || !script.trim()}
            className="btn-primary"
          >
            {executing ? '执行中...' : '执行'}
          </button>
        </div>
      </div>
    </div>
  );
};