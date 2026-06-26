import { describe, it, expect } from 'vitest';
import { AnnotationManager } from './AnnotationManager';
import type { Annotation, AnnotationType } from '@/types';

describe('AnnotationManager', () => {
  it('should initialize with empty annotations', () => {
    const am = new AnnotationManager();
    expect(am.count).toBe(0);
    expect(am.canUndo()).toBe(false);
    expect(am.canRedo()).toBe(false);
  });

  it('should add annotation', () => {
    const am = new AnnotationManager();
    const annotation: Annotation = am.add(
      'rect' as AnnotationType,
      1,
      { x: 10, y: 20 },
      { width: 100, height: 50 },
      { style: { stroke: '#FF0000', strokeWidth: 2 } }
    );

    expect(am.count).toBe(1);
    expect(annotation.type).toBe('rect');
    expect(annotation.page).toBe(1);
    expect(annotation.position.x).toBe(10);
    expect(annotation.position.y).toBe(20);
    expect(annotation.size.width).toBe(100);
    expect(annotation.size.height).toBe(50);
  });

  it('should get annotation by page', () => {
    const am = new AnnotationManager();
    am.add('rect' as AnnotationType, 1, { x: 0, y: 0 }, { width: 50, height: 50 });
    am.add('rect' as AnnotationType, 2, { x: 10, y: 10 }, { width: 50, height: 50 });

    expect(am.getByPage(1)).toHaveLength(1);
    expect(am.getByPage(2)).toHaveLength(1);
    expect(am.getByPage(3)).toHaveLength(0);
  });

  it('should get all annotations', () => {
    const am = new AnnotationManager();
    am.add('rect' as AnnotationType, 1, { x: 0, y: 0 }, { width: 50, height: 50 });
    am.add('ellipse' as AnnotationType, 2, { x: 10, y: 10 }, { width: 50, height: 50 });

    const all = am.getAll();
    expect(all).toHaveLength(2);
    expect(all[0].type).toBe('rect');
    expect(all[1].type).toBe('ellipse');
  });

  it('should get annotation by id', () => {
    const am = new AnnotationManager();
    const annotation = am.add('rect' as AnnotationType, 1, { x: 5, y: 5 }, { width: 50, height: 50 });

    const found = am.get(annotation.id);
    expect(found).toBeDefined();
    expect(found?.id).toBe(annotation.id);
    expect(found?.type).toBe('rect');
  });

  it('should return undefined for non-existent id', () => {
    const am = new AnnotationManager();
    const found = am.get('non-existent-id');
    expect(found).toBeUndefined();
  });

  it('should update annotation', () => {
    const am = new AnnotationManager();
    const annotation = am.add('rect' as AnnotationType, 1, { x: 0, y: 0 }, { width: 50, height: 50 });

    am.update(annotation.id, { position: { x: 100, y: 100 } });

    const updated = am.get(annotation.id);
    expect(updated?.position.x).toBe(100);
    expect(updated?.position.y).toBe(100);
  });

  it('should remove annotation', () => {
    const am = new AnnotationManager();
    const annotation = am.add('rect' as AnnotationType, 1, { x: 0, y: 0 }, { width: 50, height: 50 });

    expect(am.count).toBe(1);
    am.remove(annotation.id);
    expect(am.count).toBe(0);
  });

  it('should clear all annotations', () => {
    const am = new AnnotationManager();
    am.add('rect' as AnnotationType, 1, { x: 0, y: 0 }, { width: 50, height: 50 });
    am.add('rect' as AnnotationType, 2, { x: 10, y: 10 }, { width: 50, height: 50 });

    expect(am.count).toBe(2);
    am.clear();
    expect(am.count).toBe(0);
    expect(am.canUndo()).toBe(false);
    expect(am.canRedo()).toBe(false);
  });

  it('should undo add operation', () => {
    const am = new AnnotationManager();
    am.add('rect' as AnnotationType, 1, { x: 0, y: 0 }, { width: 50, height: 50 });

    expect(am.count).toBe(1);
    expect(am.canUndo()).toBe(true);

    const result = am.undo();
    expect(result).toBe(true);
    expect(am.count).toBe(0);
    expect(am.canUndo()).toBe(false);
    expect(am.canRedo()).toBe(true);
  });

  it('should redo after undo', () => {
    const am = new AnnotationManager();
    am.add('rect' as AnnotationType, 1, { x: 0, y: 0 }, { width: 50, height: 50 });

    am.undo();
    expect(am.count).toBe(0);
    expect(am.canRedo()).toBe(true);

    const result = am.redo();
    expect(result).toBe(true);
    expect(am.count).toBe(1);
    expect(am.canUndo()).toBe(true);
    expect(am.canRedo()).toBe(false);
  });

  it('should handle undo with empty stack', () => {
    const am = new AnnotationManager();
    const result = am.undo();
    expect(result).toBe(false);
  });

  it('should handle redo with empty stack', () => {
    const am = new AnnotationManager();
    const result = am.redo();
    expect(result).toBe(false);
  });

  it('should load all annotations', () => {
    const am = new AnnotationManager();
    const annotations: Annotation[] = [
      {
        id: '1',
        type: 'rect' as AnnotationType,
        page: 1,
        position: { x: 0, y: 0 },
        size: { width: 50, height: 50 },
        rotation: 0,
        style: { stroke: '#FF0000', strokeWidth: 2, fill: 'transparent', opacity: 1 },
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          author: 'test',
          locked: false,
        },
      },
      {
        id: '2',
        type: 'ellipse' as AnnotationType,
        page: 2,
        position: { x: 10, y: 10 },
        size: { width: 50, height: 50 },
        rotation: 0,
        style: { stroke: '#00FF00', strokeWidth: 2, fill: 'transparent', opacity: 1 },
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          author: 'test',
          locked: false,
        },
      },
    ];

    am.loadAll(annotations);
    expect(am.count).toBe(2);
    expect(am.getByPage(1)).toHaveLength(1);
    expect(am.getByPage(2)).toHaveLength(1);
  });
});