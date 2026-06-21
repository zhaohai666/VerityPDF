import React, { useState, useEffect, useCallback } from 'react';
import { usePdfStore } from '@/stores/pdfStore';
import { useUIStore } from '@/stores/uiStore';
import type { SmartCompressOptions } from '@/types/electron';

interface SmartCompressDialogProps {
  open: boolean;
  onClose: () => void;
}

type Preset = 'minimum' | 'balanced' | 'highQuality';

/** 预设配置 */
const PRESETS: Record<Preset, {
  label: string;
  description: string;
  icon: string;
  estimatedRatio: string;
  defaults: Required<Omit<SmartCompressOptions, 'preset'>>;
}> = {
  minimum: {
    label: '最小体积',
    description: '适合邮件发送、在线分享',
    icon: '📦',
    estimatedRatio: '60-80%',
    defaults: { imageDpi: 72, imageQuality: 30, grayscale: false, removeMetadata: true, fontSubset: true },
  },
  balanced: {
    label: '均衡',
    description: '兼顾体积与质量',
    icon: '⚖️',
    estimatedRatio: '40-60%',
    defaults: { imageDpi: 150, imageQuality: 60, grayscale: false, removeMetadata: true, fontSubset: true },
  },
  highQuality: {
    label: '高质量',
    description: '适合打印、存档',
    icon: '✨',
    estimatedRatio: '15-30%',
    defaults: { imageDpi: 300, imageQuality: 85, grayscale: false, removeMetadata: false, fontSubset: true },
  },
};

