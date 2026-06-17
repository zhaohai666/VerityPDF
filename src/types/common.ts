/** 坐标点 */
export interface Point {
  x: number;
  y: number;
}

/** 尺寸 */
export interface Size {
  width: number;
  height: number;
}

/** 矩形区域 */
export interface Rect extends Point, Size {}

/** 旋转角度 */
export type Rotation = 0 | 90 | 180 | 270;

/** 缩放模式 */
export type ZoomMode = 'fitWidth' | 'fitHeight' | 'fitPage' | 'custom';

/** 滚动模式 */
export type ScrollMode = 'continuous' | 'singlePage';

/** 主题 */
export type Theme = 'light' | 'dark' | 'system';

/** 语言 */
export type Language = 'zh-CN' | 'en-US';

/** 侧边栏标签页 */
export type SidebarTab = 'thumbnails' | 'outline' | 'annotations';

/** 通用事件回调 */
export type Callback<T = void> = (data: T) => void;

/** 异步结果 */
export interface AsyncResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}
