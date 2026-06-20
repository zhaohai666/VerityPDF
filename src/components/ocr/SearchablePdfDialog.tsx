import React, { useState, useCallback, useRef } from 'react';
import { usePdfStore } from '@/stores/pdfStore';
import { useUIStore } from '@/stores/uiStore';
import { OCRService } from '@/services/ocr/OCRService';

interface SearchablePdfDialogProps {
  open: boolean;
  onClose: () => void;
}

/** 语言选项 */
const LANG_OPTIONS = [
  { value: 'eng', label: '英文' },
  { value: 'chi_sim', label: '简体中文' },
  { value: 'chi_tra', label: '繁体中文' },
  { value: 'eng+chi_sim', label: '英文 + 简体中文' },
  { value: 'eng+chi_tra', label: '英文 + 繁体中文' },
];

/** 进度状态标签 */
const STATUS_LABELS: Record<string, string> = {
  'loading tesseract core': '加载 OCR 引擎...',
  'initializing tesseract': '初始化引擎...',
  'loading language traineddata': '加载语言数据...',
  'initializing api': '初始化 API...',
  'recognizing text': '识别文字...',
  'generating pdf': '生成 PDF...',
  'done': '完成',
};

export const SearchablePdfDialog: React.FC<SearchablePdfDialogProps> = ({ open, onClose }) => {
  const [language, setLanguage] = useState('eng+chi_sim');
  const [pageRange, setPageRange] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ status: '', value: 0 });
  const abortRef = useRef<AbortController | null>(null);
  const ocrServiceRef = useRef<OCRService | null>(null);

  const { filePath, documentInfo } = usePdfStore();
  const showToast = useUIStore((s) => s.showToast);
  const totalPages = documentInfo?.pageCount ?? 0;

  // 生成可搜索 PDF
  const handleGenerate = useCallback(async () => {
    if (isProcessing || !filePath) return;

    const pdfService = window.__pdfService;
    if (!pdfService) {
      showToast('无法访问 PDF 服务', 'error');
      return;
    }

    setIsProcessing(true);
    setProgress({ status: 'loading tesseract core', value: 0 });

    const controller = new AbortController();
    abortRef.current = controller;

    const ocrService = new OCRService();
    ocrServiceRef.current = ocrService;

    try {
      // 读取原始文件数据
      const pdfData = await window.verityAPI.readFile(filePath);

      // 解析页面范围
      const indices = pageRange.trim()
        ? parsePageRange(pageRange, totalPages)
        : Array.from({ length: totalPages }, (_, i) => i);

      if (indices.length === 0) {
        showToast('请输入有效的页面范围', 'warning');
        setIsProcessing(false);
        return;
      }

      // 创建只包含选定页面的临时 PDF
      const tempPdfService = {
        renderPage: async (page: number, canvas: HTMLCanvasElement, scale: number) => {
          await pdfService.renderPage(page, canvas, scale);
        },
        getPageSize: async (page: number) => {
          return pdfService.getPageSize(page);
        },
      };

      // 执行 OCR 生成可搜索 PDF
      const result = await ocrService.createSearchablePdf(
        pdfData,
        tempPdfService,
        indices.length,
        language,
        (p) => setProgress({ status: p.status, value: p.progress }),
        controller.signal
      );

      if (controller.signal.aborted) return;

      // 保存文件
      const savePath = await window.verityAPI.showDialog({
        type: 'save',
        filters: [{ name: 'PDF 文件', extensions: ['pdf'] }],
        defaultPath: filePath.replace(/\.pdf$/i, '_searchable.pdf'),
      });

      if (!savePath) {
        setIsProcessing(false);
        return;
      }

      const base64 = Buffer.from(result).toString('base64');
      await window.verityAPI.saveFile(base64, savePath);
      showToast('可搜索 PDF 生成成功！', 'success');
      onClose();
    } catch (err) {
      if (controller.signal.aborted) {
        showToast('OCR 已取消', 'info');
      } else {
        showToast('生成失败: ' + (err instanceof Error ? err.message : '未知错误'), 'error');
      }
    } finally {
      setIsProcessing(false);
      abortRef.current = null;
      ocrService.destroy().catch(() => {});
    }
  }, [isProcessing, filePath, language, pageRange, totalPages, showToast, onClose]);

  // 取消处理
  const handleCancel = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    onClose();
  }, [onClose]);

  if (!open) return null;

  return (
    <div className="dialog-overlay" onClick={(e) => { if (e.target === e.currentTarget) handleCancel(); }}>
      <div className="dialog searchable-pdf-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h3>生成可搜索 PDF</h3>
          <button className="dialog-close" onClick={handleCancel} aria-label="关闭">&times;</button>
        </div>

        <div className="dialog-body">
          <p className="dialog-description">
            对扫描件进行全量 OCR 识别，生成可搜索、可复制文字的 PDF 文件。
          </p>

          <div className="form-group">
            <label>识别语言</label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              disabled={isProcessing}
              className="form-input"
            >
              {LANG_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <p className="form-hint">首次使用该语言需下载识别数据（约 10MB）</p>
          </div>

          <div className="form-group">
            <label>页面范围</label>
            <input
              type="text"
              className="form-input"
              value={pageRange}
              onChange={(e) => setPageRange(e.target.value)}
              placeholder={`例如: 1-${Math.min(10, totalPages)}, 或留空表示全部 ${totalPages} 页`}
              disabled={isProcessing}
            />
            <p className="form-hint">留空表示所有页面（共 {totalPages} 页）</p>
          </div>

          {isProcessing && (
            <div className="ocr-progress-section">
              <div className="progress-bar">
                <div
                  className="progress-bar-fill"
                  style={{ width: `${Math.round(progress.value * 100)}%` }}
                />
              </div>
              <p className="progress-message">
                {STATUS_LABELS[progress.status] || progress.status}
                {` ${Math.round(progress.value * 100)}%`}
              </p>
            </div>
          )}

          <div className="form-warning">
            <strong>提示：</strong>大文档（超过 50 页）可能需要较长时间处理，期间可继续使用其他功能。
          </div>
        </div>

        <div className="dialog-footer">
          <button className="btn-secondary" onClick={handleCancel} disabled={!isProcessing && !open}>
            取消
          </button>
          <button
            className="btn-primary"
            onClick={handleGenerate}
            disabled={isProcessing || !filePath}
          >
            {isProcessing ? '处理中...' : '开始生成'}
          </button>
        </div>
      </div>
    </div>
  );
};

/** 解析页面范围字符串 */
function parsePageRange(input: string, totalPages: number): number[] {
  const indices: Set<number> = new Set();
  const parts = input.split(',').map((s) => s.trim()).filter(Boolean);
  for (const part of parts) {
    const rangeMatch = part.match(/^(\d+)\s*-\s*(\d+)$/);
    if (rangeMatch) {
      const start = Math.max(1, parseInt(rangeMatch[1], 10));
      const end = Math.min(totalPages, parseInt(rangeMatch[2], 10));
      for (let i = start; i <= end; i++) indices.add(i - 1);
    } else {
      const num = parseInt(part, 10);
      if (num >= 1 && num <= totalPages) indices.add(num - 1);
    }
  }
  return Array.from(indices).sort((a, b) => a - b);
}
