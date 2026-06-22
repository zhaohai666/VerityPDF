import React, { useRef, useEffect, useCallback, useState, Suspense } from 'react';
import { usePdfStore } from '@/stores/pdfStore';
import { useAnnotationStore } from '@/stores/annotationStore';
import { useToolStore } from '@/stores/toolStore';
import { useUIStore } from '@/stores/uiStore';
import { useTaskStore } from '@/stores/taskStore';
import { PDFService } from '@/services/pdf/PDFService';
import { PageRenderer } from './PageRenderer';

// 非核心对话框组件懒加载
const ExportDialog = React.lazy(() => import('@/components/export/ExportDialog').then(m => ({ default: m.ExportDialog })));
const SummaryDialog = React.lazy(() => import('@/components/export/SummaryDialog').then(m => ({ default: m.SummaryDialog })));
const ImageExportDialog = React.lazy(() => import('@/components/export/ImageExportDialog').then(m => ({ default: m.ImageExportDialog })));
const EncryptionDialog = React.lazy(() => import('@/components/encryption/EncryptionDialog').then(m => ({ default: m.EncryptionDialog })));
const PasswordDialog = React.lazy(() => import('@/components/encryption/PasswordDialog').then(m => ({ default: m.PasswordDialog })));
const DigitalSignatureDialog = React.lazy(() => import('@/components/signature/DigitalSignatureDialog').then(m => ({ default: m.DigitalSignatureDialog })));
const FormatConvertDialog = React.lazy(() => import('@/components/convert/FormatConvertDialog').then(m => ({ default: m.FormatConvertDialog })));
const BatchPageDialog = React.lazy(() => import('@/components/batch/BatchPageDialog').then(m => ({ default: m.BatchPageDialog })));
const WatermarkDialog = React.lazy(() => import('@/components/batch/WatermarkDialog').then(m => ({ default: m.WatermarkDialog })));
const SearchablePdfDialog = React.lazy(() => import('@/components/ocr/SearchablePdfDialog').then(m => ({ default: m.SearchablePdfDialog })));
const PageOpsDialog = React.lazy(() => import('@/components/pageops/PageOpsDialog').then(m => ({ default: m.PageOpsDialog })));
const TaskCenterDialog = React.lazy(() => import('@/components/batch/TaskCenterDialog').then(m => ({ default: m.TaskCenterDialog })));
const PipelineEditorDialog = React.lazy(() => import('@/components/batch/PipelineEditorDialog').then(m => ({ default: m.PipelineEditorDialog })));
const SmartCompressDialog = React.lazy(() => import('@/components/compress/SmartCompressDialog').then(m => ({ default: m.SmartCompressDialog })));
const RedactionDialog = React.lazy(() => import('@/components/redaction/RedactionDialog').then(m => ({ default: m.RedactionDialog })));
const EditTextDialog = React.lazy(() => import('@/components/edit/EditTextDialog').then(m => ({ default: m.EditTextDialog })));

const pdfService = new PDFService();

if (typeof window !== 'undefined') {
  window.__pdfService = pdfService;
  // 页面卸载时清理 PDFService 资源（释放 PDF.js 文档、缓存、Worker 资源）
  window.addEventListener('beforeunload', () => {
    pdfService.destroy().catch(() => { /* 忽略清理错误 */ });
  });
}

let _fileLoadInitiated = false;

/** 低内存阈值：页数 > 500 或文件大小 > 100MB */
const LOW_MEMORY_PAGE_THRESHOLD = 500;
const LOW_MEMORY_SIZE_THRESHOLD = 100 * 1024 * 1024;

