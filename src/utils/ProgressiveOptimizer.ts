/**
 * Progressive Optimization System for VerityPDF
 * Simplified implementation that works with the current codebase
 */

export interface OptimizationMetric {
  name: string;
  value: number;
  timestamp: number;
  category: 'performance' | 'usage' | 'error' | 'memory';
  metadata?: Record<string, any>;
}

export interface UsagePattern {
  userId: string;
  features: Record<string, number>;
  lastActive: number;
  avgSessionDuration: number;
}

export interface OptimizationRule {
  id: string;
  name: string;
  condition: {
    metric: string;
    operator: '>' | '<' | '==' | 'trend_up' | 'trend_down';
    threshold: number;
  };
  action: {
    type: 'enable_feature' | 'disable_feature' | 'adjust_setting' | 'create_experiment';
    config: Record<string, any>;
  };
  enabled: boolean;
}

export interface PerformanceInsight {
  id: string;
  type: 'performance' | 'optimization' | 'error';
  title: string;
  description: string;
  impact: 'low' | 'medium' | 'high';
  recommendation: string;
  confidence: number;
  createdAt: number;
}

class ProgressiveOptimizer {
  private static instance: ProgressiveOptimizer;
  private metrics: OptimizationMetric[] = [];
  private patterns: Map<string, UsagePattern> = new Map();
  private rules: Map<string, OptimizationRule> = new Map();
  private insights: PerformanceInsight[] = [];

  static getInstance(): ProgressiveOptimizer {
    if (!ProgressiveOptimizer.instance) {
      ProgressiveOptimizer.instance = new ProgressiveOptimizer();
    }
    return ProgressiveOptimizer.instance;
  }

  constructor() {
    this.loadData();
    this.initializeDefaultRules();
    this.startOptimizationLoop();
  }

  // Record performance metric
  recordMetric(name: string, value: number, category: OptimizationMetric['category'], metadata?: Record<string, any>) {
    const metric: OptimizationMetric = {
      name,
      value,
      timestamp: Date.now(),
      category,
      metadata
    };

    this.metrics.push(metric);
    
    // Keep only recent metrics (last 1000)
    if (this.metrics.length > 1000) {
      this.metrics = this.metrics.slice(-1000);
    }

    // Check rules when new metric is recorded
    this.checkRules(name, value);
    
    this.saveData();
  }

  // Record usage pattern
  recordUsage(userId: string, features: string[], sessionDuration: number) {
    let pattern = this.patterns.get(userId);
    
    if (!pattern) {
      pattern = {
        userId,
        features: {},
        lastActive: Date.now(),
        avgSessionDuration: sessionDuration
      };
    }

    // Update feature usage counts
    features.forEach(feature => {
      pattern!.features[feature] = (pattern!.features[feature] || 0) + 1;
    });

    pattern.lastActive = Date.now();
    pattern.avgSessionDuration = (pattern.avgSessionDuration + sessionDuration) / 2;

    this.patterns.set(userId, pattern);
    this.saveData();
  }

  // Create optimization rule
  createRule(config: Omit<OptimizationRule, 'id'>): OptimizationRule {
    const rule: OptimizationRule = {
      ...config,
      id: this.generateId()
    };

    this.rules.set(rule.id, rule);
    this.saveData();
    
    return rule;
  }

  // Generate performance insight
  private generateInsight(
    type: PerformanceInsight['type'],
    title: string,
    description: string,
    impact: PerformanceInsight['impact'],
    recommendation: string
  ): PerformanceInsight {
    const insight: PerformanceInsight = {
      id: this.generateId(),
      type,
      title,
      description,
      impact,
      recommendation,
      confidence: this.calculateConfidence(type),
      createdAt: Date.now()
    };

    this.insights.unshift(insight);
    
    // Keep only recent insights (last 50)
    if (this.insights.length > 50) {
      this.insights = this.insights.slice(0, 50);
    }

    this.saveData();
    return insight;
  }

  // Check optimization rules
  private checkRules(metricName: string, value: number) {
    this.rules.forEach((rule) => {
      if (!rule.enabled || rule.condition.metric !== metricName) return;

      const conditionMet = this.evaluateCondition(rule.condition, value);
      if (conditionMet) {
        this.executeRuleAction(rule);
      }
    });
  }

  private evaluateCondition(condition: OptimizationRule['condition'], value: number): boolean {
    switch (condition.operator) {
      case '>':
        return value > condition.threshold;
      case '<':
        return value < condition.threshold;
      case '==':
        return value === condition.threshold;
      case 'trend_up':
        return this.checkTrend(condition.metric, 'up');
      case 'trend_down':
        return this.checkTrend(condition.metric, 'down');
      default:
        return false;
    }
  }

