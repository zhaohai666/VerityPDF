import { create } from 'zustand';
import type { PDFDocumentInfo, PDFOutlineItem, Rotation, ZoomMode, ScrollMode } from '@/types';

interface PDFState {
  // 文档状态
  filePath: string | null;
  documentInfo: PDFDocumentInfo | null;
  isLoaded: boolean;
  isLoading: boolean;
  loadingProgress: number;
  passwordRequired: boolean;

  // 视口状态
  currentPage: number;
  zoom: number;
  effectiveZoom: number;
  zoomMode: ZoomMode;
  rotation: Rotation;
  scrollMode: ScrollMode;

  // 大纲
  outline: PDFOutlineItem[];

  // Actions
  setFilePath: (path: string | null) => void;
  setDocumentInfo: (info: PDFDocumentInfo) => void;
  setLoaded: (loaded: boolean) => void;
  setLoading: (loading: boolean) => void;
  setLoadingProgress: (progress: number) => void;
  setPasswordRequired: (required: boolean) => void;
  setCurrentPage: (page: number) => void;
  setZoom: (zoom: number) => void;
  setEffectiveZoom: (zoom: number) => void;
  setZoomMode: (mode: ZoomMode) => void;
  setRotation: (rotation: Rotation) => void;
  setScrollMode: (mode: ScrollMode) => void;
  setOutline: (outline: PDFOutlineItem[]) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  nextPage: () => void;
  prevPage: () => void;
  rotatePage: () => void;
  reset: () => void;
}

export const usePdfStore = create<PDFState>((set, get) => ({
  filePath: null,
  documentInfo: null,
  isLoaded: false,
  isLoading: false,
  loadingProgress: 0,
  passwordRequired: false,
  currentPage: 1,
  zoom: 1.0,
  effectiveZoom: 1.0,
  zoomMode: 'fitWidth',
  rotation: 0,
  scrollMode: 'continuous',
  outline: [],

  setFilePath: (path) => set({ filePath: path }),
  setDocumentInfo: (info) => set({ documentInfo: info }),
  setLoaded: (loaded) => set({ isLoaded: loaded }),
  setLoading: (loading) => set({ isLoading: loading }),
  setLoadingProgress: (progress) => set({ loadingProgress: progress }),
  setPasswordRequired: (required) => set({ passwordRequired: required }),
  setCurrentPage: (page) => {
    const { documentInfo } = get();
    const pageCount = documentInfo?.pageCount ?? 1;
    set({ currentPage: Math.max(1, Math.min(page, pageCount)) });
  },
  setZoom: (zoom) => {
    const clamped = Math.max(0.25, Math.min(zoom, 4.0));
    set({ zoom: clamped, effectiveZoom: clamped, zoomMode: 'custom' });
  },
  setEffectiveZoom: (effectiveZoom) => {
    const clamped = Math.max(0.25, Math.min(effectiveZoom, 4.0));
    set({ effectiveZoom: clamped });
  },
  setZoomMode: (mode) => set({ zoomMode: mode }),
  setRotation: (rotation) => {
    const normalized = ((rotation % 360) + 360) % 360;
    set({ rotation: normalized as Rotation });
  },
  setScrollMode: (mode) => set({ scrollMode: mode }),
  setOutline: (outline) => set({ outline }),

  zoomIn: () => {
    const { zoom } = get();
    set({ zoom: Math.min(zoom + 0.25, 4.0), effectiveZoom: Math.min(zoom + 0.25, 4.0), zoomMode: 'custom' });
  },

  zoomOut: () => {
    const { zoom } = get();
    set({ zoom: Math.max(zoom - 0.25, 0.25), effectiveZoom: Math.max(zoom - 0.25, 0.25), zoomMode: 'custom' });
  },

  nextPage: () => {
    const { currentPage, documentInfo } = get();
    if (documentInfo && currentPage < documentInfo.pageCount) {
      set({ currentPage: currentPage + 1 });
    }
  },

  prevPage: () => {
    const { currentPage } = get();
    if (currentPage > 1) {
      set({ currentPage: currentPage - 1 });
    }
  },

  rotatePage: () => {
    const { rotation } = get();
    set({ rotation: ((rotation + 90) % 360) as Rotation });
  },

  reset: () =>
    set({
      filePath: null,
      documentInfo: null,
      isLoaded: false,
      isLoading: false,
      loadingProgress: 0,
      passwordRequired: false,
      currentPage: 1,
      zoom: 1.0,
      zoomMode: 'fitWidth',
      rotation: 0,
      scrollMode: 'continuous',
      outline: [],
    }),
}));
