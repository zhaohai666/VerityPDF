import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAnnotationStore } from '@/stores/annotationStore';
import { useAutoSave } from '@/hooks/useAutoSave';

describe('Integration: Auto-save functionality', () => {
  let saveCallback: vi.Mock;

  beforeEach(() => {
    useAnnotationStore.getState().reset();
    saveCallback = vi.fn();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('should trigger save after delay when isDirty becomes true', () => {
    // 使用 renderHook 在 React 组件上下文中调用 hook
    const { result: _result } = renderHook(() => useAutoSave(saveCallback));

    const store = useAnnotationStore.getState();

    // Add annotation to make dirty
    act(() => {
      store.addAnnotation({
        id: 'test',
        type: 'rect',
        page: 1,
        position: { x: 0, y: 0 },
        size: { width: 10, height: 10 },
        rotation: 0,
        style: { stroke: '#000000', strokeWidth: 1, fill: 'transparent', opacity: 1 },
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          author: 'test',
          locked: false,
        },
      });
    });

    expect(useAnnotationStore.getState().isDirty).toBe(true);
    expect(saveCallback).not.toHaveBeenCalled(); // Not called immediately

    // Fast-forward timers
    act(() => {
      vi.advanceTimersByTime(30000); // 30 seconds
    });

    expect(saveCallback).toHaveBeenCalledTimes(1);
  });

  it('should not save if not dirty', () => {
    renderHook(() => useAutoSave(saveCallback));

    const store = useAnnotationStore.getState();
    expect(store.isDirty).toBe(false);

    act(() => {
      vi.advanceTimersByTime(30000);
    });
    expect(saveCallback).not.toHaveBeenCalled();
  });

  it('should fire save after delay from when isDirty first becomes true', () => {
    renderHook(() => useAutoSave(saveCallback));

    const store = useAnnotationStore.getState();

    // First change - isDirty goes from false to true, starts the timer
    act(() => {
      store.addAnnotation({
        id: 'test1',
        type: 'rect',
        page: 1,
        position: { x: 0, y: 0 },
        size: { width: 10, height: 10 },
        rotation: 0,
        style: { stroke: '#000000', strokeWidth: 1, fill: 'transparent', opacity: 1 },
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          author: 'test',
          locked: false,
        },
      });
    });

    expect(useAnnotationStore.getState().isDirty).toBe(true);
    expect(saveCallback).not.toHaveBeenCalled();

    // Advance 15 seconds - not yet
    act(() => {
      vi.advanceTimersByTime(15000);
    });
    expect(saveCallback).not.toHaveBeenCalled();

    // Second change while isDirty is already true - timer continues from first trigger
    act(() => {
      store.addAnnotation({
        id: 'test2',
        type: 'rect',
        page: 1,
        position: { x: 20, y: 20 },
        size: { width: 10, height: 10 },
        rotation: 0,
        style: { stroke: '#000000', strokeWidth: 1, fill: 'transparent', opacity: 1 },
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          author: 'test',
          locked: false,
        },
      });
    });

    // Advance another 15 seconds (total 30s from first change) - timer fires
    act(() => {
      vi.advanceTimersByTime(15000);
    });
    expect(saveCallback).toHaveBeenCalledTimes(1);
  });

  it('should flush immediately when flush() is called', () => {
    const { result } = renderHook(() => useAutoSave(saveCallback));

    const store = useAnnotationStore.getState();

    act(() => {
      store.addAnnotation({
        id: 'test',
        type: 'rect',
        page: 1,
        position: { x: 0, y: 0 },
        size: { width: 10, height: 10 },
        rotation: 0,
        style: { stroke: '#000000', strokeWidth: 1, fill: 'transparent', opacity: 1 },
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          author: 'test',
          locked: false,
        },
      });
    });

    expect(saveCallback).not.toHaveBeenCalled();
    act(() => {
      result.current.flush();
    });
    expect(saveCallback).toHaveBeenCalledTimes(1);
  });

  it('should not call save if cleaned up before delay', () => {
    const { unmount } = renderHook(() => useAutoSave(saveCallback));

    const store = useAnnotationStore.getState();

    act(() => {
      store.addAnnotation({
        id: 'test',
        type: 'rect',
        page: 1,
        position: { x: 0, y: 0 },
        size: { width: 10, height: 10 },
        rotation: 0,
        style: { stroke: '#000000', strokeWidth: 1, fill: 'transparent', opacity: 1 },
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          author: 'test',
          locked: false,
        },
      });
    });

    // "Unmount" the hook - triggers useEffect cleanup which clears the timer
    unmount();

    // Advance time after unmount - callback should NOT be called
    act(() => {
      vi.advanceTimersByTime(30000);
    });
    expect(saveCallback).not.toHaveBeenCalled();
  });
});