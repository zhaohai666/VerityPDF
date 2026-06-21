import React, { useState, useEffect, useCallback } from 'react';
import { usePdfStore } from '@/stores/pdfStore';
import { useUIStore } from '@/stores/uiStore';
import type { ConvertResult } from '@/types/electron';

interface FormatConvertDialogProps {
  open: boolean;
  onClose: () => void;
}

/** 导出格式选项 */
const EXPORT_FORMATS = [
  { value: 'docx', label: 'Word (docx)', icon: 'W' },
  { value: 'xlsx', label: 'Excel (xlsx)', icon: 'X' },
  { value: 'pptx', label: 'PowerPoint (pptx)', icon: 'P' },
  { value: 'html', label: 'HTML 网页', icon: 'H' },
  { value: 'md', label: 'Markdown', icon: 'M' },
  { value: 'png', label: 'PNG 高清图片', icon: '🖼' },
  { value: 'jpg', label: 'JPEG 图片', icon: 'J' },
  { value: 'tiff', label: 'TIFF 图片', icon: 'T' },
];

const IMPORT_EXTENSIONS = ['docx', 'doc', 'xlsx', 'xls', 'pptx', 'ppt', 'html', 'htm', 'md', 'txt', 'rtf', 'odt', 'ods', 'odp'];

type TabKey = 'export' | 'import' | 'batch';

