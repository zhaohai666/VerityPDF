import React, { useState } from 'react';
import type { SensitiveRule, SensitiveMatch, SensitiveDetectResult } from '@/types/electron';

interface Props {
  pdfData: string;
  onClose: () => void;
}

const DEFAULT_RULES: SensitiveRule[] = [
  { name: '手机号', pattern: '1[3-9]\\d{9}', enabled: true, description: '中国大陆手机号码' },
  { name: '身份证号', pattern: '[1-9]\\d{5}(?:19|20)\\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\\d|3[01])\\d{3}[\\dXx]', enabled: true, description: '18位身份证号码' },
  { name: '邮箱地址', pattern: '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}', enabled: true, description: '电子邮件地址' },
  { name: '银行卡号', pattern: '\\d{16,19}', enabled: false, description: '银行卡号（16-19位数字）' },
  { name: 'IPv4地址', pattern: '(?:25[0-5]|2[0-4]\\d|[01]?\\d\\d?)\\.(?:25[0-5]|2[0-4]\\d|[01]?\\d\\d?)\\.(?:25[0-5]|2[0-4]\\d|[01]?\\d\\d?)\\.(?:25[0-5]|2[0-4]\\d|[01]?\\d\\d?)', enabled: false, description: 'IPv4 地址' },
  { name: '固定电话', pattern: '(?:0\\d{2,3})?[- ]?\\d{7,8}', enabled: false, description: '固定电话' },
];

