import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAnnotationStore } from '@/stores/annotationStore';
import type { Annotation } from '@/types';

// Mock navigator.clipboard (copyAnnotations/pasteAnnotations 依赖它)
const clipboardStore: { text: string } = { text: '' };
Object.assign(navigator, {
  clipboard: {
    writeText: vi.fn((text: string) => { clipboardStore.text = text; return Promise.resolve(); }),
    readText: vi.fn(() => Promise.resolve(clipboardStore.text)),
  },
});

describe('Annotation flow integration', () => {
  beforeEach(() => {
    useAnnotationStore.getState().reset();
    clipboardStore.text = '';
  });

  it('should add, update, undo and redo annotations', () => {
    const store = useAnnotationStore.getState();

    // Add annotation
    const annotation: Annotation = {
      id: 'test-1',
      type: 'rect',
      page: 1,
      position: { x: 0.1, y: 0.1 },
      size: { width: 0.2, height: 0.2 },
      rotation: 0,
      style: { stroke: '#FF0000', strokeWidth: 2, fill: 'transparent', opacity: 1 },
      metadata: { createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), author: 'test', locked: false },
    };

    store.addAnnotation(annotation);
    // 使用 getState() 获取最新状态
    expect(useAnnotationStore.getState().annotations).toHaveLength(1);

    // Update
    store.updateAnnotation('test-1', { position: { x: 0.3, y: 0.3 } });
    expect(useAnnotationStore.getState().annotations[0].position.x).toBe(0.3);

    // Undo
    store.undo();
    expect(useAnnotationStore.getState().annotations[0].position.x).toBe(0.1);

    // Redo
    store.redo();
    expect(useAnnotationStore.getState().annotations[0].position.x).toBe(0.3);

    // Remove
    store.removeAnnotation('test-1');
    expect(useAnnotationStore.getState().annotations).toHaveLength(0);

    // Undo remove
    store.undo();
    expect(useAnnotationStore.getState().annotations).toHaveLength(1);
  });

  it('should copy and paste annotations', async () => {
    const store = useAnnotationStore.getState();

    // Add two annotations
    const ann1: Annotation = {
      id: 'ann1',
      type: 'rect',
      page: 1,
      position: { x: 10, y: 10 },
      size: { width: 20, height: 20 },
      rotation: 0,
      style: { stroke: '#FF0000', strokeWidth: 2, fill: 'transparent', opacity: 1 },
      metadata: { createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), author: 'test', locked: false },
    };
    const ann2: Annotation = {
      id: 'ann2',
      type: 'ellipse',
      page: 1,
      position: { x: 50, y: 50 },
      size: { width: 30, height: 30 },
      rotation: 0,
      style: { stroke: '#00FF00', strokeWidth: 2, fill: 'transparent', opacity: 1 },
      metadata: { createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), author: 'test', locked: false },
    };

    store.addAnnotation(ann1);
    store.addAnnotation(ann2);
    // 使用 getState() 获取最新状态
    expect(useAnnotationStore.getState().annotations).toHaveLength(2);

    // Select both annotations (simulate via store method)
    store.selectAnnotation(ann1.id, true); // multi-select
    store.selectAnnotation(ann2.id, true);

    // Copy
    store.copyAnnotations([ann1.id, ann2.id]);
    // 等待 clipboard 异步写入
    await new Promise((r) => setTimeout(r, 0));

    // Deselect
    store.clearSelection();

    // Paste to page 2
    await store.pasteAnnotations(2);

    // Should now have 4 annotations (2 original + 2 pasted)
    expect(useAnnotationStore.getState().annotations).toHaveLength(4);

    // Check pasted annotations are on page 2
    const pasted = useAnnotationStore.getState().annotations.filter(a => a.page === 2);
    expect(pasted).toHaveLength(2);
    // Check that IDs are new (not original)
    const pastedIds = pasted.map(a => a.id);
    expect(pastedIds).not.toContain(ann1.id);
    expect(pastedIds).not.toContain(ann2.id);
    // Check that types are preserved
    const types = pasted.map(a => a.type).sort();
    expect(types).toEqual(['ellipse', 'rect'].sort());
  });
});