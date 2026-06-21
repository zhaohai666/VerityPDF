import { BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';
import { PDFDocument, degrees } from 'pdf-lib';
import { WatermarkService } from './WatermarkService';
import { EncryptionService } from '../encryption/EncryptionService';
import { LibreOfficeService, type ConvertTargetFormat } from '../convert/LibreOfficeService';
import { CompressService } from './CompressService';

/** 任务类型 */
export type TaskType = 'convert' | 'watermark' | 'encrypt' | 'compress' | 'pipeline';

/** 工作流步骤 */
export interface PipelineStep {
  type: 'watermark' | 'encrypt' | 'compress' | 'convert' | 'rotate' | 'pageNumbers';
  options: Record<string, unknown>;
  label: string;
}

/** 任务项 */
export interface TaskItem {
  id: string;
  type: TaskType;
  label: string;
  filePath: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  message: string;
  error?: string;
  startTime?: number;
  endTime?: number;
  outputDir: string;
  options: Record<string, unknown>;
  pipelineSteps?: PipelineStep[];
}

/** 队列状态 */
export interface TaskQueueStatus {
  tasks: TaskItem[];
  running: boolean;
  activeCount: number;
  completedCount: number;
  failedCount: number;
}

/**
 * 异步任务队列服务
 * 串行执行后台任务，通过 IPC 推送进度到渲染进程
 */
export class TaskQueueService {
  private queue: TaskItem[] = [];
  private processing = false;
  private abortController: AbortController | null = null;
  private mainWindow: BrowserWindow | null = null;
  private taskIdCounter = 0;

  // 内部服务实例（延迟创建）
  private watermarkService: WatermarkService | null = null;
  private encryptionService: EncryptionService | null = null;
  private libreOfficeService: LibreOfficeService | null = null;
  private compressService: CompressService | null = null;

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  private ensureServices(): void {
    if (!this.watermarkService) {
      this.watermarkService = new WatermarkService();
      if (this.mainWindow) this.watermarkService.setMainWindow(this.mainWindow);
    }
    if (!this.encryptionService) {
      this.encryptionService = new EncryptionService();
    }
    if (!this.libreOfficeService) {
      this.libreOfficeService = new LibreOfficeService();
    }
    if (!this.compressService) {
      this.compressService = new CompressService();
      if (this.mainWindow) this.compressService.setMainWindow(this.mainWindow);
    }
  }

  /** 提交任务到队列，返回任务 ID */
  submitTask(params: Omit<TaskItem, 'id' | 'status' | 'progress' | 'message'>): string {
    this.taskIdCounter++;
    const task: TaskItem = {
      ...params,
      id: `task_${Date.now()}_${this.taskIdCounter}`,
      status: 'queued',
      progress: 0,
      message: '等待中',
    };
    this.queue.push(task);
    this.sendProgress(task);
    this.processNext();
    return task.id;
  }

  /** 取消指定任务 */
  cancelTask(taskId: string): void {
    const task = this.queue.find((t) => t.id === taskId);
    if (!task) return;

    if (task.status === 'running') {
      this.abortController?.abort();
      task.status = 'cancelled';
      task.message = '已取消';
      task.endTime = Date.now();
      this.sendProgress(task);
      this.sendCompleted(task);
    } else if (task.status === 'queued') {
      task.status = 'cancelled';
      task.message = '已取消';
      task.endTime = Date.now();
      this.sendProgress(task);
      this.sendCompleted(task);
    }
  }

  /** 取消所有运行中/排队的任务 */
  cancelAll(): void {
    this.abortController?.abort();
    for (const task of this.queue) {
      if (task.status === 'running' || task.status === 'queued') {
        task.status = 'cancelled';
        task.message = '已取消';
        task.endTime = Date.now();
        this.sendProgress(task);
        this.sendCompleted(task);
      }
    }
    this.processing = false;
  }

  /** 重试失败任务（重新入队） */
  retryTask(taskId: string): string | null {
    const original = this.queue.find((t) => t.id === taskId);
    if (!original || original.status !== 'failed') return null;

    this.taskIdCounter++;
    const newTask: TaskItem = {
      ...original,
      id: `task_${Date.now()}_${this.taskIdCounter}`,
      status: 'queued',
      progress: 0,
      message: '等待中',
      error: undefined,
      startTime: undefined,
      endTime: undefined,
    };
    this.queue.push(newTask);
    this.sendProgress(newTask);
    this.processNext();
    return newTask.id;
  }

  /** 获取队列状态 */
  getQueueStatus(): TaskQueueStatus {
    return {
      tasks: this.queue.map((t) => ({ ...t })),
      running: this.processing,
      activeCount: this.queue.filter((t) => t.status === 'running').length,
      completedCount: this.queue.filter((t) => t.status === 'completed').length,
      failedCount: this.queue.filter((t) => t.status === 'failed').length,
    };
  }

  /** 清除已完成/取消/失败的任务 */
  clearCompleted(): void {
    this.queue = this.queue.filter((t) => t.status === 'running' || t.status === 'queued');
  }

  /** 移除指定任务 */
  removeTask(taskId: string): void {
    const idx = this.queue.findIndex((t) => t.id === taskId);
    if (idx !== -1) {
      const task = this.queue[idx];
      if (task.status !== 'running') {
        this.queue.splice(idx, 1);
      }
    }
  }

  // ========== 内部处理逻辑 ==========

  /** 串行处理循环 */
  private async processNext(): Promise<void> {
    if (this.processing) return;

    const nextTask = this.queue.find((t) => t.status === 'queued');
    if (!nextTask) return;

    this.processing = true;
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    nextTask.status = 'running';
    nextTask.startTime = Date.now();
    nextTask.message = '处理中...';
    nextTask.progress = 0;
    this.sendProgress(nextTask);

    try {
      this.ensureServices();

      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

      if (nextTask.type === 'pipeline' && nextTask.pipelineSteps) {
        await this.executePipeline(nextTask, signal);
      } else {
        await this.executeSingleTask(nextTask, signal);
      }

      if (signal.aborted) {
        nextTask.status = 'cancelled';
        nextTask.message = '已取消';
      } else {
        nextTask.status = 'completed';
        nextTask.progress = 100;
        nextTask.message = '完成';
      }
    } catch (err: unknown) {
      if (signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
        nextTask.status = 'cancelled';
        nextTask.message = '已取消';
      } else {
        nextTask.status = 'failed';
        nextTask.error = err instanceof Error ? err.message : String(err);
        nextTask.message = `失败: ${nextTask.error}`;
      }
    } finally {
      nextTask.endTime = Date.now();
      this.sendProgress(nextTask);
      this.sendCompleted(nextTask);
      this.abortController = null;
      this.processing = false;

      // 继续处理下一个
      setTimeout(() => this.processNext(), 50);
    }
  }

  /** 执行单类型任务 */
  private async executeSingleTask(task: TaskItem, signal: AbortSignal): Promise<void> {
    switch (task.type) {
      case 'convert':
        await this.executeConvert(task, signal);
        break;
      case 'watermark':
        await this.executeWatermark(task, signal);
        break;
      case 'encrypt':
        await this.executeEncrypt(task, signal);
        break;
      case 'compress':
        await this.executeCompress(task, signal);
        break;
      default:
        throw new Error(`未知任务类型: ${task.type}`);
    }
  }

  /** 执行工作流管线 */
  private async executePipeline(task: TaskItem, signal: AbortSignal): Promise<void> {
    const steps = task.pipelineSteps!;
    if (!steps.length) throw new Error('工作流步骤为空');

    // 读取源文件
    let currentData = fs.readFileSync(task.filePath).buffer as ArrayBuffer;
    const totalSteps = steps.length;
    const baseName = path.basename(task.filePath, path.extname(task.filePath));

    for (let i = 0; i < steps.length; i++) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

      const step = steps[i];
      const stepProgress = Math.round(((i) / totalSteps) * 100);
      task.progress = stepProgress;
      task.message = `步骤 ${i + 1}/${totalSteps}: ${step.label}`;
      this.sendProgress(task);

      currentData = await this.executeStep(currentData, step, signal);
    }

    // 保存最终结果
    const outputExt = steps[steps.length - 1].type === 'convert'
      ? `.${(steps[steps.length - 1].options.targetFormat as string) || 'pdf'}`
      : '.pdf';
    const outputPath = path.join(task.outputDir, `${baseName}_pipeline${outputExt}`);
    fs.mkdirSync(task.outputDir, { recursive: true });
    fs.writeFileSync(outputPath, Buffer.from(currentData));

    task.progress = 100;
    task.message = `完成 → ${outputPath}`;
  }

  /** 执行单个工作流步骤 */
  private async executeStep(
    pdfData: ArrayBuffer,
    step: PipelineStep,
    signal: AbortSignal
  ): Promise<ArrayBuffer> {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

    switch (step.type) {
      case 'watermark': {
        const opts = step.options as {
          type?: 'text' | 'image';
          content?: string;
          opacity?: number;
          rotation?: number;
          fontSize?: number;
          color?: string;
          position?: 'center' | 'tile';
        };
        return this.watermarkService!.addWatermark(pdfData, {
          type: opts.type || 'text',
          content: opts.content || 'CONFIDENTIAL',
          opacity: opts.opacity ?? 0.3,
          rotation: opts.rotation ?? -45,
          fontSize: opts.fontSize,
          color: opts.color,
          position: opts.position,
        });
      }

      case 'encrypt': {
        const opts = step.options as {
          userPassword?: string;
          ownerPassword?: string;
          permissions?: Record<string, boolean>;
        };
        return this.encryptionService!.applyEncryption(pdfData, {
          userPassword: opts.userPassword || '',
          ownerPassword: opts.ownerPassword || '',
          permissions: {
            print: opts.permissions?.print ?? true,
            copy: opts.permissions?.copy ?? true,
            modify: opts.permissions?.modify ?? true,
            annotate: opts.permissions?.annotate ?? true,
            fillForms: opts.permissions?.fillForms ?? true,
            extract: opts.permissions?.extract ?? true,
          },
        });
      }

      case 'compress': {
        const opts = step.options as {
          quality?: 'low' | 'medium' | 'high';
          preset?: 'minimum' | 'balanced' | 'highQuality';
          imageDpi?: number;
          imageQuality?: number;
          grayscale?: boolean;
          removeMetadata?: boolean;
          fontSubset?: boolean;
        };
        return this.compressService!.compress(pdfData, {
          quality: opts.quality || 'medium',
          preset: opts.preset,
          imageDpi: opts.imageDpi,
          imageQuality: opts.imageQuality,
          grayscale: opts.grayscale,
          removeMetadata: opts.removeMetadata,
          fontSubset: opts.fontSubset,
        });
      }

      case 'rotate': {
        const opts = step.options as { angle?: number };
        const angle = opts.angle ?? 90;
        const doc = await PDFDocument.load(pdfData, { ignoreEncryption: true });
        const pages = doc.getPages();
        for (const page of pages) {
          const currentAngle = page.getRotation().angle;
          page.setRotation(degrees((currentAngle + angle) % 360));
        }
        const bytes = await doc.save();
        return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      }

      case 'pageNumbers': {
        const opts = step.options as {
          position?: string;
          style?: string;
          fontSize?: number;
          startIndex?: number;
        };
        return this.watermarkService!.addPageNumbers(pdfData, {
          position: (opts.position as 'bottom-center' | 'bottom-right' | 'bottom-left' | 'top-center' | 'top-right' | 'top-left') || 'bottom-center',
          style: (opts.style as 'arabic' | 'roman' | 'dash' | 'of-total') || 'arabic',
          fontSize: opts.fontSize ?? 10,
          startIndex: opts.startIndex ?? 1,
        });
      }

      case 'convert':
        // 转换步骤在 pipeline 中只转换最终输出格式，当前步骤保持为 PDF
        return pdfData;

      default:
        throw new Error(`未知步骤类型: ${step.type}`);
    }
  }

  // ========== 单类型任务执行 ==========

  /** 格式转换 */
  private async executeConvert(task: TaskItem, signal: AbortSignal): Promise<void> {
    const opts = task.options as { targetFormat?: string };
    const format = opts.targetFormat || 'docx';

    task.message = `转换为 ${format}...`;
    this.sendProgress(task);

    const result = await this.libreOfficeService!.convertFile(task.filePath, {
      targetFormat: format as ConvertTargetFormat,
      outputDir: task.outputDir,
    });

    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

    if (!result.success) {
      throw new Error(result.message || '转换失败');
    }

    task.message = `完成 → ${result.outputPath}`;
  }

  /** 批量加水印 */
  private async executeWatermark(task: TaskItem, signal: AbortSignal): Promise<void> {
    task.message = '添加水印...';
    task.progress = 10;
    this.sendProgress(task);

    const pdfData = fs.readFileSync(task.filePath).buffer as ArrayBuffer;
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

    const opts = task.options as {
      type?: 'text' | 'image';
      content?: string;
      opacity?: number;
      rotation?: number;
      fontSize?: number;
      color?: string;
      position?: 'center' | 'tile';
    };

    task.progress = 30;
    this.sendProgress(task);

    const result = await this.watermarkService!.addWatermark(pdfData, {
      type: opts.type || 'text',
      content: opts.content || 'CONFIDENTIAL',
      opacity: opts.opacity ?? 0.3,
      rotation: opts.rotation ?? -45,
      fontSize: opts.fontSize,
      color: opts.color,
      position: opts.position,
    });

    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

    const baseName = path.basename(task.filePath, '.pdf');
    const outputPath = path.join(task.outputDir, `${baseName}_watermarked.pdf`);
    fs.mkdirSync(task.outputDir, { recursive: true });
    fs.writeFileSync(outputPath, Buffer.from(result));

    task.progress = 90;
    task.message = `完成 → ${outputPath}`;
  }

  /** 批量加密 */
  private async executeEncrypt(task: TaskItem, signal: AbortSignal): Promise<void> {
    task.message = '加密中...';
    task.progress = 10;
    this.sendProgress(task);

    const pdfData = fs.readFileSync(task.filePath).buffer as ArrayBuffer;
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

    const opts = task.options as {
      userPassword?: string;
      ownerPassword?: string;
      permissions?: Record<string, boolean>;
    };

    task.progress = 30;
    this.sendProgress(task);

    const result = await this.encryptionService!.applyEncryption(pdfData, {
      userPassword: opts.userPassword || '',
      ownerPassword: opts.ownerPassword || '',
      permissions: {
        print: opts.permissions?.print ?? true,
        copy: opts.permissions?.copy ?? true,
        modify: opts.permissions?.modify ?? true,
        annotate: opts.permissions?.annotate ?? true,
        fillForms: opts.permissions?.fillForms ?? true,
        extract: opts.permissions?.extract ?? true,
      },
    });

    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

    const baseName = path.basename(task.filePath, '.pdf');
    const outputPath = path.join(task.outputDir, `${baseName}_encrypted.pdf`);
    fs.mkdirSync(task.outputDir, { recursive: true });
    fs.writeFileSync(outputPath, Buffer.from(result));

    task.progress = 90;
    task.message = `完成 → ${outputPath}`;
  }

  /** 批量压缩 */
  private async executeCompress(task: TaskItem, signal: AbortSignal): Promise<void> {
    task.message = '压缩中...';
    task.progress = 10;
    this.sendProgress(task);

    const pdfData = fs.readFileSync(task.filePath).buffer as ArrayBuffer;
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

    const opts = task.options as {
      quality?: 'low' | 'medium' | 'high';
      preset?: 'minimum' | 'balanced' | 'highQuality';
      imageDpi?: number;
      imageQuality?: number;
      grayscale?: boolean;
      removeMetadata?: boolean;
      fontSubset?: boolean;
    };

    task.progress = 30;
    this.sendProgress(task);

    const result = await this.compressService!.compress(pdfData, {
      quality: opts.quality || 'medium',
      preset: opts.preset,
      imageDpi: opts.imageDpi,
      imageQuality: opts.imageQuality,
      grayscale: opts.grayscale,
      removeMetadata: opts.removeMetadata,
      fontSubset: opts.fontSubset,
    });

    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

    const baseName = path.basename(task.filePath, '.pdf');
    const outputPath = path.join(task.outputDir, `${baseName}_compressed.pdf`);
    fs.mkdirSync(task.outputDir, { recursive: true });
    fs.writeFileSync(outputPath, Buffer.from(result));

    const originalSize = pdfData.byteLength;
    const compressedSize = result.byteLength;
    const ratio = Math.round((1 - compressedSize / originalSize) * 100);

    task.progress = 90;
    task.message = `完成 → ${outputPath} (压缩 ${ratio > 0 ? ratio : 0}%)`;
  }

  // ========== IPC 推送 ==========

  private sendProgress(task: TaskItem): void {
    try {
      this.mainWindow?.webContents.send('task:progress', {
        id: task.id,
        type: task.type,
        label: task.label,
        filePath: task.filePath,
        status: task.status,
        progress: task.progress,
        message: task.message,
        error: task.error,
        startTime: task.startTime,
        endTime: task.endTime,
      });
    } catch {
      // 窗口可能已关闭，忽略
    }
  }

  private sendCompleted(task: TaskItem): void {
    try {
      this.mainWindow?.webContents.send('task:completed', {
        id: task.id,
        type: task.type,
        label: task.label,
        filePath: task.filePath,
        status: task.status,
        progress: task.progress,
        message: task.message,
        error: task.error,
        startTime: task.startTime,
        endTime: task.endTime,
      });
    } catch {
      // 窗口可能已关闭，忽略
    }
  }
}