  private checkTrend(metricName: string, direction: 'up' | 'down'): boolean {
    const recentMetrics = this.metrics
      .filter(m => m.name === metricName)
      .slice(-10); // Last 10 values

    if (recentMetrics.length < 3) return false;

    const values = recentMetrics.map(m => m.value);
    const firstHalf = values.slice(0, Math.floor(values.length / 2));
    const secondHalf = values.slice(Math.floor(values.length / 2));

    const firstAvg = firstHalf.reduce((sum, val) => sum + val, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, val) => sum + val, 0) / secondHalf.length;

    if (direction === 'up') {
      return secondAvg > firstAvg * 1.1; // 10% increase
    } else {
      return secondAvg < firstAvg * 0.9; // 10% decrease
    }
  }

  private executeRuleAction(rule: OptimizationRule) {
    console.log(`[ProgressiveOptimizer] Executing rule: ${rule.name}`);
    
    switch (rule.action.type) {
      case 'enable_feature':
        this.enableFeature(rule.action.config.featureId);
        break;
      case 'disable_feature':
        this.disableFeature(rule.action.config.featureId);
        break;
      case 'adjust_setting':
        this.adjustSetting(rule.action.config.setting, rule.action.config.value);
        break;
      case 'create_experiment':
        this.createExperiment(rule.action.config);
        break;
    }

    this.recordMetric(`rule_executed_${rule.id}`, 1, 'usage', {
      ruleName: rule.name,
      actionType: rule.action.type
    });
  }

  private enableFeature(featureId: string) {
    console.log(`[ProgressiveOptimizer] Enabling feature: ${featureId}`);
    // Implementation would enable feature flag
  }

  private disableFeature(featureId: string) {
    console.log(`[ProgressiveOptimizer] Disabling feature: ${featureId}`);
    // Implementation would disable feature flag
  }

  private adjustSetting(setting: string, value: any) {
    console.log(`[ProgressiveOptimizer] Adjusting setting: ${setting} = ${value}`);
    // Implementation would adjust application setting
  }

  private createExperiment(config: Record<string, any>) {
    console.log(`[ProgressiveOptimizer] Creating experiment:`, config);
    // Implementation would create A/B test
  }

  // Start continuous optimization loop
  private startOptimizationLoop() {
    // Run optimization analysis every 5 minutes
    setInterval(() => this.runOptimizationAnalysis(), 5 * 60 * 1000);
    
    // Initial analysis after 30 seconds
    setTimeout(() => this.runOptimizationAnalysis(), 30000);
  }

  private runOptimizationAnalysis() {
    console.log('[ProgressiveOptimizer] Running optimization analysis...');
    
    try {
      this.analyzePerformanceMetrics();
      this.analyzeUsagePatterns();
      this.generateRecommendations();
    } catch (error) {
      console.error('[ProgressiveOptimizer] Analysis failed:', error);
    }
  }

  private analyzePerformanceMetrics() {
    const performanceMetrics = this.metrics.filter(m => m.category === 'performance');
    
    if (performanceMetrics.length === 0) return;

    // Analyze load times
    const loadTimeMetrics = performanceMetrics.filter(m => m.name.includes('load_time'));
    if (loadTimeMetrics.length > 5) {
      const avgLoadTime = loadTimeMetrics.reduce((sum, m) => sum + m.value, 0) / loadTimeMetrics.length;
      
      if (avgLoadTime > 3000) {
        this.generateInsight(
          'performance',
          'High Load Time Detected',
          `Average load time is ${avgLoadTime.toFixed(0)}ms, exceeding the 3000ms threshold.`,
          'high',
          'Consider implementing lazy loading, code splitting, or optimizing critical rendering path.'
        );
      }
    }

    // Analyze memory usage
    const memoryMetrics = performanceMetrics.filter(m => m.name.includes('memory'));
    if (memoryMetrics.length > 5 && this.checkTrend('memory_usage', 'up')) {
      this.generateInsight(
        'performance',
        'Memory Usage Increasing',
        'Memory usage shows an upward trend, indicating potential memory leaks.',
        'medium',
        'Implement memory leak detection, review data cleanup patterns, and optimize memory-intensive operations.'
      );
    }
  }

  private analyzeUsagePatterns() {
    if (this.patterns.size === 0) return;

    // Find most used features
    const featureUsage: Record<string, number> = {};
    this.patterns.forEach(pattern => {
      Object.entries(pattern.features).forEach(([feature, count]) => {
        featureUsage[feature] = (featureUsage[feature] || 0) + count;
      });
    });

    const topFeatures = Object.entries(featureUsage)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    topFeatures.forEach(([feature, usage]) => {
      if (usage > 10) { // Used more than 10 times
        this.generateInsight(
          'optimization',
          `High Usage: ${feature}`,
          `Feature "${feature}" is frequently used (${usage} times).`,
          'medium',
          'Consider optimizing this feature for better performance and user experience.'
        );
      }
    });
  }

  private generateRecommendations() {
    const recentMetrics = this.metrics.filter(m => 
      m.timestamp > Date.now() - 24 * 60 * 60 * 1000 // Last 24 hours
    );

    if (recentMetrics.length === 0) return;

    // Check for error spikes
    const errorMetrics = recentMetrics.filter(m => m.category === 'error');
    if (errorMetrics.length > 5) {
      const errorRate = errorMetrics.length / recentMetrics.length;
      if (errorRate > 0.1) { // More than 10% error rate
        this.generateInsight(
          'error',
          'High Error Rate',
          `Error rate is ${(errorRate * 100).toFixed(1)}%, which is above the acceptable threshold.`,
          'high',
          'Implement better error handling, add user-friendly error messages, and improve error recovery mechanisms.'
        );
      }
    }

    // Usage recommendations
    const activeUsers = Array.from(this.patterns.values()).filter(p => 
      p.lastActive > Date.now() - 24 * 60 * 60 * 1000
    ).length;

    if (activeUsers > 0) {
      const avgSessionDuration = Array.from(this.patterns.values())
        .filter(p => p.lastActive > Date.now() - 24 * 60 * 60 * 1000)
        .reduce((sum, p) => sum + p.avgSessionDuration, 0) / activeUsers;

      if (avgSessionDuration < 300000) { // Less than 5 minutes
        this.generateInsight(
          'optimization',
          'Short Session Duration',
          `Average session duration is ${(avgSessionDuration / 60000).toFixed(1)} minutes.`,
          'low',
          'Consider improving onboarding, reducing friction, or adding engaging features to increase user retention.'
        );
      }
    }
  }

  private calculateConfidence(type: string): number {
    // Simplified confidence calculation based on data availability
    switch (type) {
      case 'performance':
        return this.metrics.length > 10 ? 0.9 : 0.6;
      case 'usage':
        return this.patterns.size > 3 ? 0.8 : 0.5;
      case 'error':
        return this.metrics.filter(m => m.category === 'error').length > 2 ? 0.85 : 0.4;
      default:
        return 0.5;
    }
  }

  private initializeDefaultRules() {
    // Only add default rules if none exist
    if (this.rules.size > 0) return;

    // Rule: High error rate alert
    this.createRule({
      name: 'High Error Rate Response',
      condition: {
        metric: 'error_rate',
        operator: '>',
        threshold: 0.1
      },
      action: {
        type: 'create_experiment',
        config: {
          experimentType: 'error_reduction',
          strategies: ['better_error_handling', 'improved_validation']
        }
      },
      enabled: true
    });

    // Rule: Performance degradation response
    this.createRule({
      name: 'Performance Degradation Response',
      condition: {
        metric: 'load_time',
        operator: 'trend_up',
        threshold: 0
      },
      action: {
        type: 'adjust_setting',
        config: {
          setting: 'enable_optimizations',
          value: true
        }
      },
      enabled: true
    });

    // Rule: High memory usage
    this.createRule({
      name: 'Memory Usage Alert',
      condition: {
        metric: 'memory_usage',
        operator: '>',
        threshold: 500000000 // 500MB
      },
      action: {
        type: 'adjust_setting',
        config: {
          setting: 'memory_optimization',
          value: 'aggressive'
        }
      },
      enabled: true
    });
  }

  private generateId(): string {
    return `opt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  private loadData() {
    try {
      // Load metrics
      const metricsData = localStorage.getItem('progressive_optimizer_metrics');
      if (metricsData) {
        this.metrics = JSON.parse(metricsData);
      }

      // Load patterns
      const patternsData = localStorage.getItem('progressive_optimizer_patterns');
      if (patternsData) {
        const patterns = JSON.parse(patternsData);
        this.patterns = new Map(patterns.map((p: any) => [p.userId, p]));
      }

      // Load rules
      const rulesData = localStorage.getItem('progressive_optimizer_rules');
      if (rulesData) {
        const rules = JSON.parse(rulesData);
        this.rules = new Map(rules.map((r: any) => [r.id, r]));
      }

      // Load insights
      const insightsData = localStorage.getItem('progressive_optimizer_insights');
      if (insightsData) {
        this.insights = JSON.parse(insightsData);
      }
    } catch (error) {
      console.warn('[ProgressiveOptimizer] Failed to load data:', error);
    }
  }

  private saveData() {
    try {
      // Save metrics
      localStorage.setItem('progressive_optimizer_metrics', JSON.stringify(this.metrics));

      // Save patterns
      const patterns = Array.from(this.patterns.values());
      localStorage.setItem('progressive_optimizer_patterns', JSON.stringify(patterns));

      // Save rules
      const rules = Array.from(this.rules.values());
      localStorage.setItem('progressive_optimizer_rules', JSON.stringify(rules));

      // Save insights
      localStorage.setItem('progressive_optimizer_insights', JSON.stringify(this.insights));
    } catch (error) {
      console.warn('[ProgressiveOptimizer] Failed to save data:', error);
    }
  }

  // Public APIs
  getMetrics(): OptimizationMetric[] {
    return [...this.metrics];
  }

  getPatterns(): UsagePattern[] {
    return Array.from(this.patterns.values());
  }

  getRules(): OptimizationRule[] {
    return Array.from(this.rules.values());
  }

  getInsights(): PerformanceInsight[] {
    return [...this.insights];
  }

  getRecentMetrics(limit = 50): OptimizationMetric[] {
    return this.metrics.slice(-limit);
  }

  getUserPattern(userId: string): UsagePattern | undefined {
    return this.patterns.get(userId);
  }

  toggleRule(id: string, enabled: boolean): boolean {
    const rule = this.rules.get(id);
    if (rule) {
      rule.enabled = enabled;
      this.rules.set(id, rule);
      this.saveData();
      return true;
    }
    return false;
  }

  deleteRule(id: string): boolean {
    const deleted = this.rules.delete(id);
    if (deleted) {
      this.saveData();
    }
    return deleted;
  }

  clearMetrics(): void {
    this.metrics = [];
    this.saveData();
  }

  exportData(): string {
    return JSON.stringify({
      metrics: this.metrics,
      patterns: Array.from(this.patterns.values()),
      rules: Array.from(this.rules.values()),
      insights: this.insights
    }, null, 2);
  }

  importData(jsonData: string): boolean {
    try {
      const data = JSON.parse(jsonData);
      
      if (data.metrics) this.metrics = data.metrics;
      if (data.patterns) {
        this.patterns = new Map(data.patterns.map((p: any) => [p.userId, p]));
      }
      if (data.rules) {
        this.rules = new Map(data.rules.map((r: any) => [r.id, r]));
      }
      if (data.insights) this.insights = data.insights;

      this.saveData();
      return true;
    } catch (error) {
      console.error('[ProgressiveOptimizer] Failed to import data:', error);
      return false;
    }
  }

  // Utility methods for creating common metrics
  recordLoadTime(operation: string, duration: number) {
    this.recordMetric(`${operation}_load_time`, duration, 'performance', { operation });
  }

  recordMemoryUsage(amount: number) {
    this.recordMetric('memory_usage', amount, 'memory');
  }

  recordError(message: string, context?: string) {
    this.recordMetric('error_rate', 1, 'error', { message, context });
  }

  recordFeatureUsage(feature: string, duration?: number) {
    this.recordMetric(`feature_usage_${feature}`, 1, 'usage', { feature, duration });
  }
}

export const progressiveOptimizer = ProgressiveOptimizer.getInstance();

// Helper function for easy metric recording
export function trackPerformance(name: string, duration: number, category: OptimizationMetric['category'] = 'performance') {
  progressiveOptimizer.recordMetric(name, duration, category);
}

// Helper for measuring function execution time
export function measureFunction<T extends (...args: any[]) => any>(
  func: T,
  name: string
): T {
  return ((...args: Parameters<T>) => {
    const start = performance.now();
    try {
      const result = func(...args);
      
      if (result instanceof Promise) {
        return result.then((res) => {
          const duration = performance.now() - start;
          trackPerformance(name, duration);
          return res;
        });
      } else {
        const duration = performance.now() - start;
        trackPerformance(name, duration);
        return result;
      }
    } catch (error) {
      const duration = performance.now() - start;
      progressiveOptimizer.recordError(
        `Error in ${name}: ${(error as Error).message}`
      );
      trackPerformance(`${name}_error`, duration);
      throw error;
    }
  }) as T;
}