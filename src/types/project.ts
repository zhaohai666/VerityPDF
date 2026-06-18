/** .verity 项目文件格式 */
import type { Annotation } from './annotation';
import type { Comment } from './common';
import type { ViewState, PDFDocumentInfo } from './pdf';

export interface VerityProjectFile {
  version: string;
  format: 'verity-project';
  pdfPath: string;
  pdfHash: string;
  pdfInfo: {
    pageCount: number;
    title: string;
    fileSize: number;
  };
  createdAt: string;
  updatedAt: string;
  viewState: ViewState;
  annotations: Annotation[];
  comments?: Comment[];
}

/** 创建空的 .verity 项目结构 */
export function createEmptyProject(pdfInfo: PDFDocumentInfo, pdfHash: string): VerityProjectFile {
  return {
    version: '1.0',
    format: 'verity-project',
    pdfPath: pdfInfo.filePath,
    pdfHash,
    pdfInfo: {
      pageCount: pdfInfo.pageCount,
      title: pdfInfo.title || '',
      fileSize: pdfInfo.fileSize,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    viewState: {
      currentPage: 1,
      zoom: 1.0,
      zoomMode: 'fitWidth',
      rotation: 0,
      scrollMode: 'continuous',
    },
    annotations: [],
  };
}
