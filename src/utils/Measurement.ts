import type { Point, MeasureUnit } from '@/types';

/** 默认页面尺寸（A4 @ 72dpi） */
const DEFAULT_PAGE_W = 595.28;
const DEFAULT_PAGE_H = 841.89;

const UNIT_FACTORS: Record<MeasureUnit, number> = {
  pt: 1,
  mm: 25.4 / 72,
  cm: 2.54 / 72,
  in: 1 / 72,
};

/** 两点间像素距离转换为指定单位 */
export function calcDistance(
  p1: Point,
  p2: Point,
  pageW: number = DEFAULT_PAGE_W,
  pageH: number = DEFAULT_PAGE_H,
  unit: MeasureUnit = 'pt',
): number {
  const dx = (p2.x - p1.x) * pageW;
  const dy = (p2.y - p1.y) * pageH;
  const distPt = Math.sqrt(dx * dx + dy * dy);
  return distPt * UNIT_FACTORS[unit];
}

/** 多边形面积（Shoelace formula），归一化坐标 → 指定单位² */
export function calcArea(
  points: Point[],
  pageW: number = DEFAULT_PAGE_W,
  pageH: number = DEFAULT_PAGE_H,
  unit: MeasureUnit = 'pt',
): number {
  if (points.length < 3) return 0;
  let area = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const xi = points[i].x * pageW;
    const yi = points[i].y * pageH;
    const xj = points[j].x * pageW;
    const yj = points[j].y * pageH;
    area += xi * yj - xj * yi;
  }
  area = Math.abs(area) / 2;
  const f = UNIT_FACTORS[unit];
  return area * f * f;
}

/** 三点夹角（atan2），返回角度（度） */
export function calcAngle(p1: Point, vertex: Point, p2: Point): number {
  const a1 = Math.atan2(p1.y - vertex.y, p1.x - vertex.x);
  const a2 = Math.atan2(p2.y - vertex.y, p2.x - vertex.x);
  let angle = a2 - a1;
  if (angle > Math.PI) angle -= 2 * Math.PI;
  if (angle < -Math.PI) angle += 2 * Math.PI;
  return Math.abs(angle * (180 / Math.PI));
}

/** 格式化测量值 */
export function formatMeasure(value: number, unit: MeasureUnit): string {
  const precision = unit === 'pt' ? 1 : 2;
  return `${value.toFixed(precision)} ${unit}`;
}

/** 单位标签 */
export const UNIT_LABELS: Record<MeasureUnit, string> = {
  pt: 'pt',
  mm: 'mm',
  cm: 'cm',
  in: 'in',
};
