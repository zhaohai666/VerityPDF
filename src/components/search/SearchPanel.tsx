import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useSearchStore } from '@/stores/searchStore';
import { usePdfStore } from '@/stores/pdfStore';
import { useUIStore } from '@/stores/uiStore';
import { SearchService } from '@/services/search/SearchService';

interface SearchPanelProps {
  pdfService: { isLoaded: boolean; numPages: number; getPageText: (n: number) => Promise<string>; getPageTextItems: (n: number) => Promise<unknown[]>; getPageSize: (n: number) => Promise<{ width: number; height: number }> } | null;
}

export const SearchPanel: React.FC<SearchPanelProps> = ({ pdfService }) => {
  const {
    visible, query, replaceQuery, options, results, currentMatchIndex,
    isSearching, showReplace,
    setVisible, setQuery, setReplaceQuery, setOptions, setResults,
    setCurrentMatchIndex, nextMatch, prevMatch,
    setIsSearching, setSearchProgress, setShowReplace,
  } = useSearchStore();

  const setCurrentPage = usePdfStore((s) => s.setCurrentPage);
  const showToast = useUIStore((s) => s.showToast);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const [searchCompleted, setSearchCompleted] = useState(false);

  // 面板打开时聚焦输入框
  useEffect(() => {
    if (visible && inputRef.current) {
      inputRef.current.focus();
    }
  }, [visible]);

  // 执行搜索
  const doSearch = useCallback(async (q?: string) => {
    const searchQuery = q ?? query;
    if (!searchQuery || !pdfService?.isLoaded) {
      setResults([]);
      setSearchCompleted(false);
      return;
    }

    setIsSearching(true);
    setSearchProgress(0);

    try {
      const searchService = new SearchService();
      const searchResults = await searchService.search(
        pdfService as never,
        searchQuery,
        options,
        (progress) => setSearchProgress(progress)
      );
      setResults(searchResults);
      setSearchCompleted(true);

      // 如果有结果，跳转到第一个匹配
      if (searchResults.length > 0) {
        setCurrentPage(searchResults[0].page);
      }
    } catch (err) {
      console.error('Search failed:', err);
      showToast('搜索失败', 'error');
    } finally {
      setIsSearching(false);
    }
  }, [query, pdfService, options, setResults, setIsSearching, setSearchProgress, setCurrentPage, showToast]);

  // 防抖搜索
  const handleQueryChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newQuery = e.target.value;
    setQuery(newQuery);
    setSearchCompleted(false);

    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (newQuery.length >= 2) {
      searchTimerRef.current = setTimeout(() => doSearch(newQuery), 500);
    } else {
      setResults([]);
    }
  }, [setQuery, doSearch, setResults]);

  // 回车搜索
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (e.shiftKey) {
        prevMatch();
      } else if (results.length > 0 && currentMatchIndex === results.length - 1) {
        // 最后一个结果时重新搜索
        doSearch();
      } else {
        nextMatch();
      }
    }
    if (e.key === 'Escape') {
      setVisible(false);
    }
  }, [results, currentMatchIndex, nextMatch, prevMatch, doSearch, setVisible]);

  // 跳转到匹配
  const goToMatch = useCallback((index: number) => {
    if (index >= 0 && index < results.length) {
      setCurrentMatchIndex(index);
      setCurrentPage(results[index].page);
    }
  }, [results, setCurrentMatchIndex, setCurrentPage]);

  // 替换当前匹配
  const handleReplace = useCallback(async () => {
    if (results.length === 0 || currentMatchIndex < 0) return;
    showToast('替换功能需要通过导出时应用（pdf-lib 文本替换）', 'info');
  }, [results, currentMatchIndex, showToast]);

  // 全部替换
  const handleReplaceAll = useCallback(async () => {
    if (results.length === 0) return;
    showToast(`找到 ${results.length} 处匹配。替换功能需要通过导出时应用。`, 'info');
  }, [results, showToast]);

  // 关闭面板
  const handleClose = useCallback(() => {
    setVisible(false);
    setResults([]);
    setQuery('');
  }, [setVisible, setResults, setQuery]);

  if (!visible) return null;

  return (
    <div className="search-panel" role="search" aria-label="全文搜索">
      {/* 标题栏 */}
      <div className="search-panel-header">
        <span className="search-panel-title">搜索{showReplace ? '与替换' : ''}</span>
        <div className="search-panel-actions">
          <button
            className={`search-action-btn ${showReplace ? 'active' : ''}`}
            onClick={() => setShowReplace(!showReplace)}
            title="切换替换模式"
          >
            Aa→Bb
          </button>
          <button className="search-close-btn" onClick={handleClose} aria-label="关闭搜索">×</button>
        </div>
      </div>

      {/* 搜索输入 */}
      <div className="search-input-row">
        <input
          ref={inputRef}
          type="text"
          className="search-input"
          placeholder="搜索..."
          value={query}
          onChange={handleQueryChange}
          onKeyDown={handleKeyDown}
          aria-label="搜索关键词"
        />
        <button
          className="search-nav-btn"
          onClick={prevMatch}
          disabled={results.length === 0}
          title="上一个 (Shift+Enter)"
          aria-label="上一个匹配"
        >▲</button>
        <button
          className="search-nav-btn"
          onClick={nextMatch}
          disabled={results.length === 0}
          title="下一个 (Enter)"
          aria-label="下一个匹配"
        >▼</button>
      </div>

      {/* 替换输入 */}
      {showReplace && (
        <div className="search-input-row">
          <input
            type="text"
            className="search-input"
            placeholder="替换为..."
            value={replaceQuery}
            onChange={(e) => setReplaceQuery(e.target.value)}
            aria-label="替换关键词"
          />
          <button
            className="search-replace-btn"
            onClick={handleReplace}
            disabled={results.length === 0}
            title="替换当前"
          >替换</button>
          <button
            className="search-replace-btn"
            onClick={handleReplaceAll}
            disabled={results.length === 0}
            title="全部替换"
          >全部</button>
        </div>
      )}

      {/* 选项 */}
      <div className="search-options">
        <label className="search-option">
          <input
            type="checkbox"
            checked={options.caseSensitive}
            onChange={(e) => setOptions({ caseSensitive: e.target.checked })}
          />
          区分大小写
        </label>
        <label className="search-option">
          <input
            type="checkbox"
            checked={options.wholeWord}
            onChange={(e) => setOptions({ wholeWord: e.target.checked })}
          />
          全词匹配
        </label>
      </div>

      {/* 搜索状态 */}
      {isSearching && (
        <div className="search-status">
          <div className="loading-bar">
            <div className="loading-bar-fill" style={{ width: `${Math.round(useSearchStore.getState().searchProgress * 100)}%` }} />
          </div>
          <span className="search-status-text">搜索中...</span>
        </div>
      )}

      {/* 结果计数 */}
      {!isSearching && searchCompleted && (
        <div className="search-result-count">
          {results.length === 0 ? (
            <span className="no-results">未找到匹配</span>
          ) : (
            <span>{currentMatchIndex + 1} / {results.length} 个匹配</span>
          )}
        </div>
      )}

      {/* 结果列表 */}
      {results.length > 0 && (
        <div className="search-results-list">
          {results.map((result, idx) => (
            <div
              key={result.matchIndex}
              className={`search-result-item ${idx === currentMatchIndex ? 'active' : ''}`}
              onClick={() => goToMatch(idx)}
              tabIndex={0}
              role="button"
            >
              <span className="result-page">P{result.page}</span>
              <span className="result-text">{result.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
