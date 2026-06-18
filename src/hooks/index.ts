import { useEffect, useCallback } from 'react';
import { useToolStore } from '@/stores/toolStore';
import { usePdfStore } from '@/stores/pdfStore';
import { useAnnotationStore } from '@/stores/annotationStore';
import { useUIStore } from '@/stores/uiStore';
import type { ToolType } from '@/types';
import { TOOL_LIST } from '@/types';

/**
 * 全局快捷键 Hook
 */
export function useKeyboardShortcuts(): void {
  const setActiveTool = useToolStore((s) => s.setActiveTool);
  const { zoomIn, zoomOut, nextPage, prevPage, rotatePage } = usePdfStore();
  const { toggleSidebar } = useUIStore();

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // 忽略输入框内的快捷键
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      const ctrl = e.ctrlKey || e.metaKey;
      const shift = e.shiftKey;

      // 撤销/重做
      if (ctrl && e.key === 'z') {
        e.preventDefault();
        if (shift) {
          useAnnotationStore.getState().redo();
        } else {
          useAnnotationStore.getState().undo();
        }
        return;
      }
      if (ctrl && e.key === 'y') {
        e.preventDefault();
        useAnnotationStore.getState().redo();
        return;
      }

      // 导出
      if (ctrl && e.key === 'e') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('verity:export'));
        return;
      }

      // 全选标注
      if (ctrl && e.key === 'a') {
        e.preventDefault();
        const ann = useAnnotationStore.getState();
        const allIds = ann.annotations.map((a) => a.id);
        if (allIds.length > 0) {
          ann.selectAnnotation(allIds[0], false);
          for (let i = 1; i < allIds.length; i++) {
            ann.selectAnnotation(allIds[i], true);
          }
        }
        return;
      }

      // Escape 取消绘制、清除选中
      if (e.key === 'Escape') {
        useToolStore.getState().setActiveTool('select');
        useAnnotationStore.getState().clearSelection();
        return;
      }

      // 工具切换快捷键
      if (!ctrl && !shift) {
        const tool = TOOL_LIST.find((t) => t.shortcut === e.key.toUpperCase());
        if (tool) {
          e.preventDefault();
          setActiveTool(tool.type as ToolType);
          return;
        }
      }

      // 视图快捷键
      if (ctrl) {
        switch (e.key) {
          case '=':
          case '+':
            e.preventDefault();
            zoomIn();
            return;
          case '-':
            e.preventDefault();
            zoomOut();
            return;
          case 'b':
            e.preventDefault();
            toggleSidebar();
            return;
        }
      }

      // 翻页
      if (e.key === 'PageDown' || e.key === 'ArrowRight') {
        nextPage();
      } else if (e.key === 'PageUp' || e.key === 'ArrowLeft') {
        prevPage();
      }

      // 旋转
      if (ctrl && e.key === 'r') {
        e.preventDefault();
        rotatePage();
      }
    },
    [setActiveTool, zoomIn, zoomOut, nextPage, prevPage, rotatePage, toggleSidebar]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}

/**
 * 自动保存 Hook
 * @param interval 防抖间隔（毫秒），默认 5000ms，标注停止后 5 秒自动保存
 */
export function useAutoSave(interval = 5000): void {
  const isDirty = useAnnotationStore((s) => s.isDirty);
  const setSaveStatus = useAnnotationStore((s) => s.setSaveStatus);
  const annotations = useAnnotationStore((s) => s.annotations);
  const comments = useAnnotationStore((s) => s.comments);
  const filePath = usePdfStore((s) => s.filePath);

  const save = useCallback(async () => {
    if (!filePath || !isDirty) return;
    setSaveStatus('saving');
    try {
      const project = {
        version: '1.0',
        format: 'verity-project' as const,
        pdfPath: filePath,
        pdfHash: '',
        pdfInfo: { pageCount: 0, title: '', fileSize: 0 },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        viewState: { currentPage: 1, zoom: 1, zoomMode: 'fitWidth' as const, rotation: 0 as const, scrollMode: 'continuous' as const },
        annotations,
        comments,
      };
      await window.verityAPI.saveFile(JSON.stringify(project, null, 2), filePath.replace(/\.pdf$/i, '.verity'));
      setSaveStatus('saved');
      useAnnotationStore.setState({ isDirty: false });
    } catch {
      setSaveStatus('error');
    }
  }, [filePath, isDirty, annotations, comments, setSaveStatus]);

  // 防抖自动保存：标注停止变化后 interval ms 触发，每次变化重置计时器
  useEffect(() => {
    if (!isDirty) return;
    const timer = setTimeout(save, interval);
    return () => clearTimeout(timer);
  }, [isDirty, interval, save]);

  // 页面卸载 / 关闭时强制保存，防止数据丢失
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (useAnnotationStore.getState().isDirty && usePdfStore.getState().filePath) {
        // 同步保存（beforeunload 中异步不可靠）
        const state = useAnnotationStore.getState();
        const fp = usePdfStore.getState().filePath!;
        const project = {
          version: '1.0', format: 'verity-project' as const,
          pdfPath: fp, pdfHash: '', pdfInfo: { pageCount: 0, title: '', fileSize: 0 },
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
          viewState: { currentPage: 1, zoom: 1, zoomMode: 'fitWidth' as const, rotation: 0 as const, scrollMode: 'continuous' as const },
          annotations: state.annotations,
          comments: state.comments,
        };
        window.verityAPI.saveFile(JSON.stringify(project, null, 2), fp.replace(/\.pdf$/i, '.verity'));
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // Ctrl+S 手动保存
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [save]);
}
