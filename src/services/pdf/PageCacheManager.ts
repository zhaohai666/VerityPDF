import type { PageCacheEntry } from '@/types';
import { Logger } from '@/utils';

const logger = new Logger('PageCache');

interface LRUNode {
  key: string;
  entry: PageCacheEntry;
  prev: LRUNode | null;
  next: LRUNode | null;
}

export class PageCacheManager {
  private cache = new Map<string, LRUNode>();
  private head: LRUNode | null = null;
  private tail: LRUNode | null = null;
  private maxEntries: number;
  private maxMemory: number;
  private totalMemory: number = 0;

  constructor(maxEntries = 15, maxMemoryMB = 256) {
    this.maxEntries = maxEntries;
    this.maxMemory = maxMemoryMB * 1024 * 1024;
  }

  private makeKey(pageNumber: number, scale: number, rotation: number): string {
    return `${pageNumber}_${scale.toFixed(2)}_${rotation}`;
  }

  private addToHead(node: LRUNode): void {
    node.prev = null;
    node.next = this.head;
    if (this.head) {
      this.head.prev = node;
    } else {
      this.tail = node;
    }
    this.head = node;
  }

  private removeNode(node: LRUNode): void {
    if (node.prev) {
      node.prev.next = node.next;
    } else {
      this.head = node.next;
    }
    if (node.next) {
      node.next.prev = node.prev;
    } else {
      this.tail = node.prev;
    }
    node.prev = null;
    node.next = null;
  }

  private moveToHead(node: LRUNode): void {
    this.removeNode(node);
    this.addToHead(node);
  }

  get(pageNumber: number, scale: number, rotation: number): PageCacheEntry | undefined {
    const key = this.makeKey(pageNumber, scale, rotation);
    const node = this.cache.get(key);
    if (node) {
      this.moveToHead(node);
      logger.debug(`Cache hit: page ${pageNumber}`);
      return node.entry;
    }
    return undefined;
  }

  set(pageNumber: number, canvas: HTMLCanvasElement, scale: number, rotation: number): void {
    const key = this.makeKey(pageNumber, scale, rotation);
    const estimatedSize = canvas.width * canvas.height * 4;

    const existingNode = this.cache.get(key);
    if (existingNode) {
      this.totalMemory -= existingNode.entry.size;
      this.removeNode(existingNode);
    }

    this.evictIfNeeded(estimatedSize);

    const entry: PageCacheEntry = {
      pageNumber,
      canvas,
      scale,
      rotation: rotation as 0 | 90 | 180 | 270,
      timestamp: Date.now(),
      size: estimatedSize,
    };

    const node: LRUNode = { key, entry, prev: null, next: null };
    this.cache.set(key, node);
    this.addToHead(node);
    this.totalMemory += estimatedSize;

    logger.debug(`Cache set: page ${pageNumber} (${this.cache.size}/${this.maxEntries})`);
  }

  private evictIfNeeded(incomingSize: number): void {
    while (this.cache.size >= this.maxEntries) {
      this.evictLRU();
    }

    while (this.totalMemory + incomingSize > this.maxMemory && this.cache.size > 0) {
      this.evictLRU();
    }
  }

  private evictLRU(): void {
    if (!this.tail) return;

    const node = this.tail;
    this.removeNode(node);
    this.cache.delete(node.key);
    this.totalMemory -= node.entry.size;

    logger.debug(`Cache evict: ${node.key}`);
  }

  invalidate(pageNumber: number): void {
    const keysToRemove: string[] = [];
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${pageNumber}_`)) {
        keysToRemove.push(key);
      }
    }

    for (const key of keysToRemove) {
      const node = this.cache.get(key);
      if (node) {
        this.removeNode(node);
        this.cache.delete(key);
        this.totalMemory -= node.entry.size;
      }
    }
  }

  clear(): void {
    this.cache.clear();
    this.head = null;
    this.tail = null;
    this.totalMemory = 0;
    logger.info('Cache cleared');
  }

  getTotalMemory(): number {
    return this.totalMemory;
  }

  get size(): number {
    return this.cache.size;
  }

  getStats(): { size: number; memory: number; hitRate: string } {
    return {
      size: this.cache.size,
      memory: this.totalMemory,
      hitRate: `${((this.cache.size / this.maxEntries) * 100).toFixed(0)}%`,
    };
  }
}
