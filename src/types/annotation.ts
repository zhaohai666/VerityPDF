import type { Point, Size } from './common';

/** 标注类型 */
export type AnnotationType =
  | 'rect'
  | 'ellipse'
  | 'arrow'
  | 'line'
  | 'freehand'
  | 'text'
  | 'highlight'
  | 'stickyNote'
  | 'stamp'
  | 'signature'
  | 'redaction'
  | 'wavyLine'
  | 'measureDistance'
  | 'measureArea'
  | 'measureAngle';

/** 标注样式 */
export interface AnnotationStyle {
  stroke: string;
  strokeWidth: number;
  fill: string;
  opacity: number;
  dash?: number[];
  /** 文本标注专用 */
  fontSize?: number;
  fontFamily?: string;
  /** 箭头类型 */
  arrowType?: 'none' | 'end' | 'both';
}

/** 标注元数据 */
export interface AnnotationMetadata {
  createdAt: string;
  updatedAt: string;
  author: string;
  locked: boolean;
}

/** 基础标注 */
export interface BaseAnnotation {
  id: string;
  type: AnnotationType;
  page: number;
  position: Point;
  size: Size;
  rotation: number;
  style: AnnotationStyle;
  metadata: AnnotationMetadata;
  content?: string;
  groupId?: string;
  zIndex?: number;
}

/** 矩形标注 */
export interface RectAnnotation extends BaseAnnotation {
  type: 'rect';
}

/** 椭圆标注 */
export interface EllipseAnnotation extends BaseAnnotation {
  type: 'ellipse';
}

/** 箭头标注 */
export interface ArrowAnnotation extends BaseAnnotation {
  type: 'arrow';
  endPoint: Point;
}

/** 直线标注 */
export interface LineAnnotation extends BaseAnnotation {
  type: 'line';
  endPoint: Point;
}

/** 自由画笔标注 */
export interface FreehandAnnotation extends BaseAnnotation {
  type: 'freehand';
  points: Point[];
}

/** 文本标注 */
export interface TextAnnotation extends BaseAnnotation {
  type: 'text';
  content: string;
}

/** 文本高亮标注 */
export interface HighlightAnnotation extends BaseAnnotation {
  type: 'highlight';
  /** 高亮覆盖的文字范围 */
  textRange?: { start: number; end: number };
}

/** 便签标注 */
export interface StickyNoteAnnotation extends BaseAnnotation {
  type: 'stickyNote';
  content: string;
  collapsed: boolean;
}

/** 印章标注 */
export interface StampAnnotation extends BaseAnnotation {
  type: 'stamp';
  imagePath: string;
}

/** 测量单位 */
export type MeasureUnit = 'pt' | 'mm' | 'cm' | 'in';

/** 签名标注 */
export interface SignatureAnnotation extends BaseAnnotation {
  type: 'signature';
  imagePath: string;
}

/** 涂黑标注 */
export interface RedactionAnnotation extends BaseAnnotation {
  type: 'redaction';
}

/** 波浪线标注 */
export interface WavyLineAnnotation extends BaseAnnotation {
  type: 'wavyLine';
  endPoint: Point;
}

/** 距离测量标注 */
export interface MeasureDistanceAnnotation extends BaseAnnotation {
  type: 'measureDistance';
  endPoint: Point;
  unit: MeasureUnit;
}

/** 面积测量标注 */
export interface MeasureAreaAnnotation extends BaseAnnotation {
  type: 'measureArea';
  points: Point[];
  unit: MeasureUnit;
}

/** 角度测量标注 */
export interface MeasureAngleAnnotation extends BaseAnnotation {
  type: 'measureAngle';
  startPoint: Point;
  midPoint: Point;
  endPoint: Point;
}

/** 标注联合类型 */
export type Annotation =
  | RectAnnotation
  | EllipseAnnotation
  | ArrowAnnotation
  | LineAnnotation
  | FreehandAnnotation
  | TextAnnotation
  | HighlightAnnotation
  | StickyNoteAnnotation
  | StampAnnotation
  | SignatureAnnotation
  | RedactionAnnotation
  | WavyLineAnnotation
  | MeasureDistanceAnnotation
  | MeasureAreaAnnotation
  | MeasureAngleAnnotation;

/** 标注操作（用于撤销/重做） */
export interface AnnotationAction {
  type: 'add' | 'remove' | 'modify' | 'move' | 'resize' | 'rotate';
  annotationId: string;
  before?: Partial<Annotation>;
  after?: Partial<Annotation>;
  timestamp: number;
}

/** 默认标注样式 */
export const DEFAULT_ANNOTATION_STYLE: AnnotationStyle = {
  stroke: '#FF0000',
  strokeWidth: 2,
  fill: 'transparent',
  opacity: 1,
  dash: [],
  fontSize: 14,
  fontFamily: 'sans-serif',
  arrowType: 'end',
};

/** 创建空标注元数据 */
export function createDefaultMetadata(): AnnotationMetadata {
  return {
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    author: 'user',
    locked: false,
  };
}
