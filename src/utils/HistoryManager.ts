/**
 * 撤销/重做历史管理器
 */
export class HistoryManager<T> {
  private undoStack: T[] = [];
  private redoStack: T[] = [];
  private maxSize: number;

  constructor(maxSize = 200) {
    this.maxSize = maxSize;
  }

  push(action: T): void {
    this.undoStack.push(action);
    if (this.undoStack.length > this.maxSize) {
      this.undoStack.shift();
    }
    // 新操作清空重做栈
    this.redoStack = [];
  }

  undo(): T | undefined {
    const action = this.undoStack.pop();
    if (action !== undefined) {
      this.redoStack.push(action);
    }
    return action;
  }

  redo(): T | undefined {
    const action = this.redoStack.pop();
    if (action !== undefined) {
      this.undoStack.push(action);
    }
    return action;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  get undoCount(): number {
    return this.undoStack.length;
  }

  get redoCount(): number {
    return this.redoStack.length;
  }
}
