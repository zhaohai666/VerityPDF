import type { Annotation } from '@/types';
import { Logger } from '@/utils';

const logger = new Logger('ExportService');

/** 导出过滤选项 */
export interface ExportOptions {
  /** 包含的标注类型，为空表示全部 */
  includeTypes?: string[];
  /** 页码范围，如 "1-5,8,10-12"，空表示全部 */
  pageRange?: string;
  /** 总页数，用于解析页码范围 */
  totalPages?: number;
}

/**
 * 标注导出服务（使用 pdf-lib 合并标注到 PDF）
 */
export class ExportService {
  /**
   * 导出带标注的 PDF
   */
  async prepareExportData(
    annotations: Annotation[],
    pageSizes: Array<{ width: number; height: number }>
  ): Promise<ExportData> {
    const exportAnnotations = annotations.map((ann) => ({
      ...ann,
      pageIndex: ann.page - 1,
      pageSize: pageSizes[ann.page - 1] || { width: 612, height: 792 },
    }));

    logger.info(`Prepared ${exportAnnotations.length} annotations for export`);

    return {
      annotations: exportAnnotations,
      pageCount: pageSizes.length,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * 根据选项过滤标注
   * 支持按类型和页码范围过滤
   */
  filterAnnotations(annotations: Annotation[], options: ExportOptions): Annotation[] {
    let filtered = annotations;

    // 按类型过滤
    if (options.includeTypes && options.includeTypes.length > 0) {
      const typeSet = new Set(options.includeTypes);
      filtered = filtered.filter((a) => typeSet.has(a.type));
    }

    // 按页码范围过滤
    if (options.pageRange) {
      const pages = parsePageRange(options.pageRange, options.totalPages);
      if (pages.size > 0) {
        filtered = filtered.filter((a) => pages.has(a.page));
      }
    }

    logger.info(`Filtered ${annotations.length} → ${filtered.length} annotations`);
    return filtered;
  }
}

/**
 * 解析页码范围字符串为 Set<number>
 * 支持格式: "1-5", "1,3,5", "1-3,7,9-11", "all"
 */
export function parsePageRange(range: string, totalPages?: number): Set<number> {
  const pages = new Set<number>();
  const trimmed = range.trim().toLowerCase();

  if (!trimmed || trimmed === 'all' || trimmed === '*') {
    // 返回空集合表示“全部”
    return pages;
  }

  const parts = trimmed.split(',');
  for (const part of parts) {
    const trimmedPart = part.trim();
    if (trimmedPart.includes('-')) {
      const [startStr, endStr] = trimmedPart.split('-').map((s) => s.trim());
      const start = parseInt(startStr, 10);
      const end = endStr ? parseInt(endStr, 10) : (totalPages ?? start);
      if (!isNaN(start) && !isNaN(end)) {
        for (let i = Math.max(1, start); i <= Math.min(end, totalPages ?? end); i++) {
          pages.add(i);
        }
      }
    } else {
      const page = parseInt(trimmedPart, 10);
      if (!isNaN(page) && page >= 1) {
        pages.add(page);
      }
    }
  }

  return pages;
}

export interface ExportData {
  annotations: Array<Annotation & {
    pageIndex: number;
    pageSize: { width: number; height: number };
  }>;
  pageCount: number;
  timestamp: string;
}
