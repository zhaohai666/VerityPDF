import React, { useState, useCallback, useRef, memo } from 'react';
import { usePdfStore } from '@/stores/pdfStore';
import { useUIStore } from '@/stores/uiStore';
import { usePageStore } from '@/stores/pageStore';

/** 缩略图（用于页面管理面板） */
const PageThumb = memo(({ pageIndex, isActive, onClick, onDelete, onDragStart, onDragOver, onDrop }: {
  pageIndex: number;
  isActive: boolean;
  onClick: () => void;
  onDelete: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderedRef = useRef(false);

  React.useEffect(() => {
    if (renderedRef.current || !canvasRef.current) return;
    const timer = setTimeout(async () => {
      if (!canvasRef.current || renderedRef.current) return;
      try {
        const pdfService = window.__pdfService;
        if (!pdfService) return;
        const pageNum = pageIndex + 1;
        const pageSize = await pdfService.getPageSize(pageNum);
        const scale = 120 / pageSize.width;
        const viewport = (await pdfService.getPage(pageNum)).getViewport({ scale });
        const canvas = canvasRef.current;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const page = await pdfService.getPage(pageNum);
        await page.render({ canvasContext: ctx, viewport }).promise;
        renderedRef.current = true;
      } catch { /* ignore */ }
    }, pageIndex * 80);
    return () => clearTimeout(timer);
  }, [pageIndex]);

  return (
    <div
      className={`page-thumb-item ${isActive ? 'active' : ''}`}
      onClick={onClick}
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      tabIndex={0}
      role="button"
      aria-label={`第 ${pageIndex + 1} 页`}
    >
      <canvas ref={canvasRef} className="page-thumb-canvas" />
      <div className="page-thumb-label">{pageIndex + 1}</div>
      <button
        className="page-thumb-delete"
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        title="删除此页"
        aria-label={`删除第 ${pageIndex + 1} 页`}
      >×</button>
    </div>
  );
});

PageThumb.displayName = 'PageThumb';

export const PageManager: React.FC = () => {
  const { documentInfo, currentPage, setCurrentPage, filePath } = usePdfStore();
  const showToast = useUIStore((s) => s.showToast);
  const { setModified } = usePageStore();
  const totalPages = documentInfo?.pageCount ?? 0;

  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  const [insertCount, setInsertCount] = useState(1);
  const dragSourceRef = useRef<number | null>(null);

  // 获取当前 PDF 数据（base64）
  const getPdfBase64 = useCallback(async (): Promise<string> => {
    if (!filePath) throw new Error('未打开文件');
    const data = await window.verityAPI.readFile(filePath);
    const bytes = new Uint8Array(data);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }, [filePath]);

  // 重新加载文档
  const reloadDocument = useCallback(async (newPdfArrayBuffer: ArrayBuffer) => {
    if (!filePath) return;
    const base64 = (() => {
      const bytes = new Uint8Array(newPdfArrayBuffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      return btoa(binary);
    })();

    // 保存到原文件
    await window.verityAPI.saveFile(
      Buffer.from(newPdfArrayBuffer).toString('base64'),
      filePath
    );

    setModified(base64);

    // 通知 PDFViewer 重新加载
    window.dispatchEvent(new CustomEvent('verity:reloadPdf'));
    showToast('页面操作已应用，请重新加载文档', 'info');
  }, [filePath, setModified, showToast]);

  // 删除页面
  const handleDelete = useCallback(async (pageIndices: number[]) => {
    if (isProcessing || totalPages <= 1) return;
    if (pageIndices.length >= totalPages) {
      showToast('不能删除所有页面', 'error');
      return;
    }

    setIsProcessing(true);
    try {
      const pdfBase64 = await getPdfBase64();
      const result = await window.verityAPI.manipulatePages(pdfBase64, {
        type: 'delete',
        pageIndices,
      });
      await reloadDocument(result);
      setSelectedPages(new Set());
    } catch (err) {
      showToast(err instanceof Error ? err.message : '删除页面失败', 'error');
    } finally {
      setIsProcessing(false);
    }
  }, [isProcessing, totalPages, getPdfBase64, reloadDocument, showToast]);

  // 插入空白页
  const handleInsertBlank = useCallback(async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      const pdfBase64 = await getPdfBase64();
      const afterIndex = currentPage - 1; // 在当前页后插入
      const result = await window.verityAPI.manipulatePages(pdfBase64, {
        type: 'insertBlank',
        afterIndex,
        count: insertCount,
      });
      await reloadDocument(result);
    } catch (err) {
      showToast(err instanceof Error ? err.message : '插入页面失败', 'error');
    } finally {
      setIsProcessing(false);
    }
  }, [isProcessing, currentPage, insertCount, getPdfBase64, reloadDocument, showToast]);

  // 提取页面
  const handleExtract = useCallback(async () => {
    if (isProcessing || selectedPages.size === 0) return;
    setIsProcessing(true);
    try {
      const pdfBase64 = await getPdfBase64();
      const indices = Array.from(selectedPages).sort((a, b) => a - b);
      const savedPath = await window.verityAPI.extractPages(pdfBase64, indices);
      if (savedPath) {
        showToast(`已提取 ${indices.length} 页到: ${savedPath.split(/[\\/]/).pop()}`, 'success');
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : '提取页面失败', 'error');
    } finally {
      setIsProcessing(false);
    }
  }, [isProcessing, selectedPages, getPdfBase64, showToast]);

  // 合并另一个 PDF
  const handleMerge = useCallback(async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      const mergePath = await window.verityAPI.openFile();
      if (!mergePath) { setIsProcessing(false); return; }

      const pdfBase64 = await getPdfBase64();
      const secondData = await window.verityAPI.readFile(mergePath);
      const secondBytes = new Uint8Array(secondData);
      let secondBinary = '';
      for (let i = 0; i < secondBytes.length; i++) secondBinary += String.fromCharCode(secondBytes[i]);
      const secondBase64 = btoa(secondBinary);

      const result = await window.verityAPI.manipulatePages(pdfBase64, {
        type: 'merge',
        secondPdfData: secondBase64,
        insertAfterIndex: currentPage - 1,
      });
      await reloadDocument(result);
      showToast('PDF 合并完成', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : '合并 PDF 失败', 'error');
    } finally {
      setIsProcessing(false);
    }
  }, [isProcessing, currentPage, getPdfBase64, reloadDocument, showToast]);

  // 拖拽重排
  const handleDragStart = useCallback((idx: number) => (e: React.DragEvent) => {
    dragSourceRef.current = idx;
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback((targetIdx: number) => async (e: React.DragEvent) => {
    e.preventDefault();
    const sourceIdx = dragSourceRef.current;
    if (sourceIdx === null || sourceIdx === targetIdx) return;

    setIsProcessing(true);
    try {
      const pdfBase64 = await getPdfBase64();
      // 构建新的页面顺序
      const order = Array.from({ length: totalPages }, (_, i) => i);
      order.splice(sourceIdx, 1);
      order.splice(targetIdx, 0, sourceIdx);

      const result = await window.verityAPI.manipulatePages(pdfBase64, {
        type: 'reorder',
        pageIndices: order,
      });
      await reloadDocument(result);
    } catch (err) {
      showToast(err instanceof Error ? err.message : '重排页面失败', 'error');
    } finally {
      setIsProcessing(false);
      dragSourceRef.current = null;
    }
  }, [totalPages, getPdfBase64, reloadDocument, showToast]);

  const toggleSelect = useCallback((idx: number, multi: boolean) => {
    setSelectedPages((prev) => {
      if (multi) {
        const next = new Set(prev);
        if (next.has(idx)) next.delete(idx); else next.add(idx);
        return next;
      }
      return prev.has(idx) && prev.size === 1 ? new Set() : new Set([idx]);
    });
  }, []);

  return (
    <div className="page-manager">
      {/* 工具栏 */}
      <div className="page-manager-toolbar">
        <button
          className="pm-btn"
          onClick={handleInsertBlank}
          disabled={isProcessing}
          title="在当前页后插入空白页"
        >+ 插入</button>
        <button
          className="pm-btn"
          onClick={handleMerge}
          disabled={isProcessing}
          title="合并另一个 PDF"
        >合并</button>
        <button
          className="pm-btn"
          onClick={handleExtract}
          disabled={isProcessing || selectedPages.size === 0}
          title="提取选中页面"
        >提取{selectedPages.size > 0 ? ` (${selectedPages.size})` : ''}</button>
        <button
          className="pm-btn pm-btn-danger"
          onClick={() => handleDelete(Array.from(selectedPages))}
          disabled={isProcessing || selectedPages.size === 0 || selectedPages.size >= totalPages}
          title="删除选中页面"
        >删除{selectedPages.size > 0 ? ` (${selectedPages.size})` : ''}</button>
      </div>

      {/* 插入页数量 */}
      <div className="pm-insert-row">
        <label>插入页数:</label>
        <input
          type="number"
          min={1}
          max={100}
          value={insertCount}
          onChange={(e) => setInsertCount(Math.max(1, Math.min(100, Number(e.target.value))))}
          className="pm-number-input"
        />
      </div>

      {/* 页面缩略图列表 */}
      <div className="page-thumb-list">
        {Array.from({ length: totalPages }, (_, i) => (
          <div
            key={i}
            className={`page-thumb-wrapper ${selectedPages.has(i) ? 'selected' : ''}`}
            onClick={(e) => toggleSelect(i, e.ctrlKey || e.metaKey)}
          >
            <PageThumb
              pageIndex={i}
              isActive={currentPage === i + 1}
              onClick={() => setCurrentPage(i + 1)}
              onDelete={() => handleDelete([i])}
              onDragStart={handleDragStart(i)}
              onDragOver={handleDragOver}
              onDrop={handleDrop(i)}
            />
            {selectedPages.has(i) && <div className="page-thumb-selected-overlay" />}
          </div>
        ))}
      </div>

      {isProcessing && (
        <div className="pm-processing-overlay">
          <div className="loading-spinner" />
          <p>处理中...</p>
        </div>
      )}

      <p className="pm-hint">提示：Ctrl+点击多选，拖拽重排</p>
    </div>
  );
};
