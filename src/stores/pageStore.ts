import { create } from 'zustand';

interface PageState {
  /** 页面是否被修改过（需要重新保存） */
  isPageModified: boolean;
  /** 修改后的 PDF 数据（base64），用于替换当前文档 */
  modifiedPdfBase64: string | null;

  setModified: (base64: string) => void;
  resetModified: () => void;
}

export const usePageStore = create<PageState>((set) => ({
  isPageModified: false,
  modifiedPdfBase64: null,

  setModified: (base64) => set({ isPageModified: true, modifiedPdfBase64: base64 }),

  resetModified: () => set({ isPageModified: false, modifiedPdfBase64: null }),
}));
