import React, { useRef, useEffect, useCallback, useState } from 'react';
import { usePdfStore } from '@/stores/pdfStore';
import { useAnnotationStore } from '@/stores/annotationStore';
import { useToolStore } from '@/stores/toolStore';
import { useUIStore } from '@/stores/uiStore';
import { PDFService } from '@/services/pdf/PDFService';
import { PageRenderer } from './PageRenderer';
import { ExportDialog } from '@/components/export/ExportDialog';

const pdfService = new PDFService();

if (typeof window !== 'undefined') {
  window.__pdfService = pdfService;
  // 页面卸载时清理 PDFService 资源（释放 PDF.js 文档、缓存、Worker 资源）
  window.addEventListener('beforeunload', () => {
    pdfService.destroy().catch(() => { /* 忽略清理错误 */ });
  });
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
  // 滚动方向跟踪：用于非对称预加载（滚动方向前部更多缓冲）
  const scrollDirRef = useRef<'forward' | 'backward'>('forward');
  const lastScrollTopRef = useRef<number>(0);
  // 加载阶段跟踪：提供有意义的进度反馈
  const [loadingPhase, setLoadingPhase] = useState<'idle' | 'reading' | 'parsing' | 'preparing' | 'done'>('idle');
  const [showExportDialog, setShowExportDialog] = useState(false);

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
      // 阶段 1：读取文件（0-30%）
      setLoadingPhase('reading');
      const store = usePdfStore.getState();
      store.setLoading(true);
      store.setFilePath(path);
      store.setLoadingProgress(0.1);

      const data = await window.verityAPI.readFile(path);
      if (!data) {
        showToast('无法读取文件', 'error');
        setLoadingPhase('idle');
        return;
      }
      store.setLoadingProgress(0.3);

      // 阶段 2：解析 PDF（30-80%）
      setLoadingPhase('parsing');
      await pdfService.loadDocument(data, {
        onProgress: (p) => store.setLoadingProgress(0.3 + p * 0.5),
      });
      store.setLoadingProgress(0.8);

      // 阶段 3：准备文档信息（80-100%）
      setLoadingPhase('preparing');
      const info = await pdfService.getDocumentInfo(path);
      if (info) {
        info.fileSize = data.byteLength;
        store.setDocumentInfo(info);
      }

      store.setLoaded(true);
      store.setLoading(false);
      store.setLoadingProgress(1);
      setLoadingPhase('done');

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
      setLoadingPhase('idle');
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
    const store = usePdfStore.getState();
    if (!store.filePath || !store.isLoaded) {
      useUIStore.getState().showToast('请先打开 PDF 文件', 'warning');
      return;
    }
    // 显示导出选项对话框（支持类型/页码范围筛选）
    setShowExportDialog(true);
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
      // 跟踪滚动方向（用于非对称预加载）
      const currentTop = container.scrollTop;
      scrollDirRef.current = currentTop > lastScrollTopRef.current ? 'forward' : 'backward';
      lastScrollTopRef.current = currentTop;

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

    // 方向感知预加载：滚动方向前部 400px 缓冲，后部 100px
    const getRootMargin = () => {
      const dir = scrollDirRef.current;
      return dir === 'forward' ? '100px 0px 400px 0px' : '400px 0px 100px 0px';
    };

    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const pageNum = parseInt(entry.target.getAttribute('data-page') || '0');
          if (pageNum > 0) {
            if (entry.isIntersecting) {
              // 页面进入视口：根据滚动方向非对称预加载
              setVisiblePages((prev) => {
                const next = new Set(prev);
                const ahead = scrollDirRef.current === 'forward'
                  ? VISIBLE_THRESHOLD + 2   // 向下滚动：多预加载 2 页
                  : VISIBLE_THRESHOLD;
                const behind = scrollDirRef.current === 'forward'
                  ? VISIBLE_THRESHOLD
                  : VISIBLE_THRESHOLD + 2;  // 向上滚动：多预加载后方
                for (let i = Math.max(1, pageNum - behind); i <= Math.min(documentInfo?.pageCount ?? 0, pageNum + ahead); i++) {
                  next.add(i);
                }
                return next;
              });
            } else {
              // 页面离开视口：从渲染集合中移除，释放内存
              setVisiblePages((prev) => {
                if (!prev.has(pageNum)) return prev;
                const next = new Set(prev);
                next.delete(pageNum);
                return next;
              });
            }
          }
        });
      },
      {
        root: scrollContainerRef.current,
        rootMargin: getRootMargin(),
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
    const phaseLabels: Record<string, string> = { idle: '', reading: '读取文件中...', parsing: '解析 PDF 结构...', preparing: '准备文档...', done: '完成' };
    return (
      <div className="pdf-viewer">
        <div className="pdf-viewer-empty">
          <div className="empty-content">
            <div className="loading-spinner" />
            <p>{phaseLabels[loadingPhase] || '正在加载 PDF...'}</p>
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
    <>
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
      <ExportDialog open={showExportDialog} onClose={() => setShowExportDialog(false)} />
    </>
  );
};
