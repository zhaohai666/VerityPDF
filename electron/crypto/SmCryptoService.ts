/**
 * 国密算法服务（SM2/SM3/SM4）
 *
 * 提供中国国家标准密码算法支持：
 * - SM2: 椭圆曲线公钥密码算法（签名/验签/加密/解密）
 * - SM3: 密码杂凑算法（哈希）
 * - SM4: 分组密码算法（对称加密/解密）
 *
 * 用于替代或补充 RSA/SHA-256/AES-256，满足国密合规要求
 */

import crypto from 'crypto';

// sm-crypto 是 CommonJS 模块，需要动态导入
let sm2: any = null;
let sm3: any = null;
let sm4: any = null;

/** 延迟加载 sm-crypto 模块 */
async function loadSmCrypto(): Promise<void> {
  if (sm2) return;
  const smCrypto = await import('sm-crypto');
  sm2 = smCrypto.sm2 || smCrypto.default?.sm2;
  sm3 = smCrypto.sm3 || smCrypto.default?.sm3;
  sm4 = smCrypto.sm4 || smCrypto.default?.sm4;
}

// ─── 类型定义 ────────────────────────────────────────

/** SM2 密钥对 */
export interface SM2KeyPair {
  publicKey: string;   // 16进制公钥（130位，非压缩格式）
  privateKey: string;  // 16进制私钥
  compressedPublicKey?: string; // 压缩公钥（66位）
}

/** SM2 签名选项 */
export interface SM2SignOptions {
  hash?: boolean;      // 是否做SM3杂凑，默认true
  der?: boolean;       // 是否DER编码，默认true
  userId?: string;     // 用户ID，默认 '1234567812345678'
  publicKey?: string;  // 传入公钥可加速签名
}

/** SM2 验签选项 */
export interface SM2VerifyOptions {
  hash?: boolean;
  der?: boolean;
  userId?: string;
}

/** SM4 加密选项 */
export interface SM4EncryptOptions {
  mode?: 'ecb' | 'cbc';  // 加密模式，默认 ecb
  iv?: string;             // CBC模式初始向量（16进制，32位）
  padding?: 'pkcs#7' | 'none';  // 填充模式，默认 pkcs#7
  output?: 'hex' | 'array';     // 输出格式，默认 hex
}

/** SM4 解密选项 */
export interface SM4DecryptOptions {
  mode?: 'ecb' | 'cbc';
  iv?: string;
  padding?: 'pkcs#7' | 'none';
  output?: 'string' | 'array';  // 输出格式，默认 string (utf8)
}

/** 国密签名结果 */
export interface SM2SignatureResult {
  signatureHex: string;  // 签名值（16进制）
  publicKey: string;     // 签名公钥
  algorithm: 'SM2-SM3';  // 算法标识
}

/** 国密验签结果 */
export interface SM2VerifyResult {
  isValid: boolean;
  algorithm: 'SM2-SM3';
  message: string;
}

// ─── SM2 服务 ────────────────────────────────────────

export class Sm2Service {
  /**
   * 生成 SM2 密钥对
   */
  async generateKeyPair(): Promise<SM2KeyPair> {
    await loadSmCrypto();
    const keypair = sm2.generateKeyPairHex();
    const compressedPublicKey = sm2.compressPublicKeyHex(keypair.publicKey);

    return {
      publicKey: keypair.publicKey,
      privateKey: keypair.privateKey,
      compressedPublicKey,
    };
  }

  /**
   * SM2 签名
   * @param data 待签名数据（字符串或Buffer）
   * @param privateKey 私钥（16进制）
   * @param options 签名选项
   */
  async sign(
    data: string | Buffer,
    privateKey: string,
    options?: SM2SignOptions
  ): Promise<SM2SignatureResult> {
    await loadSmCrypto();

    const msgStr = typeof data === 'string' ? data : data.toString('hex');
    const publicKey = options?.publicKey || sm2.getPublicKeyFromPrivateKey(privateKey);

    const sigOptions = {
      hash: options?.hash !== false,  // 默认true，做SM3杂凑
      der: options?.der !== false,     // 默认true，DER编码
      userId: options?.userId || '1234567812345678',
      publicKey: options?.publicKey,
    };

    const signatureHex = sm2.doSignature(msgStr, privateKey, sigOptions);

    return {
      signatureHex,
      publicKey,
      algorithm: 'SM2-SM3',
    };
  }

  /**
   * SM2 验签
   * @param data 原始数据
   * @param signatureHex 签名值（16进制）
   * @param publicKey 公钥（16进制）
   * @param options 验签选项
   */
  async verify(
    data: string | Buffer,
    signatureHex: string,
    publicKey: string,
    options?: SM2VerifyOptions
  ): Promise<SM2VerifyResult> {
    await loadSmCrypto();

    const msgStr = typeof data === 'string' ? data : data.toString('hex');

    const verifyOptions = {
      hash: options?.hash !== false,
      der: options?.der !== false,
      userId: options?.userId || '1234567812345678',
    };

    const isValid = sm2.doVerifySignature(msgStr, signatureHex, publicKey, verifyOptions);

    return {
      isValid,
      algorithm: 'SM2-SM3',
      message: isValid ? 'SM2签名验证通过' : 'SM2签名验证失败',
    };
  }

  /**
   * SM2 加密
   * @param data 明文数据
   * @param publicKey 公钥
   * @param cipherMode 密文模式：1=C1C3C2, 0=C1C2C3
   */
  async encrypt(data: string, publicKey: string, cipherMode: number = 1): Promise<string> {
    await loadSmCrypto();
    return sm2.doEncrypt(data, publicKey, cipherMode);
  }