export const SensitiveRedactDialog: React.FC<Props> = ({ pdfData, onClose }) => {
  const [rules, setRules] = useState<SensitiveRule[]>(DEFAULT_RULES);
  const [detectResult, setDetectResult] = useState<SensitiveDetectResult | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [scanning, setScanning] = useState(false);
  const [redacting, setRedacting] = useState(false);
  const [error, setError] = useState('');
  const [customPattern, setCustomPattern] = useState('');

  const toggleRule = (name: string) => {
    setRules(prev => prev.map(r => r.name === name ? { ...r, enabled: !r.enabled } : r));
  };

  const addCustomRule = () => {
    if (!customPattern.trim()) return;
    const name = `自定义规则 ${rules.filter(r => r.name.startsWith('自定义')).length + 1}`;
    setRules(prev => [...prev, { name, pattern: customPattern.trim(), enabled: true, description: '用户自定义' }]);
    setCustomPattern('');
  };

  const handleScan = async () => {
    setScanning(true); setError(''); setDetectResult(null); setSelectedIds(new Set());
    try {
      const result = await window.verityAPI.detectSensitiveInfo(pdfData, rules) as SensitiveDetectResult;
      setDetectResult(result);
      // 默认全选
      setSelectedIds(new Set(result.matches.map(m => m.id)));
    } catch (e: any) {
      setError(e.message || '扫描失败');
    } finally {
      setScanning(false);
    }
  };

  const toggleMatch = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (!detectResult) return;
    if (selectedIds.size === detectResult.matches.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(detectResult.matches.map(m => m.id)));
    }
  };

  const handleRedact = async () => {
    if (!detectResult || selectedIds.size === 0) return;
    setRedacting(true); setError('');
    try {
      const selectedMatches = detectResult.matches.filter(m => selectedIds.has(m.id));
      const result = await window.verityAPI.redactSensitiveInfo(pdfData, selectedMatches) as { pdfData: ArrayBuffer; redactedCount: number };

      // 保存结果
      const savePath = await window.verityAPI.showDialog({ type: 'save', defaultPath: 'redacted.pdf', filters: [{ name: 'PDF 文件', extensions: ['pdf'] }] });
      if (savePath && result.pdfData) {
        const bytes = new Uint8Array(result.pdfData);
        const binary = String.fromCharCode(...bytes);
        // 分块处理避免栈溢出
        const CHUNK = 8192;
        let str = '';
        for (let i = 0; i < binary.length; i += CHUNK) {
          str += binary.substring(i, Math.min(i + CHUNK, binary.length));
        }
        await window.verityAPI.saveFile(btoa(str), savePath);
      }
      onClose();
    } catch (e: any) {
      setError(e.message || '涂黑失败');
    } finally {
      setRedacting(false);
    }
  };

  // 按页分组
  const matchesByPage = detectResult
    ? detectResult.matches.reduce<Record<number, SensitiveMatch[]>>((acc, m) => {
        if (!acc[m.page]) acc[m.page] = [];
        acc[m.page].push(m);
        return acc;
      }, {})
    : {};

  return (
    <div className="dialog-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog-box" style={{ maxWidth: 640, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
        <div className="dialog-header">
          <h3>敏感信息自动涂黑</h3>
          <button className="dialog-close" onClick={onClose}>&times;</button>
        </div>
        <div className="dialog-body" style={{ flex: 1, overflow: 'auto' }}>
          {error && <div className="error-msg">{error}</div>}

          <div className="form-group">
            <label>检测规则</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {rules.map(rule => (
                <label key={rule.name} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                  <input type="checkbox" checked={rule.enabled} onChange={() => toggleRule(rule.name)} />
                  <span style={{ fontWeight: 500 }}>{rule.name}</span>
                  <span style={{ color: '#999', fontSize: 12 }}>— {rule.description}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label>添加自定义正则</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="form-input" value={customPattern} onChange={e => setCustomPattern(e.target.value)}
                placeholder="输入正则表达式..." style={{ flex: 1 }} />
              <button className="btn-secondary" onClick={addCustomRule}>添加</button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <button className="btn-primary" onClick={handleScan} disabled={scanning}>
              {scanning ? '扫描中...' : '开始扫描'}
            </button>
            {detectResult && (
              <span style={{ fontSize: 13, color: '#666', alignSelf: 'center' }}>
                扫描 {detectResult.pagesScanned} 页，发现 {detectResult.matches.length} 处匹配
              </span>
            )}
          </div>

          {detectResult && detectResult.matches.length > 0 && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
                  <input type="checkbox" checked={selectedIds.size === detectResult.matches.length}
                    onChange={toggleAll} />
                  全选 ({selectedIds.size}/{detectResult.matches.length})
                </label>
              </div>

              <div style={{ maxHeight: 260, overflow: 'auto', border: '1px solid #ddd', borderRadius: 4 }}>
                {Object.entries(matchesByPage).map(([page, matches]) => (
                  <div key={page}>
                    <div style={{ padding: '4px 8px', backgroundColor: '#f5f5f5', fontSize: 12, fontWeight: 600, position: 'sticky', top: 0 }}>
                      第 {page} 页 ({matches.length} 处)
                    </div>
                    {matches.map(m => (
                      <div key={m.id} style={{ padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 6, borderBottom: '1px solid #eee', fontSize: 12 }}>
                        <input type="checkbox" checked={selectedIds.has(m.id)} onChange={() => toggleMatch(m.id)} />
                        <span style={{
                          padding: '1px 6px', borderRadius: 3, fontSize: 11,
                          backgroundColor: '#e3f2fd', color: '#1565c0'
                        }}>{m.ruleName}</span>
                        <code style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.text}</code>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </>
          )}

          {detectResult && detectResult.matches.length === 0 && (
            <div style={{ textAlign: 'center', color: '#999', padding: 20 }}>未发现匹配的敏感信息</div>
          )}
        </div>
        <div className="dialog-footer">
          <button className="btn-secondary" onClick={onClose}>取消</button>
          <button className="btn-primary" onClick={handleRedact}
            disabled={redacting || !detectResult || selectedIds.size === 0}>
            {redacting ? '涂黑中...' : `涂黑并导出 (${selectedIds.size} 处)`}
          </button>
        </div>
      </div>
    </div>
  );
};
