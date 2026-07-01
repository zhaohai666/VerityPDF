import { getQuickJS } from 'quickjs-emscripten';
import type { QuickJSWASMModule, QuickJSContext, QuickJSRuntime, QuickJSHandle, DisposableSuccess } from 'quickjs-emscripten';

/** 脚本执行结果 */
export interface ScriptResult {
  success: boolean;
  result?: any;
  error?: string;
  stdout: string[];
  stderr: string[];
  executionTime: number;
}

/** 脚本执行选项 */
export interface ScriptOptions {
  /** 最大执行时间 (ms), 默认 5000 */
  timeout?: number;
  /** 最大内存 (bytes), 默认 10MB */
  memoryLimit?: number;
  /** 传入脚本的上下文数据 */
  context?: Record<string, any>;
  /** 允许的模块列表 */
  allowedModules?: string[];
}

/** 脚本引擎统计信息 */
export interface ScriptEngineStats {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageExecutionTime: number;
}

/**
 * QuickJS 脚本执行引擎
 * 提供安全的沙箱环境执行 JavaScript 脚本
 */
export class ScriptEngineService {
  private quickjs: QuickJSWASMModule | null = null;
  private stats: ScriptEngineStats = {
    totalExecutions: 0,
    successfulExecutions: 0,
    failedExecutions: 0,
    averageExecutionTime: 0,
  };

  /**
   * 初始化 QuickJS 引擎
   */
  async initialize(): Promise<void> {
    if (this.quickjs) return;
    this.quickjs = await getQuickJS();
  }

  /**
   * 执行 JavaScript 脚本
   */
  async executeScript(code: string, options: ScriptOptions = {}): Promise<ScriptResult> {
    await this.initialize();

    const startTime = Date.now();
    const stdout: string[] = [];
    const stderr: string[] = [];

    let vm: QuickJSContext | null = null;
    let runtime: QuickJSRuntime | null = null;

    try {
      if (!this.quickjs) throw new Error('QuickJS 引擎未初始化');

      // Create runtime first to set memory/timeout limits
      runtime = this.quickjs.newRuntime();
      const memoryLimit = options.memoryLimit || 10 * 1024 * 1024; // 10MB
      runtime.setMemoryLimit(memoryLimit);

      // Set execution timeout via interrupt handler
      const timeout = options.timeout || 5000; // 5s
      const deadline = Date.now() + timeout;
      runtime.setInterruptHandler(() => Date.now() > deadline);

      vm = runtime.newContext();

      // Inject console
      this.injectConsole(vm, stdout, stderr);

      // Inject context data
      if (options.context) {
        this.injectContext(vm, options.context);
      }

      // Inject PDF utility helpers
      this.injectPdfHelpers(vm);

      // Execute the script
      const result = vm.evalCode(code);

      // Check for errors
      if (result.error) {
        const errorVal = result.error.consume((handle) => vm!.dump(handle));
        const executionTime = Date.now() - startTime;
        this.updateStats(false, executionTime);
        return {
          success: false,
          error: typeof errorVal === 'object' && errorVal !== null ? (errorVal as any).message || JSON.stringify(errorVal) : String(errorVal),
          stdout,
          stderr,
          executionTime,
        };
      }

      // Get result value (after error check, result is DisposableSuccess)
      const resultValue = (result as DisposableSuccess<QuickJSHandle>).value.consume((handle) => vm!.dump(handle));
      const executionTime = Date.now() - startTime;
      this.updateStats(true, executionTime);

      return {
        success: true,
        result: resultValue,
        stdout,
        stderr,
        executionTime,
      };
    } catch (err: any) {
      const executionTime = Date.now() - startTime;
      this.updateStats(false, executionTime);

      return {
        success: false,
        error: err.message || String(err),
        stdout,
        stderr,
        executionTime,
      };
    } finally {
      if (vm) {
        vm.dispose();
      }
      if (runtime) {
        runtime.dispose();
      }
    }
  }

