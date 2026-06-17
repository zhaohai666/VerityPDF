import React, { useRef, useEffect, useCallback, useState } from 'react';
import { usePdfStore } from '@/stores/pdfStore';
import { useAnnotationStore } from '@/stores/annotationStore';
import { useToolStore } from '@/stores/toolStore';
import { PDFService } from '@/services/pdf/PDFService';
import { PageRenderer } from './PageRenderer';

const pdfService = new PDFService();

// 全局暴露 pdfService 供缩略图使用
if (typeof window !== 'undefined') {
  (window as any).__pdfService = pdfService;
}

// 防止 StrictMode 双重挂载导致重复加载
let _fileLoadInitiated = false;

export const PDFViewer: React.FC = () => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const viewerContentRef = useRef<HTMLDivElement>(null);
  const { filePath, isLoaded, currentPage, zoom, rotation, zoomMode, scrollMode, isLoading, loadingProgress, documentInfo } = usePdfStore();
  const activeTool = useToolStore((s) => s.activeTool);
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // 测量容器宽度
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    // 立即获取初始宽度
    const initialWidth = el.clientWidth;
    if (initialWidth > 0) {
      setContainerWidth(initialWidth);
    }

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [isLoaded, isLoading]); // 当加载状态变化时重新绑定

  // 计算并同步 effectiveZoom
  useEffect(() => {
    if (!isLoaded || !documentInfo || containerWidth <= 0) return;
    const computeEffectiveZoom = async () => {
      if (zoomMode === 'fitWidth') {
        const pageSize = await pdfService.getPageSize(1);
        const effectiveZoom = (containerWidth - 40) / pageSize.width;
        usePdfStore.getState().setEffectiveZoom(effectiveZoom);
      } else if (zoomMode === 'fitPage') {
        const pageSize = await pdfService.getPageSize(1);
        const availH = window.innerHeight - 160;
        const availW = containerWidth - 40;
        const effectiveZoom = Math.min(availH / pageSize.height, availW / pageSize.width);
        usePdfStore.getState().setEffectiveZoom(effectiveZoom);
      } else {
        usePdfStore.getState().setEffectiveZoom(zoom);
      }
    };
    computeEffectiveZoom();
  }, [isLoaded, zoomMode, zoom, containerWidth, documentInfo]);

  // 渲染完成后加载大纲
  useEffect(() => {
    if (!isLoaded) return;
    pdfService.getOutline().then((outline) => {
      if (outline && outline.length > 0) {
        const mapped = outline.map((item) => ({
          title: item.title || 'Untitled',
          pageNumber: item.dest ? 1 : 1, // 简化处理
          children: [],
        }));
        usePdfStore.getState().setOutline(mapped);
      }
    }).catch(() => { /* ignore */ });
  }, [isLoaded]);

  // 加载文件
  const loadFileFromPath = useCallback(async (path: string) => {
    try {
      const data = await window.verityAPI.readFile(path);
      const store = usePdfStore.getState();
      store.setLoading(true);
      store.setFilePath(path);

      await pdfService.loadDocument(data, {
        onProgress: (p) => store.setLoadingProgress(p),
      });

      const info = await pdfService.getDocumentInfo(path);
      if (info) {
        info.fileSize = data.byteLength;
        store.setDocumentInfo(info);
      }

      store.setLoaded(true);
      store.setLoading(false);

      // 自动加载 .verity 项目文件
      const verityPath = path.replace(/\.pdf$/i, '.verity');
      try {
        const verityData = await window.verityAPI.readFile(verityPath);
        if (verityData) {
          const project = JSON.parse(new TextDecoder().decode(verityData));
          if (project.annotations && Array.isArray(project.annotations)) {
            useAnnotationStore.getState().setAnnotations(project.annotations);
            console.log('[Viewer] Loaded', project.annotations.length, 'annotations from', verityPath.split(/[\\/]/).pop());
          }
        }
      } catch {
        // .verity 文件不存在，正常情况
      }

      const fileName = path.split(/[\\/]/).pop() || 'VerityPDF';
      window.verityAPI.setWindowTitle(`${fileName} - VerityPDF`);
      console.log('[Viewer] File loaded:', fileName, 'pages:', info?.pageCount);

      // 自动滚动到第 1 页
      setTimeout(() => scrollToPage(1), 300);
    } catch (err) {
      console.error('Failed to load file:', err);
      usePdfStore.getState().setLoading(false);
    }
  }, []);

  // 打开文件对话框
  const handleOpenFile = useCallback(async () => {
    try {
      const path = await window.verityAPI.openFile();
      if (!path) return;
      await loadFileFromPath(path);
    } catch (err) {
      console.error('Failed to open file:', err);
      usePdfStore.getState().setLoading(false);
    }
  }, [loadFileFromPath]);

  // 导出带标注的 PDF
  const handleExportPDF = useCallback(async () => {
    try {
      const store = usePdfStore.getState();
      if (!store.filePath || !store.isLoaded) {
        console.warn('[Export] No PDF loaded');
        return;
      }

      // 读取原始 PDF 文件并转为 Base64
      const pdfArrayBuffer = await window.verityAPI.readFile(store.filePath);
      const pdfBytes = new Uint8Array(pdfArrayBuffer);
      let binary = '';
      for (let i = 0; i < pdfBytes.length; i++) {
        binary += String.fromCharCode(pdfBytes[i]);
      }
      const pdfBase64 = btoa(binary);

      // 获取所有标注
      const annotations = useAnnotationStore.getState().annotations;

      // 默认导出文件名
      const originalName = store.filePath.split(/[\\/]/).pop()?.replace(/\.pdf$/i, '') || 'document';
      const defaultName = `${originalName}_annotated.pdf`;

      console.log(`[Export] Starting export: ${annotations.length} annotations`);

      // 调用主进程导出
      const savedPath = await window.verityAPI.exportPDF(pdfBase64, annotations, defaultName);
      if (savedPath) {
        console.log('[Export] PDF saved to:', savedPath);
      } else {
        console.log('[Export] Export cancelled by user');
      }
    } catch (err) {
      console.error('[Export] Export failed:', err);
      alert(`导出失败: ${err instanceof Error ? err.message : '未知错误'}`);
    }
  }, []);

  // 滚动到指定页面
  const scrollToPage = useCallback((page: number) => {
    const el = pageRefs.current.get(page);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  // 监听 currentPage 变化来滚动
  useEffect(() => {
    if (isLoaded && scrollMode === 'singlePage') {
      scrollToPage(currentPage);
    }
  }, [currentPage, isLoaded, scrollMode, scrollToPage]);

  // 监听滚动事件，更新当前页码
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || !isLoaded) return;

    let scrollTimeout: ReturnType<typeof setTimeout>;
    const handleScroll = () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        const containerRect = container.getBoundingClientRect();
        const viewportMiddle = containerRect.top + containerRect.height * 0.3;

        let closestPage = 1;
        let closestDist = Infinity;

        pageRefs.current.forEach((el, page) => {
          const rect = el.getBoundingClientRect();
          const dist = Math.abs(rect.top - viewportMiddle);
          if (dist < closestDist) {
            closestDist = dist;
            closestPage = page;
          }
        });

        if (closestPage !== usePdfStore.getState().currentPage) {
          usePdfStore.getState().setCurrentPage(closestPage);
        }
      }, 100);
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', handleScroll);
      clearTimeout(scrollTimeout);
    };
  }, [isLoaded]);

  // 鼠标滚轮缩放 (Ctrl+Wheel)
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || !isLoaded) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const store = usePdfStore.getState();
        if (e.deltaY < 0) {
          store.zoomIn();
        } else {
          store.zoomOut();
        }
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [isLoaded]);

  // 文件拖放
  useEffect(() => {
    const handleDrop = async (e: DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer?.files[0];
      if (file && file.path && file.name.toLowerCase().endsWith('.pdf')) {
        await loadFileFromPath(file.path);
      }
    };
    const handleDragOver = (e: DragEvent) => { e.preventDefault(); e.stopPropagation(); };
    window.addEventListener('drop', handleDrop);
    window.addEventListener('dragover', handleDragOver);
    return () => {
      window.removeEventListener('drop', handleDrop);
      window.removeEventListener('dragover', handleDragOver);
    };
  }, [loadFileFromPath]);

  // 菜单事件 + 文件打开事件 + 导出事件
  useEffect(() => {
    const unsubMenu = window.verityAPI.onMenuAction((action) => {
      if (action === 'file:open') handleOpenFile();
      if (action === 'file:export') handleExportPDF();
    });
    const unsubFile = window.verityAPI.onFileOpen((fp) => {
      console.log('[Viewer] Received file:opened event:', fp);
      loadFileFromPath(fp);
    });
    // 工具栏导出按钮事件
    const handleExportEvent = () => handleExportPDF();
    window.addEventListener('verity:export', handleExportEvent);
    return () => {
      unsubMenu();
      unsubFile();
      window.removeEventListener('verity:export', handleExportEvent);
    };
  }, [handleOpenFile, loadFileFromPath, handleExportPDF]);

  // 启动时自动加载测试文件
  useEffect(() => {
    if (_fileLoadInitiated) return;
    _fileLoadInitiated = true; // 同步设置，防止 StrictMode 双重挂载
    const checkTestFile = async () => {
      const testFilePath = await window.verityAPI.getTestFile();
      if (testFilePath && !usePdfStore.getState().isLoaded && !usePdfStore.getState().isLoading) {
        console.log('[Viewer] Auto-loading test file:', testFilePath);
        loadFileFromPath(testFilePath);
      }
    };
    checkTestFile();
  }, [loadFileFromPath]);

  // 注册页面 ref
  const registerPageRef = useCallback((page: number, el: HTMLDivElement | null) => {
    if (el) {
      pageRefs.current.set(page, el);
    } else {
      pageRefs.current.delete(page);
    }
  }, []);

  const cursor = activeTool === 'select' ? 'default' : activeTool === 'pan' ? 'grab' : 'crosshair';
  const pageCount = documentInfo?.pageCount ?? 0;

  // 空状态
  if (!isLoaded && !isLoading) {
    return (
      <div className="pdf-viewer" style={{ cursor: 'default' }}>
        <div className="pdf-viewer-empty">
          <div className="empty-content">
            <h2>VerityPDF</h2>
            <p>专业 PDF 批注工具</p>
            <button className="btn-primary" onClick={handleOpenFile}>打开 PDF 文件</button>
            <p className="hint">或将 PDF 文件拖放到此处</p>
          </div>
        </div>
      </div>
    );
  }

  // 加载中
  if (isLoading) {
    return (
      <div className="pdf-viewer">
        <div className="pdf-viewer-empty">
          <div className="empty-content">
            <div className="loading-spinner" />
            <p>正在加载 PDF...</p>
            <div className="loading-bar">
              <div className="loading-bar-fill" style={{ width: `${Math.round(loadingProgress * 100)}%` }} />
            </div>
            <p className="hint">{Math.round(loadingProgress * 100)}%</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={scrollContainerRef}
      className="pdf-viewer"
      style={{ cursor }}
    >
      <div ref={viewerContentRef} className="pdf-viewer-content">
        {Array.from({ length: pageCount }, (_, i) => i + 1).map((pageNum) => (
          <div
            key={pageNum}
            ref={(el) => registerPageRef(pageNum, el)}
            className={`pdf-page-slot ${currentPage === pageNum ? 'active' : ''}`}
          >
            <PageRenderer
              pageNumber={pageNum}
              pdfService={pdfService}
              zoom={zoom}
              rotation={rotation}
              containerWidth={containerWidth}
              zoomMode={zoomMode}
            />
          </div>
        ))}
      </div>
    </div>
  );
};
