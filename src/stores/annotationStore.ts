import { create } from 'zustand';
import type { Annotation } from '@/types';

interface HistoryEntry {
  before: Annotation[];
  after: Annotation[];
}

interface AnnotationState {
  annotations: Annotation[];
  selectedIds: string[];
  isDirty: boolean;
  saveStatus: 'saved' | 'saving' | 'unsaved' | 'error';
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];

  // Actions
  setAnnotations: (annotations: Annotation[]) => void;
  addAnnotation: (annotation: Annotation) => void;
  updateAnnotation: (id: string, changes: Partial<Annotation>) => void;
  removeAnnotation: (id: string) => void;
  selectAnnotation: (id: string | null, multi?: boolean) => void;
  clearSelection: () => void;
  setDirty: (dirty: boolean) => void;
  setSaveStatus: (status: 'saved' | 'saving' | 'unsaved' | 'error') => void;
  getByPage: (page: number) => Annotation[];
  getSelected: () => Annotation[];
  undo: () => void;
  redo: () => void;
  reset: () => void;
}

export const useAnnotationStore = create<AnnotationState>((set, get) => ({
  annotations: [],
  selectedIds: [],
  isDirty: false,
  saveStatus: 'saved',
  undoStack: [],
  redoStack: [],

  setAnnotations: (annotations) => set({ annotations, isDirty: false, saveStatus: 'saved', undoStack: [], redoStack: [] }),

  addAnnotation: (annotation) => {
    const before = [...get().annotations];
    set((state) => ({
      annotations: [...state.annotations, annotation],
      isDirty: true,
      saveStatus: 'unsaved',
      undoStack: [...state.undoStack.slice(-49), { before, after: [...state.annotations, annotation] }],
      redoStack: [],
    }));
  },

  updateAnnotation: (id, changes) => {
    const before = [...get().annotations];
    set((state) => {
      const after = state.annotations.map((a) => (a.id === id ? ({ ...a, ...changes } as Annotation) : a));
      return {
        annotations: after,
        isDirty: true,
        saveStatus: 'unsaved',
        undoStack: [...state.undoStack.slice(-49), { before, after }],
        redoStack: [],
      };
    });
  },

  removeAnnotation: (id) => {
    const before = [...get().annotations];
    set((state) => {
      const after = state.annotations.filter((a) => a.id !== id);
      return {
        annotations: after,
        selectedIds: state.selectedIds.filter((sid) => sid !== id),
        isDirty: true,
        saveStatus: 'unsaved',
        undoStack: [...state.undoStack.slice(-49), { before, after }],
        redoStack: [],
      };
    });
  },

  selectAnnotation: (id, multi = false) => {
    if (!id) {
      set({ selectedIds: [] });
      return;
    }
    if (multi) {
      set((state) => ({
        selectedIds: state.selectedIds.includes(id)
          ? state.selectedIds.filter((sid) => sid !== id)
          : [...state.selectedIds, id],
      }));
    } else {
      set({ selectedIds: [id] });
    }
  },

  clearSelection: () => set({ selectedIds: [] }),

  setDirty: (dirty) => set({ isDirty: dirty }),
  setSaveStatus: (status) => set({ saveStatus: status }),

  getByPage: (page) => {
    return get().annotations.filter((a) => a.page === page);
  },

  getSelected: () => {
    const { annotations, selectedIds } = get();
    return annotations.filter((a) => selectedIds.includes(a.id));
  },

  reset: () =>
    set({
      annotations: [],
      selectedIds: [],
      isDirty: false,
      saveStatus: 'saved',
      undoStack: [],
      redoStack: [],
    }),

  undo: () => {
    const { undoStack, annotations } = get();
    if (undoStack.length === 0) return;
    const entry = undoStack[undoStack.length - 1];
    set({
      annotations: entry.before,
      undoStack: undoStack.slice(0, -1),
      redoStack: [...get().redoStack, { before: entry.before, after: annotations }],
      isDirty: true,
      saveStatus: 'unsaved',
    });
  },

  redo: () => {
    const { redoStack, annotations } = get();
    if (redoStack.length === 0) return;
    const entry = redoStack[redoStack.length - 1];
    set({
      annotations: entry.after,
      redoStack: redoStack.slice(0, -1),
      undoStack: [...get().undoStack, { before: annotations, after: entry.after }],
      isDirty: true,
      saveStatus: 'unsaved',
    });
  },
}));
