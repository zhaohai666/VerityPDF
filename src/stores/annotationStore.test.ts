import { describe, it, expect } from 'vitest';
import { useAnnotationStore } from './annotationStore';
import type { Annotation } from '@/types';

describe('AnnotationStore', () => {
  it('should initialize with empty state', () => {
    const state = useAnnotationStore.getState();
    expect(state.annotations).toEqual([]);
    expect(state.selectedIds).toEqual([]);
    expect(state.isDirty).toBe(false);
    expect(state.saveStatus).toBe('saved');
    expect(state.lastSavedTime).toBe(null);
  });

  it('should add an annotation', () => {
    useAnnotationStore.getState().reset();
    const annotation: Annotation = {
      id: 'test-1',
      type: 'rect',
      page: 1,
      position: { x: 0.1, y: 0.1 },
      size: { width: 0.2, height: 0.2 },
      rotation: 0,
      style: { stroke: '#FF0000', strokeWidth: 2, fill: 'transparent', opacity: 1 },
      metadata: {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        author: 'test',
        locked: false,
      },
    };

    useAnnotationStore.getState().addAnnotation(annotation);
    const state = useAnnotationStore.getState();
    expect(state.annotations).toHaveLength(1);
    expect(state.annotations[0].id).toBe('test-1');
    expect(state.isDirty).toBe(true);
    expect(state.saveStatus).toBe('unsaved');
  });

  it('should update an annotation', () => {
    useAnnotationStore.getState().reset();
    const annotation: Annotation = {
      id: 'test-1',
      type: 'rect',
      page: 1,
      position: { x: 0.1, y: 0.1 },
      size: { width: 0.2, height: 0.2 },
      rotation: 0,
      style: { stroke: '#FF0000', strokeWidth: 2, fill: 'transparent', opacity: 1 },
      metadata: {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        author: 'test',
        locked: false,
      },
    };

    useAnnotationStore.getState().addAnnotation(annotation);
    useAnnotationStore.getState().updateAnnotation('test-1', { position: { x: 0.3, y: 0.3 } });
    const state = useAnnotationStore.getState();
    expect(state.annotations[0].position.x).toBe(0.3);
    expect(state.annotations[0].position.y).toBe(0.3);
  });

  it('should remove an annotation', () => {
    useAnnotationStore.getState().reset();
    const annotation: Annotation = {
      id: 'test-1',
      type: 'rect',
      page: 1,
      position: { x: 0.1, y: 0.1 },
      size: { width: 0.2, height: 0.2 },
      rotation: 0,
      style: { stroke: '#FF0000', strokeWidth: 2, fill: 'transparent', opacity: 1 },
      metadata: {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        author: 'test',
        locked: false,
      },
    };

    useAnnotationStore.getState().addAnnotation(annotation);
    useAnnotationStore.getState().removeAnnotation('test-1');
    const state = useAnnotationStore.getState();
    expect(state.annotations).toHaveLength(0);
  });

  it('should undo an action', () => {
    useAnnotationStore.getState().reset();
    const annotation: Annotation = {
      id: 'test-1',
      type: 'rect',
      page: 1,
      position: { x: 0.1, y: 0.1 },
      size: { width: 0.2, height: 0.2 },
      rotation: 0,
      style: { stroke: '#FF0000', strokeWidth: 2, fill: 'transparent', opacity: 1 },
      metadata: {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        author: 'test',
        locked: false,
      },
    };

    useAnnotationStore.getState().addAnnotation(annotation);
    expect(useAnnotationStore.getState().annotations).toHaveLength(1);

    useAnnotationStore.getState().undo();
    expect(useAnnotationStore.getState().annotations).toHaveLength(0);
  });

  it('should redo an action', () => {
    useAnnotationStore.getState().reset();
    const annotation: Annotation = {
      id: 'test-1',
      type: 'rect',
      page: 1,
      position: { x: 0.1, y: 0.1 },
      size: { width: 0.2, height: 0.2 },
      rotation: 0,
      style: { stroke: '#FF0000', strokeWidth: 2, fill: 'transparent', opacity: 1 },
      metadata: {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        author: 'test',
        locked: false,
      },
    };

    useAnnotationStore.getState().addAnnotation(annotation);
    useAnnotationStore.getState().undo();
    expect(useAnnotationStore.getState().annotations).toHaveLength(0);

    useAnnotationStore.getState().redo();
    expect(useAnnotationStore.getState().annotations).toHaveLength(1);
  });
});