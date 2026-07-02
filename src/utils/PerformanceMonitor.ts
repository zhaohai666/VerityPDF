/**
 * Performance monitoring system for VerityPDF
 * Collects real usage data for progressive optimization
 */

export interface PerformanceMetric {
  name: string;
  value: number;
  timestamp: number;
  category: 'load' | 'interaction' | 'memory' | 'network' | 'custom';
  metadata?: Record<string, any>;
}

export interface UserSession {
  sessionId: string;
  userId?: string;
  startTime: number;
  deviceInfo: DeviceInfo;
  userAgent: string;
  connectionType?: string;
  metrics: PerformanceMetric[];
  events: UserEvent[];
  errors: ErrorReport[];
}

export interface DeviceInfo {
  memory?: number;
  cores?: number;
  deviceType: 'desktop' | 'mobile' | 'tablet';
  browser: string;
  os: string;
  viewport: { width: number; height: number };
}

export interface UserEvent {
  type: string;
  timestamp: number;
  duration?: number;
  metadata?: Record<string, any>;
}

export interface ErrorReport {
  message: string;
  stack?: string;
  timestamp: number;
  context?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private session: UserSession | null = null;
  private metricsQueue: PerformanceMetric[] = [];
  private isEnabled = true;
  private batchSize = 10;
  private flushInterval = 30000; // 30 seconds
  private flushTimer: NodeJS.Timeout | null = null;

  private constructor() {
    this.initializeSession();
    this.setupGlobalErrorHandling();
    this.setupVisibilityChangeHandling();
  }

  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  private initializeSession() {
    const sessionId = this.generateSessionId();
    const deviceInfo = this.getDeviceInfo();
    
    this.session = {
      sessionId,
      startTime: Date.now(),
      deviceInfo,
      userAgent: navigator.userAgent,
      connectionType: (navigator as any).connection?.effectiveType,
      metrics: [],
      events: [],
      errors: []
    };

    this.recordMetric('session_start', 0, 'load', {
      sessionId,
      deviceInfo
    });
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  private getDeviceInfo(): DeviceInfo {
    const nav = navigator as any;
    
    return {
      memory: nav.deviceMemory,
      cores: nav.hardwareConcurrency,
      deviceType: this.getDeviceType(),
      browser: this.getBrowser(),
      os: this.getOS(),
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      }
    };
  }

  private getDeviceType(): 'desktop' | 'mobile' | 'tablet' {
    const ua = navigator.userAgent;
    if (/Mobile|Android|iPhone|iPad|iPod/.test(ua)) {
      if (/Tablet|iPad|Android/.test(ua) && !/Mobile/.test(ua)) {
        return 'tablet';
      }
      return 'mobile';
    }
    return 'desktop';
  }

  private getBrowser(): string {
    const ua = navigator.userAgent;
    if (ua.includes('Chrome') && !ua.includes('Edg')) return 'Chrome';
    if (ua.includes('Firefox')) return 'Firefox';
    if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari';
    if (ua.includes('Edg')) return 'Edge';
    if (ua.includes('Opera') || ua.includes('OPR')) return 'Opera';
    return 'Unknown';
  }

  private getOS(): string {
    const ua = navigator.userAgent;
    if (ua.includes('Windows')) return 'Windows';
    if (ua.includes('Mac')) return 'macOS';
    if (ua.includes('Linux')) return 'Linux';
    if (ua.includes('Android')) return 'Android';
    if (ua.includes('iOS')) return 'iOS';
    return 'Unknown';
  }

  recordMetric(
    name: string, 
    value: number, 
    category: PerformanceMetric['category'], 
    metadata?: Record<string, any>
  ) {
    if (!this.isEnabled || !this.session) return;

    const metric: PerformanceMetric = {
      name,
      value,
      timestamp: Date.now(),
      category,
      metadata
    };

    this.metricsQueue.push(metric);
    this.session.metrics.push(metric);

    if (this.metricsQueue.length >= this.batchSize) {
      this.flushMetrics();
    }
  }

  recordEvent(type: string, duration?: number, metadata?: Record<string, any>) {
    if (!this.isEnabled || !this.session) return;

    const event: UserEvent = {
      type,
      timestamp: Date.now(),
      duration,
      metadata
    };

    this.session.events.push(event);
  }

  recordError(message: string, stack?: string, context?: string, severity: ErrorReport['severity'] = 'medium') {
    if (!this.isEnabled || !this.session) return;

    const error: ErrorReport = {
      message,
      stack,
      timestamp: Date.now(),
      context,
      severity
    };

    this.session.errors.push(error);

    // Flush immediately for critical errors
    if (severity === 'critical') {
      this.flushMetrics(true);
    }
  }

  measureTime<T extends (...args: any[]) => any>(
    func: T, 
    name: string, 
    category: PerformanceMetric['category'] = 'interaction'
  ): T {
    return ((...args: Parameters<T>) => {
      const start = performance.now();
      try {
        const result = func(...args);
        
        if (result instanceof Promise) {
          return result.then((res) => {
            const duration = performance.now() - start;
            this.recordMetric(`${name}_duration`, duration, category);
            return res;
          }).catch((error) => {
            const duration = performance.now() - start;
            this.recordMetric(`${name}_error_duration`, duration, category, {
              error: error.message
            });
            throw error;
          });
        } else {
          const duration = performance.now() - start;
          this.recordMetric(`${name}_duration`, duration, category);
          return result;
        }
      } catch (error) {
        const duration = performance.now() - start;
        this.recordError(
          `Error in ${name}: ${(error as Error).message}`,
          (error as Error).stack,
          undefined,
          'high'
        );
        this.recordMetric(`${name}_error_duration`, duration, category);
        throw error;
      }
    }) as T;
  }