  /**
   * 验证脚本语法（不执行）
   */
  async validateScript(code: string): Promise<{ valid: boolean; error?: string }> {
    await this.initialize();

    let vm: QuickJSContext | null = null;
    try {
      if (!this.quickjs) throw new Error('QuickJS 引擎未初始化');

      vm = this.quickjs.newContext();
      // Use evalCode with parse-only approach: wrap in a function
      const result = vm.evalCode(`(function() { ${code} })`);
      if (result.error) {
        const errorVal = result.error.consume((handle) => vm!.dump(handle));
        return {
          valid: false,
          error: typeof errorVal === 'object' && errorVal !== null ? (errorVal as any).message || JSON.stringify(errorVal) : String(errorVal),
        };
      }
      (result as DisposableSuccess<QuickJSHandle>).value.dispose();
      return { valid: true };
    } catch (err: any) {
      return { valid: false, error: err.message || String(err) };
    } finally {
      if (vm) vm.dispose();
    }
  }

  /**
   * 获取引擎统计信息
   */
  getStats(): ScriptEngineStats {
    return { ...this.stats };
  }

  /**
   * 重置统计信息
   */
  resetStats(): void {
    this.stats = {
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      averageExecutionTime: 0,
    };
  }

  /**
   * 释放引擎资源
   */
  dispose(): void {
    this.quickjs = null;
  }

  // ---- Private methods ----

  private injectConsole(vm: QuickJSContext, stdout: string[], stderr: string[]): void {
    const logFn = vm.newFunction('log', (...args: QuickJSHandle[]) => {
      const parts = args.map((arg) => {
        try {
          return String(vm.dump(arg));
        } catch {
          return '[unknown]';
        }
      });
      stdout.push(parts.join(' '));
      return vm.undefined;
    });

    const warnFn = vm.newFunction('warn', (...args: QuickJSHandle[]) => {
      const parts = args.map((arg) => {
        try {
          return String(vm.dump(arg));
        } catch {
          return '[unknown]';
        }
      });
      stderr.push(parts.join(' '));
      return vm.undefined;
    });

    const errorFn = vm.newFunction('error', (...args: QuickJSHandle[]) => {
      const parts = args.map((arg) => {
        try {
          return String(vm.dump(arg));
        } catch {
          return '[unknown]';
        }
      });
      stderr.push(parts.join(' '));
      return vm.undefined;
    });

    const consoleObj = vm.newObject();
    vm.setProp(consoleObj, 'log', logFn);
    vm.setProp(consoleObj, 'warn', warnFn);
    vm.setProp(consoleObj, 'error', errorFn);
    vm.setProp(vm.global, 'console', consoleObj);

    // Dispose function handles
    logFn.dispose();
    warnFn.dispose();
    errorFn.dispose();
    consoleObj.dispose();
  }

  private injectContext(vm: QuickJSContext, context: Record<string, any>): void {
    try {
      const contextJson = JSON.stringify(context);
      const result = vm.evalCode(`var __context = ${contextJson};`);
      if (result.error) {
        result.error.dispose();
      } else {
        (result as DisposableSuccess<QuickJSHandle>).value.dispose();
      }
    } catch {
      // If context injection fails, continue without it
    }
  }

  private injectPdfHelpers(vm: QuickJSContext): void {
    // Inject basic PDF utility helpers
    const helpers = `
      var __pdf = {
        // Convert points to mm
        pointsToMm: function(points) { return points * 25.4 / 72; },
        // Convert mm to points
        mmToPoints: function(mm) { return mm * 72 / 25.4; },
        // Convert points to inches
        pointsToInches: function(points) { return points / 72; },
        // Convert inches to points
        inchesToPoints: function(inches) { return inches * 72; },
        // Common page sizes in points
        pageSizes: {
          A4: { width: 595.28, height: 841.89 },
          A3: { width: 841.89, height: 1190.55 },
          Letter: { width: 612, height: 792 },
          Legal: { width: 612, height: 1008 },
          Tabloid: { width: 792, height: 1224 },
        },
        // Get context data
        getContext: function() { return __context || {}; }
      };
    `;

    const result = vm.evalCode(helpers);
    if (result.error) {
      result.error.dispose();
    } else {
      (result as DisposableSuccess<QuickJSHandle>).value.dispose();
    }
  }

  private updateStats(success: boolean, executionTime: number): void {
    this.stats.totalExecutions++;
    if (success) {
      this.stats.successfulExecutions++;
    } else {
      this.stats.failedExecutions++;
    }
    // Running average
    const totalTime = this.stats.averageExecutionTime * (this.stats.totalExecutions - 1) + executionTime;
    this.stats.averageExecutionTime = totalTime / this.stats.totalExecutions;
  }
}