export const SmartCompressDialog: React.FC<SmartCompressDialogProps> = ({ open, onClose }) => {
  const [selectedPreset, setSelectedPreset] = useState<Preset>('balanced');
  const [customMode, setCustomMode] = useState(false);
  const [customParams, setCustomParams] = useState(PRESETS.balanced.defaults);
  const [isCompressing, setIsCompressing] = useState(false);
  const [gsStatus, setGsStatus] = useState<{ available: boolean; version?: string } | null>(null);
  const [compressResult, setCompressResult] = useState<{
    originalSize: number;
    compressedSize: number;
    ratio: number;
  } | null>(null);

  const { filePath, documentInfo } = usePdfStore();
  const showToast = useUIStore((s) => s.showToast);

  // 检查 Ghostscript 可用性
  useEffect(() => {
    if (open) {
      window.verityAPI.checkGhostscript().then(setGsStatus).catch(() => setGsStatus({ available: false }));
      setCompressResult(null);
    }
  }, [open]);

  // 选择预设时同步自定义参数
  const handleSelectPreset = useCallback((preset: Preset) => {
    setSelectedPreset(preset);
    setCustomParams(PRESETS[preset].defaults);
    setCustomMode(false);
    setCompressResult(null);
  }, []);

  // 执行压缩
  const handleCompress = useCallback(async () => {
    if (!filePath || isCompressing) return;

    setIsCompressing(true);
    setCompressResult(null);

    try {
      // 读取文件
      const pdfData = await window.verityAPI.readFile(filePath);
      const originalSize = pdfData.byteLength;

      // base64 编码
      const base64 = btoa(String.fromCharCode(...new Uint8Array(pdfData)));

      // 构造选项
      const options: SmartCompressOptions = customMode
        ? { ...customParams }
        : { preset: selectedPreset, ...customParams };

      const compressed = await window.verityAPI.smartCompress(base64, options);
      const compressedSize = compressed.byteLength;
      const ratio = originalSize > 0 ? Math.round((1 - compressedSize / originalSize) * 100) : 0;

      setCompressResult({ originalSize, compressedSize, ratio });

      // 弹出保存对话框
      const savePath = await window.verityAPI.showDialog({
        type: 'save',
        filters: [{ name: 'PDF 文件', extensions: ['pdf'] }],
        defaultPath: filePath.replace(/\.pdf$/i, '_compressed.pdf'),
      });

      if (savePath) {
        const compressedBase64 = btoa(String.fromCharCode(...new Uint8Array(compressed)));
        await window.verityAPI.saveFile(compressedBase64, savePath);
        showToast(`压缩成功！减小 ${ratio}%`, 'success');
        if (savePath !== filePath) {
          // 保存到新文件，不重新加载
        } else {
          // 覆盖原文件，重新加载
          window.dispatchEvent(new CustomEvent('verity:reloadPdf'));
        }
      }
    } catch (err) {
      showToast('压缩失败: ' + (err instanceof Error ? err.message : '未知错误'), 'error');
    } finally {
      setIsCompressing(false);
    }
  }, [filePath, isCompressing, selectedPreset, customMode, customParams, showToast]);

  if (!open) return null;

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="dialog-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dialog smart-compress-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h3>智能压缩</h3>
          <button className="dialog-close" onClick={onClose} aria-label="关闭">&times;</button>
        </div>

        <div className="dialog-body">
          <p className="dialog-description">
            使用 Ghostscript 引擎对 PDF 进行分级压缩，支持图片降采样、字体子集化。
          </p>

          {/* GS 状态指示 */}
          <div className="compress-gs-status">
            {gsStatus === null ? (
              <span>检测 Ghostscript...</span>
            ) : gsStatus.available ? (
              <span className="gs-available">✓ Ghostscript {gsStatus.version || ''} 已就绪</span>
            ) : (
              <span className="gs-unavailable">
                ⚠ Ghostscript 未安装，将使用 pdf-lib 优化（压缩效果有限）
              </span>
            )}
          </div>

          {/* 三档预设按钮组 */}
          <div className="compress-presets">
            {(Object.keys(PRESETS) as Preset[]).map((key) => {
              const preset = PRESETS[key];
              return (
                <button
                  key={key}
                  className={`compress-preset-card ${selectedPreset === key && !customMode ? 'active' : ''}`}
                  onClick={() => handleSelectPreset(key)}
                  disabled={isCompressing}
                >
                  <span className="compress-preset-icon">{preset.icon}</span>
                  <span className="compress-preset-label">{preset.label}</span>
                  <span className="compress-preset-desc">{preset.description}</span>
                  <span className="compress-preset-ratio">预计压缩 {preset.estimatedRatio}</span>
                </button>
              );
            })}
          </div>

          {/* 自定义参数展开面板 */}
          <details className="compress-custom-panel" open={customMode} onToggle={(e) => setCustomMode((e.target as HTMLDetailsElement).open)}>
            <summary>自定义参数</summary>
            <div className="compress-custom-options">
              <label className="compress-param-row">
                图片 DPI: {customParams.imageDpi}
                <input
                  type="range" min={72} max={600} step={10}
                  value={customParams.imageDpi}
                  onChange={(e) => { setCustomMode(true); setCustomParams({ ...customParams, imageDpi: Number(e.target.value) }); }}
                  disabled={isCompressing}
                  className="compress-slider"
                />
              </label>
              <label className="compress-param-row">
                JPEG 质量: {customParams.imageQuality}
                <input
                  type="range" min={0} max={100} step={5}
                  value={customParams.imageQuality}
                  onChange={(e) => { setCustomMode(true); setCustomParams({ ...customParams, imageQuality: Number(e.target.value) }); }}
                  disabled={isCompressing}
                  className="compress-slider"
                />
              </label>
              <label className="compress-param-row compress-param-check">
                <input type="checkbox"
                  checked={customParams.grayscale}
                  onChange={(e) => { setCustomMode(true); setCustomParams({ ...customParams, grayscale: e.target.checked }); }}
                  disabled={isCompressing}
                />
                灰度化
              </label>
              <label className="compress-param-row compress-param-check">
                <input type="checkbox"
                  checked={customParams.removeMetadata}
                  onChange={(e) => { setCustomMode(true); setCustomParams({ ...customParams, removeMetadata: e.target.checked }); }}
                  disabled={isCompressing}
                />
                清除元数据
              </label>
              <label className="compress-param-row compress-param-check">
                <input type="checkbox"
                  checked={customParams.fontSubset}
                  onChange={(e) => { setCustomMode(true); setCustomParams({ ...customParams, fontSubset: e.target.checked }); }}
                  disabled={isCompressing}
                />
                字体子集化
              </label>
            </div>
          </details>

          {/* 压缩结果 */}
          {compressResult && (
            <div className="compress-result">
              <div className="compress-result-row">
                <span>原始大小</span>
                <strong>{formatSize(compressResult.originalSize)}</strong>
              </div>
              <div className="compress-result-row">
                <span>压缩后大小</span>
                <strong>{formatSize(compressResult.compressedSize)}</strong>
              </div>
              <div className="compress-result-row compress-result-ratio">
                <span>压缩比</span>
                <strong>{compressResult.ratio}%</strong>
              </div>
            </div>
          )}

          {/* 文件信息 */}
          {documentInfo && (
            <p className="compress-file-info">
              当前文件: {documentInfo.title || filePath?.split(/[\\/]/).pop()} ({formatSize(documentInfo.fileSize || 0)}, {documentInfo.pageCount} 页)
            </p>
          )}
        </div>

        <div className="dialog-footer">
          <button className="btn-secondary" onClick={onClose}>关闭</button>
          <button
            className="btn-primary"
            onClick={handleCompress}
            disabled={isCompressing || !filePath}
          >
            {isCompressing ? '压缩中...' : '开始压缩'}
          </button>
        </div>
      </div>
    </div>
  );
};
