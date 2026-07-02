import { PDFDocument } from 'pdf-lib';
import crypto from 'crypto';
import { QpdfService } from './QpdfService';
import { SmCryptoService } from '../crypto/SmCryptoService';

/** PDF 权限标志 */
export interface PDFPermissions {
  print: boolean;
  copy: boolean;
  modify: boolean;
  annotate: boolean;
  fillForms: boolean;
  extract: boolean;
}

/** 加密算法类型 */
export type EncryptionAlgorithm = 'AES-256' | 'SM4';

/** 加密选项 */
export interface EncryptionOptions {
  userPassword: string;
  ownerPassword: string;
  permissions: PDFPermissions;
  /** 加密算法：'AES-256'（默认）或 'SM4'（国密） */
  algorithm?: EncryptionAlgorithm;
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
 * - 优先使用 QPDF 实现真实 AES-256 加密（第三方工具强制密码验证）
 * - SM4 国密加密：使用 sm-crypto 实现 SM4-CBC 对称加密
 * - QPDF 不可用时回退到 pdf-lib 元数据标记（仅 VerityPDF 内部识别）
 * - 读取加密 PDF：依赖 PDF.js 原生 password 参数（在 PDFService 层处理）
 */
export class EncryptionService {
  private qpdfService: QpdfService;
  private smCrypto: SmCryptoService;

  constructor() {
    this.qpdfService = new QpdfService();
    this.smCrypto = new SmCryptoService();
  }

  /** 检测 QPDF 是否可用 */
  async isQpdfAvailable(): Promise<{ available: boolean; version?: string }> {
    return this.qpdfService.isAvailable();
  }
  /**
   * 对 PDF 应用加密和权限
   * - SM4 算法：使用国密 SM4-CBC 对称加密
   * - AES-256 算法：优先使用 QPDF，不可用时回退到元数据标记
   */
  async applyEncryption(
    pdfData: ArrayBuffer,
    options: EncryptionOptions
  ): Promise<ArrayBuffer> {
    const algorithm = options.algorithm || 'AES-256';

    // SM4 国密加密
    if (algorithm === 'SM4') {
      return this.applySM4Encryption(pdfData, options);
    }

    // AES-256 加密（原有逻辑）
    // 尝试 QPDF 真实 AES-256 加密
    const qpdfCheck = await this.qpdfService.isAvailable();
    if (qpdfCheck.available) {
      try {
        return await this.qpdfService.encrypt(pdfData, {
          userPassword: options.userPassword,
          ownerPassword: options.ownerPassword,
          permissions: options.permissions,
        });
      } catch (err) {
        console.warn('[EncryptionService] QPDF encrypt failed, falling back to metadata:', err);
      }
    }

    // 回退：元数据标记方式
    return this.applyMetadataEncryption(pdfData, options);
  }

  /**
   * SM4 国密加密
   * 使用 SM4-CBC 模式加密 PDF 数据，密码哈希作为密钥
   * 加密后数据格式：[16字节IV][SM4密文][权限元数据]
   */
  private async applySM4Encryption(
    pdfData: ArrayBuffer,
    options: EncryptionOptions
  ): Promise<ArrayBuffer> {
    // 从密码派生 SM4 密钥（128位 = 32位16进制）
    const key = this.hashPassword(options.userPassword).padEnd(32, '0').slice(0, 32);
    const iv = this.smCrypto.sm4.generateIV();

    // SM4-CBC 加密 PDF 数据
    const pdfBuffer = Buffer.from(pdfData);
    const pdfHex = pdfBuffer.toString('hex');
        await this.smCrypto.sm4.encrypt(pdfHex, key, {
      mode: 'cbc',
      iv,
      padding: 'pkcs#7',
      output: 'hex',
    }) as string;

    // 构建加密数据包：IV(32hex) + 密文 + 权限标记
    const permFlags = this.computePermissionFlags(options.permissions);
    const ownerHash = options.ownerPassword ? this.hashPassword(options.ownerPassword) : '';

    // 使用 pdf-lib 写入加密元数据标记
    const doc = await PDFDocument.load(pdfData, { ignoreEncryption: true });
    doc.setSubject(`[VerityPDF:SM4:PERM:${permFlags}]`);
    doc.setProducer('VerityPDF SM4 Encryption');

    const keywords: string[] = [
      `veritysm4iv:${iv}`,
      `veritypwd:${this.hashPassword(options.userPassword)}`,
    ];
    if (ownerHash) {
      keywords.push(`verityowner:${ownerHash}`);
    }
    doc.setKeywords(keywords);

    // 先保存带标记的 PDF，再加密
    const markedBytes = await doc.save();
    const markedBuffer = Buffer.from(markedBytes);
    const markedHex = markedBuffer.toString('hex');

    const finalEncrypted = await this.smCrypto.sm4.encrypt(markedHex, key, {
      mode: 'cbc',
      iv,
      padding: 'pkcs#7',
      output: 'hex',
    }) as string;

    // 存储格式：SM4标识 + IV + 加密数据
    const result = Buffer.alloc(4 + 16 + Buffer.from(finalEncrypted, 'hex').length);
    result.write('SM4\x00', 0);  // 4字节魔数
    Buffer.from(iv, 'hex').copy(result, 4);  // 16字节IV
    Buffer.from(finalEncrypted, 'hex').copy(result, 20);  // 密文

    return result.buffer.slice(result.byteOffset, result.byteOffset + result.byteLength) as ArrayBuffer;
  }

