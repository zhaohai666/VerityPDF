import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { promisify } from 'util';
import { app } from 'electron';

const execFileAsync = promisify(execFile);

/** PDF 权限标志（复用 EncryptionService 定义） */
export interface QpdfPermissions {
  print: boolean;
  copy: boolean;
  modify: boolean;
  annotate: boolean;
  fillForms: boolean;
  extract: boolean;
}

/** 加密选项 */
export interface QpdfEncryptionOptions {
  userPassword: string;
  ownerPassword: string;
  permissions: QpdfPermissions;
}

/**
 * QPDF 命令行封装服务
 *
 * 使用 QPDF 实现真正的 AES-256 加密，确保第三方工具强制密码验证。
 * QPDF 二进制需放入 vendor/qpdf/ 目录随应用分发。
 *
 * 加密命令格式:
 *   qpdf --encrypt <user-pass> <owner-pass> 256 --print=y/n --modify=... --extract=y/n -- <out> -- <in>
 *
 * 解密命令格式:
 *   qpdf --decrypt --password=<pass> <in> <out>
 */
export class QpdfService {
  private qpdfPath: string;
  private available: boolean | null = null;

  constructor() {
    this.qpdfPath = this.findQpdf();
  }

  /**
   * 查找 QPDF 可执行文件
   * 搜索顺序: vendor/qpdf/ (内置) -> 系统 PATH
   */
  private findQpdf(): string {
    const exeName = process.platform === 'win32' ? 'qpdf.exe' : 'qpdf';

    // 1. vendor/qpdf/ 目录（开发环境 + 打包后）
    const vendorCandidates: string[] = [];

    if (app.isPackaged) {
      // 打包后：resources/vendor/qpdf/
      const resourcesPath = path.join(process.resourcesPath || '', 'vendor', 'qpdf');
      vendorCandidates.push(path.join(resourcesPath, exeName));
      // Windows 下可能在 bin 子目录
      vendorCandidates.push(path.join(resourcesPath, 'bin', exeName));
    }

    // 开发环境：项目根目录/vendor/qpdf/
    const devVendorPath = path.join(app.getAppPath(), 'vendor', 'qpdf');
    vendorCandidates.push(path.join(devVendorPath, exeName));
    vendorCandidates.push(path.join(devVendorPath, 'bin', exeName));

    // macOS: .app bundle 内
    if (process.platform === 'darwin') {
      vendorCandidates.push(path.join(devVendorPath, 'MacOS', exeName));
    }

    for (const candidate of vendorCandidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    // 2. 系统 PATH 回退
    return process.platform === 'win32' ? 'qpdf.exe' : 'qpdf';
  }

  /**
   * 检测 QPDF 是否可用
   */
  async isAvailable(): Promise<{ available: boolean; version?: string }> {
    if (this.available === false) {
      return { available: false };
    }
    try {
      const { stdout } = await execFileAsync(this.qpdfPath, ['--version'], {
        timeout: 10000,
        windowsHide: true,
      });
      this.available = true;
      const versionMatch = stdout.match(/qpdf version (\S+)/);
      return { available: true, version: versionMatch ? versionMatch[1] : stdout.trim() };
    } catch {
      this.available = false;
      return { available: false };
    }
  }

  /**
   * AES-256 加密 PDF
   *
   * 流程: 将 ArrayBuffer 写入临时文件 -> 调用 qpdf --encrypt -> 读回输出文件 -> 清理临时文件
   */
  async encrypt(pdfData: ArrayBuffer, options: QpdfEncryptionOptions): Promise<ArrayBuffer> {
    const check = await this.isAvailable();
    if (!check.available) {
      throw new Error('QPDF 不可用，无法执行 AES-256 加密');
    }

    const tmpDir = os.tmpdir();
    const id = `verity_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const inputPath = path.join(tmpDir, `${id}_input.pdf`);
    const outputPath = path.join(tmpDir, `${id}_encrypted.pdf`);

    try {
      // 写入临时输入文件
      fs.writeFileSync(inputPath, Buffer.from(pdfData));

      // 构建 QPDF 加密参数
      const permArgs = this.buildPermissionArgs(options.permissions);
      const args = [
        '--encrypt',
        options.userPassword || '',
        options.ownerPassword || options.userPassword,
        '256',
        ...permArgs,
        '--', outputPath,
        '--', inputPath,
      ];

      await execFileAsync(this.qpdfPath, args, {
        timeout: 120000,
        maxBuffer: 50 * 1024 * 1024,
        windowsHide: true,
      });

      if (!fs.existsSync(outputPath)) {
        throw new Error('QPDF 加密完成但未找到输出文件');
      }

      const resultBuffer = fs.readFileSync(outputPath);
      return resultBuffer.buffer.slice(
        resultBuffer.byteOffset,
        resultBuffer.byteOffset + resultBuffer.byteLength
      ) as ArrayBuffer;
    } finally {
      // 清理临时文件
      this.cleanupFile(inputPath);
      this.cleanupFile(outputPath);
    }
  }

  /**
   * 解密 PDF（移除已知密码）
   *
   * 流程: 将 ArrayBuffer 写入临时文件 -> 调用 qpdf --decrypt -> 读回输出文件 -> 清理
   */
  async decrypt(pdfData: ArrayBuffer, password: string): Promise<ArrayBuffer> {
    const check = await this.isAvailable();
    if (!check.available) {
      throw new Error('QPDF 不可用，无法执行解密');
    }

    const tmpDir = os.tmpdir();
    const id = `verity_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const inputPath = path.join(tmpDir, `${id}_enc.pdf`);
    const outputPath = path.join(tmpDir, `${id}_decrypted.pdf`);

    try {
      fs.writeFileSync(inputPath, Buffer.from(pdfData));

      const args = [
        '--decrypt',
        `--password=${password}`,
        inputPath,
        outputPath,
      ];

      await execFileAsync(this.qpdfPath, args, {
        timeout: 120000,
        maxBuffer: 50 * 1024 * 1024,
        windowsHide: true,
      });

      if (!fs.existsSync(outputPath)) {
        throw new Error('QPDF 解密完成但未找到输出文件');
      }

      const resultBuffer = fs.readFileSync(outputPath);
      return resultBuffer.buffer.slice(
        resultBuffer.byteOffset,
        resultBuffer.byteOffset + resultBuffer.byteLength
      ) as ArrayBuffer;
    } finally {
      this.cleanupFile(inputPath);
      this.cleanupFile(outputPath);
    }
  }

  /**
   * 将权限标志映射为 QPDF 命令行参数
   */
  private buildPermissionArgs(permissions: QpdfPermissions): string[] {
    const args: string[] = [];

    // --print
    args.push(`--print=${permissions.print ? 'y' : 'n'}`);

    // --extract (覆盖 copy + extract)
    args.push(`--extract=${(permissions.copy || permissions.extract) ? 'y' : 'n'}`);

    // --modify (综合 modify / annotate / fillForms)
    if (permissions.modify) {
      args.push('--modify=all');
    } else if (permissions.annotate && permissions.fillForms) {
      args.push('--modify=annotate');
    } else if (permissions.fillForms) {
      args.push('--modify=form');
    } else if (permissions.annotate) {
      args.push('--modify=annotate');
    } else {
      args.push('--modify=none');
    }

    // --annotate (独立控制注释权限)
    args.push(`--annotate=${permissions.annotate ? 'y' : 'n'}`);

    return args;
  }

  /**
   * 安全清理临时文件
   */
  private cleanupFile(filePath: string): void {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch {
      // 忽略清理失败
    }
  }
}
