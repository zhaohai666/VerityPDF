import React, { useCallback, useRef, useEffect, useState } from 'react';
import { useOCRStore } from '@/stores/ocrStore';
import { usePdfStore } from '@/stores/pdfStore';
import { useUIStore } from '@/stores/uiStore';
import { OCRService } from '@/services/ocr/OCRService';
import { OCREngineManager, type OCREngineType, type EngineComparisonResult } from '@/services/ocr/OCREngineManager';

const ocrService = new OCRService();
const engineManager = new OCREngineManager();

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

/** 引擎选项 */
const ENGINE_OPTIONS: { value: OCREngineType; label: string; desc: string }[] = [
  { value: 'auto', label: '自动选择', desc: '根据语言智能选择引擎' },
  { value: 'tesseract', label: 'Tesseract.js', desc: '通用引擎，100+ 语言' },
  { value: 'paddleocr', label: 'PaddleOCR', desc: '中文精度更高' },
];

/** 进度状态标签 */
const STATUS_LABELS: Record<string, string> = {
  'loading tesseract core': '加载 OCR 引擎...',
  'initializing tesseract': '初始化引擎...',
  'loading language traineddata': '加载语言数据...',
  'initializing api': '初始化 API...',
  'recognizing text': '识别文字...',
  'loading paddleocr core': '加载 PaddleOCR...',
  'initializing paddleocr': '初始化 PaddleOCR...',
  'paddleocr ready': 'PaddleOCR 就绪',
  'processing results': '处理结果...',
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

  // 引擎选择和对比模式
  const [selectedEngine, setSelectedEngine] = useState<OCREngineType>('auto');
  const [compareMode, setCompareMode] = useState(false);
  const [compareResult, setCompareResult] = useState<EngineComparisonResult | null>(null);

  // 引擎切换
  useEffect(() => {
    engineManager.setEngine(selectedEngine);
  }, [selectedEngine]);

  // 识别当前页
  const handleRecognizePage = useCallback(async () => {
    const pdfService = window.__pdfService;
    if (!pdfService) {
      showToast('请先打开 PDF 文件', 'warning');
      return;
    }

    setIsRecognizing(true);
    setResult(null);
    setCompareResult(null);
    setProgress({ status: 'loading tesseract core', progress: 0 });

    try {
      // 创建临时 Canvas 渲染页面
      const canvas = document.createElement('canvas');
      await pdfService.renderPage(selectedPage || currentPage, canvas, 2.0);
      const scale = 2.0;

      if (compareMode) {
        // 对比模式：同时使用两个引擎
        const comparison = await engineManager.compare(
          canvas, language,
          { preprocess: preprocessOptions },
          (p) => setProgress(p)
        );
        setCompareResult(comparison);
        // 使用最佳引擎的结果作为主结果
        const bestResult = comparison.best === 'paddleocr'
          ? comparison.paddleocr
          : comparison.tesseract;
        if (bestResult) setResult(bestResult);
        canvas.remove();
      } else if (regionMode && selectedRegion) {
        // 选区识别模式 - 使用 Tesseract 的选区识别能力
        await ocrService.initWorker(language, (p) => setProgress(p));
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
        // 整页识别（使用引擎管理器）
        const ocrResult = await engineManager.recognize(
          canvas, language,
          { preprocess: preprocessOptions },
          (p) => setProgress(p)
        );
        canvas.remove();
        setResult(ocrResult);
      }
    } catch (err) {
      showToast('OCR 识别失败: ' + (err instanceof Error ? err.message : '未知错误'), 'error');
    } finally {
      setIsRecognizing(false);
    }
  }, [selectedPage, currentPage, language, regionMode, selectedRegion, preprocessOptions, compareMode]);

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
      engineManager.destroy().catch(() => {});
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
          {/* OCR 引擎选择 */}
          <div className="ocr-control-group">
            <label>OCR 引擎</label>
            <select
              value={selectedEngine}
              onChange={(e) => setSelectedEngine(e.target.value as OCREngineType)}
              disabled={isRecognizing}
            >
              {ENGINE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label} - {opt.desc}</option>
              ))}
            </select>
          </div>

          {/* 对比模式 */}
          <div className="ocr-control-group">
            <label className="ocr-enhance-row">
              <input
                type="checkbox"
                checked={compareMode}
                onChange={(e) => setCompareMode(e.target.checked)}
                disabled={isRecognizing}
              />
              对比模式（同时使用两个引擎）
            </label>
          </div>

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
              <span>识别结果 {compareResult && `(最佳: ${compareResult.best === 'paddleocr' ? 'PaddleOCR' : 'Tesseract'})`}</span>
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

        {/* 对比结果 */}
        {compareResult && compareResult.tesseract && compareResult.paddleocr && (
          <div className="ocr-compare-result" style={{ marginTop: '12px' }}>
            <div style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '8px' }}>引擎对比</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div style={{ border: `2px solid ${compareResult.best === 'tesseract' ? '#4caf50' : '#ddd'}`, borderRadius: '4px', padding: '8px' }}>
                <div style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>
                  Tesseract.js
                  <span style={{ float: 'right', color: '#666' }}>{Math.round(compareResult.tesseract.confidence)}%</span>
                </div>
                <div style={{ fontSize: '11px', color: '#666' }}>
                  {compareResult.tesseract.words.length} 词 | {compareResult.tesseract.text.length} 字符
                </div>
              </div>
              <div style={{ border: `2px solid ${compareResult.best === 'paddleocr' ? '#4caf50' : '#ddd'}`, borderRadius: '4px', padding: '8px' }}>
                <div style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>
                  PaddleOCR
                  <span style={{ float: 'right', color: '#666' }}>{Math.round(compareResult.paddleocr.confidence)}%</span>
                </div>
                <div style={{ fontSize: '11px', color: '#666' }}>
                  {compareResult.paddleocr.words.length} 词 | {compareResult.paddleocr.text.length} 字符
                </div>
              </div>
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