  /**
   * SM4 国密解密
   */
  async decryptSM4(
    encryptedData: ArrayBuffer,
    password: string
  ): Promise<ArrayBuffer> {
    const buffer = Buffer.from(encryptedData);

    // 验证 SM4 魔数
    const magic = buffer.slice(0, 4).toString('ascii');
    if (magic !== 'SM4\x00') {
      throw new Error('不是有效的 SM4 加密数据');
    }

    // 提取 IV 和密文
    const iv = buffer.slice(4, 20).toString('hex');
    const cipherText = buffer.slice(20).toString('hex');

    // 从密码派生密钥
    const key = this.hashPassword(password).padEnd(32, '0').slice(0, 32);

    // SM4-CBC 解密
    const decryptedHex = await this.smCrypto.sm4.decrypt(cipherText, key, {
      mode: 'cbc',
      iv,
      padding: 'pkcs#7',
      output: 'string',
    }) as string;

    const pdfBuffer = Buffer.from(decryptedHex, 'hex');
    return pdfBuffer.buffer.slice(pdfBuffer.byteOffset, pdfBuffer.byteOffset + pdfBuffer.byteLength) as ArrayBuffer;
  }

  /**
   * 检测数据是否为 SM4 加密格式
   */
  isSM4Encrypted(data: ArrayBuffer): boolean {
    const buffer = Buffer.from(data);
    if (buffer.length < 20) return false;
    const magic = buffer.slice(0, 4).toString('ascii');
    return magic === 'SM4\x00';
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
   * 移除加密（已知密码解密）
   * - SM4 加密数据：使用 SM4 解密
   * - QPDF 加密：优先使用 QPDF 解密
   * - 元数据标记：清除标记
   */
  async removeEncryption(pdfData: ArrayBuffer, password?: string): Promise<ArrayBuffer> {
    // 检测 SM4 加密
    if (this.isSM4Encrypted(pdfData) && password) {
      try {
        return await this.decryptSM4(pdfData, password);
      } catch (err) {
        console.warn('[EncryptionService] SM4 decrypt failed:', err);
        throw new Error('SM4解密失败，密码可能不正确');
      }
    }

    // 尝试 QPDF 真实解密
    const qpdfCheck = await this.qpdfService.isAvailable();
    if (qpdfCheck.available && password) {
      try {
        return await this.qpdfService.decrypt(pdfData, password);
      } catch (err) {
        console.warn('[EncryptionService] QPDF decrypt failed, falling back to metadata:', err);
      }
    }

    // 回退：清除元数据标记
    return this.removeMetadataEncryption(pdfData);
  }

  /**
   * 元数据标记方式加密（回退方案）
   */
  private async applyMetadataEncryption(
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
   * 清除元数据标记（回退方案）
   */
  private async removeMetadataEncryption(pdfData: ArrayBuffer): Promise<ArrayBuffer> {
    const doc = await PDFDocument.load(pdfData, { ignoreEncryption: true });

    const subject = doc.getSubject() || '';
    doc.setSubject(subject.replace(/\[VerityPDF:PERM:\d+\]/, '').trim());

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
