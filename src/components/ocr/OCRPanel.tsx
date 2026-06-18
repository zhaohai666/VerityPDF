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
  { value: 'eng+chi_sim', label: '英文 + 中文' },
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
    setIsRecognizing, setProgress, setResult, setSelectedPage,
    setLanguage, setPanelVisible,
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
      const ocrResult = await ocrService.recognizePage(
        pdfService,
        selectedPage || currentPage,
        2.0,
        (p) => setProgress(p)
      );
      setResult(ocrResult);
    } catch (err) {
      showToast('OCR 识别失败: ' + (err instanceof Error ? err.message : '未知错误'), 'error');
    } finally {
      setIsRecognizing(false);
    }
  }, [selectedPage, currentPage, language]);

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
            disabled={isRecognizing || !isLoaded}
          >
            {isRecognizing ? '识别中...' : '开始识别'}
          </button>

          {result && (
            <button className="btn-secondary" onClick={handleCopy}>
              复制结果
            </button>
          )}
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
            <p>选择页码和语言后点击"开始识别"</p>
            <p className="hint">首次使用需下载语言数据（约 10MB）</p>
          </div>
        )}
      </div>
    </div>
  );
};
