import type { Point, Rect } from '@/types';

/**
 * 标注对齐吸附辅助工具
 */
export class SnapHelper {
  private threshold: number;
  private enabled: boolean;

  constructor(threshold = 5, enabled = true) {
    this.threshold = threshold;
    this.enabled = enabled;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  setThreshold(threshold: number): void {
    this.threshold = threshold;
  }

  /**
   * 计算吸附后的位置，返回吸附参考线信息
   */
  snap(
    point: Point,
    references: Rect[],
    _currentPage: number
  ): { point: Point; guides: SnapGuide[] } {
    if (!this.enabled || references.length === 0) {
      return { point, guides: [] };
    }

    const guides: SnapGuide[] = [];
    let snappedX = point.x;
    let snappedY = point.y;

    for (const ref of references) {
      const refEdges = {
        left: ref.x,
        centerX: ref.x + ref.width / 2,
        right: ref.x + ref.width,
        top: ref.y,
        centerY: ref.y + ref.height / 2,
        bottom: ref.y + ref.height,
      };

      // X 轴吸附
      for (const edgeX of [refEdges.left, refEdges.centerX, refEdges.right]) {
        if (Math.abs(point.x - edgeX) < this.threshold) {
          snappedX = edgeX;
          guides.push({ axis: 'x', position: edgeX, type: 'snap' });
        }
      }

      // Y 轴吸附
      for (const edgeY of [refEdges.top, refEdges.centerY, refEdges.bottom]) {
        if (Math.abs(point.y - edgeY) < this.threshold) {
          snappedY = edgeY;
          guides.push({ axis: 'y', position: edgeY, type: 'snap' });
        }
      }
    }

    return { point: { x: snappedX, y: snappedY }, guides };
  }
}

export interface SnapGuide {
  axis: 'x' | 'y';
  position: number;
  type: 'snap' | 'center' | 'midpoint';
}
