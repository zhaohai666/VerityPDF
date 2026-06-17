import React, { useRef, useEffect, useCallback, useState } from 'react';
import { usePdfStore } from '@/stores/pdfStore';
import { useAnnotationStore } from '@/stores/annotationStore';
import { useToolStore } from '@/stores/toolStore';
import { useUIStore } from '@/stores/uiStore';
import { PDFService } from '@/services/pdf/PDFService';
import { PageRenderer } from './PageRenderer';

const pdfService = new PDFService();

if (typeof window !== 'undefined') {
  window.__pdfService = pdfService;
}

let _fileLoadInitiated = false;

const VISIBLE_THRESHOLD = 2;

export const PDFViewer: React.FC = () => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const viewerContentRef = useRef<HTMLDivElement>(null);
  const { isLoaded, currentPage, zoom, rotation, zoomMode, scrollMode, isLoading, loadingProgress, documentInfo } = usePdfStore();
  const activeTool = useToolStore((s) => s.activeTool);
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const [visiblePages, setVisiblePages] = useState<Set<number>>(new Set([1]));
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

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
  }, [isLoaded, isLoading]);

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

  useEffect(() => {
    if (!isLoaded) return;
    pdfService.getOutline().then((outline) => {
      if (outline && outline.length > 0) {
        const mapped = outline.map((item) => ({
          title: item.title || 'Untitled',
          pageNumber: item.pageNumber || 1,
          children: [],
        }));
        usePdfStore.getState().setOutline(mapped);
      }
    }).catch(() => { /* ignore */ });
  }, [isLoaded]);

  const loadFileFromPath = useCallback(async (path: string) => {
    const showToast = useUIStore.getState().showToast;
    try {
      const data = await window.verityAPI.readFile(path);
      if (!data) {
        showToast('无法读取文件', 'error');
        return;
      }

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

      setTimeout(() => scrollToPage(1), 300);
    } catch (err) {
      console.error('Failed to load file:', err);
      usePdfStore.getState().setLoading(false);
      const errorMsg = err instanceof Error ? err.message : '加载文件失败';
      showToast(errorMsg, 'error');
    }
  }, []);

  const handleOpenFile = useCallback(async () => {
    const showToast = useUIStore.getState().showToast;
    try {
      const path = await window.verityAPI.openFile();
      if (!path) return;
      await loadFileFromPath(path);
    } catch (err) {
      console.error('Failed to open file:', err);
      usePdfStore.getState().setLoading(false);
      const errorMsg = err instanceof Error ? err.message : '打开文件失败';
      showToast(errorMsg, 'error');
    }
  }, [loadFileFromPath]);

  const handleExportPDF = useCallback(async () => {
    const showToast = useUIStore.getState().showToast;
    try {
      const store = usePdfStore.getState();
      if (!store.filePath || !store.isLoaded) {
        showToast('请先打开 PDF 文件', 'warning');
        return;
      }

      const pdfArrayBuffer = await window.verityAPI.readFile(store.filePath);
      if (!pdfArrayBuffer) {
        showToast('无法读取 PDF 文件', 'error');
        return;
      }

      const pdfBytes = new Uint8Array(pdfArrayBuffer);
      let binary = '';
      for (let i = 0; i < pdfBytes.length; i++) {
        binary += String.fromCharCode(pdfBytes[i]);
      }
      const pdfBase64 = btoa(binary);

      const annotations = useAnnotationStore.getState().annotations;

      const originalName = store.filePath.split(/[\\/]/).pop()?.replace(/\.pdf$/i, '') || 'document';
      const defaultName = `${originalName}_annotated.pdf`;

      console.log(`[Export] Starting export: ${annotations.length} annotations`);

      const savedPath = await window.verityAPI.exportPDF(pdfBase64, annotations, defaultName);
      if (savedPath) {
        console.log('[Export] PDF saved to:', savedPath);
        showToast('导出成功', 'success');
      } else {
        console.log('[Export] Export cancelled by user');
      }
    } catch (err) {
      console.error('[Export] Export failed:', err);
      const errorMsg = err instanceof Error ? err.message : '导出失败';
      showToast(errorMsg, 'error');
    }
  }, []);

  const scrollToPage = useCallback((page: number) => {
    const el = pageRefs.current.get(page);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  useEffect(() => {
    if (isLoaded && scrollMode === 'singlePage') {
      scrollToPage(currentPage);
    }
  }, [currentPage, isLoaded, scrollMode, scrollToPage]);

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

  useEffect(() => {
    const unsubMenu = window.verityAPI.onMenuAction((action) => {
      if (action === 'file:open') handleOpenFile();
      if (action === 'file:export') handleExportPDF();
    });
    const unsubFile = window.verityAPI.onFileOpen((fp) => {
      console.log('[Viewer] Received file:opened event:', fp);
      loadFileFromPath(fp);
    });
    const handleExportEvent = () => handleExportPDF();
    window.addEventListener('verity:export', handleExportEvent);
    return () => {
      unsubMenu();
      unsubFile();
      window.removeEventListener('verity:export', handleExportEvent);
    };
  }, [handleOpenFile, loadFileFromPath, handleExportPDF]);

  useEffect(() => {
    if (_fileLoadInitiated) return;
    _fileLoadInitiated = true;
    const checkTestFile = async () => {
      const testFilePath = await window.verityAPI.getTestFile();
      if (testFilePath && !usePdfStore.getState().isLoaded && !usePdfStore.getState().isLoading) {
        console.log('[Viewer] Auto-loading test file:', testFilePath);
        loadFileFromPath(testFilePath);
      }
    };
    checkTestFile();
  }, [loadFileFromPath]);

  const registerPageRef = useCallback((page: number, el: HTMLDivElement | null) => {
    if (el) {
      pageRefs.current.set(page, el);
      if (observerRef.current) {
        observerRef.current.observe(el);
      }
    } else {
      pageRefs.current.delete(page);
    }
  }, []);

  useEffect(() => {
    if (!scrollContainerRef.current) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const pageNum = parseInt(entry.target.getAttribute('data-page') || '0');
          if (pageNum > 0) {
            if (entry.isIntersecting) {
              setVisiblePages((prev) => {
                const next = new Set(prev);
                for (let i = Math.max(1, pageNum - VISIBLE_THRESHOLD); i <= Math.min(documentInfo?.pageCount ?? 0, pageNum + VISIBLE_THRESHOLD); i++) {
                  next.add(i);
                }
                return next;
              });
            }
          }
        });
      },
      {
        root: scrollContainerRef.current,
        rootMargin: '200px',
        threshold: 0.1,
      }
    );

    pageRefs.current.forEach((el) => {
      observerRef.current?.observe(el);
    });

    return () => {
      observerRef.current?.disconnect();
    };
  }, [isLoaded, documentInfo?.pageCount]);

  const cursor = activeTool === 'select' ? 'default' : activeTool === 'pan' ? 'grab' : 'crosshair';
  const pageCount = documentInfo?.pageCount ?? 0;



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
            data-page={pageNum}
            className={`pdf-page-slot ${currentPage === pageNum ? 'active' : ''}`}
          >
            {visiblePages.has(pageNum) && (
              <PageRenderer
                pageNumber={pageNum}
                pdfService={pdfService}
                zoom={zoom}
                rotation={rotation}
                containerWidth={containerWidth}
                zoomMode={zoomMode}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
