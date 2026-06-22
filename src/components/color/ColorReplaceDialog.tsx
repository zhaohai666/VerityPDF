import React, { useState } from 'react';
import type { ColorUsage, ColorReplaceResult } from '@/types/electron';

interface ColorRule {
  oldColor: string;
  newColor: string;
  colorSpace: 'rgb' | 'cmyk' | 'gray';
  enabled: boolean;
}

interface Props {
  pdfData: string;
  onClose: () => void;
}

export const ColorReplaceDialog: React.FC<Props> = ({ pdfData, onClose }) => {
  const [colors, setColors] = useState<ColorUsage[]>([]);
  const [rules, setRules] = useState<ColorRule[]>([]);
  const [tolerance, setTolerance] = useState(0.05);
  const [scanning, setScanning] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ColorReplaceResult | null>(null);

  const handleScan = async () => {
    setScanning(true); setError(''); setColors([]); setRules([]); setResult(null);
    try {
      const detected = await window.verityAPI.detectColors(pdfData) as ColorUsage[];
      setColors(detected);
      // 为每种颜色创建默认替换规则（默认不启用）
      setRules(detected.map(c => ({
        oldColor: c.hex,
        newColor: c.hex,
        colorSpace: c.colorSpace,
        enabled: false,
      })));
    } catch (e: any) {
      setError(e.message || '扫描颜色失败');
    } finally {
      setScanning(false);
    }
  };

  const updateRule = (index: number, field: keyof ColorRule, value: any) => {
    setRules(prev => prev.map((r, i) => i === index ? { ...r, [field]: value } : r));
  };

  const handleReplace = async () => {
    const activeRules = rules.filter(r => r.enabled && r.oldColor !== r.newColor);
    if (activeRules.length === 0) { setError('请至少启用一条替换规则且设置不同的目标色'); return; }

    setReplacing(true); setError('');
    try {
      const replaceResult = await window.verityAPI.replaceColors(pdfData, {
        rules: activeRules.map(r => ({
          oldColor: r.oldColor,
          newColor: r.newColor,
          colorSpace: r.colorSpace,
          tolerance,
        })),
        tolerance,
      }) as ColorReplaceResult;
      setResult(replaceResult);
    } catch (e: any) {
      setError(e.message || '替换失败');
    } finally {
      setReplacing(false);
    }
  };

  const handleSave = async () => {
    if (!result?.pdfData) return;
    try {
      const savePath = await window.verityAPI.showDialog({
        type: 'save', defaultPath: 'color_replaced.pdf',
        filters: [{ name: 'PDF 文件', extensions: ['pdf'] }],
      });
      if (savePath) {
        const bytes = new Uint8Array(result.pdfData);
        const binary = String.fromCharCode(...bytes);
        const CHUNK = 8192;
        let str = '';
        for (let i = 0; i < binary.length; i += CHUNK) {
          str += binary.substring(i, Math.min(i + CHUNK, binary.length));
        }
        await window.verityAPI.saveFile(btoa(str), savePath);
      }
      onClose();
    } catch (e: any) {
      setError(e.message || '保存失败');
    }
  };

  return (
    <div className="dialog-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog-box" style={{ maxWidth: 640, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
        <div className="dialog-header">
          <h3>批量颜色替换</h3>
          <button className="dialog-close" onClick={onClose}>&times;</button>
        </div>
        <div className="dialog-body" style={{ flex: 1, overflow: 'auto' }}>
          {error && <div className="error-msg">{error}</div>}

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
            <button className="btn-primary" onClick={handleScan} disabled={scanning}>
              {scanning ? '扫描中...' : '扫描颜色'}
            </button>
            <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}>
              容差:
              <input type="range" min="0" max="0.3" step="0.01" value={tolerance}
                onChange={e => setTolerance(Number(e.target.value))} style={{ width: 80 }} />
              <span style={{ width: 30 }}>{tolerance.toFixed(2)}</span>
            </label>
            {colors.length > 0 && (
              <span style={{ fontSize: 13, color: '#666' }}>
                检测到 {colors.length} 种颜色
              </span>
            )}
          </div>

          {rules.length > 0 && (
            <div style={{ border: '1px solid #ddd', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{
                display: 'grid', gridTemplateColumns: '30px 1fr 40px 1fr 60px 60px',
                padding: '6px 8px', backgroundColor: '#f5f5f5', fontSize: 12, fontWeight: 600,
                borderBottom: '1px solid #ddd',
              }}>
                <span>启用</span>
                <span>原色</span>
                <span></span>
                <span>替换为</span>
                <span>次数</span>
                <span>用途</span>
              </div>
              {rules.map((rule, idx) => {
                const colorUsage = colors[idx];
                return (
                  <div key={idx} style={{
                    display: 'grid', gridTemplateColumns: '30px 1fr 40px 1fr 60px 60px',
                    padding: '6px 8px', alignItems: 'center', borderBottom: '1px solid #eee',
                    fontSize: 12,
                  }}>
                    <input type="checkbox" checked={rule.enabled}
                      onChange={e => updateRule(idx, 'enabled', e.target.checked)} />

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{
                        width: 20, height: 20, borderRadius: 3, border: '1px solid #ccc',
                        backgroundColor: rule.oldColor,
                      }} />
                      <code>{rule.oldColor}</code>
                    </div>

                    <span style={{ textAlign: 'center', fontSize: 16, color: '#999' }}>&rarr;</span>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input type="color" value={rule.newColor}
                        onChange={e => updateRule(idx, 'newColor', e.target.value)}
                        style={{ width: 28, height: 24, padding: 0, border: '1px solid #ccc', borderRadius: 3, cursor: 'pointer' }} />
                      <code>{rule.newColor}</code>
                    </div>

                    <span style={{ textAlign: 'center' }}>{colorUsage?.count || 0}</span>
                    <span style={{ textAlign: 'center', fontSize: 11, color: '#666' }}>
                      {colorUsage?.usage === 'f' ? '填充' : colorUsage?.usage === 's' ? '描边' : '两者'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {result && (
            <div style={{ marginTop: 8, padding: 8, backgroundColor: '#e8f5e9', borderRadius: 4, fontSize: 13 }}>
              替换完成: 共替换 {result.replacedCount} 处颜色，处理了 {result.pagesProcessed} 页
            </div>
          )}
        </div>
        <div className="dialog-footer">
          <button className="btn-secondary" onClick={onClose}>取消</button>
          {!result ? (
            <button className="btn-primary" onClick={handleReplace} disabled={replacing || rules.filter(r => r.enabled).length === 0}>
              {replacing ? '替换中...' : '执行替换'}
            </button>
          ) : (
            <button className="btn-primary" onClick={handleSave}>保存并导出</button>
          )}
        </div>
      </div>
    </div>
  );
};
