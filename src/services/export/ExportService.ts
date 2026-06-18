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
 * 容错处理：忽略无效段，跳过超出范围的页码
 */
export function parsePageRange(range: string, totalPages?: number): Set<number> {
  const pages = new Set<number>();
  const trimmed = range.trim().toLowerCase();

  if (!trimmed || trimmed === 'all' || trimmed === '*') {
    // 返回空集合表示“全部”
    return pages;
  }

  const maxPage = totalPages ?? Infinity;
  const parts = trimmed.split(',');
  for (const part of parts) {
    const trimmedPart = part.trim();
    if (!trimmedPart) continue; // 跳过空段（如连续逗号）

    if (trimmedPart.includes('-')) {
      const segments = trimmedPart.split('-').map((s) => s.trim());
      if (segments.length !== 2 || !segments[0] || !segments[1]) continue; // 跳过畸形范围如 "3-" 或 "-5"
      const start = parseInt(segments[0], 10);
      const end = parseInt(segments[1], 10);
      if (isNaN(start) || isNaN(end)) continue;
      if (start > end) continue; // 跳过起始大于结束的范围
      for (let i = Math.max(1, start); i <= Math.min(end, maxPage); i++) {
        pages.add(i);
      }
    } else {
      const page = parseInt(trimmedPart, 10);
      if (!isNaN(page) && page >= 1 && page <= maxPage) {
        pages.add(page);
      }
    }
  }

  return pages;
}

/** 页码范围验证结果 */
export interface PageRangeValidation {
  valid: boolean;
  errors: string[];
}

/**
 * 验证页码范围输入的合法性
 */
export function validatePageRange(input: string, totalPages: number): PageRangeValidation {
  const errors: string[] = [];
  const trimmed = input.trim();

  if (!trimmed || trimmed === 'all' || trimmed === '*') {
    return { valid: true, errors: [] };
  }

  // 检查非法字符（只允许数字、逗号、短横线、空格）
  if (/[^\d,\-\s]/.test(trimmed)) {
    errors.push('包含非法字符，只允许数字、逗号和短横线');
    return { valid: false, errors };
  }

  const parts = trimmed.split(',');
  for (const part of parts) {
    const trimmedPart = part.trim();
    if (!trimmedPart) {
      errors.push('包含空段（连续逗号）');
      continue;
    }

    if (trimmedPart.includes('-')) {
      const segments = trimmedPart.split('-').map((s) => s.trim());
      if (segments.length !== 2 || !segments[0] || !segments[1]) {
        errors.push(`无效的范围格式: "${trimmedPart}"`);
        continue;
      }
      const start = parseInt(segments[0], 10);
      const end = parseInt(segments[1], 10);
      if (isNaN(start) || isNaN(end)) {
        errors.push(`无法解析数字: "${trimmedPart}"`);
        continue;
      }
      if (start > end) {
        errors.push(`起始页码 ${start} 大于结束页码 ${end}`);
      }
      if (start < 1) {
        errors.push(`页码不能小于 1`);
      }
      if (end > totalPages) {
        errors.push(`页码 ${end} 超出总页数 ${totalPages}`);
      }
    } else {
      const page = parseInt(trimmedPart, 10);
      if (isNaN(page)) {
        errors.push(`无法解析数字: "${trimmedPart}"`);
      } else if (page < 1) {
        errors.push(`页码不能小于 1`);
      } else if (page > totalPages) {
        errors.push(`页码 ${page} 超出总页数 ${totalPages}`);
      }
    }
  }

  // 去重错误信息
  const uniqueErrors = [...new Set(errors)];
  return { valid: uniqueErrors.length === 0, errors: uniqueErrors };
}

export interface ExportData {
  annotations: Array<Annotation & {
    pageIndex: number;
    pageSize: { width: number; height: number };
  }>;
  pageCount: number;
  timestamp: string;
}
