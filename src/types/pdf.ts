import type { Rotation, ZoomMode, ScrollMode } from './common';

/** PDF 文档信息 */
export interface PDFDocumentInfo {
  title?: string;
  author?: string;
  subject?: string;
  creator?: string;
  producer?: string;
  creationDate?: string;
  modificationDate?: string;
  pageCount: number;
  fileSize: number;
  filePath: string;
}

/** PDF 页面信息 */
export interface PDFPageInfo {
  pageNumber: number;
  width: number;
  height: number;
  rotation: Rotation;
  scale: number;
}

/** PDF 大纲/书签项 */
export interface PDFOutlineItem {
  title: string;
  pageNumber: number;
  children: PDFOutlineItem[];
  expanded?: boolean;
}

/** PDF 搜索结果 */
export interface PDFSearchResult {
  page: number;
  text: string;
  matchIndex: number;
  highlightRects: Array<{ x: number; y: number; width: number; height: number }>;
}

/** 视口状态 */
export interface ViewState {
  currentPage: number;
  zoom: number;
  zoomMode: ZoomMode;
  rotation: Rotation;
  scrollMode: ScrollMode;
}

/** 页面渲染状态 */
export type PageRenderStatus = 'idle' | 'loading' | 'rendering' | 'done' | 'error';

/** 页面缓存条目 */
export interface PageCacheEntry {
  pageNumber: number;
  canvas: HTMLCanvasElement;
  scale: number;
  rotation: Rotation;
  timestamp: number;
  size: number; // estimated memory in bytes
}
