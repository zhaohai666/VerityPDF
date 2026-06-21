import React, { useCallback, useRef, useEffect } from 'react';
import { useOCRStore } from '@/stores/ocrStore';
import { usePdfStore } from '@/stores/pdfStore';
import { useUIStore } from '@/stores/uiStore';
import { OCRService } from '@/services/ocr/OCRService';

const ocrService = new OCRService();

/** 语言选项 */
const LANG_OPTIONS = [
  { value: 'eng', label: '英文' },
  { value: 'chi_sim', label: '简体中文' },
  { value: 'chi_tra', label: '繁体中文' },
  { value: 'eng+chi_sim', label: '英文 + 简体中文' },
  { value: 'eng+chi_tra', label: '英文 + 繁体中文' },
  { value: 'jpn', label: '日文' },
  { value: 'kor', label: '韩文' },
];

/** 进度状态标签 */
const STATUS_LABELS: Record<string, string> = {
  'loading tesseract core': '加载 OCR 引擎...',
  'initializing tesseract': '初始化引擎...',
  'loading language traineddata': '加载语言数据...',
  'initializing api': '初始化 API...',
  'recognizing text': '识别文字...',
};

/**
 * OCR 面板 - 浮动面板形式
 */
export const OCRPanel: React.FC = () => {
  const {
    isRecognizing, progress, result, selectedPage, language, panelVisible,
    regionMode, selectedRegion, preprocessOptions,
    setIsRecognizing, setProgress, setResult, setSelectedPage,
    setLanguage, setPanelVisible, setRegionMode, setSelectedRegion,
    setPreprocessOptions,
  } = useOCRStore();

  const currentPage = usePdfStore((s) => s.currentPage);
  const isLoaded = usePdfStore((s) => s.isLoaded);
  const showToast = useUIStore.getState().showToast;
  const textAreaRef = useRef<HTMLTextAreaElement>(null);

  // 识别当前页
  const handleRecognizePage = useCallback(async () => {
    const pdfService = window.__pdfService;
    if (!pdfService) {
      showToast('请先打开 PDF 文件', 'warning');
      return;
    }

    setIsRecognizing(true);
    setResult(null);
    setProgress({ status: 'loading tesseract core', progress: 0 });

    try {
      await ocrService.initWorker(language, (p) => setProgress(p));

      if (regionMode && selectedRegion) {
        // 选区识别模式
        const canvas = document.createElement('canvas');
        await pdfService.renderPage(selectedPage || currentPage, canvas, 2.0);
        const scale = 2.0;
        const region = {
          x: selectedRegion.x * scale,
          y: selectedRegion.y * scale,
          width: selectedRegion.width * scale,
          height: selectedRegion.height * scale,
        };
        const ocrResult = await ocrService.recognizeRegion(canvas, region, (p) => setProgress(p));
        canvas.remove();
        setResult(ocrResult);
      } else {
        // 整页识别（传入预处理选项）
        const ocrResult = await ocrService.recognizePage(
          pdfService,
          selectedPage || currentPage,
          2.0,
          { preprocess: preprocessOptions },
          (p) => setProgress(p)
        );
        setResult(ocrResult);
      }
    } catch (err) {
      showToast('OCR 识别失败: ' + (err instanceof Error ? err.message : '未知错误'), 'error');
    } finally {
      setIsRecognizing(false);
    }
  }, [selectedPage, currentPage, language, regionMode, selectedRegion, preprocessOptions]);

  // 复制结果
  const handleCopy = useCallback(async () => {
    if (!result?.text) return;
    try {
      await navigator.clipboard.writeText(result.text);
      showToast('已复制到剪贴板', 'success');
    } catch {
      // fallback
      if (textAreaRef.current) {
        textAreaRef.current.select();
        document.execCommand('copy');
        showToast('已复制到剪贴板', 'success');
      }
    }
  }, [result]);

  // 清理
  useEffect(() => {
    return () => {
      ocrService.destroy().catch(() => {});
    };
  }, []);

  // 选区绘制交互（在 PDF 页面上拖拽绘制矩形）
  useEffect(() => {
    if (!regionMode || !panelVisible) return;
    const handleRegionSelect = (e: CustomEvent) => {
      const detail = e.detail as { x: number; y: number; width: number; height: number };
      if (detail && detail.width > 5 && detail.height > 5) {
        setSelectedRegion(detail);
        showToast('已选定识别区域，点击“开始识别”', 'info');
      }
    };
    window.addEventListener('verity:ocr-region-selected', handleRegionSelect as EventListener);
    return () => {
      window.removeEventListener('verity:ocr-region-selected', handleRegionSelect as EventListener);
    };
  }, [regionMode, panelVisible, setSelectedRegion, showToast]);

  if (!panelVisible) return null;

  return (
    <div className="ocr-panel-overlay" onClick={(e) => { if (e.target === e.currentTarget) setPanelVisible(false); }}>
      <div className="ocr-panel">
        <div className="ocr-panel-header">
          <h3>OCR 文字识别</h3>
          <button className="ocr-panel-close" onClick={() => setPanelVisible(false)}>×</button>
        </div>

        <div className="ocr-panel-controls">
          {/* 语言选择 */}
          <div className="ocr-control-group">
            <label>识别语言</label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              disabled={isRecognizing}
            >
              {LANG_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* 识别模式切换 */}
          <div className="ocr-control-group">
            <label>识别模式</label>
            <div className="ocr-mode-btns">
              <button
                className={`btn-small ${!regionMode ? 'active' : ''}`}
                onClick={() => setRegionMode(false)}
                disabled={isRecognizing}
              >整页识别</button>
              <button
                className={`btn-small ${regionMode ? 'active' : ''}`}
                onClick={() => setRegionMode(true)}
                disabled={isRecognizing}
              >选区识别</button>
            </div>
          </div>

          {/* 页码选择 */}
          <div className="ocr-control-group">
            <label>页码</label>
            <input
              type="number"
              min={1}
              value={selectedPage || currentPage}
              onChange={(e) => setSelectedPage(parseInt(e.target.value) || 1)}
              disabled={isRecognizing}
            />
          </div>

          {/* 识别按钮 */}
          <button
            className="btn-primary"
            onClick={handleRecognizePage}
            disabled={isRecognizing || !isLoaded || (regionMode && !selectedRegion)}
          >
            {isRecognizing ? '识别中...' : regionMode ? '识别选区' : '开始识别'}
          </button>

          {result && (
            <button className="btn-secondary" onClick={handleCopy}>
              复制结果
            </button>
          )}

          {/* 图像增强面板 */}
          <details className="ocr-enhance-panel">
            <summary>图像增强 (OpenCV)</summary>
            <div className="ocr-enhance-options">
              <label className="ocr-enhance-row">
                <input
                  type="checkbox"
                  checked={preprocessOptions.denoise}
                  onChange={(e) => setPreprocessOptions({ ...preprocessOptions, denoise: e.target.checked })}
                  disabled={isRecognizing}
                />
                去噪
              </label>
              {preprocessOptions.denoise && (
                <label className="ocr-enhance-row ocr-enhance-slider">
                  强度: {preprocessOptions.denoiseStrength}
                  <input
                    type="range"
                    min={1} max={10} step={1}
                    value={preprocessOptions.denoiseStrength}
                    onChange={(e) => setPreprocessOptions({ ...preprocessOptions, denoiseStrength: Number(e.target.value) })}
                    disabled={isRecognizing}
                  />
                </label>
              )}
              <label className="ocr-enhance-row">
                <input
                  type="checkbox"
                  checked={preprocessOptions.deskew}
                  onChange={(e) => setPreprocessOptions({ ...preprocessOptions, deskew: e.target.checked })}
                  disabled={isRecognizing}
                />
                倾斜校正
              </label>
              <label className="ocr-enhance-row">
                <input
                  type="checkbox"
                  checked={preprocessOptions.contrastEnhance}
                  onChange={(e) => setPreprocessOptions({ ...preprocessOptions, contrastEnhance: e.target.checked })}
                  disabled={isRecognizing}
                />
                对比度增强
              </label>
              <label className="ocr-enhance-row">
                <input
                  type="checkbox"
                  checked={preprocessOptions.sharpen}
                  onChange={(e) => setPreprocessOptions({ ...preprocessOptions, sharpen: e.target.checked })}
                  disabled={isRecognizing}
                />
                锐化
              </label>
              <label className="ocr-enhance-row">
                <input
                  type="checkbox"
                  checked={preprocessOptions.binarize}
                  onChange={(e) => setPreprocessOptions({ ...preprocessOptions, binarize: e.target.checked })}
                  disabled={isRecognizing}
                />
                二值化 (OTSU)
              </label>
            </div>
          </details>

          {/* 生成可搜索 PDF 入口 */}
          <div className="ocr-divider" />
          <button
            className="btn-secondary ocr-searchable-btn"
            onClick={() => window.dispatchEvent(new CustomEvent('verity:ocr-searchable'))}
            disabled={!isLoaded || isRecognizing}
          >
            生成可搜索 PDF
          </button>
        </div>

        {/* 进度 */}
        {isRecognizing && (
          <div className="ocr-progress">
            <div className="ocr-progress-bar">
              <div
                className="ocr-progress-fill"
                style={{ width: `${Math.round(progress.progress * 100)}%` }}
              />
            </div>
            <span className="ocr-progress-text">
              {STATUS_LABELS[progress.status] || progress.status}
              {` ${Math.round(progress.progress * 100)}%`}
            </span>
          </div>
        )}

        {/* 结果 */}
        {result && (
          <div className="ocr-result">
            <div className="ocr-result-header">
              <span>识别结果</span>
              <span className="ocr-confidence">
                置信度: {Math.round(result.confidence)}%
              </span>
            </div>
            <textarea
              ref={textAreaRef}
              className="ocr-result-text"
              value={result.text}
              readOnly
              rows={12}
            />
            <div className="ocr-result-stats">
              {result.words.length} 个词 | {result.text.length} 个字符
            </div>
          </div>
        )}

        {/* 空状态 */}
        {!result && !isRecognizing && (
          <div className="ocr-empty">
            <p>{regionMode ? '点击“选区识别”后在页面上拖拽绘制识别区域' : '选择页码和语言后点击“开始识别”'}</p>
            <p className="hint">首次使用需下载语言数据（约 10MB）</p>
          </div>
        )}
      </div>
    </div>
  );
};
