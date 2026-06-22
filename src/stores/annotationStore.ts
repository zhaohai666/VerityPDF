import { create } from 'zustand';
import type { Annotation, AnnotationFilterOptions } from '@/types';
import type { Comment } from '@/types/common';

/** 解析页码范围字符串为 Set<number> */
function parsePageRange(range: string): Set<number> {
  const pages = new Set<number>();
  const trimmed = range.trim();
  if (!trimmed || trimmed === '*' || trimmed === 'all') return pages;
  const parts = trimmed.split(',');
  for (const part of parts) {
    const p = part.trim();
    if (!p) continue;
    if (p.includes('-')) {
      const [s, e] = p.split('-').map((v) => parseInt(v.trim(), 10));
      if (!isNaN(s) && !isNaN(e) && s <= e) {
        for (let i = Math.max(1, s); i <= e; i++) pages.add(i);
      }
    } else {
      const n = parseInt(p, 10);
      if (!isNaN(n) && n >= 1) pages.add(n);
    }
  }
  return pages;
}

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
  // 搜索与过滤
  filterOptions: AnnotationFilterOptions;
  setFilterOptions: (options: AnnotationFilterOptions) => void;
  getFilteredAnnotations: () => Annotation[];
  searchAnnotations: (query: string) => Annotation[];

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
  filterOptions: {},

  setFilterOptions: (options) => set({ filterOptions: options }),

  getFilteredAnnotations: () => {
    const { annotations, filterOptions: opts } = get();
    let result = [...annotations];

    // 关键词搜索
    if (opts.query) {
      const q = opts.query.toLowerCase();
      result = result.filter((a) =>
        (a.content && a.content.toLowerCase().includes(q)) ||
        a.type.toLowerCase().includes(q)
      );
    }

    // 按类型过滤
    if (opts.types && opts.types.length > 0) {
      const typeSet = new Set<string>(opts.types);
      result = result.filter((a) => typeSet.has(a.type));
    }

    // 按页码范围过滤
    if (opts.pageRange) {
      const pages = parsePageRange(opts.pageRange);
      if (pages.size > 0) {
        result = result.filter((a) => pages.has(a.page));
      }
    }

    // 按作者过滤
    if (opts.author) {
      const author = opts.author.toLowerCase();
      result = result.filter((a) => a.metadata.author.toLowerCase().includes(author));
    }

    // 按锁定状态过滤
    if (opts.locked !== undefined) {
      result = result.filter((a) => a.metadata.locked === opts.locked);
    }

    // 排序
    const sortBy = opts.sortBy || 'page';
    const sortDir = opts.sortDir === 'desc' ? -1 : 1;
    result.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'page') cmp = a.page - b.page;
      else if (sortBy === 'type') cmp = a.type.localeCompare(b.type);
      else if (sortBy === 'createdAt') cmp = a.metadata.createdAt.localeCompare(b.metadata.createdAt);
      return cmp * sortDir;
    });

    return result;
  },

  searchAnnotations: (query) => {
    const { annotations } = get();
    if (!query) return annotations;
    const q = query.toLowerCase();
    return annotations.filter((a) =>
      (a.content && a.content.toLowerCase().includes(q)) ||
      a.type.toLowerCase().includes(q)
    );
  },

  setAnnotations: (annotations) => {
    set({ annotations, isDirty: false, saveStatus: 'saved', lastSavedTime: Date.now(), undoStack: [], redoStack: [], filterOptions: {} });
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
      filterOptions: {},
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
    set((state) => {
      // 递归收集所有后代 ID（级联删除）
      const idsToRemove = new Set<string>([commentId]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const c of state.comments) {
          if (c.parentId && idsToRemove.has(c.parentId) && !idsToRemove.has(c.id)) {
            idsToRemove.add(c.id);
            changed = true;
          }
        }
      }
      return {
        comments: state.comments.filter((c) => !idsToRemove.has(c.id)),
        isDirty: true,
        saveStatus: 'unsaved',
      };
    });
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