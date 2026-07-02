import { useCallback, useRef, useEffect } from 'react';
import { optimizedDebounce, optimizedThrottle } from '@/utils/PerformanceOptimizer';

/**
 * Hook for creating debounced callbacks
 */
export function useDebounceCallback<T extends (...args: any[]) => any>(
  callback: T,
  delay: number,
  deps: any[]
): (...args: Parameters<T>) => void {
  const callbackRef = useRef(callback);
  
  // Keep the callback reference updated
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback, ...deps]);
  
  // Create the debounced function only once
  const debouncedFn = useRef(optimizedDebounce((...args: Parameters<T>) => {
    callbackRef.current(...args);
  }, delay));
  
  return debouncedFn.current;
}

/**
 * Hook for creating throttled callbacks
 */
export function useThrottleCallback<T extends (...args: any[]) => any>(
  callback: T,
  limit: number,
  deps: any[]
): (...args: Parameters<T>) => void {
  const callbackRef = useRef(callback);
  
  // Keep the callback reference updated
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback, ...deps]);
  
  // Create the throttled function only once
  const throttledFn = useRef(optimizedThrottle((...args: Parameters<T>) => {
    callbackRef.current(...args);
  }, limit));
  
  return throttledFn.current;
}

/**
 * Hook for memoized functions with custom equality check
 */
export function useMemoizedCallback<T extends (...args: any[]) => any>(
  callback: T,
  deps: any[],
  equalityFn?: (prevDeps: any[], nextDeps: any[]) => boolean
): (...args: Parameters<T>) => ReturnType<T> {
  const callbackRef = useRef(callback);
  const depsRef = useRef(deps);
  
  // Update callback reference
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback, ...deps]);
  
  // Check if deps have changed
  const depsChanged = !equalityFn 
    ? !deps.every((dep, index) => dep === depsRef.current[index])
    : !equalityFn(depsRef.current, deps);
  
  if (depsChanged) {
    depsRef.current = deps;
  }
  
  return useCallback((...args: Parameters<T>) => {
    return callbackRef.current(...args);
  }, deps);
}

/**
 * Hook for creating memoized functions with cache size limit
 */
export function useMemoizedFunction<T extends (...args: any[]) => any>(
  func: T,
  maxCacheSize = 100
): T {
  const cacheRef = useRef<Map<string, ReturnType<T>>>(new Map());
  
  return useCallback((...args: Parameters<T>): ReturnType<T> => {
    const key = JSON.stringify(args);
    
    if (cacheRef.current.has(key)) {
      return cacheRef.current.get(key)!;
    }
    
    // If cache is full, remove oldest entry
    if (cacheRef.current.size >= maxCacheSize) {
      const firstKey = cacheRef.current.keys().next().value;
      if (firstKey !== undefined) {
        cacheRef.current.delete(firstKey);
      }
    }
    
    const result = func(...args);
    cacheRef.current.set(key, result);
    
    return result;
  }, [func, maxCacheSize]) as T;
}