  private setupGlobalErrorHandling() {
    window.addEventListener('error', (event) => {
      this.recordError(
        event.message,
        event.error?.stack,
        `${event.filename}:${event.lineno}:${event.colno}`,
        'critical'
      );
    });

    window.addEventListener('unhandledrejection', (event) => {
      this.recordError(
        `Unhandled Promise Rejection: ${event.reason}`,
        event.reason?.stack,
        'unhandledrejection',
        'medium'
      );
    });

    // Memory pressure monitoring
    if ('memory' in performance) {
      setInterval(() => {
        const memInfo = (performance as any).memory;
        if (memInfo) {
          this.recordMetric('js_heap_size_used', memInfo.usedJSHeapSize, 'memory');
          this.recordMetric('js_heap_size_total', memInfo.totalJSHeapSize, 'memory');
          
          // Alert on high memory usage
          if (memInfo.usedJSHeapSize / memInfo.totalJSHeapSize > 0.9) {
            this.recordMetric('memory_high_usage', 1, 'memory', {
              used: memInfo.usedJSHeapSize,
              total: memInfo.totalJSHeapSize,
              percentage: (memInfo.usedJSHeapSize / memInfo.totalJSHeapSize * 100).toFixed(2)
            });
          }
        }
      }, 10000); // Every 10 seconds
    }
  }

  private setupVisibilityChangeHandling() {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.recordEvent('page_hidden');
        this.flushMetrics(true);
      } else {
        this.recordEvent('page_visible');
      }
    });

    window.addEventListener('beforeunload', () => {
      this.recordEvent('session_end', Date.now() - (this.session?.startTime || Date.now()));
      this.flushMetrics(true);
    });
  }

  private async flushMetrics(force = false) {
    if (!this.metricsQueue.length) return;

    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    const metrics = [...this.metricsQueue];
    this.metricsQueue = [];

    try {
      // In production, send to analytics endpoint
      await this.sendMetricsToServer(metrics);
      console.log(`[PerformanceMonitor] Flushed ${metrics.length} metrics`);
    } catch (error) {
      console.warn('[PerformanceMonitor] Failed to flush metrics:', error);
      // Re-queue metrics on failure if not forced
      if (!force) {
        this.metricsQueue.unshift(...metrics);
      }
    }

    if (!force && this.isEnabled) {
      this.scheduleNextFlush();
    }
  }

  private scheduleNextFlush() {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushMetrics();
    }, this.flushInterval);
  }

  private async sendMetricsToServer(metrics: PerformanceMetric[]) {
    // For demo purposes, store in localStorage
    // In production, send to analytics service
    const existingData = localStorage.getItem('verity_performance_data');
    const data = existingData ? JSON.parse(existingData) : [];
    
    data.push({
      sessionId: this.session?.sessionId,
      timestamp: Date.now(),
      metrics
    });

    // Keep only last 100 sessions to avoid localStorage overflow
    const trimmedData = data.slice(-100);
    localStorage.setItem('verity_performance_data', JSON.stringify(trimmedData));

    // In production, you would use:
    // await fetch('/api/analytics/performance', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({
    //     sessionId: this.session?.sessionId,
    //     metrics
    //   })
    // });
  }

  // Public APIs for manual instrumentation
  startLoadTiming(operation: string) {
    const start = performance.now();
    return {
      end: () => {
        const duration = performance.now() - start;
        this.recordMetric(`${operation}_load_time`, duration, 'load');
        return duration;
      }
    };
  }

  trackFeatureUsage(feature: string, action: string, metadata?: Record<string, any>) {
    this.recordEvent('feature_usage', undefined, {
      feature,
      action,
      ...metadata
    });
  }

  getSessionData(): UserSession | null {
    return this.session;
  }

  enable() {
    this.isEnabled = true;
  }

  disable() {
    this.isEnabled = false;
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }
}

export const performanceMonitor = PerformanceMonitor.getInstance();

// Helper function for easy usage
export function trackPerformance<T extends (...args: any[]) => any>(
  name: string,
  func: T,
  category: PerformanceMetric['category'] = 'custom'
): T {
  return performanceMonitor.measureTime(func, name, category);
}

// React Hook for component performance monitoring
import { useEffect, useRef } from 'react';

export function usePerformanceMonitoring(componentName: string) {
  const mountTime = useRef<number>(Date.now());

  useEffect(() => {
    const mountDuration = Date.now() - mountTime.current;
    performanceMonitor.recordMetric(`${componentName}_mount_time`, mountDuration, 'load');
    performanceMonitor.recordEvent('component_mounted', undefined, { componentName });

    return () => {
      const unmountTime = Date.now();
      const totalLifeTime = unmountTime - mountTime.current;
      performanceMonitor.recordMetric(`${componentName}_lifetime`, totalLifeTime, 'interaction');
      performanceMonitor.recordEvent('component_unmounted', undefined, { componentName });
    };
  }, [componentName]);

  return {
    trackInteraction: (action: string, metadata?: Record<string, any>) => {
      performanceMonitor.trackFeatureUsage(componentName, action, metadata);
    },
    measureTime: <T extends (...args: any[]) => any>(func: T, operation: string) => {
      return performanceMonitor.measureTime(func, `${componentName}_${operation}`, 'interaction');
    }
  };
}