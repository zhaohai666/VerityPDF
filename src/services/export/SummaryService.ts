import type { Annotation, AnnotationType } from '@/types';
import type { Comment } from '@/types/common';

/** 类型标签 */
const TYPE_LABELS: Record<AnnotationType, string> = {
  rect: '矩形', ellipse: '椭圆', arrow: '箭头', line: '直线',
  freehand: '画笔', text: '文本', highlight: '高亮', stickyNote: '便签',
  stamp: '印章', signature: '签名', redaction: '涂黑', wavyLine: '波浪线',
  measureDistance: '距离', measureArea: '面积', measureAngle: '角度',
};

/** 类型统计 */
export interface TypeStat {
  type: AnnotationType;
  label: string;
  count: number;
}

/** 页面总结 */
export interface PageSummary {
  page: number;
  annotations: Annotation[];
  typeStats: TypeStat[];
  commentCount: number;
}

/** 完整总结报告 */
export interface SummaryReport {
  totalAnnotations: number;
  totalComments: number;
  totalPages: number;
  typeStats: TypeStat[];
  pages: PageSummary[];
}

/** 生成总结报告 */
export function generateSummary(
  annotations: Annotation[],
  comments: Comment[],
): SummaryReport {
  // 按类型统计
  const typeCountMap = new Map<AnnotationType, number>();
  for (const ann of annotations) {
    typeCountMap.set(ann.type, (typeCountMap.get(ann.type) ?? 0) + 1);
  }
  const typeStats: TypeStat[] = Array.from(typeCountMap.entries()).map(([type, count]) => ({
    type,
    label: TYPE_LABELS[type] ?? type,
    count,
  }));
  typeStats.sort((a, b) => b.count - a.count);

  // 按页分组
  const byPage = new Map<number, Annotation[]>();
  for (const ann of annotations) {
    if (!byPage.has(ann.page)) byPage.set(ann.page, []);
    byPage.get(ann.page)!.push(ann);
  }

  const pages: PageSummary[] = Array.from(byPage.entries())
    .sort(([a], [b]) => a - b)
    .map(([page, anns]) => {
      const pageTypeMap = new Map<AnnotationType, number>();
      for (const ann of anns) {
        pageTypeMap.set(ann.type, (pageTypeMap.get(ann.type) ?? 0) + 1);
      }
      const pageTypeStats: TypeStat[] = Array.from(pageTypeMap.entries()).map(([type, count]) => ({
        type,
        label: TYPE_LABELS[type] ?? type,
        count,
      }));
      const annIds = new Set(anns.map((a) => a.id));
      const commentCount = comments.filter((c) => annIds.has(c.annotationId)).length;
      return { page, annotations: anns, typeStats: pageTypeStats, commentCount };
    });

  return {
    totalAnnotations: annotations.length,
    totalComments: comments.length,
    totalPages: byPage.size,
    typeStats,
    pages,
  };
}

/** 获取类型标签 */
export function getTypeLabel(type: AnnotationType): string {
  return TYPE_LABELS[type] ?? type;
}
