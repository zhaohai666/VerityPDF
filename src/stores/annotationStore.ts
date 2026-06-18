import { create } from 'zustand';
import type { Annotation } from '@/types';
import type { Comment } from '@/types/common';

type Operation =
  | { type: 'add'; annotation: Annotation }
  | { type: 'remove'; annotation: Annotation }
  | { type: 'update'; annotationId: string; before: Annotation; after: Annotation };

interface AnnotationState {
  annotations: Annotation[];
  selectedIds: string[];
  isDirty: boolean;
  saveStatus: 'saved' | 'saving' | 'unsaved' | 'error';
  lastSavedTime: number | null;
  undoStack: Operation[];
  redoStack: Operation[];
  comments: Comment[];

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
  addComment: (annotationId: string, author: string, text: string, parentId?: string) => void;
  removeComment: (commentId: string) => void;
  getCommentsByAnnotation: (annotationId: string) => Comment[];
  setComments: (comments: Comment[]) => void;
}

export const useAnnotationStore = create<AnnotationState>((set, get) => ({
  annotations: [],
  selectedIds: [],
  isDirty: false,
  saveStatus: 'saved',
  lastSavedTime: null,
  undoStack: [],
  redoStack: [],
  comments: [],

  setAnnotations: (annotations) => {
    set({ annotations, isDirty: false, saveStatus: 'saved', lastSavedTime: Date.now(), undoStack: [], redoStack: [] });
  },

  addAnnotation: (annotation) => {
    set((state) => ({
      annotations: [...state.annotations, annotation],
      isDirty: true,
      saveStatus: 'unsaved',
      undoStack: [...state.undoStack.slice(-49), { type: 'add', annotation }],
      redoStack: [],
    }));
  },

  updateAnnotation: (id, changes) => {
    set((state) => {
      const before = state.annotations.find((a) => a.id === id);
      if (!before) return state;
      const after = { ...before, ...changes } as Annotation;
      return {
        annotations: state.annotations.map((a) => (a.id === id ? after : a)),
        isDirty: true,
        saveStatus: 'unsaved',
        undoStack: [...state.undoStack.slice(-49), { type: 'update', annotationId: id, before, after }],
        redoStack: [],
      };
    });
  },

  removeAnnotation: (id) => {
    set((state) => {
      const annotation = state.annotations.find((a) => a.id === id);
      if (!annotation) return state;
      return {
        annotations: state.annotations.filter((a) => a.id !== id),
        selectedIds: state.selectedIds.filter((sid) => sid !== id),
        isDirty: true,
        saveStatus: 'unsaved',
        undoStack: [...state.undoStack.slice(-49), { type: 'remove', annotation }],
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
  setSaveStatus: (status) => {
    set((state) => ({
      saveStatus: status,
      lastSavedTime: status === 'saved' ? Date.now() : state.lastSavedTime,
    }));
  },

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
      lastSavedTime: null,
      undoStack: [],
      redoStack: [],
      comments: [],
    }),

  undo: () => {
    // 使用 set 的函数式更新，避免快速连续调用时读取过期状态
    set((state) => {
      const { undoStack, annotations } = state;
      if (undoStack.length === 0) return state;
      const op = undoStack[undoStack.length - 1];

      let newAnnotations = [...annotations];
      let redoOp: Operation;

      switch (op.type) {
        case 'add':
          newAnnotations = newAnnotations.filter((a) => a.id !== op.annotation.id);
          redoOp = { type: 'add', annotation: op.annotation };
          break;
        case 'remove':
          newAnnotations = [...newAnnotations, op.annotation];
          redoOp = { type: 'remove', annotation: op.annotation };
          break;
        case 'update':
          newAnnotations = newAnnotations.map((a) => (a.id === op.annotationId ? op.before : a));
          redoOp = { type: 'update', annotationId: op.annotationId, before: op.before, after: op.after };
          break;
        default:
          return state;
      }

      return {
        annotations: newAnnotations,
        undoStack: undoStack.slice(0, -1),
        redoStack: [...state.redoStack, redoOp],
        isDirty: true,
        saveStatus: 'unsaved' as const,
      };
    });
  },

  redo: () => {
    // 使用 set 的函数式更新，避免快速连续调用时读取过期状态
    set((state) => {
      const { redoStack, annotations } = state;
      if (redoStack.length === 0) return state;
      const op = redoStack[redoStack.length - 1];

      let newAnnotations = [...annotations];
      let undoOp: Operation;

      switch (op.type) {
        case 'add':
          newAnnotations = [...newAnnotations, op.annotation];
          undoOp = { type: 'add', annotation: op.annotation };
          break;
        case 'remove':
          newAnnotations = newAnnotations.filter((a) => a.id !== op.annotation.id);
          undoOp = { type: 'remove', annotation: op.annotation };
          break;
        case 'update':
          newAnnotations = newAnnotations.map((a) => (a.id === op.annotationId ? op.after : a));
          undoOp = { type: 'update', annotationId: op.annotationId, before: op.before, after: op.after };
          break;
        default:
          return state;
      }

      return {
        annotations: newAnnotations,
        redoStack: redoStack.slice(0, -1),
        undoStack: [...state.undoStack, undoOp],
        isDirty: true,
        saveStatus: 'unsaved' as const,
      };
    });
  },

  addComment: (annotationId, author, text, parentId) => {
    const comment: Comment = {
      id: `cmt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      annotationId,
      author,
      text,
      createdAt: new Date().toISOString(),
      parentId,
    };
    set((state) => ({
      comments: [...state.comments, comment],
      isDirty: true,
      saveStatus: 'unsaved',
    }));
  },

  removeComment: (commentId) => {
    set((state) => ({
      comments: state.comments.filter((c) => c.id !== commentId && c.parentId !== commentId),
      isDirty: true,
      saveStatus: 'unsaved',
    }));
  },

  getCommentsByAnnotation: (annotationId) => {
    return get().comments.filter((c) => c.annotationId === annotationId);
  },

  setComments: (comments) => {
    set({ comments });
  },
}));

if (typeof window !== 'undefined') {
  window.__annotationStore = useAnnotationStore;
}