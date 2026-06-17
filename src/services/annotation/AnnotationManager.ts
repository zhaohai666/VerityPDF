import type { Annotation, AnnotationType, AnnotationAction, Point, Size } from '@/types';
import { DEFAULT_ANNOTATION_STYLE, createDefaultMetadata } from '@/types';
import { HistoryManager, SnapHelper, generateId, Logger } from '@/utils';

const logger = new Logger('AnnotationManager');

export class AnnotationManager {
  private annotations: Map<string, Annotation> = new Map();
  private history: HistoryManager<AnnotationAction>;
  private snapHelper: SnapHelper;
  private onChange?: () => void;

  constructor() {
    this.history = new HistoryManager(200);
    this.snapHelper = new SnapHelper(5, true);
  }

  setOnChange(callback: () => void): void {
    this.onChange = callback;
  }

  /** 添加标注 */
  add(
    type: AnnotationType,
    page: number,
    position: Point,
    size: Size,
    extra?: Partial<Annotation>
  ): Annotation {
    const annotation: Annotation = {
      id: generateId('ann'),
      type,
      page,
      position,
      size,
      rotation: 0,
      style: { ...DEFAULT_ANNOTATION_STYLE },
      metadata: createDefaultMetadata(),
      ...extra,
    } as Annotation;

    this.annotations.set(annotation.id, annotation);
    this.history.push({
      type: 'add',
      annotationId: annotation.id,
      after: { ...annotation },
      timestamp: Date.now(),
    });
    this.onChange?.();
    logger.debug(`Annotation added: ${annotation.id} (${type})`);
    return annotation;
  }

  /** 更新标注 */
  update(id: string, changes: Partial<Annotation>): void {
    const existing = this.annotations.get(id);
    if (!existing) return;

    const before = { ...existing };
    const updated = { ...existing, ...changes, id: existing.id };
    this.annotations.set(id, updated as Annotation);

    this.history.push({
      type: 'modify',
      annotationId: id,
      before,
      after: updated,
      timestamp: Date.now(),
    });
    this.onChange?.();
  }

  /** 删除标注 */
  remove(id: string): void {
    const existing = this.annotations.get(id);
    if (!existing) return;

    this.annotations.delete(id);
    this.history.push({
      type: 'remove',
      annotationId: id,
      before: { ...existing },
      timestamp: Date.now(),
    });
    this.onChange?.();
    logger.debug(`Annotation removed: ${id}`);
  }

  /** 撤销 */
  undo(): boolean {
    const action = this.history.undo();
    if (!action) return false;

    switch (action.type) {
      case 'add':
        this.annotations.delete(action.annotationId);
        break;
      case 'remove':
        if (action.before) {
          this.annotations.set(action.annotationId, action.before as Annotation);
        }
        break;
      case 'modify':
      case 'move':
      case 'resize':
      case 'rotate':
        if (action.before) {
          this.annotations.set(action.annotationId, action.before as Annotation);
        }
        break;
    }
    this.onChange?.();
    return true;
  }

  /** 重做 */
  redo(): boolean {
    const action = this.history.redo();
    if (!action) return false;

    switch (action.type) {
      case 'add':
        if (action.after) {
          this.annotations.set(action.annotationId, action.after as Annotation);
        }
        break;
      case 'remove':
        this.annotations.delete(action.annotationId);
        break;
      case 'modify':
      case 'move':
      case 'resize':
      case 'rotate':
        if (action.after) {
          this.annotations.set(action.annotationId, action.after as Annotation);
        }
        break;
    }
    this.onChange?.();
    return true;
  }

  /** 获取指定页面的标注 */
  getByPage(page: number): Annotation[] {
    return Array.from(this.annotations.values())
      .filter((a) => a.page === page)
      .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
  }

  /** 获取所有标注 */
  getAll(): Annotation[] {
    return Array.from(this.annotations.values());
  }

  /** 获取单个标注 */
  get(id: string): Annotation | undefined {
    return this.annotations.get(id);
  }

  /** 清空所有标注 */
  clear(): void {
    this.annotations.clear();
    this.history.clear();
    this.onChange?.();
  }

  /** 批量加载标注 */
  loadAll(annotations: Annotation[]): void {
    this.annotations.clear();
    for (const ann of annotations) {
      this.annotations.set(ann.id, ann);
    }
    this.onChange?.();
    logger.info(`Loaded ${annotations.length} annotations`);
  }

  canUndo(): boolean {
    return this.history.canUndo();
  }

  canRedo(): boolean {
    return this.history.canRedo();
  }

  getSnapHelper(): SnapHelper {
    return this.snapHelper;
  }

  get count(): number {
    return this.annotations.size;
  }
}
