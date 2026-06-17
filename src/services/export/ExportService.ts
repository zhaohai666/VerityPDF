import type { Annotation } from '@/types';
import { Logger } from '@/utils';

const logger = new Logger('ExportService');

/**
 * 标注导出服务（使用 pdf-lib 合并标注到 PDF）
 * 完整导出逻辑需要 pdf-lib，这里提供框架
 */
export class ExportService {
  /**
   * 导出带标注的 PDF
   * 注意：实际导出需要在 Main Process 中使用 pdf-lib
   * 这里仅提供渲染端的数据准备
   */
  async prepareExportData(
    annotations: Annotation[],
    pageSizes: Array<{ width: number; height: number }>
  ): Promise<ExportData> {
    const exportAnnotations = annotations.map((ann) => ({
      ...ann,
      pageIndex: ann.page - 1, // 转为 0-indexed
      pageSize: pageSizes[ann.page - 1] || { width: 612, height: 792 },
    }));

    logger.info(`Prepared ${exportAnnotations.length} annotations for export`);

    return {
      annotations: exportAnnotations,
      pageCount: pageSizes.length,
      timestamp: new Date().toISOString(),
    };
  }
}

export interface ExportData {
  annotations: Array<Annotation & {
    pageIndex: number;
    pageSize: { width: number; height: number };
  }>;
  pageCount: number;
  timestamp: string;
}
