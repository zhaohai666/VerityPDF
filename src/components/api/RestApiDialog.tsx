import React, { useState, useEffect, useCallback } from 'react';
import {
  RestApiStatus,
  RestApiConfig,
  ApiKeyInfo,
} from '@/types/electron';

interface RestApiDialogProps {
  onClose: () => void;
}

export const RestApiDialog: React.FC<RestApiDialogProps> = ({ onClose }) => {
  const [status, setStatus] = useState<RestApiStatus | null>(null);
  const [config, setConfig] = useState<RestApiConfig | null>(null);
  const [apiKeys, setApiKeys] = useState<ApiKeyInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'main' | 'config' | 'keys'>('main');

  // 配置表单
  const [formPort, setFormPort] = useState(8080);
  const [formHost, setFormHost] = useState('0.0.0.0');
  const [formCors, setFormCors] = useState(true);
  const [formMaxFileSize, setFormMaxFileSize] = useState(100);
  const [formAuthToken, setFormAuthToken] = useState('');
  const [savingConfig, setSavingConfig] = useState(false);

  // API Key 表单
  const [keyLabel, setKeyLabel] = useState('');
  const [creatingKey, setCreatingKey] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);

  const refreshData = useCallback(async () => {
    try {
      const [s, c, k] = await Promise.all([
        window.verityAPI.getRestApiStatus(),
        window.verityAPI.getRestApiConfig(),
        window.verityAPI.listRestApiKeys(),
      ]);
      setStatus(s);
      setConfig(c);
      setApiKeys(k);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  useEffect(() => {
    if (config) {
      setFormPort(config.port);
      setFormHost(config.host);
      setFormCors(config.corsEnabled);
      setFormMaxFileSize(Math.round(config.maxFileSize / (1024 * 1024)));
      setFormAuthToken(config.authToken || '');
    }
  }, [config]);

  const isRunning = status?.running ?? false;

  const handleStart = async () => {
    setLoading(true);
    setError(null);
    try {
      await window.verityAPI.startRestApi();
      await refreshData();
    } catch (err) {
      setError(err instanceof Error ? err.message : '启动 REST API 失败');
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async () => {
    setLoading(true);
    setError(null);
    try {
      await window.verityAPI.stopRestApi();
      await refreshData();
    } catch (err) {
      setError(err instanceof Error ? err.message : '停止 REST API 失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveConfig = async () => {
    setSavingConfig(true);
    setError(null);
    try {
      await window.verityAPI.updateRestApiConfig({
        port: formPort,
        host: formHost,
        corsEnabled: formCors,
        maxFileSize: formMaxFileSize * 1024 * 1024,
        authToken: formAuthToken || undefined,
      });
      await refreshData();
      setMode('main');
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存配置失败');
    } finally {
      setSavingConfig(false);
    }
  };

  const handleGenerateKey = async () => {
    if (!keyLabel.trim()) return;
    setCreatingKey(true);
    setError(null);
    try {
      const info = await window.verityAPI.generateRestApiKey(keyLabel.trim());
      setNewKey(info.key);
      setKeyLabel('');
      await refreshData();
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成 API Key 失败');
    } finally {
      setCreatingKey(false);
    }
  };

  const handleRevokeKey = async (key: string) => {
    try {
      await window.verityAPI.revokeRestApiKey(key);
      await refreshData();
    } catch (err) {
      setError(err instanceof Error ? err.message : '撤销 API Key 失败');
    }
  };

  // API 端点列表
  const endpoints = [
    { method: 'GET', path: '/api/status', desc: '服务器状态' },
    { method: 'GET', path: '/api/config', desc: '服务器配置' },
    { method: 'POST', path: '/api/pdf/info', desc: '获取 PDF 信息' },
    { method: 'POST', path: '/api/pdf/repair', desc: '修复 PDF' },
    { method: 'POST', path: '/api/pdf/encrypt', desc: '加密 PDF' },
    { method: 'POST', path: '/api/pdf/decrypt', desc: '解密 PDF' },
    { method: 'POST', path: '/api/pdf/merge', desc: '合并 PDF' },
    { method: 'POST', path: '/api/pdf/split', desc: '拆分 PDF' },
    { method: 'POST', path: '/api/pdf/watermark', desc: '添加水印' },
    { method: 'POST', path: '/api/pdf/compress', desc: '压缩 PDF' },
    { method: 'POST', path: '/api/pdf/rotate', desc: '旋转页面' },
    { method: 'POST', path: '/api/pdf/extract-text', desc: '提取文本' },
    { method: 'POST', path: '/api/pdf/extract-images', desc: '提取图片' },
    { method: 'POST', path: '/api/pdf/bookmarks', desc: '获取书签' },
    { method: 'POST', path: '/api/pdf/hyperlinks', desc: '获取超链接' },
    { method: 'POST', path: '/api/pdf/form-fields', desc: '检测表单字段' },
    { method: 'POST', path: '/api/pdf/sanitize', desc: '消毒处理' },
    { method: 'POST', path: '/api/pdf/convert-pdfA', desc: 'PDF/A 转换' },
    { method: 'GET', path: '/health', desc: '健康检查' },
  ];

  const methodColor: Record<string, string> = {
    GET: '#27ae60',
    POST: '#2980b9',
    DELETE: '#e74c3c',
    PUT: '#f39c12',
  };

  return (
    <div className="dialog-overlay">
      <div className="dialog-box" style={{ width: '760px' }}>
        <div className="dialog-header">
          <h2>REST API</h2>
          <button onClick={onClose} className="close-button">×</button>
        </div>

        <div className="dialog-body">
          {error && (
            <div className="error-message" style={{ marginBottom: '12px' }}>
              {error}
              <button onClick={() => setError(null)} style={{ marginLeft: '8px', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>✕</button>
            </div>
          )}

          {/* 服务器状态 */}
          <div style={{
            padding: '12px 16px',
            background: 'var(--bg-tertiary)',
            borderRadius: '8px',
            marginBottom: '16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <div>
              <div style={{ fontWeight: 500, fontSize: '14px' }}>
                REST API 服务器
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                {isRunning
                  ? `运行中 · ${status?.host}:${status?.port} · ${status?.requestCount ?? 0} 次请求 · ${status?.apiKeyCount ?? 0} 个 API Key`
                  : '未启动'}
              </div>
            </div>
            <button
              onClick={isRunning ? handleStop : handleStart}
              disabled={loading}
              className={isRunning ? 'btn-secondary' : 'btn-primary'}
              style={{ fontSize: '13px' }}
            >
              {loading ? '处理中...' : isRunning ? '停止服务' : '启动服务'}
            </button>
          </div>

          {/* Tab 切换 */}
          {isRunning && (
            <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
              {(['main', 'config', 'keys'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setMode(tab)}
                  className={mode === tab ? 'btn-primary' : 'btn-secondary'}
                  style={{ fontSize: '13px', padding: '6px 14px' }}
                >
                  {tab === 'main' ? '端点列表' : tab === 'config' ? '配置' : 'API Keys'}
                </button>
              ))}
            </div>
          )}

          {isRunning && mode === 'main' && (
            <div>
              <div style={{ fontWeight: 500, fontSize: '13px', marginBottom: '8px' }}>
                API 端点 ({endpoints.length})
              </div>
              <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                {endpoints.map((ep, i) => (
                  <div
                    key={i}
                    style={{
                      padding: '8px 12px',
                      borderBottom: '1px solid var(--border-color)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                    }}
                  >
                    <span style={{
                      display: 'inline-block',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: 600,
                      color: '#fff',
                      background: methodColor[ep.method] || '#999',
                      minWidth: '36px',
                      textAlign: 'center',
                    }}>
                      {ep.method}
                    </span>
                    <code style={{ fontSize: '12px', flex: 1 }}>{ep.path}</code>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{ep.desc}</span>
                  </div>
                ))}
              </div>

              {/* 使用示例 */}
              <div style={{ marginTop: '16px', padding: '12px', background: 'var(--bg-tertiary)', borderRadius: '8px' }}>
                <div style={{ fontWeight: 500, fontSize: '13px', marginBottom: '8px' }}>使用示例</div>
                <pre style={{ fontSize: '12px', lineHeight: 1.6, overflowX: 'auto', margin: 0 }}>
{`curl http://localhost:${status?.port}/api/status

curl -X POST http://localhost:${status?.port}/api/pdf/info \\
  -H "Content-Type: application/json" \\
  -d '{"filePath": "/path/to/file.pdf"}'`}
                </pre>
              </div>
            </div>
          )}

          {isRunning && mode === 'config' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="form-group">
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px' }}>端口</label>
                <input
                  type="number"
                  value={formPort}
                  onChange={(e) => setFormPort(parseInt(e.target.value, 10) || 8080)}
                  className="form-input"
                  style={{ width: '100%' }}
                />
              </div>
              <div className="form-group">
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px' }}>主机</label>
                <input
                  type="text"
                  value={formHost}
                  onChange={(e) => setFormHost(e.target.value)}
                  className="form-input"
                  style={{ width: '100%' }}
                />
              </div>
              <div className="form-group">
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px' }}>最大文件大小 (MB)</label>
                <input
                  type="number"
                  value={formMaxFileSize}
                  onChange={(e) => setFormMaxFileSize(parseInt(e.target.value, 10) || 100)}
                  className="form-input"
                  style={{ width: '100%' }}
                />
              </div>
              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                  <input
                    type="checkbox"
                    checked={formCors}
                    onChange={(e) => setFormCors(e.target.checked)}
                  />
                  启用 CORS
                </label>
              </div>
              <div className="form-group">
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px' }}>认证 Token (可选)</label>
                <input
                  type="text"
                  value={formAuthToken}
                  onChange={(e) => setFormAuthToken(e.target.value)}
                  placeholder="留空则不启用认证"
                  className="form-input"
                  style={{ width: '100%' }}
                />
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  设置后请求需携带 Authorization: Bearer {'<token>'} 或 X-API-Key 头
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button onClick={() => setMode('main')} className="btn-secondary">取消</button>
                <button onClick={handleSaveConfig} disabled={savingConfig} className="btn-primary">
                  {savingConfig ? '保存中...' : '保存配置'}
                </button>
              </div>
            </div>
          )}

          {isRunning && mode === 'keys' && (
            <div>
              {/* 生成新 Key */}
              <div style={{ padding: '12px', background: 'var(--bg-tertiary)', borderRadius: '8px', marginBottom: '16px' }}>
                <div style={{ fontWeight: 500, fontSize: '13px', marginBottom: '8px' }}>生成 API Key</div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    type="text"
                    value={keyLabel}
                    onChange={(e) => setKeyLabel(e.target.value)}
                    placeholder="Key 标签 (如: my-app)"
                    className="form-input"
                    style={{ flex: 1, fontSize: '13px' }}
                  />
                  <button
                    onClick={handleGenerateKey}
                    disabled={creatingKey || !keyLabel.trim()}
                    className="btn-primary"
                    style={{ fontSize: '13px' }}
                  >
                    {creatingKey ? '生成中...' : '生成'}
                  </button>
                </div>
                {newKey && (
                  <div style={{ marginTop: '8px', padding: '8px', background: 'var(--bg-primary)', borderRadius: '4px', fontSize: '12px' }}>
                    <div style={{ color: '#e74c3c', fontWeight: 500, marginBottom: '4px' }}>请妥善保存，此 Key 仅显示一次：</div>
                    <code style={{ wordBreak: 'break-all' }}>{newKey}</code>
                    <button
                      onClick={() => { navigator.clipboard?.writeText(newKey); }}
                      className="btn-secondary"
                      style={{ fontSize: '11px', padding: '2px 8px', marginLeft: '8px' }}
                    >
                      复制
                    </button>
                  </div>
                )}
              </div>

              {/* Key 列表 */}
              <div style={{ fontWeight: 500, fontSize: '13px', marginBottom: '8px' }}>
                已有 API Keys ({apiKeys.length})
              </div>
              {apiKeys.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-secondary)' }}>
                  暂无 API Key
                </div>
              ) : (
                <div style={{ maxHeight: '240px', overflowY: 'auto' }}>
                  {apiKeys.map((key) => (
                    <div
                      key={key.key}
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
                          <code>{key.key}</code>
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                          标签: {key.label} · 请求: {key.requestCount} · 创建: {new Date(key.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                      <button
                        onClick={() => handleRevokeKey(key.key)}
                        className="btn-secondary"
                        style={{ fontSize: '11px', padding: '4px 8px', color: '#e74c3c' }}
                      >
                        撤销
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {!isRunning && (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>🔌</div>
              <div style={{ fontSize: '15px', fontWeight: 500, marginBottom: '8px' }}>REST API 服务</div>
              <div style={{ fontSize: '13px' }}>启动 REST API 服务器，通过 HTTP 接口调用 PDF 处理功能</div>
              <div style={{ fontSize: '12px', marginTop: '8px' }}>支持 API Key 认证、CORS、文件上传</div>
            </div>
          )}
        </div>

        <div className="dialog-footer">
          <button onClick={onClose} className="btn-secondary">
            关闭
          </button>
        </div>
      </div>
    </div>
  );
};