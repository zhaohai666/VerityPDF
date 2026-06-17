import type { AnnotationType, AnnotationStyle } from './annotation';

/** 工具类型 */
export type ToolType = AnnotationType | 'select' | 'pan' | 'eraser';

/** 工具配置 */
export interface ToolConfig {
  type: ToolType;
  label: string;
  icon: string;
  shortcut: string;
  cursor: string;
}

/** 工具选项 */
export interface ToolOptions {
  style: Partial<AnnotationStyle>;
  /** 是否保持选中工具（false = 绘制后切回 select） */
  keepActive: boolean;
}

/** 预定义工具列表 */
export const TOOL_LIST: ToolConfig[] = [
  { type: 'select', label: '选择', icon: 'cursor', shortcut: 'V', cursor: 'default' },
  { type: 'pan', label: '平移', icon: 'hand', shortcut: 'H', cursor: 'grab' },
  { type: 'rect', label: '矩形', icon: 'rect', shortcut: 'R', cursor: 'crosshair' },
  { type: 'ellipse', label: '椭圆', icon: 'ellipse', shortcut: 'O', cursor: 'crosshair' },
  { type: 'arrow', label: '箭头', icon: 'arrow', shortcut: 'A', cursor: 'crosshair' },
  { type: 'line', label: '直线', icon: 'line', shortcut: 'L', cursor: 'crosshair' },
  { type: 'freehand', label: '画笔', icon: 'pen', shortcut: 'P', cursor: 'crosshair' },
  { type: 'text', label: '文本', icon: 'text', shortcut: 'T', cursor: 'text' },
  { type: 'highlight', label: '高亮', icon: 'highlight', shortcut: 'U', cursor: 'text' },
  { type: 'stickyNote', label: '便签', icon: 'note', shortcut: 'N', cursor: 'crosshair' },
  { type: 'stamp', label: '印章', icon: 'stamp', shortcut: '', cursor: 'crosshair' },
  { type: 'signature', label: '签名', icon: 'sign', shortcut: '', cursor: 'crosshair' },
  { type: 'eraser', label: '橡皮擦', icon: 'eraser', shortcut: 'E', cursor: 'crosshair' },
];
