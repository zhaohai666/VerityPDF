import { PDFDocument } from 'pdf-lib';
import crypto from 'crypto';

/** PDF 权限标志 */
export interface PDFPermissions {
  print: boolean;
  copy: boolean;
  modify: boolean;
  annotate: boolean;
  fillForms: boolean;
  extract: boolean;
}

/** 加密选项 */
export interface EncryptionOptions {
  userPassword: string;
  ownerPassword: string;
  permissions: PDFPermissions;
}

/** 默认权限（全部允许） */
export const DEFAULT_PERMISSIONS: PDFPermissions = {
  print: true,
  copy: true,
  modify: true,
  annotate: true,
  fillForms: true,
  extract: true,
};

/**
 * PDF 加密与权限控制服务
 *
 * 策略说明：
 * - 读取加密 PDF：依赖 PDF.js 原生 password 参数（在 PDFService 层处理）
 * - 写入加密：pdf-lib 不直接支持加密写入，此处使用元数据标记权限信息，
 *   并通过密码哈希实现简单的密码验证。
 *   对于生产级加密需求，建议集成 qpdf 或 mupdf。
 */
export class EncryptionService {
  /**
   * 对 PDF 应用权限标记和密码哈希
   */
  async applyEncryption(
    pdfData: ArrayBuffer,
    options: EncryptionOptions
  ): Promise<ArrayBuffer> {
    const doc = await PDFDocument.load(pdfData, { ignoreEncryption: true });

    const permFlags = this.computePermissionFlags(options.permissions);
    doc.setSubject(`[VerityPDF:PERM:${permFlags}]`);

    const passwordHash = this.hashPassword(options.userPassword);
    const keywords: string[] = [`veritypwd:${passwordHash}`];

    if (options.ownerPassword) {
      const ownerHash = this.hashPassword(options.ownerPassword);
      keywords.push(`verityowner:${ownerHash}`);
    }

    doc.setKeywords(keywords);

    const bytes = await doc.save();
    return bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength
    ) as ArrayBuffer;
  }

  /**
   * 从元数据中解析权限标志
   */
  parsePermissions(subject: string): PDFPermissions | null {
    const match = subject?.match(/\[VerityPDF:PERM:(\d+)\]/);
    if (!match) return null;

    const flags = parseInt(match[1], 10);
    return {
      print: !!(flags & 0x04),
      modify: !!(flags & 0x08),
      copy: !!(flags & 0x10),
      annotate: !!(flags & 0x20),
      fillForms: !!(flags & 0x100),
      extract: !!(flags & 0x200),
    };
  }

  /**
   * 从元数据关键词中提取密码哈希
   */
  extractPasswordHash(keywords: string[]): { userHash?: string; ownerHash?: string } {
    const result: { userHash?: string; ownerHash?: string } = {};
    const joined = keywords.join(' ');
    const userMatch = joined.match(/veritypwd:([a-f0-9]+)/);
    if (userMatch) result.userHash = userMatch[1];
    const ownerMatch = joined.match(/verityowner:([a-f0-9]+)/);
    if (ownerMatch) result.ownerHash = ownerMatch[1];
    return result;
  }

  /**
   * 验证密码是否匹配存储的哈希
   */
  checkPassword(password: string, storedHash: string): boolean {
    return this.hashPassword(password) === storedHash;
  }

  /**
   * 移除权限标记（清除元数据中的加密信息）
   */
  async removeEncryption(pdfData: ArrayBuffer): Promise<ArrayBuffer> {
    const doc = await PDFDocument.load(pdfData, { ignoreEncryption: true });

    const subject = doc.getSubject() || '';
    doc.setSubject(subject.replace(/\[VerityPDF:PERM:\d+\]/, '').trim());

    // 过滤掉加密标记关键词
    const rawKeywords = doc.getKeywords() || '';
    const keywords = rawKeywords.split(/\s+/).filter(Boolean);
    const cleaned = keywords.filter(
      (kw) => !kw.startsWith('veritypwd:') && !kw.startsWith('verityowner:')
    );
    doc.setKeywords(cleaned);

    const bytes = await doc.save();
    return bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength
    ) as ArrayBuffer;
  }

  /**
   * 计算权限标志位（遵循 PDF 规范中的权限位定义）
   */
  private computePermissionFlags(permissions: PDFPermissions): number {
    let flags = 0;
    if (permissions.print) flags |= 0x04;
    if (permissions.modify) flags |= 0x08;
    if (permissions.copy) flags |= 0x10;
    if (permissions.annotate) flags |= 0x20;
    if (permissions.fillForms) flags |= 0x100;
    if (permissions.extract) flags |= 0x200;
    return flags;
  }

  /**
   * SHA-256 密码哈希（取前 16 位十六进制）
   */
  private hashPassword(password: string): string {
    return crypto
      .createHash('sha256')
      .update(password)
      .digest('hex')
      .slice(0, 16);
  }
}