/** 预加载窗口：可视页前后各 20 页保持渲染 */
const PRELOAD_WINDOW = 20;

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
  const [showSummaryDialog, setShowSummaryDialog] = useState(false);
  const [showImageExportDialog, setShowImageExportDialog] = useState(false);
  const [showEncryptionDialog, setShowEncryptionDialog] = useState(false);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [showSignatureDialog, setShowSignatureDialog] = useState(false);
  const [showConvertDialog, setShowConvertDialog] = useState(false);
  const [showBatchDialog, setShowBatchDialog] = useState(false);
  const [showWatermarkDialog, setShowWatermarkDialog] = useState(false);
  const [showSearchablePdfDialog, setShowSearchablePdfDialog] = useState(false);
  const [showPageOpsDialog, setShowPageOpsDialog] = useState(false);
  const [showTaskCenterDialog, setShowTaskCenterDialog] = useState(false);
  const [showPipelineDialog, setShowPipelineDialog] = useState(false);
  const [showSmartCompressDialog, setShowSmartCompressDialog] = useState(false);
  const [showRedactionDialog, setShowRedactionDialog] = useState(false);
  const [showEditTextDialog, setShowEditTextDialog] = useState(false);
  const [pendingPasswordPath, setPendingPasswordPath] = useState<string | null>(null);
  const [pendingPasswordData, setPendingPasswordData] = useState<ArrayBuffer | null>(null);

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
      try {
        await pdfService.loadDocument(data, {
          onProgress: (p) => store.setLoadingProgress(0.3 + p * 0.5),
        });
      } catch (loadErr: unknown) {
        // 检查是否是密码错误
        const errStr = loadErr instanceof Error ? loadErr.message : String(loadErr);
        if (errStr.includes('password') || errStr.includes('Password') || errStr.includes('encrypted')) {
          store.setLoading(false);
          setLoadingPhase('idle');
          store.setPasswordRequired(true);
          setPendingPasswordPath(path);
          setPendingPasswordData(data);
          setShowPasswordDialog(true);
          return;
        }
        throw loadErr;
      }
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

      // 低内存模式检测：大文档自动降级
      const pageCount = info?.pageCount ?? 0;
      const fileSize = data.byteLength;
      if (pageCount > LOW_MEMORY_PAGE_THRESHOLD || fileSize > LOW_MEMORY_SIZE_THRESHOLD) {
        store.setLowMemoryMode(true);
        // 缩小缓存池（低内存模式：仅保留 10 页缓存）
        pdfService.getPageCache().setMaxEntries?.(10);
        console.log('[Viewer] Low memory mode enabled:', pageCount, 'pages,', (fileSize / 1024 / 1024).toFixed(1), 'MB');
      }

      const verityPath = path.replace(/\.pdf$/i, '.verity');
      try {
        const verityData = await window.verityAPI.readFile(verityPath);
        if (verityData) {
          const project = JSON.parse(new TextDecoder().decode(verityData));
          if (project.annotations && Array.isArray(project.annotations)) {
            useAnnotationStore.getState().setAnnotations(project.annotations);
            console.log('[Viewer] Loaded', project.annotations.length, 'annotations from', verityPath.split(/[\\/]/).pop());
          }
          if (project.comments && Array.isArray(project.comments)) {
            useAnnotationStore.getState().setComments(project.comments);
            console.log('[Viewer] Loaded', project.comments.length, 'comments');
          }
        }
      } catch {
        // .verity 文件不存在，正常情况
      }

      // 检查草稿恢复
      const draftPath = path.replace(/\.pdf$/i, '.verity.draft');
      try {
        const draftData = await window.verityAPI.readFile(draftPath);
        if (draftData) {
          const draft = JSON.parse(new TextDecoder().decode(draftData));
          if (draft.annotations && Array.isArray(draft.annotations) && draft.annotations.length > 0) {
            const currentAnnotations = useAnnotationStore.getState().annotations;
            // 如果草稿比当前标注更新且数量不同，提示用户恢复
            if (draft.savedAt && draft.annotations.length !== currentAnnotations.length) {
              console.log('[Viewer] Draft recovery available:', draft.savedAt, draft.annotations.length, 'annotations');
              useUIStore.getState().showToast(
                `发现未保存的草稿 (${new Date(draft.savedAt).toLocaleString()})，已自动恢复`,
                'info'
              );
              useAnnotationStore.getState().setAnnotations(draft.annotations);
              if (draft.comments && Array.isArray(draft.comments)) {
                useAnnotationStore.getState().setComments(draft.comments);
              }
            }
          }
        }
      } catch {
        // 草稿文件不存在，正常情况
      }

      const fileName = path.split(/[\\/]/).pop() || 'VerityPDF';
      window.verityAPI.setWindowTitle(`${fileName} - VerityPDF`);
      console.log('[Viewer] File loaded:', fileName, 'pages:', info?.pageCount);

      // PDF/A 只读标记提示
      if (pdfService.isPDFA) {
        useUIStore.getState().showToast(
          '此文档为 PDF/A 格式（归档文档），建议以只读方式查看',
          'info'
        );
      }
      // 加密文档提示
      if (pdfService.isEncrypted) {
        console.log('[Viewer] Encrypted PDF loaded');
      }

      setTimeout(() => scrollToPage(1), 300);
    } catch (err) {
      console.error('Failed to load file:', err);
      usePdfStore.getState().setLoading(false);
      setLoadingPhase('idle');
      const errorMsg = err instanceof Error ? err.message : '加载文件失败';

      // 尝试 PDF 修复流程
      if (errorMsg.includes('InvalidPDF') || errorMsg.includes('MissingPDF') || errorMsg.includes('corrupt')) {
        const showToast = useUIStore.getState().showToast;
        showToast('PDF 文件可能已损坏，正在尝试修复...', 'info');
        try {
          const repairedData = await window.verityAPI.repairPDF(path);
          if (repairedData) {
            showToast('修复成功，正在重新加载...', 'success');
            const store = usePdfStore.getState();
            store.setLoading(true);
            await pdfService.loadDocument(repairedData, {
              onProgress: (p) => store.setLoadingProgress(p),
            });
            store.setLoaded(true);
            store.setLoading(false);
            setLoadingPhase('done');
            console.log('[Viewer] PDF repaired and loaded successfully');
            return;
          }
        } catch (repairErr) {
          console.error('[Viewer] PDF repair failed:', repairErr);
          showToast('PDF 修复失败，文件可能严重损坏', 'error');
        }
      }

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
    const handleSummaryExport = () => setShowSummaryDialog(true);
    const handleImageExport = () => setShowImageExportDialog(true);
    const handleEncryption = () => setShowEncryptionDialog(true);
    const handleSignature = () => setShowSignatureDialog(true);
    const handleConvert = () => setShowConvertDialog(true);
    const handleBatch = () => setShowBatchDialog(true);
    const handleWatermark = () => setShowWatermarkDialog(true);
    const handleSearchablePdf = () => setShowSearchablePdfDialog(true);
    const handlePageOps = () => setShowPageOpsDialog(true);
    const handleTaskCenter = () => setShowTaskCenterDialog(true);
    const handlePipeline = () => setShowPipelineDialog(true);
    const handleSmartCompress = () => setShowSmartCompressDialog(true);
    const handleRedaction = () => setShowRedactionDialog(true);
    const handleEditText = () => setShowEditTextDialog(true);
    const handleReloadPdf = () => {
      // 页面操作后重新加载文档
      const fp = usePdfStore.getState().filePath;
      if (fp) loadFileFromPath(fp);
    };
    window.addEventListener('verity:export', handleExportEvent);
    window.addEventListener('verity:exportSummary', handleSummaryExport);
    window.addEventListener('verity:exportImages', handleImageExport);
    window.addEventListener('verity:encrypt', handleEncryption);
    window.addEventListener('verity:signature', handleSignature);
    window.addEventListener('verity:convert', handleConvert);
    window.addEventListener('verity:batch', handleBatch);
    window.addEventListener('verity:watermark', handleWatermark);
    window.addEventListener('verity:ocr-searchable', handleSearchablePdf);
    window.addEventListener('verity:pageops', handlePageOps);
    window.addEventListener('verity:taskCenter', handleTaskCenter);
    window.addEventListener('verity:pipeline', handlePipeline);
    window.addEventListener('verity:smartCompress', handleSmartCompress);
    window.addEventListener('verity:redaction', handleRedaction);
    window.addEventListener('verity:editText', handleEditText);
    window.addEventListener('verity:reloadPdf', handleReloadPdf);
    return () => {
      unsubMenu();
      unsubFile();
      window.removeEventListener('verity:export', handleExportEvent);
      window.removeEventListener('verity:exportSummary', handleSummaryExport);
      window.removeEventListener('verity:exportImages', handleImageExport);
      window.removeEventListener('verity:encrypt', handleEncryption);
      window.removeEventListener('verity:signature', handleSignature);
      window.removeEventListener('verity:convert', handleConvert);
      window.removeEventListener('verity:batch', handleBatch);
      window.removeEventListener('verity:watermark', handleWatermark);
      window.removeEventListener('verity:ocr-searchable', handleSearchablePdf);
      window.removeEventListener('verity:pageops', handlePageOps);
      window.removeEventListener('verity:taskCenter', handleTaskCenter);
      window.removeEventListener('verity:pipeline', handlePipeline);
      window.removeEventListener('verity:smartCompress', handleSmartCompress);
      window.removeEventListener('verity:redaction', handleRedaction);
      window.removeEventListener('verity:editText', handleEditText);
      window.removeEventListener('verity:reloadPdf', handleReloadPdf);
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

  // 初始化任务队列监听
  useEffect(() => {
    const cleanup = useTaskStore.getState().initListeners();
    useTaskStore.getState().loadTemplates();
    return cleanup;
  }, []);

  // 密码提交处理
  const handlePasswordSubmit = useCallback(async (password: string) => {
    if (!pendingPasswordData || !pendingPasswordPath) return;
    const showToast = useUIStore.getState().showToast;
    try {
      const store = usePdfStore.getState();
      store.setLoading(true);
      setLoadingPhase('parsing');

      await pdfService.loadDocument(pendingPasswordData, {
        password,
        onProgress: (p) => store.setLoadingProgress(0.3 + p * 0.5),
      });
      store.setLoadingProgress(0.8);

      setLoadingPhase('preparing');
      const info = await pdfService.getDocumentInfo(pendingPasswordPath);
      if (info) {
        info.fileSize = pendingPasswordData.byteLength;
        store.setDocumentInfo(info);
      }

      store.setLoaded(true);
      store.setLoading(false);
      store.setLoadingProgress(1);
      store.setPasswordRequired(false);
      setLoadingPhase('done');
      setShowPasswordDialog(false);
      setPendingPasswordPath(null);
      setPendingPasswordData(null);

      const fileName = pendingPasswordPath.split(/[\\/]/).pop() || 'VerityPDF';
      window.verityAPI.setWindowTitle(`${fileName} - VerityPDF`);
      setTimeout(() => scrollToPage(1), 300);
    } catch {
      showToast('密码错误，请重试', 'error');
      usePdfStore.getState().setLoading(false);
      setLoadingPhase('idle');
    }
  }, [pendingPasswordData, pendingPasswordPath]);

  const handlePasswordCancel = useCallback(() => {
    setShowPasswordDialog(false);
    setPendingPasswordPath(null);
    setPendingPasswordData(null);
    usePdfStore.getState().setPasswordRequired(false);
  }, []);

  // 加密应用处理
  const handleApplyEncryption = useCallback(async (options: {
    userPassword: string;
    ownerPassword: string;
    permissions: {
      print: boolean; copy: boolean; modify: boolean;
      annotate: boolean; fillForms: boolean; extract: boolean;
    };
  }) => {
    const showToast = useUIStore.getState().showToast;
    const store = usePdfStore.getState();
    if (!store.filePath) return;

    try {
      const data = await window.verityAPI.readFile(store.filePath);
      const base64 = btoa(String.fromCharCode(...new Uint8Array(data)));
      const encrypted = await window.verityAPI.applyEncryption(base64, options);

      const savePath = await window.verityAPI.showDialog({
        type: 'save',
        filters: [{ name: 'PDF 文件', extensions: ['pdf'] }],
      });
      if (!savePath) return;

      const encryptedBase64 = btoa(String.fromCharCode(...new Uint8Array(encrypted)));
      await window.verityAPI.saveFile(encryptedBase64, savePath);
      showToast('加密成功', 'success');
      setShowEncryptionDialog(false);
      // 如果保存到原文件路径，重新加载
      if (savePath === store.filePath) {
        loadFileFromPath(savePath);
      }
    } catch (err) {
      showToast('加密失败: ' + (err instanceof Error ? err.message : '未知错误'), 'error');
    }
  }, [loadFileFromPath]);

  // 解密处理
  const handleDecryptEncryption = useCallback(async (password: string) => {
    const showToast = useUIStore.getState().showToast;
    const store = usePdfStore.getState();
    if (!store.filePath) return;

    try {
      const data = await window.verityAPI.readFile(store.filePath);
      const base64 = btoa(String.fromCharCode(...new Uint8Array(data)));
      const decrypted = await window.verityAPI.decryptWithPassword(base64, password);

      // 保存回原文件
      const decryptedBase64 = btoa(String.fromCharCode(...new Uint8Array(decrypted)));
      await window.verityAPI.saveFile(decryptedBase64, store.filePath);
      showToast('加密已移除', 'success');
      setShowEncryptionDialog(false);
      loadFileFromPath(store.filePath);
    } catch (err) {
      showToast('解密失败: ' + (err instanceof Error ? err.message : '密码可能不正确'), 'error');
    }
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

    // 方向感知预加载：滚动方向前部多缓冲，后部少缓冲
    const getRootMargin = () => {
      const dir = scrollDirRef.current;
      return dir === 'forward' ? '200px 0px 600px 0px' : '600px 0px 200px 0px';
    };

    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const pageNum = parseInt(entry.target.getAttribute('data-page') || '0');
          if (pageNum > 0) {
            if (entry.isIntersecting) {
              // 页面进入视口：前后各 PRELOAD_WINDOW 页保持渲染
              setVisiblePages((prev) => {
                const next = new Set(prev);
                const total = documentInfo?.pageCount ?? 0;
                for (let i = Math.max(1, pageNum - PRELOAD_WINDOW); i <= Math.min(total, pageNum + PRELOAD_WINDOW); i++) {
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
      <Suspense fallback={null}>
        <ExportDialog open={showExportDialog} onClose={() => setShowExportDialog(false)} />
        <SummaryDialog open={showSummaryDialog} onClose={() => setShowSummaryDialog(false)} />
        <ImageExportDialog open={showImageExportDialog} onClose={() => setShowImageExportDialog(false)} pdfService={pdfService} />
        <EncryptionDialog open={showEncryptionDialog} onClose={() => setShowEncryptionDialog(false)} onApply={handleApplyEncryption} onDecrypt={handleDecryptEncryption} />
        <PasswordDialog
          open={showPasswordDialog}
          fileName={pendingPasswordPath?.split(/[\\/]/).pop() || ''}
          onSubmit={handlePasswordSubmit}
          onCancel={handlePasswordCancel}
        />
        <DigitalSignatureDialog open={showSignatureDialog} onClose={() => setShowSignatureDialog(false)} />
        <FormatConvertDialog open={showConvertDialog} onClose={() => setShowConvertDialog(false)} />
        <BatchPageDialog open={showBatchDialog} onClose={() => setShowBatchDialog(false)} />
        <WatermarkDialog open={showWatermarkDialog} onClose={() => setShowWatermarkDialog(false)} />
        <SearchablePdfDialog open={showSearchablePdfDialog} onClose={() => setShowSearchablePdfDialog(false)} />
        <PageOpsDialog open={showPageOpsDialog} onClose={() => setShowPageOpsDialog(false)} />
        {showTaskCenterDialog && <TaskCenterDialog onClose={() => setShowTaskCenterDialog(false)} />}
        {showPipelineDialog && <PipelineEditorDialog onClose={() => setShowPipelineDialog(false)} />}
        {showSmartCompressDialog && <SmartCompressDialog open={showSmartCompressDialog} onClose={() => setShowSmartCompressDialog(false)} />}
        {showRedactionDialog && <RedactionDialog open={showRedactionDialog} onClose={() => setShowRedactionDialog(false)} />}
        {showEditTextDialog && <EditTextDialog onClose={() => setShowEditTextDialog(false)} />}
      </Suspense>
    </>
  );
};