export const FormatConvertDialog: React.FC<FormatConvertDialogProps> = ({ open, onClose }) => {
  const [activeTab, setActiveTab] = useState<TabKey>('export');
  const [loAvailable, setLoAvailable] = useState<boolean | null>(null);
  const [loVersion, setLoVersion] = useState('');
  const [loSource, setLoSource] = useState('');
  const [targetFormat, setTargetFormat] = useState('docx');
  const [imageDpi, setImageDpi] = useState(300);
  const [jpegQuality, setJpegQuality] = useState(95);
  const [isConverting, setIsConverting] = useState(false);
  const [convertResult, setConvertResult] = useState<ConvertResult | null>(null);
  const [batchFiles, setBatchFiles] = useState<string[]>([]);
  const [batchResults, setBatchResults] = useState<ConvertResult[]>([]);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0, file: '' });

  const filePath = usePdfStore((s) => s.filePath);
  const showToast = useUIStore((s) => s.showToast);

  // 检查 LibreOffice 可用性
  useEffect(() => {
    if (!open) return;
    window.verityAPI.checkLibreOffice().then((info) => {
      setLoAvailable(info.available);
      setLoVersion(info.version || '');
      setLoSource((info as { source?: string }).source || '');
    }).catch(() => {
      setLoAvailable(false);
    });
  }, [open]);

  // 获取输出目录
  const getOutputDir = useCallback(async (): Promise<string | null> => {
    const dirPath = await window.verityAPI.showDialog({
      type: 'save',
      filters: [{ name: '选择输出目录', extensions: ['*'] }],
      defaultPath: 'converted_output',
    });
    if (!dirPath) return null;
    // showDialog 返回文件路径，取其目录
    const parts = dirPath.replace(/\\/g, '/').split('/');
    parts.pop();
    return parts.join('/') || dirPath;
  }, []);

  // PDF → 其他格式
  const handleExport = useCallback(async () => {
    if (!filePath) { showToast('请先打开 PDF 文件', 'warning'); return; }
    const outputDir = await getOutputDir();
    if (!outputDir) return;

    setIsConverting(true);
    setConvertResult(null);
    try {
      const result = await window.verityAPI.convertFile(filePath, {
        targetFormat,
        outputDir,
        imageDpi: ['png', 'jpg', 'tiff'].includes(targetFormat) ? imageDpi : undefined,
        jpegQuality: targetFormat === 'jpg' ? jpegQuality : undefined,
      });
      setConvertResult(result);
      if (result.success) showToast(result.message, 'success');
      else showToast(result.message, 'error');
    } catch (err) {
      showToast('转换失败: ' + (err instanceof Error ? err.message : '未知错误'), 'error');
    } finally {
      setIsConverting(false);
    }
  }, [filePath, targetFormat, imageDpi, jpegQuality, getOutputDir, showToast]);

  // 选择文件转为 PDF
  const handleImportSelect = useCallback(async () => {
    const files = await window.verityAPI.selectConvertFiles(IMPORT_EXTENSIONS);
    if (!files || files.length === 0) return;
    setBatchFiles(files);
    setActiveTab('batch');
  }, []);

  // 批量转换
  const handleBatchConvert = useCallback(async () => {
    if (batchFiles.length === 0) { showToast('请先选择文件', 'warning'); return; }
    const outputDir = await getOutputDir();
    if (!outputDir) return;

    setIsConverting(true);
    setBatchResults([]);
    setBatchProgress({ current: 0, total: batchFiles.length, file: '' });

    try {
      const result = await window.verityAPI.batchConvert(batchFiles, {
        targetFormat: activeTab === 'batch' && filePath ? targetFormat : 'pdf',
        outputDir,
        imageDpi,
        jpegQuality,
      });
      setBatchResults(result.results);
      showToast(`批量转换完成：${result.successCount} 成功，${result.failCount} 失败`, result.failCount > 0 ? 'warning' : 'success');
    } catch (err) {
      showToast('批量转换失败: ' + (err instanceof Error ? err.message : '未知错误'), 'error');
    } finally {
      setIsConverting(false);
      setBatchProgress({ current: 0, total: 0, file: '' });
    }
  }, [batchFiles, activeTab, filePath, targetFormat, imageDpi, jpegQuality, getOutputDir, showToast]);

  // 单文件转 PDF
  const handleImportConvert = useCallback(async () => {
    const files = await window.verityAPI.selectConvertFiles(IMPORT_EXTENSIONS);
    if (!files || files.length === 0) return;
    const outputDir = await getOutputDir();
    if (!outputDir) return;

    setIsConverting(true);
    setConvertResult(null);
    try {
      if (files.length === 1) {
        const result = await window.verityAPI.convertToPDF(files[0], outputDir);
        setConvertResult(result);
        if (result.success) showToast(result.message, 'success');
        else showToast(result.message, 'error');
      } else {
        const result = await window.verityAPI.batchConvert(files, { targetFormat: 'pdf', outputDir });
        showToast(`转换完成：${result.successCount} 成功，${result.failCount} 失败`, result.failCount > 0 ? 'warning' : 'success');
      }
    } catch (err) {
      showToast('转换失败: ' + (err instanceof Error ? err.message : '未知错误'), 'error');
    } finally {
      setIsConverting(false);
    }
  }, [getOutputDir, showToast]);

  if (!open) return null;

  // LibreOffice 不可用提示
  if (loAvailable === false) {
    return (
      <div className="dialog-overlay" onClick={onClose}>
        <div className="dialog convert-dialog" onClick={(e) => e.stopPropagation()}>
          <div className="dialog-header">
            <h2>格式转换</h2>
            <button className="dialog-close" onClick={onClose} aria-label="关闭">&times;</button>
          </div>
          <div className="dialog-body">
            <div className="lo-unavailable">
              <div className="lo-icon">⚠️</div>
              <h3>未检测到 LibreOffice</h3>
              <p>格式转换功能需要安装 LibreOffice。请安装后重启应用。</p>
              <a href="https://www.libreoffice.org/download/" target="_blank" rel="noopener noreferrer" className="lo-download-link">
                下载 LibreOffice →
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const isImageFormat = ['png', 'jpg', 'tiff'].includes(targetFormat);

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog convert-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h2>格式转换</h2>
          {loVersion && (
            <span className="lo-version">
              {loVersion}
              {loSource === 'portable' && <span className="lo-source-tag portable">内置便携版</span>}
              {loSource === 'system' && <span className="lo-source-tag system">系统安装</span>}
            </span>
          )}
          <button className="dialog-close" onClick={onClose} aria-label="关闭">&times;</button>
        </div>

        <div className="convert-tabs">
          <button className={`convert-tab ${activeTab === 'export' ? 'active' : ''}`} onClick={() => setActiveTab('export')}>
            PDF → 其他格式
          </button>
          <button className={`convert-tab ${activeTab === 'import' ? 'active' : ''}`} onClick={() => setActiveTab('import')}>
            其他 → PDF
          </button>
          <button className={`convert-tab ${activeTab === 'batch' ? 'active' : ''}`} onClick={() => setActiveTab('batch')}>
            批量转换
          </button>
        </div>

        <div className="dialog-body">
          {loAvailable === null && <div className="convert-loading">正在检测 LibreOffice...</div>}

          {/* Tab: PDF → 其他格式 */}
          {activeTab === 'export' && loAvailable && (
            <div className="convert-section">
              <p className="convert-desc">将当前 PDF 文件转换为其他格式</p>
              <div className="format-grid">
                {EXPORT_FORMATS.map((fmt) => (
                  <button
                    key={fmt.value}
                    className={`format-card ${targetFormat === fmt.value ? 'selected' : ''}`}
                    onClick={() => setTargetFormat(fmt.value)}
                  >
                    <span className="format-icon">{fmt.icon}</span>
                    <span className="format-label">{fmt.label}</span>
                  </button>
                ))}
              </div>

              {isImageFormat && (
                <div className="convert-options">
                  <div className="option-row">
                    <label>DPI（分辨率）</label>
                    <select value={imageDpi} onChange={(e) => setImageDpi(Number(e.target.value))} className="form-select">
                      <option value={150}>150 DPI</option>
                      <option value={300}>300 DPI（推荐）</option>
                      <option value={600}>600 DPI</option>
                    </select>
                  </div>
                  {targetFormat === 'jpg' && (
                    <div className="option-row">
                      <label>JPEG 质量: {jpegQuality}%</label>
                      <input type="range" min={10} max={100} step={5} value={jpegQuality}
                        onChange={(e) => setJpegQuality(Number(e.target.value))} className="form-range" />
                    </div>
                  )}
                </div>
              )}

              {convertResult && (
                <div className={`convert-result ${convertResult.success ? 'success' : 'error'}`}>
                  <span>{convertResult.success ? '✓' : '✗'}</span>
                  <span>{convertResult.message}</span>
                  {convertResult.success && (
                    <span className="result-size">({(convertResult.fileSize / 1024).toFixed(1)} KB)</span>
                  )}
                </div>
              )}

              <div className="dialog-actions">
                <button className="btn-primary" onClick={handleExport} disabled={isConverting || !filePath}>
                  {isConverting ? '转换中...' : '开始转换'}
                </button>
              </div>
            </div>
          )}

          {/* Tab: 其他 → PDF */}
          {activeTab === 'import' && loAvailable && (
            <div className="convert-section">
              <p className="convert-desc">将 Word/Excel/PPT/HTML 等文件转换为 PDF</p>
              <div className="import-area">
                <p>支持的格式：Word、Excel、PowerPoint、HTML、Markdown、RTF、OpenDocument</p>
                <button className="btn-primary" onClick={handleImportConvert} disabled={isConverting}>
                  {isConverting ? '转换中...' : '选择文件并转换为 PDF'}
                </button>
              </div>

              {convertResult && (
                <div className={`convert-result ${convertResult.success ? 'success' : 'error'}`}>
                  <span>{convertResult.success ? '✓' : '✗'}</span>
                  <span>{convertResult.message}</span>
                </div>
              )}
            </div>
          )}

          {/* Tab: 批量转换 */}
          {activeTab === 'batch' && loAvailable && (
            <div className="convert-section">
              <p className="convert-desc">批量将多个文件转换为目标格式</p>

              <div className="batch-file-actions">
                <button className="btn-secondary btn-sm" onClick={handleImportSelect} disabled={isConverting}>
                  添加文件
                </button>
                {batchFiles.length > 0 && <span className="file-count">{batchFiles.length} 个文件</span>}
              </div>

              {batchFiles.length > 0 && (
                <div className="batch-file-list">
                  {batchFiles.map((f, i) => (
                    <div key={i} className="batch-file-item">
                      <span className="file-name">{f.split(/[\\/]/).pop()}</span>
                      <button className="btn-remove" onClick={() => setBatchFiles(batchFiles.filter((_, idx) => idx !== i))}>&times;</button>
                    </div>
                  ))}
                </div>
              )}

              <div className="option-row">
                <label>目标格式</label>
                <select value={targetFormat} onChange={(e) => setTargetFormat(e.target.value)} className="form-select">
                  <option value="pdf">PDF</option>
                  {EXPORT_FORMATS.map((fmt) => (
                    <option key={fmt.value} value={fmt.value}>{fmt.label}</option>
                  ))}
                </select>
              </div>

              {batchProgress.total > 0 && (
                <div className="batch-progress">
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }} />
                  </div>
                  <span className="progress-text">{batchProgress.current}/{batchProgress.total} - {batchProgress.file}</span>
                </div>
              )}

              {batchResults.length > 0 && (
                <div className="batch-results">
                  {batchResults.map((r, i) => (
                    <div key={i} className={`result-item ${r.success ? 'success' : 'error'}`}>
                      <span>{r.success ? '✓' : '✗'}</span>
                      <span className="result-file">{r.outputPath ? r.outputPath.split(/[\\/]/).pop() : batchFiles[i]?.split(/[\\/]/).pop()}</span>
                      <span className="result-msg">{r.message}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="dialog-actions">
                <button className="btn-primary" onClick={handleBatchConvert} disabled={isConverting || batchFiles.length === 0}>
                  {isConverting ? '转换中...' : `批量转换 (${batchFiles.length} 个文件)`}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
