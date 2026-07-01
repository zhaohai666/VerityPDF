import React, { useEffect, useState, Suspense } from 'react';
import { Toolbar } from '@/components/toolbar/Toolbar';
import { Sidebar } from '@/components/sidebar/Sidebar';
import { PDFViewer } from '@/components/viewer/PDFViewer';
import { PropertyPanel } from '@/components/property/PropertyPanel';
import { StatusBar } from '@/components/common/StatusBar';
import { Toast } from '@/components/common/Toast';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { useKeyboardShortcuts, useAutoSave } from '@/hooks';
import { usePdfStore } from '@/stores/pdfStore';
import { useAnnotationStore } from '@/stores/annotationStore';
import { useUIStore } from '@/stores/uiStore';
import { useSearchStore } from '@/stores/searchStore';
import './i18n';

// 非核心模块懒加载
const CommentPanel = React.lazy(() => import('@/components/comment/CommentPanel').then(m => ({ default: m.CommentPanel })));
const SearchPanel = React.lazy(() => import('@/components/search/SearchPanel').then(m => ({ default: m.SearchPanel })));
const OCRPanel = React.lazy(() => import('@/components/ocr/OCRPanel').then(m => ({ default: m.OCRPanel })));

// 工具对话框懒加载
const MetadataEditorDialog = React.lazy(() => import('@/components/metadata/MetadataEditorDialog').then(m => ({ default: m.MetadataEditorDialog })));
const RemoveAnnotationsDialog = React.lazy(() => import('@/components/annotation/RemoveAnnotationsDialog').then(m => ({ default: m.RemoveAnnotationsDialog })));
const PageResizeDialog = React.lazy(() => import('@/components/resize/PageResizeDialog').then(m => ({ default: m.PageResizeDialog })));
const PdfOverlayDialog = React.lazy(() => import('@/components/overlay/PdfOverlayDialog').then(m => ({ default: m.PdfOverlayDialog })));
const NUpDialog = React.lazy(() => import('@/components/nup/NUpDialog').then(m => ({ default: m.NUpDialog })));
const ImageExtractDialog = React.lazy(() => import('@/components/extract/ImageExtractDialog').then(m => ({ default: m.ImageExtractDialog })));
const SignatureVerifyDialog = React.lazy(() => import('@/components/signature/SignatureVerifyDialog').then(m => ({ default: m.SignatureVerifyDialog })));
const PdfDiffDialog = React.lazy(() => import('@/components/diff/PdfDiffDialog').then(m => ({ default: m.PdfDiffDialog })));
const SensitiveRedactDialog = React.lazy(() => import('@/components/redact/SensitiveRedactDialog').then(m => ({ default: m.SensitiveRedactDialog })));
const BookletDialog = React.lazy(() => import('@/components/booklet/BookletDialog').then(m => ({ default: m.BookletDialog })));
const ColorReplaceDialog = React.lazy(() => import('@/components/color/ColorReplaceDialog').then(m => ({ default: m.ColorReplaceDialog })));
const SanitizeDialog = React.lazy(() => import('@/components/sanitize/SanitizeDialog').then(m => ({ default: m.SanitizeDialog })));
const PdfAConvertDialog = React.lazy(() => import('@/components/pdfa/PdfAConvertDialog').then(m => ({ default: m.PdfAConvertDialog })));
const SplitByBookmarksDialog = React.lazy(() => import('@/components/split-bookmarks/SplitByBookmarksDialog').then(m => ({ default: m.SplitByBookmarksDialog })));
const InvertColorsDialog = React.lazy(() => import('@/components/invert-colors/InvertColorsDialog').then(m => ({ default: m.InvertColorsDialog })));
const RemoveImagesDialog = React.lazy(() => import('@/components/remove-images/RemoveImagesDialog').then(m => ({ default: m.RemoveImagesDialog })));
const AttachmentDialog = React.lazy(() => import('@/components/attachments/AttachmentDialog').then(m => ({ default: m.AttachmentDialog })));
const InfoJsonDialog = React.lazy(() => import('@/components/info-json/InfoJsonDialog').then(m => ({ default: m.InfoJsonDialog })));
const ScannerEffectDialog = React.lazy(() => import('@/components/scanner-effect/ScannerEffectDialog').then(m => ({ default: m.ScannerEffectDialog })));
const ImageToPdfDialog = React.lazy(() => import('@/components/image-to-pdf/ImageToPdfDialog').then(m => ({ default: m.ImageToPdfDialog })));
const CsvExportDialog = React.lazy(() => import('@/components/csv-export/CsvExportDialog').then(m => ({ default: m.CsvExportDialog })));
const ShowJsDialog = React.lazy(() => import('@/components/show-js/ShowJsDialog').then(m => ({ default: m.ShowJsDialog })));
const ImageEditorDialog = React.lazy(() => import('@/components/image-edit/ImageEditorDialog').then(m => ({ default: m.ImageEditorDialog })));
const HyperlinkEditDialog = React.lazy(() => import('@/components/hyperlink/HyperlinkEditDialog').then(m => ({ default: m.HyperlinkEditDialog })));
const BookmarkEditDialog = React.lazy(() => import('@/components/bookmark/BookmarkEditDialog').then(m => ({ default: m.BookmarkEditDialog })));
const ScriptExecuteDialog = React.lazy(() => import('@/components/script/ScriptExecuteDialog').then(m => ({ default: m.ScriptExecuteDialog })));
const CollabDialog = React.lazy(() => import('@/components/collab/CollabDialog').then(m => ({ default: m.CollabDialog })));
const RestApiDialog = React.lazy(() => import('@/components/api/RestApiDialog').then(m => ({ default: m.RestApiDialog })));
const LanguageSelector = React.lazy(() => import('@/components/language-selector/LanguageSelector').then(m => ({ default: m.LanguageSelector })));

