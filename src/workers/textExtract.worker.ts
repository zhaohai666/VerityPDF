/**
 * Web Worker：文本提取与搜索
 * 将文本提取和全文搜索从主线程移到 Worker，避免阻塞 UI
 */

interface ExtractRequest {
  type: 'extract';
  pageNumber: number;
  /** 序列化的 textContent.items */
  items: Array<{ str: string; transform?: number[]; width?: number; height?: number }>;
  pageHeight: number;
}

interface SearchRequest {
  type: 'search';
  /** 所有页面文本：Map<pageNumber, text> */
  pages: Array<{ page: number; text: string }>;
  /** 所有页面文本位置信息 */
  pageItems: Array<{
    page: number;
    items: Array<{ str: string; x: number; y: number; width: number; height: number }>;
    pageSize: { width: number; height: number };
  }>;
  query: string;
  options: { caseSensitive: boolean; wholeWord: boolean };
}

interface SearchResultItem {
  page: number;
  matchIndex: number;
  text: string;
  startOffset: number;
  endOffset: number;
  rects: Array<{ x: number; y: number; width: number; height: number }>;
}

interface ExtractResponse {
  type: 'extractResult';
  pageNumber: number;
  text: string;
}

interface SearchResponse {
  type: 'searchResult';
  results: SearchResultItem[];
}

interface ProgressResponse {
  type: 'progress';
  progress: number;
}

type ResponseMessage = ExtractResponse | SearchResponse | ProgressResponse;

self.onmessage = (event: MessageEvent<ExtractRequest | SearchRequest>) => {
  const data = event.data;

  if (data.type === 'extract') {
    handleExtract(data);
  } else if (data.type === 'search') {
    handleSearch(data);
  }
};

function handleExtract(request: ExtractRequest): void {
  const text = request.items
    .map((item) => ('str' in item ? item.str : ''))
    .join(' ');

  const response: ExtractResponse = {
    type: 'extractResult',
    pageNumber: request.pageNumber,
    text,
  };
  (self as unknown as Worker).postMessage(response);
}

function handleSearch(request: SearchRequest): void {
  const { pages, pageItems, query, options } = request;
  const results: SearchResultItem[] = [];
  const searchStr = options.caseSensitive ? query : query.toLowerCase();
  let globalMatchIndex = 0;
  const total = pages.length;

  for (let i = 0; i < total; i++) {
    const { page, text } = pages[i];
    const pageText = options.caseSensitive ? text : text.toLowerCase();
    let searchStart = 0;

    while (searchStart < pageText.length) {
      let idx: number;
      if (options.wholeWord) {
        idx = -1;
        let pos = searchStart;
        while (pos < pageText.length) {
          const found = pageText.indexOf(searchStr, pos);
          if (found === -1) break;
          const before = found > 0 ? pageText[found - 1] : ' ';
          const after = found + searchStr.length < pageText.length ? pageText[found + searchStr.length] : ' ';
          if (/\W/.test(before) && /\W/.test(after)) {
            idx = found;
            break;
          }
          pos = found + 1;
        }
      } else {
        idx = pageText.indexOf(searchStr, searchStart);
      }

      if (idx === -1) break;

      const contextStart = Math.max(0, idx - 30);
      const contextEnd = Math.min(text.length, idx + query.length + 30);
      const contextText = text.slice(contextStart, contextEnd);

      // 获取匹配文字在页面上的位置
      const itemInfo = pageItems.find((p) => p.page === page);
      const rects = itemInfo
        ? findTextRects(text, itemInfo.items, idx, query.length, itemInfo.pageSize)
        : [];

      results.push({
        page,
        matchIndex: globalMatchIndex++,
        text: contextText,
        startOffset: idx,
        endOffset: idx + query.length,
        rects,
      });

      searchStart = idx + Math.max(1, query.length);
    }

    // 每处理 10 页报告一次进度
    if (i % 10 === 0 || i === total - 1) {
      const progressMsg: ProgressResponse = { type: 'progress', progress: (i + 1) / total };
      (self as unknown as Worker).postMessage(progressMsg);
    }
  }

  const response: SearchResponse = { type: 'searchResult', results };
  (self as unknown as Worker).postMessage(response);
}

function findTextRects(
  _fullText: string,
  textItems: Array<{ str: string; x: number; y: number; width: number; height: number }>,
  startOffset: number,
  matchLength: number,
  pageSize: { width: number; height: number }
): Array<{ x: number; y: number; width: number; height: number }> {
  if (textItems.length === 0) return [];

  let charIndex = 0;
  const rects: Array<{ x: number; y: number; width: number; height: number }> = [];
  const endOffset = startOffset + matchLength;

  for (const item of textItems) {
    const itemStart = charIndex;
    const itemEnd = charIndex + item.str.length;

    if (itemEnd > startOffset && itemStart < endOffset) {
      const overlapStart = Math.max(itemStart, startOffset) - itemStart;
      const overlapEnd = Math.min(itemEnd, endOffset) - itemStart;
      const charWidth = item.str.length > 0 ? item.width / item.str.length : item.width;

      rects.push({
        x: (item.x + overlapStart * charWidth) / pageSize.width,
        y: item.y / pageSize.height,
        width: ((overlapEnd - overlapStart) * charWidth) / pageSize.width,
        height: item.height / pageSize.height,
      });
    }

    charIndex = itemEnd + 1; // +1 for space
  }

  return rects;
}
