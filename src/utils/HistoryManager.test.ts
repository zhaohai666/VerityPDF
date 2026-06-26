import { describe, it, expect } from 'vitest';
import { HistoryManager } from './HistoryManager';

interface TestAction {
  type: string;
  id: string;
}

describe('HistoryManager', () => {
  it('should initialize with empty stacks', () => {
    const hm = new HistoryManager<TestAction>();
    expect(hm.canUndo()).toBe(false);
    expect(hm.canRedo()).toBe(false);
    expect(hm.undoCount).toBe(0);
    expect(hm.redoCount).toBe(0);
  });

  it('should push and undo', () => {
    const hm = new HistoryManager<TestAction>();
    const action: TestAction = { type: 'add', id: '1' };
    hm.push(action);
    expect(hm.canUndo()).toBe(true);
    expect(hm.undoCount).toBe(1);

    const undone = hm.undo();
    expect(undone).toEqual(action);
    expect(hm.canUndo()).toBe(false);
    expect(hm.canRedo()).toBe(true);
  });

  it('should redo after undo', () => {
    const hm = new HistoryManager<TestAction>();
    const action: TestAction = { type: 'add', id: '1' };
    hm.push(action);
    hm.undo();

    const redone = hm.redo();
    expect(redone).toEqual(action);
    expect(hm.canUndo()).toBe(true);
    expect(hm.canRedo()).toBe(false);
  });

  it('should clear redo stack on new push', () => {
    const hm = new HistoryManager<TestAction>();
    const action1: TestAction = { type: 'add', id: '1' };
    const action2: TestAction = { type: 'add', id: '2' };

    hm.push(action1);
    hm.undo();
    expect(hm.canRedo()).toBe(true);

    hm.push(action2);
    expect(hm.canRedo()).toBe(false);
  });

  it('should respect max size', () => {
    const hm = new HistoryManager<TestAction>(2);
    const action1: TestAction = { type: 'add', id: '1' };
    const action2: TestAction = { type: 'add', id: '2' };
    const action3: TestAction = { type: 'add', id: '3' };

    hm.push(action1);
    hm.push(action2);
    hm.push(action3);

    expect(hm.undoCount).toBe(2); // Should only keep last 2
    expect(hm.canUndo()).toBe(true);

    const firstUndo = hm.undo();
    expect(firstUndo).toEqual(action3); // Last in, first out
    expect(hm.canUndo()).toBe(true);

    const secondUndo = hm.undo();
    expect(secondUndo).toEqual(action2);
    expect(hm.canUndo()).toBe(false);
  });

  it('should clear all', () => {
    const hm = new HistoryManager<TestAction>();
    const action: TestAction = { type: 'add', id: '1' };
    hm.push(action);
    hm.undo();

    hm.clear();
    expect(hm.canUndo()).toBe(false);
    expect(hm.canRedo()).toBe(false);
    expect(hm.undoCount).toBe(0);
    expect(hm.redoCount).toBe(0);
  });

  it('should handle undo with empty stack', () => {
    const hm = new HistoryManager<TestAction>();
    const result = hm.undo();
    expect(result).toBeUndefined();
  });

  it('should handle redo with empty stack', () => {
    const hm = new HistoryManager<TestAction>();
    const result = hm.redo();
    expect(result).toBeUndefined();
  });
});