const App: React.FC = () => {
  // 初始化全局快捷键
  useKeyboardShortcuts();
  // 初始化自动保存
  useAutoSave();

  // 搜索面板可见性
  const searchVisible = useSearchStore((s) => s.visible);

  // 评论面板状态
  const selectedIds = useAnnotationStore((s) => s.selectedIds);
  const [showComments, setShowComments] = useState(false);
  const activeCommentId = showComments && selectedIds.length === 1 ? selectedIds[0] : null;

  // 工具对话框状态
  const [activeToolDialog, setActiveToolDialog] = useState<string | null>(null);
  const [dialogPdfData, setDialogPdfData] = useState<string>('');
  const [showLangSelector, setShowLangSelector] = useState(false);

  // 监听工具栏评论按钮事件
  useEffect(() => {
    const handler = () => setShowComments((prev) => !prev);
    window.addEventListener('verity:toggleComments', handler);
    return () => window.removeEventListener('verity:toggleComments', handler);
  }, []);
  
  // PDF 卸载时同步清理标注 Store，防止新文档残留标注
  const isLoaded = usePdfStore((s) => s.isLoaded);
  useEffect(() => {
    if (!isLoaded) {
      useAnnotationStore.getState().reset();
    }
  }, [isLoaded]);

  // 全局菜单事件处理：将 Electron 菜单的 menu:action 分发到各 store
  useEffect(() => {
    const unsub = window.verityAPI.onMenuAction((action: string) => {
      const pdf = usePdfStore.getState();
      const ann = useAnnotationStore.getState();
      const ui = useUIStore.getState();

      switch (action) {
        // 语言选择
        case 'help:language':
          setShowLangSelector(true);
          break;

        // 文件操作
        case 'file:save':
          // 由 useAutoSave 处理
          break;

        // 编辑操作
        case 'edit:undo':
          ann.undo();
          break;
        case 'edit:redo':
          ann.redo();
          break;
        case 'edit:delete':
          if (ann.selectedIds.length > 0) {
            ann.selectedIds.forEach((id) => ann.removeAnnotation(id));
            ann.clearSelection();
          }
          break;

        // 视图操作
        case 'view:zoomIn':
          pdf.zoomIn();
          break;
        case 'view:zoomOut':
          pdf.zoomOut();
          break;
        case 'view:fitWidth':
          pdf.setZoomMode('fitWidth');
          break;
        case 'view:prevPage':
          pdf.prevPage();
          break;
        case 'view:nextPage':
          pdf.nextPage();
          break;
        case 'view:rotate':
          pdf.rotatePage();
          break;
        case 'view:toggleSidebar':
          ui.toggleSidebar();
          break;

        // 工具对话框
        case 'tool:overlay':
        case 'tool:extractImages':
        case 'tool:removeAnnotations':
        case 'tool:metadata':
        case 'tool:resize':
        case 'tool:nup':
        case 'tool:verifySignature':
        case 'tool:diff':
        case 'tool:sensitiveRedact':
        case 'tool:booklet':
        case 'tool:colorReplace':
        case 'tool:sanitize':
        case 'tool:pdfaConvert':
        case 'tool:splitByBookmarks':
        case 'tool:invertColors':
        case 'tool:removeImages':
        case 'tool:attachments':
        case 'tool:infoJson':
        case 'tool:scannerEffect':
        case 'tool:csvExport':
        case 'tool:showJs':
        case 'tool:imageEdit':
        case 'tool:hyperlinkEdit':
        case 'tool:bookmarkEdit':
        case 'tool:scriptExecute':
          if (pdf.isLoaded) {
            const fp = pdf.filePath;
            if (fp) {
              window.verityAPI.readFile(fp).then(buf => {
                const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
                setDialogPdfData(b64);
                setActiveToolDialog(action.replace('tool:', ''));
              }).catch(() => {});
            }
          }
          break;

        // 图片转PDF不需要已加载的PDF
        case 'tool:imageToPdf':
          setActiveToolDialog('imageToPdf');
          break;

        // 服务管理对话框（不需要PDF数据）
        case 'tool:collab':
          setActiveToolDialog('collab');
          break;
        case 'tool:restApi':
          setActiveToolDialog('restApi');
          break;
      }
    });
    return unsub;
  }, []);

  // 关闭前检查未保存标注
  useEffect(() => {
    const unsub = window.verityAPI.onBeforeClose(async () => {
      const isDirty = useAnnotationStore.getState().isDirty;
      return !isDirty;
    });
    return unsub;
  }, []);

  return (
    <ErrorBoundary>
      <div className="app-layout">
        <Toolbar />
        <div className="app-main">
          <Sidebar />
          <ErrorBoundary
            fallback={(error, reset) => (
              <div className="error-boundary-fallback" style={{ flex: 1 }}>
                <div className="error-boundary-content">
                  <h2>PDF 查看器出错</h2>
                  <p className="error-boundary-message">{error.message}</p>
                  <button className="btn-primary" onClick={reset}>重新加载</button>
                </div>
              </div>
            )}
          >
            <PDFViewer />
          </ErrorBoundary>
          <PropertyPanel />
          {searchVisible && (
            <Suspense fallback={null}>
              <SearchPanel pdfService={(window as unknown as { __pdfService: unknown }).__pdfService as never} />
            </Suspense>
          )}
          {activeCommentId && (
            <Suspense fallback={null}>
              <CommentPanel annotationId={activeCommentId} onClose={() => setShowComments(false)} />
            </Suspense>
          )}
          <Suspense fallback={null}>
            <OCRPanel />
          </Suspense>
        </div>
        <StatusBar />
        <Toast />

        {/* 工具对话框 */}
        {activeToolDialog && (
          <Suspense fallback={null}>
            {activeToolDialog === 'metadata' && (
              <MetadataEditorDialog
                pdfData={dialogPdfData}
                onApply={() => setActiveToolDialog(null)}
                onClose={() => setActiveToolDialog(null)}
              />
            )}
            {activeToolDialog === 'removeAnnotations' && (
              <RemoveAnnotationsDialog
                pdfData={dialogPdfData}
                onApply={() => setActiveToolDialog(null)}
                onClose={() => setActiveToolDialog(null)}
              />
            )}
            {activeToolDialog === 'resize' && (
              <PageResizeDialog
                pdfData={dialogPdfData}
                onApply={() => setActiveToolDialog(null)}
                onClose={() => setActiveToolDialog(null)}
              />
            )}
            {activeToolDialog === 'overlay' && (
              <PdfOverlayDialog
                pdfData={dialogPdfData}
                onApply={() => setActiveToolDialog(null)}
                onClose={() => setActiveToolDialog(null)}
              />
            )}
            {activeToolDialog === 'nup' && (
              <NUpDialog
                pdfData={dialogPdfData}
                onApply={() => setActiveToolDialog(null)}
                onClose={() => setActiveToolDialog(null)}
              />
            )}
            {activeToolDialog === 'extractImages' && (
              <ImageExtractDialog
                pdfData={dialogPdfData}
                onClose={() => setActiveToolDialog(null)}
              />
            )}
            {activeToolDialog === 'verifySignature' && (
              <SignatureVerifyDialog
                pdfData={dialogPdfData}
                onClose={() => setActiveToolDialog(null)}
              />
            )}
            {activeToolDialog === 'diff' && (
              <PdfDiffDialog
                pdfData={dialogPdfData}
                onClose={() => setActiveToolDialog(null)}
              />
            )}
            {activeToolDialog === 'sensitiveRedact' && (
              <SensitiveRedactDialog
                pdfData={dialogPdfData}
                onClose={() => setActiveToolDialog(null)}
              />
            )}
            {activeToolDialog === 'booklet' && (
              <BookletDialog
                pdfData={dialogPdfData}
                onClose={() => setActiveToolDialog(null)}
              />
            )}
            {activeToolDialog === 'colorReplace' && (
              <ColorReplaceDialog
                pdfData={dialogPdfData}
                onClose={() => setActiveToolDialog(null)}
              />
            )}
            {activeToolDialog === 'sanitize' && (
              <SanitizeDialog
                pdfData={dialogPdfData}
                onClose={() => setActiveToolDialog(null)}
              />
            )}
            {activeToolDialog === 'pdfaConvert' && (
              <PdfAConvertDialog
                pdfData={dialogPdfData}
                onClose={() => setActiveToolDialog(null)}
              />
            )}
            {activeToolDialog === 'splitByBookmarks' && (
              <SplitByBookmarksDialog
                pdfData={dialogPdfData}
                onClose={() => setActiveToolDialog(null)}
              />
            )}
            {activeToolDialog === 'invertColors' && (
              <InvertColorsDialog
                pdfData={dialogPdfData}
                onClose={() => setActiveToolDialog(null)}
              />
            )}
            {activeToolDialog === 'removeImages' && (
              <RemoveImagesDialog
                pdfData={dialogPdfData}
                onClose={() => setActiveToolDialog(null)}
              />
            )}
            {activeToolDialog === 'attachments' && (
              <AttachmentDialog
                pdfData={dialogPdfData}
                onClose={() => setActiveToolDialog(null)}
              />
            )}
            {activeToolDialog === 'infoJson' && (
              <InfoJsonDialog
                pdfData={dialogPdfData}
                onClose={() => setActiveToolDialog(null)}
              />
            )}
            {activeToolDialog === 'scannerEffect' && (
              <ScannerEffectDialog
                pdfData={dialogPdfData}
                onClose={() => setActiveToolDialog(null)}
              />
            )}
            {activeToolDialog === 'imageToPdf' && (
              <ImageToPdfDialog
                pdfData=""
                onClose={() => setActiveToolDialog(null)}
              />
            )}
            {activeToolDialog === 'csvExport' && (
              <CsvExportDialog
                pdfData={dialogPdfData}
                onClose={() => setActiveToolDialog(null)}
              />
            )}
            {activeToolDialog === 'showJs' && (
              <ShowJsDialog
                pdfData={dialogPdfData}
                onClose={() => setActiveToolDialog(null)}
              />
            )}
            {activeToolDialog === 'imageEdit' && (
              <ImageEditorDialog
                pdfData={dialogPdfData}
                onClose={() => setActiveToolDialog(null)}
              />
            )}
            {activeToolDialog === 'hyperlinkEdit' && (
              <HyperlinkEditDialog
                pdfData={dialogPdfData}
                onClose={() => setActiveToolDialog(null)}
              />
            )}
            {activeToolDialog === 'bookmarkEdit' && (
              <BookmarkEditDialog
                pdfData={dialogPdfData}
                onClose={() => setActiveToolDialog(null)}
              />
            )}
            {activeToolDialog === 'scriptExecute' && (
              <ScriptExecuteDialog
                pdfData={dialogPdfData}
                onClose={() => setActiveToolDialog(null)}
              />
            )}
            {activeToolDialog === 'collab' && (
              <CollabDialog
                onClose={() => setActiveToolDialog(null)}
              />
            )}
            {activeToolDialog === 'restApi' && (
              <RestApiDialog
                onClose={() => setActiveToolDialog(null)}
              />
            )}
          </Suspense>
        )}

        {/* 语言选择器 */}
        {showLangSelector && (
          <Suspense fallback={null}>
            <LanguageSelector onClose={() => setShowLangSelector(false)} />
          </Suspense>
        )}
      </div>
    </ErrorBoundary>
  );
};

export default App;
