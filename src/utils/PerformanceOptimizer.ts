/**
 * Performance optimization utilities for VerityPDF
 */

/**
 * Debounce function to limit how often a function is called
 */
export function optimizedDebounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number,
  immediate = false
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;

  return function executedFunction(this: any, ...args: Parameters<T>) {
    const context = this;

    const later = () => {
      timeout = null;
      if (!immediate) func.apply(context, args);
    };

    const callNow = immediate && !timeout;

    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(later, wait);

    if (callNow) func.apply(context, args);
  };
}

/**
 * Throttle function to limit function execution rate
 */
export function optimizedThrottle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  return function executedFunction(this: any, ...args: Parameters<T>) {
    const context = this;
    if (!inThrottle) {
      func.apply(context, args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

/**
 * Measure function execution time
 */
export function measurePerformance<T extends (...args: any[]) => any>(
  func: T,
  label: string = func.name
): (...args: Parameters<T>) => ReturnType<T> {
  return function executedFunction(this: any, ...args: Parameters<T>): ReturnType<T> {
    const start = performance.now();
    const result = func.apply(this, args);
    const end = performance.now();
    
    console.log(`%c[Performance] ${label}: ${(end - start).toFixed(2)}ms`, 
                'color: #2196F3; font-weight: bold;');
    
    return result;
  };
}

/**
 * Cache function results based on arguments
 */
export function memoizedFunction<T extends (...args: any[]) => any>(
  func: T
): (...args: Parameters<T>) => ReturnType<T> {
  const cache = new Map<string, ReturnType<T>>();
  
  return function executedFunction(this: any, ...args: Parameters<T>): ReturnType<T> {
    const key = JSON.stringify(args);
    
    if (cache.has(key)) {
      return cache.get(key)!;
    }
    
    const result = func.apply(this as any, args);
    cache.set(key, result);
    
    return result;
  };
}

/**
 * RAF-based batch update helper
 */
class BatchUpdater {
  private queuedUpdates = new Set<() => void>();
  private animationFrameId: number | null = null;

  queue(update: () => void) {
    this.queuedUpdates.add(update);
    
    if (!this.animationFrameId) {
      this.animationFrameId = requestAnimationFrame(() => {
        this.flush();
      });
    }
  }

  private flush() {
    this.animationFrameId = null;
    
    const updates = Array.from(this.queuedUpdates);
    this.queuedUpdates.clear();
    
    updates.forEach(update => update());
  }

  cancel() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.queuedUpdates.clear();
  }
}

export const batchUpdater = new BatchUpdater();

/**
 * Virtual scrolling helper for large lists
 */
export interface VirtualScrollConfig {
  itemHeight: number;
  containerHeight: number;
  totalItems: number;
  buffer?: number;
}

export interface VirtualScrollResult {
  startIndex: number;
  endIndex: number;
  visibleItems: number;
  offsetY: number;
}

export function calculateVirtualScroll({
  itemHeight,
  containerHeight,
  totalItems,
  buffer = 5
}: VirtualScrollConfig, scrollTop: number): VirtualScrollResult {
  const visibleItems = Math.ceil(containerHeight / itemHeight);
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - buffer);
  const endIndex = Math.min(totalItems - 1, startIndex + visibleItems + buffer * 2);
  const offsetY = startIndex * itemHeight;

  return {
    startIndex,
    endIndex,
    visibleItems,
    offsetY
  };
}

/**
 * Detect if user is on a low-end device
 */
export function isLowEndDevice(): boolean {
  // Check device memory
  const nav = navigator as any;
  if (nav.deviceMemory && nav.deviceMemory < 4) {
    return true;
  }

  // Check hardware concurrency
  if (nav.hardwareConcurrency && nav.hardwareConcurrency < 4) {
    return true;
  }

  // Check connection type
  if (nav.connection) {
    const connection = nav.connection;
    return connection.effectiveType === 'slow-2g' || 
           connection.effectiveType === '2g' ||
           connection.saveData === true;
  }

  return false;
}

/**
 * Conditional rendering based on device capabilities
 */
export function shouldOptimizeFor(): 'low' | 'medium' | 'high' {
  if (isLowEndDevice()) {
    return 'low';
  }

  const nav = navigator as any;
  const memory = nav.deviceMemory || 8;
  const cores = nav.hardwareConcurrency || 4;

  if (memory >= 8 && cores >= 8) {
    return 'high';
  }

  return 'medium';
}

/**
 * Image loading optimization
 */
export function createOptimizedImage(url: string, maxWidth?: number): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      if (maxWidth && img.width > maxWidth) {
        // Create canvas to resize image
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d')!;
        
        const ratio = maxWidth / img.width;
        canvas.width = maxWidth;
        canvas.height = img.height * ratio;
        
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        const resizedImg = new Image();
        resizedImg.onload = () => resolve(resizedImg);
        resizedImg.onerror = reject;
        resizedImg.src = canvas.toDataURL('image/jpeg', 0.8);
      } else {
        resolve(img);
      }
    };
    
    img.onerror = reject;
    img.src = url;
  });
}