import React, { useEffect } from 'react';
import { Toolbar } from '@/components/toolbar/Toolbar';
import { Sidebar } from '@/components/sidebar/Sidebar';
import { PDFViewer } from '@/components/viewer/PDFViewer';
import { PropertyPanel } from '@/components/property/PropertyPanel';
import { StatusBar } from '@/components/common/StatusBar';
import { Toast } from '@/components/common/Toast';
import { useKeyboardShortcuts, useAutoSave } from '@/hooks';
import { usePdfStore } from '@/stores/pdfStore';
import { useAnnotationStore } from '@/stores/annotationStore';
import { useUIStore } from '@/stores/uiStore';
import './i18n';

const App: React.FC = () => {
  // 初始化全局快捷键
  useKeyboardShortcuts();
  // 初始化自动保存
  useAutoSave(30000);

  // 全局菜单事件处理：将 Electron 菜单的 menu:action 分发到各 store
  useEffect(() => {
    const unsub = window.verityAPI.onMenuAction((action: string) => {
      const pdf = usePdfStore.getState();
      const ann = useAnnotationStore.getState();
      const ui = useUIStore.getState();

      switch (action) {
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
      }
    });
    return unsub;
  }, []);

  return (
    <div className="app-layout">
      <Toolbar />
      <div className="app-main">
        <Sidebar />
        <PDFViewer />
        <PropertyPanel />
      </div>
      <StatusBar />
      <Toast />
    </div>
  );
};

export default App;
