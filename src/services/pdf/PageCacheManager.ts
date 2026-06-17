import type { PageCacheEntry } from '@/types';
import { Logger } from '@/utils';

const logger = new Logger('PageCache');

/**
 * LRU 页面缓存管理器
 * 最大缓存 15 页，总内存不超过 256MB
 */
export class PageCacheManager {
  private cache = new Map<string, PageCacheEntry>();
  private maxEntries: number;
  private maxMemory: number;

  constructor(maxEntries = 15, maxMemoryMB = 256) {
    this.maxEntries = maxEntries;
    this.maxMemory = maxMemoryMB * 1024 * 1024;
  }

  private makeKey(pageNumber: number, scale: number, rotation: number): string {
    return `${pageNumber}_${scale.toFixed(2)}_${rotation}`;
  }

  /**
   * 获取缓存的页面
   */
  get(pageNumber: number, scale: number, rotation: number): PageCacheEntry | undefined {
    const key = this.makeKey(pageNumber, scale, rotation);
    const entry = this.cache.get(key);
    if (entry) {
      // 更新访问时间（LRU）
      entry.timestamp = Date.now();
      logger.debug(`Cache hit: page ${pageNumber}`);
    }
    return entry;
  }

  /**
   * 缓存页面
   */
  set(pageNumber: number, canvas: HTMLCanvasElement, scale: number, rotation: number): void {
    const key = this.makeKey(pageNumber, scale, rotation);
    const estimatedSize = canvas.width * canvas.height * 4; // RGBA 4 bytes per pixel

    // 淘汰旧条目
    this.evictIfNeeded(estimatedSize);

    this.cache.set(key, {
      pageNumber,
      canvas,
      scale,
      rotation: rotation as 0 | 90 | 180 | 270,
      timestamp: Date.now(),
      size: estimatedSize,
    });

    logger.debug(`Cache set: page ${pageNumber} (${this.cache.size}/${this.maxEntries})`);
  }

  /**
   * LRU 淘汰
   */
  private evictIfNeeded(incomingSize: number): void {
    // 淘汰过期条目
    while (this.cache.size >= this.maxEntries) {
      this.evictLRU();
    }

    // 检查内存限制
    let totalMemory = this.getTotalMemory() + incomingSize;
    while (totalMemory > this.maxMemory && this.cache.size > 0) {
      this.evictLRU();
      totalMemory = this.getTotalMemory() + incomingSize;
    }
  }

  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      logger.debug(`Cache evict: ${oldestKey}`);
    }
  }

  /**
   * 使特定页面的缓存失效（缩放/旋转变化时）
   */
  invalidate(pageNumber: number): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${pageNumber}_`)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * 清空缓存
   */
  clear(): void {
    this.cache.clear();
    logger.info('Cache cleared');
  }

  getTotalMemory(): number {
    let total = 0;
    for (const entry of this.cache.values()) {
      total += entry.size;
    }
    return total;
  }

  get size(): number {
    return this.cache.size;
  }

  getStats(): { size: number; memory: number; hitRate: string } {
    return {
      size: this.cache.size,
      memory: this.getTotalMemory(),
      hitRate: `${((this.cache.size / this.maxEntries) * 100).toFixed(0)}%`,
    };
  }
}
