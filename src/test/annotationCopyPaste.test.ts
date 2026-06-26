import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAnnotationStore } from '@/stores/annotationStore';

// Mock navigator.clipboard (copyAnnotations/pasteAnnotations 依赖它)
const clipboardStore: { text: string } = { text: '' };
Object.assign(navigator, {
  clipboard: {
    writeText: vi.fn((text: string) => { clipboardStore.text = text; return Promise.resolve(); }),
    readText: vi.fn(() => Promise.resolve(clipboardStore.text)),
  },
});

describe('Annotation store with copy/paste', () => {
  beforeEach(() => {
    useAnnotationStore.getState().reset();
    clipboardStore.text = '';
  });

  it('should copy and paste annotations', async () => {
    const store = useAnnotationStore.getState();

    // Add test annotations
    const annotation1: any = {
      id: 'ann1',
      type: 'rect',
      page: 1,
      position: { x: 10, y: 10 },
      size: { width: 50, height: 50 },
      rotation: 0,
      style: { stroke: '#FF0000', strokeWidth: 2, fill: 'transparent', opacity: 1 },
      metadata: {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        author: 'test',
        locked: false,
      },
    };

    const annotation2: any = {
      id: 'ann2',
      type: 'ellipse',
      page: 1,
      position: { x: 100, y: 100 },
      size: { width: 30, height: 30 },
      rotation: 0,
      style: { stroke: '#00FF00', strokeWidth: 2, fill: 'transparent', opacity: 1 },
      metadata: {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        author: 'test',
        locked: false,
      },
    };

    store.addAnnotation(annotation1);
    store.addAnnotation(annotation2);
    // 使用 getState() 获取最新状态，而非过期的快照
    expect(useAnnotationStore.getState().annotations).toHaveLength(2);

    // Copy both annotations
    store.copyAnnotations(['ann1', 'ann2']);
    // 等待 clipboard 异步写入
    await new Promise((r) => setTimeout(r, 0));

    // Clear selection
    store.clearSelection();

    // Paste to page 2
    await store.pasteAnnotations(2);

    // Should now have 4 annotations total
    expect(useAnnotationStore.getState().annotations).toHaveLength(4);

    // Check that pasted annotations exist on page 2
    const pasted = useAnnotationStore.getState().annotations.filter(a => a.page === 2);
    expect(pasted).toHaveLength(2);

    // Verify pasted annotations have new IDs
    const pastedIds = pasted.map(a => a.id);
    expect(pastedIds).not.toContain('ann1');
    expect(pastedIds).not.toContain('ann2');

    // Verify types are preserved
    const types = pasted.map(a => a.type).sort();
    expect(types).toEqual(['ellipse', 'rect'].sort());
  });
});