import { create } from 'zustand';
import type { SearchResultItem, SearchOptions } from '@/services/search/SearchService';

interface SearchState {
  /** 搜索面板是否可见 */
  visible: boolean;
  /** 搜索关键词 */
  query: string;
  /** 替换关键词 */
  replaceQuery: string;
  /** 搜索选项 */
  options: SearchOptions;
  /** 搜索结果 */
  results: SearchResultItem[];
  /** 当前匹配序号 */
  currentMatchIndex: number;
  /** 是否正在搜索 */
  isSearching: boolean;
  /** 搜索进度 0-1 */
  searchProgress: number;
  /** 是否显示替换输入 */
  showReplace: boolean;

  setVisible: (visible: boolean) => void;
  toggleVisible: () => void;
  setQuery: (query: string) => void;
  setReplaceQuery: (query: string) => void;
  setOptions: (options: Partial<SearchOptions>) => void;
  setResults: (results: SearchResultItem[]) => void;
  setCurrentMatchIndex: (index: number) => void;
  nextMatch: () => void;
  prevMatch: () => void;
  setIsSearching: (searching: boolean) => void;
  setSearchProgress: (progress: number) => void;
  setShowReplace: (show: boolean) => void;
  reset: () => void;
}

export const useSearchStore = create<SearchState>((set, get) => ({
  visible: false,
  query: '',
  replaceQuery: '',
  options: { caseSensitive: false, wholeWord: false },
  results: [],
  currentMatchIndex: 0,
  isSearching: false,
  searchProgress: 0,
  showReplace: false,

  setVisible: (visible) => set({ visible }),
  toggleVisible: () => set((s) => ({ visible: !s.visible })),
  setQuery: (query) => set({ query }),
  setReplaceQuery: (replaceQuery) => set({ replaceQuery }),
  setOptions: (options) => set((s) => ({ options: { ...s.options, ...options } })),
  setResults: (results) => set({ results, currentMatchIndex: results.length > 0 ? 0 : -1 }),
  setCurrentMatchIndex: (index) => set({ currentMatchIndex: index }),
  nextMatch: () => {
    const { results, currentMatchIndex } = get();
    if (results.length > 0) {
      set({ currentMatchIndex: (currentMatchIndex + 1) % results.length });
    }
  },
  prevMatch: () => {
    const { results, currentMatchIndex } = get();
    if (results.length > 0) {
      set({ currentMatchIndex: (currentMatchIndex - 1 + results.length) % results.length });
    }
  },
  setIsSearching: (isSearching) => set({ isSearching }),
  setSearchProgress: (searchProgress) => set({ searchProgress }),
  setShowReplace: (showReplace) => set({ showReplace }),
  reset: () => set({
    visible: false,
    query: '',
    replaceQuery: '',
    results: [],
    currentMatchIndex: 0,
    isSearching: false,
    searchProgress: 0,
  }),
}));
