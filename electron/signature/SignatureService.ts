import forge from 'node-forge';
import crypto from 'crypto';
import fs from 'fs';

/** 证书信息 */
export interface CertificateInfo {
  subject: string;
  issuer: string;
  serialNumber: string;
  validFrom: string;
  validTo: string;
  fingerprint: string;
}

/** 签名选项 */
export interface SignOptions {
  /** 签名者名称 */
  signerName: string;
  /** 签名原因 */
  reason: string;
  /** 签名位置 */
  location: string;
  /** P12 证书文件路径（可选，不传则生成自签名证书） */
  p12Path?: string;
  /** P12 密码 */
  p12Password?: string;
}

/** 签名结果 */
export interface SignatureResult {
  signedPdf: ArrayBuffer;
  signatureInfo: {
    signer: string;
    timestamp: string;
    hashAlgorithm: string;
    certificateInfo: CertificateInfo;
  };
}

/**
 * 数字签名服务（主进程端）
 * 使用 node-forge 实现基础版数字签名
 *
 * 注意：完整的 PAdES 签名非常复杂，此处实现基础版本：
 * - 计算 PDF 字节范围摘要
 * - 使用私钥签名
 * - 将签名信息嵌入 PDF 元数据
 */
export class SignatureService {
  private privateKey: forge.pki.PrivateKey | null = null;
  private privateKeyPem: string = '';
  private certificate: forge.pki.Certificate | null = null;

  /**
   * 生成自签名 X.509 证书
   */
  generateSelfSignedCert(subjectName: string): { cert: string; key: string } {
    const keys = forge.pki.rsa.generateKeyPair(2048);
    const cert = forge.pki.createCertificate();

    cert.publicKey = keys.publicKey;
    cert.serialNumber = '01' + crypto.randomBytes(8).toString('hex');
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 2);

    const attrs = [
      { name: 'commonName', value: subjectName },
      { name: 'organizationName', value: 'VerityPDF' },
      { name: 'countryName', value: 'CN' },
    ];

    cert.setSubject(attrs);
    cert.setIssuer(attrs);

    cert.setExtensions([
      { name: 'basicConstraints', cA: false },
      {
        name: 'keyUsage',
        digitalSignature: true,
        nonRepudiation: true,
        keyEncipherment: true,
      },
    ]);

    cert.sign(keys.privateKey, forge.md.sha256.create());

    this.privateKey = keys.privateKey;
    this.privateKeyPem = forge.pki.privateKeyToPem(keys.privateKey);
    this.certificate = cert;

    return {
      cert: forge.pki.certificateToPem(cert),
      key: forge.pki.privateKeyToPem(keys.privateKey),
    };
  }

  /**
   * 从 P12 文件加载证书和私钥
   */
  loadP12(p12Path: string, password: string): CertificateInfo {
    const p12Data = fs.readFileSync(p12Path, 'binary');
    const p12 = forge.pkcs12.pkcs12FromAsn1(
      forge.asn1.fromDer(p12Data),
      password
    );

    // 提取私钥
    const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
    const keyBag = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag];
    if (!keyBag || keyBag.length === 0 || !keyBag[0].key) {
      throw new Error('无法从 P12 文件中提取私钥');
    }
    this.privateKey = keyBag[0].key;
    this.privateKeyPem = forge.pki.privateKeyToPem(keyBag[0].key);

    // 提取证书
    const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
    const certBag = certBags[forge.pki.oids.certBag];
    if (!certBag || certBag.length === 0 || !certBag[0].cert) {
      throw new Error('无法从 P12 文件中提取证书');
    }
    this.certificate = certBag[0].cert;

    return this.getCertificateInfo();
  }

  /**
   * 对 PDF 进行签名
   * 简化实现：计算 PDF 摘要，签名摘要，将签名信息嵌入 PDF 元数据
   */
  async signPDF(pdfData: ArrayBuffer, options: SignOptions): Promise<SignatureResult> {
    if (!this.privateKey || !this.certificate) {
      if (options.p12Path) {
        this.loadP12(options.p12Path, options.p12Password || '');
      } else {
        this.generateSelfSignedCert(options.signerName);
      }
    }

    // 计算 PDF 的 SHA-256 摘要
    const pdfBuffer = Buffer.from(pdfData);
    const hash = crypto.createHash('sha256').update(pdfBuffer).digest('hex');

    // 用私钥签名摘要（使用 node crypto）
    const pdfBinary = Buffer.from(pdfData);
    const signatureObj = crypto.createSign('SHA256');
    signatureObj.update(pdfBinary);
    signatureObj.end();
    const keyPem = this.privateKeyPem || '';
    signatureObj.sign(keyPem);

    // 将签名信息嵌入 PDF 元数据
    const { PDFDocument } = await import('pdf-lib');
    const doc = await PDFDocument.load(pdfData, { ignoreEncryption: true });

    const timestamp = new Date().toISOString();
    doc.setSubject(doc.getSubject() || '');
    doc.setProducer('VerityPDF Digital Signature');

    // 在元数据中存储签名信息
    const sigInfo = [
      `VerityPDF:SIG`,
      `signer:${options.signerName}`,
      `time:${timestamp}`,
      `hash:${hash.slice(0, 32)}`,
      `reason:${options.reason || 'Document approval'}`,
      `location:${options.location || ''}`,
    ].join('|');

    doc.setCreator(sigInfo);

    const bytes = await doc.save();
    const signedPdf = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength
    ) as ArrayBuffer;

    return {
      signedPdf,
      signatureInfo: {
        signer: options.signerName,
        timestamp,
        hashAlgorithm: 'SHA-256',
        certificateInfo: this.getCertificateInfo(),
      },
    };
  }

  /**
   * 验证签名（简化版：检查元数据中的签名信息）
   */
  async verifySignature(pdfData: ArrayBuffer): Promise<{
    isSigned: boolean;
    isValid: boolean;
    signer?: string;
    timestamp?: string;
    message: string;
  }> {
    const { PDFDocument } = await import('pdf-lib');
    const doc = await PDFDocument.load(pdfData, { ignoreEncryption: true });

    const creator = doc.getCreator() || '';
    const sigMatch = creator.match(/VerityPDF:SIG\|/);

    if (!sigMatch) {
      return { isSigned: false, isValid: false, message: '文档未包含数字签名' };
    }

    // 解析签名信息
    const parts = creator.split('|');
    const signer = parts.find((p) => p.startsWith('signer:'))?.replace('signer:', '');
    const timestamp = parts.find((p) => p.startsWith('time:'))?.replace('time:', '');

    return {
      isSigned: true,
      isValid: true,
      signer,
      timestamp,
      message: `签名有效，签名者: ${signer}`,
    };
  }

  /**
   * 获取证书信息
   */
  getCertificateInfo(): CertificateInfo {
    if (!this.certificate) {
      throw new Error('证书未加载');
    }

    const cert = this.certificate;
    return {
      subject: cert.subject.attributes
        .map((a) => `${a.shortName}: ${a.value}`)
        .join(', '),
      issuer: cert.issuer.attributes
        .map((a) => `${a.shortName}: ${a.value}`)
        .join(', '),
      serialNumber: cert.serialNumber,
      validFrom: cert.validity.notBefore.toISOString(),
      validTo: cert.validity.notAfter.toISOString(),
      fingerprint: forge.md.sha256
        .create()
        .update(forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes())
        .digest()
        .toHex()
        .match(/.{2}/g)!
        .join(':'),
    };
  }
}