  /**
   * SM2 解密
   * @param cipherText 密文
   * @param privateKey 私钥
   * @param cipherMode 密文模式
   */
  async decrypt(cipherText: string, privateKey: string, cipherMode: number = 1): Promise<string> {
    await loadSmCrypto();
    return sm2.doDecrypt(cipherText, privateKey, cipherMode);
  }

  /**
   * 验证公钥有效性
   */
  async verifyPublicKey(publicKey: string): Promise<boolean> {
    await loadSmCrypto();
    return sm2.verifyPublicKey(publicKey);
  }

  /**
   * 从私钥推导公钥
   */
  async getPublicKeyFromPrivateKey(privateKey: string): Promise<string> {
    await loadSmCrypto();
    return sm2.getPublicKeyFromPrivateKey(privateKey);
  }
}

// ─── SM3 服务 ────────────────────────────────────────

export class Sm3Service {
  /**
   * SM3 杂凑（哈希）
   * @param data 待哈希数据（字符串或Buffer）
   * @returns 16进制哈希值
   */
  async hash(data: string | Buffer): Promise<string> {
    await loadSmCrypto();

    if (typeof data === 'string') {
      return sm3(data);
    }

    // Buffer 转16进制字符串再计算
    return sm3(data.toString('hex'));
  }

  /**
   * SM3 HMAC
   * @param data 待哈希数据
   * @param key HMAC密钥（16进制字符串）
   * @returns 16进制哈希值
   */
  async hmac(data: string | Buffer, key: string): Promise<string> {
    await loadSmCrypto();

    const msgStr = typeof data === 'string' ? data : data.toString('hex');
    return sm3(msgStr, { key });
  }
}

// ─── SM4 服务 ────────────────────────────────────────

export class Sm4Service {
  /**
   * 生成 SM4 密钥（128位 = 32位16进制）
   */
  generateKey(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * 生成 SM4 CBC 模式 IV（128位 = 32位16进制）
   */
  generateIV(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * SM4 加密
   * @param data 明文数据（字符串或字节数组）
   * @param key 密钥（16进制，128位）
   * @param options 加密选项
   * @returns 密文（16进制字符串或字节数组）
   */
  async encrypt(
    data: string | number[],
    key: string,
    options?: SM4EncryptOptions
  ): Promise<string | number[]> {
    await loadSmCrypto();

    const encryptOptions: Record<string, any> = {};
    if (options?.mode) encryptOptions.mode = options.mode;
    if (options?.iv) encryptOptions.iv = options.iv;
    if (options?.padding) encryptOptions.padding = options.padding;
    if (options?.output) encryptOptions.output = options.output;

    return sm4.encrypt(data, key, encryptOptions);
  }

  /**
   * SM4 解密
   * @param cipherText 密文
   * @param key 密钥（16进制，128位）
   * @param options 解密选项
   * @returns 明文（字符串或字节数组）
   */
  async decrypt(
    cipherText: string | number[],
    key: string,
    options?: SM4DecryptOptions
  ): Promise<string | number[]> {
    await loadSmCrypto();

    const decryptOptions: Record<string, any> = {};
    if (options?.mode) decryptOptions.mode = options.mode;
    if (options?.iv) decryptOptions.iv = options.iv;
    if (options?.padding) decryptOptions.padding = options.padding;
    if (options?.output) decryptOptions.output = options.output;

    return sm4.decrypt(cipherText, key, decryptOptions);
  }

  /**
   * SM4 加密 Buffer（用于文件加密等场景）
   * 将 Buffer 转为16进制字符串加密，返回16进制密文
   */
  async encryptBuffer(buffer: Buffer, key: string, options?: SM4EncryptOptions): Promise<string> {
    const hexStr = buffer.toString('hex');
    return (await this.encrypt(hexStr, key, options)) as string;
  }

  /**
   * SM4 解密为 Buffer
   * 解密16进制密文，返回Buffer
   */
  async decryptToBuffer(cipherText: string, key: string, options?: SM4DecryptOptions): Promise<Buffer> {
    const hexStr = (await this.decrypt(cipherText, key, { ...options, output: 'string' })) as string;
    return Buffer.from(hexStr, 'hex');
  }
}

// ─── 统一国密服务门面 ─────────────────────────────────

export class SmCryptoService {
  readonly sm2: Sm2Service;
  readonly sm3: Sm3Service;
  readonly sm4: Sm4Service;

  constructor() {
    this.sm2 = new Sm2Service();
    this.sm3 = new Sm3Service();
    this.sm4 = new Sm4Service();
  }

  /**
   * 快捷SM3哈希
   */
  async hash(data: string | Buffer): Promise<string> {
    return this.sm3.hash(data);
  }

  /**
   * 快捷SM2签名
   */
  async sign(data: string | Buffer, privateKey: string, publicKey?: string): Promise<SM2SignatureResult> {
    return this.sm2.sign(data, privateKey, { publicKey });
  }

  /**
   * 快捷SM2验签
   */
  async verify(data: string | Buffer, signature: string, publicKey: string): Promise<SM2VerifyResult> {
    return this.sm2.verify(data, signature, publicKey);
  }

  /**
   * 快捷SM4加密
   */
  async encrypt(data: string, key: string, options?: SM4EncryptOptions): Promise<string | number[]> {
    return this.sm4.encrypt(data, key, options);
  }

  /**
   * 快捷SM4解密
   */
  async decrypt(cipherText: string | number[], key: string, options?: SM4DecryptOptions): Promise<string | number[]> {
    return this.sm4.decrypt(cipherText, key, options);
  }
}

/** 单例实例 */
export const smCryptoService = new SmCryptoService();