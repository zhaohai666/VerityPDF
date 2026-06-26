import { create } from 'zustand';
import type { ToolType, AnnotationStyle } from '@/types';
import { DEFAULT_ANNOTATION_STYLE } from '@/types';

interface ToolState {
  activeTool: ToolType;
  toolStyle: AnnotationStyle;
  keepToolActive: boolean;

  setActiveTool: (tool: ToolType) => void;
  setToolStyle: (style: Partial<AnnotationStyle>) => void;
  resetStyle: () => void;
  setKeepToolActive: (keep: boolean) => void;
}

export const useToolStore = create<ToolState>((set) => ({
  activeTool: 'select',
  toolStyle: { ...DEFAULT_ANNOTATION_STYLE },
  keepToolActive: false,

  setActiveTool: (tool) => set({ activeTool: tool }),

  setToolStyle: (style) =>
    set((state) => ({
      toolStyle: { ...state.toolStyle, ...style },
    })),

  resetStyle: () => set({ toolStyle: { ...DEFAULT_ANNOTATION_STYLE } }),

  setKeepToolActive: (keep) => set({ keepToolActive: keep }),
}));

if (typeof window !== 'undefined') {
  (window as any).__toolStore = useToolStore;
}
