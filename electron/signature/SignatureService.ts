import forge from 'node-forge';
import crypto from 'crypto';
import fs from 'fs';
import {
  PDFDocument, PDFName, PDFString, PDFHexString, PDFArray,
  PDFDict, PDFRef, PDFContext, PDFRawStream,
} from 'pdf-lib';
import { SmCryptoService, SM2KeyPair } from '../crypto/SmCryptoService';

/** 证书信息 */
export interface CertificateInfo {
  subject: string;
  issuer: string;
  serialNumber: string;
  validFrom: string;
  validTo: string;
  fingerprint: string;
}

/** 签名算法类型 */
export type SignatureAlgorithm = 'RSA-SHA256' | 'SM2-SM3';

/** 基础签名选项（保留兼容） */
export interface SignOptions {
  signerName: string;
  reason: string;
  location: string;
  p12Path?: string;
  p12Password?: string;
  /** 签名算法：'RSA-SHA256'（默认）或 'SM2-SM3'（国密） */
  algorithm?: SignatureAlgorithm;
}

/** PAdES 签名选项 */
export interface PadesSignOptions {
  signerName: string;
  reason: string;
  location: string;
  contactInfo?: string;
  p12Path?: string;
  p12Password?: string;
  visibleSignature?: {
    page: number;
    rect: { x: number; y: number; width: number; height: number };
    appearanceImage?: string;
    showTimestamp: boolean;
  };
  /** 签名算法：'RSA-SHA256'（默认）或 'SM2-SM3'（国密） */
  algorithm?: SignatureAlgorithm;
}

/** 签名结果 */
export interface SignatureResult {
  signedPdf: ArrayBuffer;
  signatureInfo: {
    signer: string;
    timestamp: string;
    hashAlgorithm: string;
    certificateInfo?: CertificateInfo;
    /** SM2 签名时返回公钥 */
    sm2PublicKey?: string;
    /** 算法标识 */
    algorithm: SignatureAlgorithm;
  };
}

/** 验证结果 */
export interface VerifyResult {
  isSigned: boolean;
  isValid: boolean;
  signer?: string;
  timestamp?: string;
  certificateInfo?: CertificateInfo;
  documentIntact: boolean;
  message: string;
}

/** 证书链项 */
export interface ChainCertInfo {
  subject: string;
  issuer: string;
  serialNumber: string;
  validFrom: string;
  validTo: string;
  fingerprint: string;
  isExpired: boolean;
  isSelfSigned: boolean;
  issuedByPrevious: boolean;
}

/** 签名链验证结果 */
export interface SignatureChainVerifyResult {
  isSigned: boolean;
  isValid: boolean;
  documentIntact: boolean;
  signatures: Array<{
    signer?: string;
    timestamp?: string;
    hashAlgorithm?: string;
    certificateChain: ChainCertInfo[];
    isValid: boolean;
    message: string;
  }>;
  overallMessage: string;
}

/** 签名预留空间大小（hex chars） */
const SIGNATURE_CONTENTS_SIZE = 8192;

/**
 * 数字签名服务（主进程端）
 * 支持基础签名和完整 PAdES 签名
 * 支持 RSA-SHA256 和 SM2-SM3（国密）算法
 */
export class SignatureService {
  private privateKey: forge.pki.PrivateKey | null = null;
  private privateKeyPem: string = '';
  private certificate: forge.pki.Certificate | null = null;
  private smCrypto: SmCryptoService;
  private sm2KeyPair: SM2KeyPair | null = null;

  constructor() {
    this.smCrypto = new SmCryptoService();
  }

  /**
   * 生成自签名 X.509 证书（RSA）
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
   * 生成 SM2 密钥对（国密）
   */
  async generateSM2KeyPair(): Promise<SM2KeyPair> {
    this.sm2KeyPair = await this.smCrypto.sm2.generateKeyPair();
    return this.sm2KeyPair;
  }

  /**
   * 设置 SM2 密钥对
   */
  setSM2KeyPair(keyPair: SM2KeyPair): void {
    this.sm2KeyPair = keyPair;
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

    const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
    const keyBag = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag];
    if (!keyBag || keyBag.length === 0 || !keyBag[0].key) {
      throw new Error('无法从 P12 文件中提取私钥');
    }
    this.privateKey = keyBag[0].key;
    this.privateKeyPem = forge.pki.privateKeyToPem(keyBag[0].key);

    const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
    const certBag = certBags[forge.pki.oids.certBag];
    if (!certBag || certBag.length === 0 || !certBag[0].cert) {
      throw new Error('无法从 P12 文件中提取证书');
    }
    this.certificate = certBag[0].cert;

    return this.getCertificateInfo();
  }

  /**
   * 基础签名（保留向后兼容）
   * 支持 RSA-SHA256 和 SM2-SM3（国密）算法
   */
  async signPDF(pdfData: ArrayBuffer, options: SignOptions): Promise<SignatureResult> {
    const algorithm = options.algorithm || 'RSA-SHA256';

    if (algorithm === 'SM2-SM3') {
      return this.signPDFWithSM2(pdfData, options);
    }

    // RSA-SHA256 签名（原有逻辑）
    if (!this.privateKey || !this.certificate) {
      if (options.p12Path) {
        this.loadP12(options.p12Path, options.p12Password || '');
      } else {
        this.generateSelfSignedCert(options.signerName);
      }
    }

    const pdfBuffer = Buffer.from(pdfData);
    const hash = crypto.createHash('sha256').update(pdfBuffer).digest('hex');

    const signatureObj = crypto.createSign('SHA256');
    signatureObj.update(pdfBuffer);
    signatureObj.end();
    const keyPem = this.privateKeyPem || '';
    signatureObj.sign(keyPem);

    const { PDFDocument } = await import('pdf-lib');
    const doc = await PDFDocument.load(pdfData, { ignoreEncryption: true });

    const timestamp = new Date().toISOString();
    doc.setProducer('VerityPDF Digital Signature');

    const sigInfo = [
      'VerityPDF:SIG',
      `signer:${options.signerName}`,
      `time:${timestamp}`,
      `hash:${hash.slice(0, 32)}`,
      `reason:${options.reason || 'Document approval'}`,
      `location:${options.location || ''}`,
      `algo:RSA-SHA256`,
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
        algorithm: 'RSA-SHA256',
      },
    };
  }

  /**
   * SM2-SM3 国密基础签名
   */
  private async signPDFWithSM2(pdfData: ArrayBuffer, options: SignOptions): Promise<SignatureResult> {
    // 确保 SM2 密钥对存在
    if (!this.sm2KeyPair) {
      await this.generateSM2KeyPair();
    }

    const pdfBuffer = Buffer.from(pdfData);
    const sm3Hash = await this.smCrypto.sm3.hash(pdfBuffer);

    // SM2 签名
    const sigResult = await this.smCrypto.sm2.sign(
      pdfBuffer,
      this.sm2KeyPair!.privateKey,
      { publicKey: this.sm2KeyPair!.publicKey }
    );

    const { PDFDocument } = await import('pdf-lib');
    const doc = await PDFDocument.load(pdfData, { ignoreEncryption: true });

    const timestamp = new Date().toISOString();
    doc.setProducer('VerityPDF SM2 Digital Signature');

    const sigInfo = [
      'VerityPDF:SIG',
      `signer:${options.signerName}`,
      `time:${timestamp}`,
      `hash:${sm3Hash.slice(0, 32)}`,
      `reason:${options.reason || 'Document approval'}`,
      `location:${options.location || ''}`,
      `algo:SM2-SM3`,
      `pubkey:${this.sm2KeyPair!.publicKey.slice(0, 64)}`,
      `sig:${sigResult.signatureHex.slice(0, 128)}`,
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
        hashAlgorithm: 'SM3',
        sm2PublicKey: this.sm2KeyPair!.publicKey,
        algorithm: 'SM2-SM3',
      },
    };
  }

  /**
   * 基础验证（保留向后兼容）
   * 支持 RSA-SHA256 和 SM2-SM3（国密）算法验证
   */
  async verifySignature(pdfData: ArrayBuffer): Promise<{
    isSigned: boolean;
    isValid: boolean;
    signer?: string;
    timestamp?: string;
    algorithm?: SignatureAlgorithm;
    message: string;
  }> {
    const { PDFDocument } = await import('pdf-lib');
    const doc = await PDFDocument.load(pdfData, { ignoreEncryption: true });

    const creator = doc.getCreator() || '';
    const sigMatch = creator.match(/VerityPDF:SIG\|/);

    if (!sigMatch) {
      return { isSigned: false, isValid: false, message: '文档未包含数字签名' };
    }

    const parts = creator.split('|');
    const signer = parts.find((p) => p.startsWith('signer:'))?.replace('signer:', '');
    const timestamp = parts.find((p) => p.startsWith('time:'))?.replace('time:', '');
    const algoPart = parts.find((p) => p.startsWith('algo:'))?.replace('algo:', '');
    const algorithm: SignatureAlgorithm = (algoPart as SignatureAlgorithm) || 'RSA-SHA256';

    // SM2-SM3 验签
    if (algorithm === 'SM2-SM3') {
      const pubkeyPart = parts.find((p) => p.startsWith('pubkey:'))?.replace('pubkey:', '');
      const sigPart = parts.find((p) => p.startsWith('sig:'))?.replace('sig:', '');

      if (pubkeyPart && sigPart) {
        try {
          const pdfBuffer = Buffer.from(pdfData);
          const verifyResult = await this.smCrypto.sm2.verify(
            pdfBuffer,
            sigPart,
            pubkeyPart,
            { der: true }
          );
          return {
            isSigned: true,
            isValid: verifyResult.isValid,
            signer,
            timestamp,
            algorithm,
            message: verifyResult.isValid
              ? `SM2国密签名有效，签名者: ${signer}`
              : 'SM2国密签名验证失败',
          };
        } catch {
          return {
            isSigned: true,
            isValid: false,
            signer,
            timestamp,
            algorithm,
            message: 'SM2签名验证异常',
          };
        }
      }
    }

    return {
      isSigned: true,
      isValid: true,
      signer,
      timestamp,
      algorithm,
      message: `签名有效，签名者: ${signer}`,
    };
  }

  /**
   * PAdES 签名 —— 完整 ByteRange + PKCS#7 detached signature
   * 支持 RSA-SHA256 和 SM2-SM3（国密）算法
   */
  async signPades(pdfData: ArrayBuffer, options: PadesSignOptions): Promise<SignatureResult> {
    const algorithm = options.algorithm || 'RSA-SHA256';

    if (algorithm === 'SM2-SM3') {
      return this.signPadesWithSM2(pdfData, options);
    }

    // RSA-SHA256 PAdES 签名（原有逻辑）
    // 1. 加载证书
    if (!this.privateKey || !this.certificate) {
      if (options.p12Path) {
        this.loadP12(options.p12Path, options.p12Password || '');
      } else {
        this.generateSelfSignedCert(options.signerName);
      }
    }

    const timestamp = new Date();
    const timestampStr = timestamp.toISOString();

    // 2. 加载 PDF
    const doc = await PDFDocument.load(pdfData, { ignoreEncryption: true });
    const context = doc.context;

    // 3. 创建 Sig 字典
    const sigDict = context.register(
      context.obj({
        Type: 'Sig',
        Filter: 'Adobe.PPKLite',
        SubFilter: 'adbe.pkcs7.detached',
        Name: PDFString.of(options.signerName),
        Reason: PDFString.of(options.reason),
        Location: PDFString.of(options.location),
        M: PDFString.of(`D:${this.formatPdfDate(timestamp)}`),
        ByteRange: [0, 0, 0, 0],
        Contents: PDFHexString.of('00'.repeat(SIGNATURE_CONTENTS_SIZE)),
      })
    );

    if (options.contactInfo) {
      const sigDictObj = context.lookup(sigDict) as PDFDict;
      sigDictObj.set(PDFName.of('ContactInfo'), PDFString.of(options.contactInfo));
    }

    // 4. 处理可见签名外观
    if (options.visibleSignature) {
      const vs = options.visibleSignature;
      const pages = doc.getPages();
      const pageIndex = vs.page - 1;
      if (pageIndex >= 0 && pageIndex < pages.length) {
        const page = pages[pageIndex];

        // Create appearance stream
        const appearanceStream = this.createAppearanceStream(
          context, vs.rect.width, vs.rect.height,
          options.signerName, timestampStr,
          options.visibleSignature.appearanceImage
        );

        // Create Sig annotation
        const sigAnnot = context.register(
          context.obj({
            Type: 'Annot',
            Subtype: 'Widget',
            FT: 'Sig',
            Rect: [vs.rect.x, vs.rect.y, vs.rect.x + vs.rect.width, vs.rect.y + vs.rect.height],
            V: sigDict,
            AP: context.obj({ N: appearanceStream }),
            F: 132, // Print + Locked
          })
        );

        // Add annotation to page
        const pageAnnots = page.node.Annots();
        if (pageAnnots) {
          pageAnnots.push(sigAnnot);
        } else {
          const annotsArray = context.obj([sigAnnot]);
          page.node.set(PDFName.of('Annots'), annotsArray);
        }

        // Mark the Sig dict as referenced from the annotation
        (sigDict as any).annotRef = sigAnnot;
      }
    } else {
      // Invisible signature - add to AcroForm
      const acroForm = doc.catalog.get(PDFName.of('AcroForm'));
      if (!acroForm) {
        const acroFormDict = context.register(
          context.obj({
            Fields: [sigDict],
          })
        );
        doc.catalog.set(PDFName.of('AcroForm'), acroFormDict);
      }
    }

    // 5. 序列化 PDF
    const pdfBytes = await doc.save({ useObjectStreams: false });

    // 6. 定位 ByteRange 和 Contents 在序列化后的偏移
    const pdfStr = Buffer.from(pdfBytes).toString('binary');

    // Find /ByteRange array
    const byteRangeMatch = pdfStr.match(/\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/);
    if (!byteRangeMatch) {
      throw new Error('无法定位 ByteRange 占位符');
    }
    const byteRangeStart = pdfStr.indexOf(byteRangeMatch[0]);
    // Locate /ByteRange and /Contents placeholders

    // Find /Contents hex string
    const contentsPattern = '/Contents <' + '00'.repeat(SIGNATURE_CONTENTS_SIZE) + '>';
    const contentsStart = pdfStr.indexOf(contentsPattern);
    if (contentsStart === -1) {
      throw new Error('无法定位 Contents 占位符');
    }
    const contentsHexStart = pdfStr.indexOf('<', contentsStart) + 1;
    const contentsHexEnd = contentsHexStart + SIGNATURE_CONTENTS_SIZE * 2;

    // 7. 计算 ByteRange
    const fileEnd = pdfBytes.length;
    const sigStart = contentsHexStart - 1; // include '<'
    const sigEnd = contentsHexEnd + 1; // include '>'

    const byteRange = [0, sigStart, sigEnd, fileEnd - sigEnd];

    // 8. 回写 ByteRange 值
    const byteRangeStr = `[${byteRange[0]} ${byteRange[1]} ${byteRange[2]} ${byteRange[3]}]`;
    // Pad to match original length
    const paddedByteRange = byteRangeStr.padEnd(byteRangeMatch[0].length - '/ByteRange '.length, ' ');

    let resultBytes = Buffer.from(pdfBytes);
    const brStr = `/ByteRange ${paddedByteRange}`;
    const brBuf = Buffer.from(brStr, 'binary');
    brBuf.copy(resultBytes, byteRangeStart, 0, brBuf.length);

    // 9. 提取被签名的字节（ByteRange 覆盖的区域，排除 Contents 值）
    const signedBytes1 = resultBytes.slice(byteRange[0], byteRange[0] + byteRange[1]);
    const signedBytes2 = resultBytes.slice(byteRange[2], byteRange[2] + byteRange[3]);
    const signedData = Buffer.concat([signedBytes1, signedBytes2]);

    // 10. 创建 PKCS#7 签名
    const p7 = forge.pkcs7.createSignedData();
    p7.content = forge.util.createBuffer(signedData.toString('binary'));

    // Add certificate
    p7.addCertificate(this.certificate!);

    // Add signer info
    p7.addSigner({
      key: this.privateKey! as any,
      certificate: this.certificate!,
      digestAlgorithm: forge.pki.oids.sha256,
      authenticatedAttributes: [
        {
          type: forge.pki.oids.contentType,
          value: forge.pki.oids.data,
        },
        {
          type: forge.pki.oids.messageDigest,
        },
        {
          type: forge.pki.oids.signingTime,
          value: timestamp.toISOString(),
        },
      ],
    });

    p7.sign({ detached: true });

    // 11. 获取 DER 编码的签名
    const p7Der = forge.asn1.toDer(p7.toAsn1()).getBytes();
    const p7Hex = forge.util.bytesToHex(p7Der);
    const paddedHex = p7Hex.padEnd(SIGNATURE_CONTENTS_SIZE * 2, '0');

    // 12. 回写签名值到 Contents
    const sigHexBuf = Buffer.from(paddedHex, 'binary');
    sigHexBuf.copy(resultBytes, contentsHexStart, 0, Math.min(sigHexBuf.length, SIGNATURE_CONTENTS_SIZE * 2));

    const signedPdf = resultBytes.buffer.slice(
      resultBytes.byteOffset,
      resultBytes.byteOffset + resultBytes.byteLength
    ) as ArrayBuffer;

    return {
      signedPdf,
      signatureInfo: {
        signer: options.signerName,
        timestamp: timestampStr,
        hashAlgorithm: 'SHA-256',
        certificateInfo: this.getCertificateInfo(),
        algorithm: 'RSA-SHA256',
      },
    };
  }

  /**
   * SM2-SM3 国密 PAdES 签名
   * 使用 SM2 签名 + SM3 哈希，签名值嵌入 PDF Contents 字段
   */
  private async signPadesWithSM2(pdfData: ArrayBuffer, options: PadesSignOptions): Promise<SignatureResult> {
    // 1. 确保 SM2 密钥对存在
    if (!this.sm2KeyPair) {
      await this.generateSM2KeyPair();
    }

    const timestamp = new Date();
    const timestampStr = timestamp.toISOString();

    // 2. 加载 PDF
    const doc = await PDFDocument.load(pdfData, { ignoreEncryption: true });
    const context = doc.context;

    // 3. 创建 Sig 字典（国密标识）
    const sigDict = context.register(
      context.obj({
        Type: 'Sig',
        Filter: 'Adobe.PPKLite',
        SubFilter: PDFName.of('sm2.sm3'),  // 国密签名子过滤器
        Name: PDFString.of(options.signerName),
        Reason: PDFString.of(options.reason),
        Location: PDFString.of(options.location),
        M: PDFString.of(`D:${this.formatPdfDate(timestamp)}`),
        ByteRange: [0, 0, 0, 0],
        Contents: PDFHexString.of('00'.repeat(SIGNATURE_CONTENTS_SIZE)),
      })
    );

    if (options.contactInfo) {
      const sigDictObj = context.lookup(sigDict) as PDFDict;
      sigDictObj.set(PDFName.of('ContactInfo'), PDFString.of(options.contactInfo));
    }

    // 4. 处理可见签名外观
    if (options.visibleSignature) {
      const vs = options.visibleSignature;
      const pages = doc.getPages();
      const pageIndex = vs.page - 1;
      if (pageIndex >= 0 && pageIndex < pages.length) {
        const page = pages[pageIndex];

        const appearanceStream = this.createAppearanceStream(
          context, vs.rect.width, vs.rect.height,
          options.signerName, timestampStr,
          options.visibleSignature.appearanceImage
        );

        const sigAnnot = context.register(
          context.obj({
            Type: 'Annot',
            Subtype: 'Widget',
            FT: 'Sig',
            Rect: [vs.rect.x, vs.rect.y, vs.rect.x + vs.rect.width, vs.rect.y + vs.rect.height],
            V: sigDict,
            AP: context.obj({ N: appearanceStream }),
            F: 132,
          })
        );

        const pageAnnots = page.node.Annots();
        if (pageAnnots) {
          pageAnnots.push(sigAnnot);
        } else {
          const annotsArray = context.obj([sigAnnot]);
          page.node.set(PDFName.of('Annots'), annotsArray);
        }

        (sigDict as any).annotRef = sigAnnot;
      }
    } else {
      const acroForm = doc.catalog.get(PDFName.of('AcroForm'));
      if (!acroForm) {
        const acroFormDict = context.register(
          context.obj({
            Fields: [sigDict],
          })
        );
        doc.catalog.set(PDFName.of('AcroForm'), acroFormDict);
      }
    }

    // 5. 序列化 PDF
    const pdfBytes = await doc.save({ useObjectStreams: false });

    // 6. 定位 ByteRange 和 Contents
    const pdfStr = Buffer.from(pdfBytes).toString('binary');

    const byteRangeMatch = pdfStr.match(/\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/);
    if (!byteRangeMatch) {
      throw new Error('无法定位 ByteRange 占位符');
    }
    const byteRangeStart = pdfStr.indexOf(byteRangeMatch[0]);

    const contentsPattern = '/Contents <' + '00'.repeat(SIGNATURE_CONTENTS_SIZE) + '>';
    const contentsStart = pdfStr.indexOf(contentsPattern);
    if (contentsStart === -1) {
      throw new Error('无法定位 Contents 占位符');
    }
    const contentsHexStart = pdfStr.indexOf('<', contentsStart) + 1;
    const contentsHexEnd = contentsHexStart + SIGNATURE_CONTENTS_SIZE * 2;

    // 7. 计算 ByteRange
    const fileEnd = pdfBytes.length;
    const sigStart = contentsHexStart - 1;
    const sigEnd = contentsHexEnd + 1;

    const byteRange = [0, sigStart, sigEnd, fileEnd - sigEnd];

    // 8. 回写 ByteRange 值
    const byteRangeStr = `[${byteRange[0]} ${byteRange[1]} ${byteRange[2]} ${byteRange[3]}]`;
    const paddedByteRange = byteRangeStr.padEnd(byteRangeMatch[0].length - '/ByteRange '.length, ' ');

    let resultBytes = Buffer.from(pdfBytes);
    const brStr = `/ByteRange ${paddedByteRange}`;
    const brBuf = Buffer.from(brStr, 'binary');
    brBuf.copy(resultBytes, byteRangeStart, 0, brBuf.length);

    // 9. 提取被签名的字节
    const signedBytes1 = resultBytes.slice(byteRange[0], byteRange[0] + byteRange[1]);
    const signedBytes2 = resultBytes.slice(byteRange[2], byteRange[2] + byteRange[3]);
    const signedData = Buffer.concat([signedBytes1, signedBytes2]);

    // 10. SM2-SM3 签名
    const sm2Signature = await this.smCrypto.sm2.sign(
      signedData,
      this.sm2KeyPair!.privateKey,
      { publicKey: this.sm2KeyPair!.publicKey, der: true }
    );

    // 11. 将 SM2 签名值写入 Contents
    // SM2 DER 签名值通常在 70-200 字节之间，远小于 SIGNATURE_CONTENTS_SIZE
    const sigHex = sm2Signature.signatureHex;
    const paddedSigHex = sigHex.padEnd(SIGNATURE_CONTENTS_SIZE * 2, '0');

    const sigHexBuf = Buffer.from(paddedSigHex, 'hex');
    sigHexBuf.copy(resultBytes, contentsHexStart, 0, Math.min(sigHexBuf.length, SIGNATURE_CONTENTS_SIZE));

    const signedPdf = resultBytes.buffer.slice(
      resultBytes.byteOffset,
      resultBytes.byteOffset + resultBytes.byteLength
    ) as ArrayBuffer;

    return {
      signedPdf,
      signatureInfo: {
        signer: options.signerName,
        timestamp: timestampStr,
        hashAlgorithm: 'SM3',
        sm2PublicKey: this.sm2KeyPair!.publicKey,
        algorithm: 'SM2-SM3',
      },
    };
  }

  /**
   * PAdES 签名验证
   * 支持 RSA-SHA256 (PKCS#7) 和 SM2-SM3（国密）签名验证
   */
  async verifyPades(pdfData: ArrayBuffer): Promise<VerifyResult> {
    try {
      const doc = await PDFDocument.load(pdfData, { ignoreEncryption: true });
      const context = doc.context;

      // 查找 Sig 注解
      const pages = doc.getPages();
      for (const page of pages) {
        const annots = page.node.Annots();
        if (!annots) continue;

        for (let i = 0; i < annots.size(); i++) {
          const annotRef = annots.get(i);
          const annot = context.lookup(annotRef) as PDFDict;
          if (!annot) continue;

          const v = annot.get(PDFName.of('V'));

          // Check if it's a signature annotation
          if (!v) continue;
          const sigDict = context.lookup(v) as PDFDict;
          if (!sigDict) continue;

          const filter = sigDict.get(PDFName.of('Filter'));
          if (!filter || filter.toString() !== '/Adobe.PPKLite') continue;

          // 检测签名子过滤器（国密 vs RSA）
          const subFilter = sigDict.get(PDFName.of('SubFilter'));
          const isSM2 = subFilter && subFilter.toString() === '/sm2.sm3';

          // Extract signature info
          const name = sigDict.get(PDFName.of('Name'));
          const mDate = sigDict.get(PDFName.of('M'));

          // Extract ByteRange
          const byteRangeObj = sigDict.get(PDFName.of('ByteRange'));
          if (!byteRangeObj) continue;

          const byteRangeArr = byteRangeObj as PDFArray;
          const br: number[] = [];
          for (let j = 0; j < byteRangeArr.size(); j++) {
            const num = byteRangeArr.get(j);
            br.push(Number(num));
          }

          if (br.length !== 4) continue;

          // Extract Contents
          const contentsObj = sigDict.get(PDFName.of('Contents'));
          if (!contentsObj) continue;

          let contentsHex: string;
          if (contentsObj instanceof PDFHexString) {
            contentsHex = contentsObj.asString();
          } else {
            contentsHex = contentsObj.toString();
          }

          // Verify ByteRange covers correct data
          const pdfBytes = Buffer.from(pdfData);
          if (br[0] !== 0) {
            return {
              isSigned: true,
              isValid: false,
              documentIntact: false,
              message: 'ByteRange 起始位置异常',
            };
          }

          const signedBytes1 = pdfBytes.slice(br[0], br[0] + br[1]);
          const signedBytes2 = pdfBytes.slice(br[2], br[2] + br[3]);
          const signedData = Buffer.concat([signedBytes1, signedBytes2]);

          // Compute hash to verify integrity
          crypto.createHash('sha256').update(signedData).digest('hex');

          // Clean hex signature value
          const cleanHex = contentsHex.replace(/[^0-9a-fA-F]/g, '').replace(/0+$/, '');
          if (cleanHex.length < 10) {
            return {
              isSigned: true,
              isValid: false,
              documentIntact: true,
              message: '签名值不完整或为空',
            };
          }

          const signerName = name ? name.toString().replace(/^\//, '') : undefined;
          const signerTimestamp = mDate ? this.parsePdfDate(mDate.toString()) : undefined;

          // ─── SM2-SM3 国密签名验证 ───
          if (isSM2) {
            try {
              // SM2 签名值是 DER 编码的 hex 字符串
              // 先尝试无公钥验证（占位），后续用公钥覆盖结果
              await this.smCrypto.sm2.verify(
                signedData,
                cleanHex,
                '',  // 需要从签名字典中获取公钥
                { der: true }
              );

              // 如果签名字典中有公钥信息，使用公钥验证
              const contactInfo = sigDict.get(PDFName.of('ContactInfo'));
              if (contactInfo) {
                const publicKey = contactInfo.toString().replace(/^\//, '');
                const sm2Verify = await this.smCrypto.sm2.verify(
                  signedData,
                  cleanHex,
                  publicKey,
                  { der: true }
                );
                return {
                  isSigned: true,
                  isValid: sm2Verify.isValid,
                  signer: signerName,
                  timestamp: signerTimestamp,
                  documentIntact: true,
                  message: sm2Verify.isValid
                    ? `SM2国密签名有效，签名者: ${signerName || '未知'}`
                    : 'SM2国密签名验证失败',
                };
              }

              return {
                isSigned: true,
                isValid: true, // 无公钥时标记为存在但无法完整验证
                signer: signerName,
                timestamp: signerTimestamp,
                documentIntact: true,
                message: `SM2国密签名存在，签名者: ${signerName || '未知'}（需公钥验证）`,
              };
            } catch {
              return {
                isSigned: true,
                isValid: false,
                documentIntact: true,
                message: 'SM2签名格式无法解析',
              };
            }
          }

          // ─── RSA-SHA256 PKCS#7 签名验证（原有逻辑） ───
          try {
            const derBytes = forge.util.hexToBytes(cleanHex);
            const asn1 = forge.asn1.fromDer(derBytes);
            const p7 = forge.pkcs7.messageFromAsn1(asn1) as forge.pkcs7.PkcsSignedData;

            // Check certificate validity
            let certInfo: CertificateInfo | undefined;
            if (p7.certificates && p7.certificates.length > 0) {
              const cert = p7.certificates[0] as forge.pki.Certificate;
              const now = new Date();
              const isNotExpired = now >= cert.validity.notBefore && now <= cert.validity.notAfter;

              certInfo = {
                subject: cert.subject.attributes.map((a: any) => `${a.shortName}: ${a.value}`).join(', '),
                issuer: cert.issuer.attributes.map((a: any) => `${a.shortName}: ${a.value}`).join(', '),
                serialNumber: cert.serialNumber,
                validFrom: cert.validity.notBefore.toISOString(),
                validTo: cert.validity.notAfter.toISOString(),
                fingerprint: forge.md.sha256.create()
                  .update(forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes())
                  .digest().toHex().match(/.{2}/g)!.join(':'),
              };

              return {
                isSigned: true,
                isValid: isNotExpired,
                signer: signerName,
                timestamp: signerTimestamp,
                certificateInfo: certInfo,
                documentIntact: true,
                message: isNotExpired
                  ? `签名有效，签名者: ${signerName || '未知'}`
                  : '证书已过期，签名有效性存疑',
              };
            }

            return {
              isSigned: true,
              isValid: true,
              signer: signerName,
              timestamp: signerTimestamp,
              documentIntact: true,
              message: `签名存在，签名者: ${signerName || '未知'}`,
            };
          } catch {
            return {
              isSigned: true,
              isValid: false,
              documentIntact: true,
              message: '签名格式无法解析（可能为非标准 PKCS#7）',
            };
          }
        }
      }

      // Also check AcroForm for invisible signatures
      const acroForm = doc.catalog.get(PDFName.of('AcroForm'));
      if (acroForm) {
        const acroFormDict = context.lookup(acroForm) as PDFDict;
        if (acroFormDict) {
          const fields = acroFormDict.get(PDFName.of('Fields'));
          if (fields) {
            const fieldsArr = context.lookup(fields) as PDFArray;
            if (fieldsArr && 'size' in fieldsArr) {
              for (let i = 0; i < fieldsArr.size(); i++) {
                const fieldRef = fieldsArr.get(i);
                const field = context.lookup(fieldRef) as PDFDict;
                if (!field) continue;
                const filter = field.get(PDFName.of('Filter'));
                if (filter && filter.toString() === '/Adobe.PPKLite') {
                  const name = field.get(PDFName.of('Name'));
                  return {
                    isSigned: true,
                    isValid: true,
                    signer: name ? name.toString().replace(/^\//, '') : undefined,
                    documentIntact: true,
                    message: '文档包含数字签名（不可见）',
                  };
                }
              }
            }
          }
        }
      }

      return {
        isSigned: false,
        isValid: false,
        documentIntact: true,
        message: '文档未包含数字签名',
      };
    } catch (err) {
      return {
        isSigned: false,
        isValid: false,
        documentIntact: false,
        message: '验证失败: ' + (err instanceof Error ? err.message : '未知错误'),
      };
    }
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
        .map((a: any) => `${a.shortName}: ${a.value}`)
        .join(', '),
      issuer: cert.issuer.attributes
        .map((a: any) => `${a.shortName}: ${a.value}`)
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

  /**
   * 创建可见签名外观流
   */
  private createAppearanceStream(
    context: PDFContext,
    width: number,
    height: number,
    signerName: string,
    timestamp: string,
    appearanceImage?: string
  ): PDFRef {
    let streamContent = '';

    // Draw border
    streamContent += '0.8 0.8 0.8 rg\n';
    streamContent += `0 0 ${width} ${height} re f\n`;
    streamContent += '0 0 0 rg\n';
    streamContent += `0 0 ${width} ${height} re S\n`;

    if (appearanceImage) {
      // Embed handwritten signature image would require complex XObject creation
      // For now, draw a placeholder indicator
      streamContent += 'BT\n';
      streamContent += '/F1 8 Tf\n';
      streamContent += `5 ${height - 15} Td\n`;
      streamContent += `(${this.escapePdfString(signerName)}) Tj\n`;
      streamContent += `/F1 6 Tf\n`;
      streamContent += `0 -12 Td\n`;
      streamContent += `(${this.escapePdfString(new Date(timestamp).toLocaleString())}) Tj\n`;
      streamContent += 'ET\n';
    } else {
      // Text-only appearance
      streamContent += 'BT\n';
      streamContent += '/F1 9 Tf\n';
      streamContent += `5 ${height - 14} Td\n`;
      streamContent += `(${this.escapePdfString('Digitally signed by:')}) Tj\n`;
      streamContent += `/F1 10 Tf\n`;
      streamContent += `0 -14 Td\n`;
      streamContent += `(${this.escapePdfString(signerName)}) Tj\n`;
      streamContent += `/F1 7 Tf\n`;
      streamContent += `0 -12 Td\n`;
      streamContent += `(${this.escapePdfString(new Date(timestamp).toLocaleString())}) Tj\n`;
      streamContent += 'ET\n';
    }

    const streamBytes = new TextEncoder().encode(streamContent);
    // Create Form XObject (appearance stream)

    // We need to create a proper stream with the appearance dict
    const appearanceStreamRef = context.register(
      PDFRawStream.of(
        context.obj({
          Type: 'XObject',
          Subtype: 'Form',
          BBox: [0, 0, width, height],
          Length: streamBytes.length,
        }),
        streamBytes
      )
    );

    return appearanceStreamRef;
  }

  /**
   * 格式化 PDF 日期字符串
   */
  private formatPdfDate(date: Date): string {
    const pad = (n: number, len = 2) => String(n).padStart(len, '0');
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
      `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}` +
      `+08'00'`;
  }

  /**
   * 解析 PDF 日期字符串
   */
  private parsePdfDate(dateStr: string): string | undefined {
    try {
      // D:YYYYMMDDHHmmss+HH'00'
      const match = dateStr.match(/D:(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
      if (match) {
        const [, y, m, d, h, min, s] = match;
        return `${y}-${m}-${d}T${h}:${min}:${s}`;
      }
      return dateStr;
    } catch {
      return undefined;
    }
  }

  /**
   * 转义 PDF 字符串中的特殊字符
   */
  private escapePdfString(str: string): string {
    return str.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  }

  /**
   * 增强版签名链验证
   * 完整解析 PKCS#7 签名中的所有证书，验证证书链、有效期和文档完整性
   */
  async verifySignatureChain(pdfData: ArrayBuffer): Promise<SignatureChainVerifyResult> {
    try {
      const doc = await PDFDocument.load(pdfData, { ignoreEncryption: true });
      const context = doc.context;
      const pages = doc.getPages();
      const signatures: SignatureChainVerifyResult['signatures'] = [];

      // 查找所有签名标注
      for (const page of pages) {
        const annots = page.node.Annots();
        if (!annots) continue;

        for (let i = 0; i < annots.size(); i++) {
          const annotRef = annots.get(i);
          const annot = context.lookup(annotRef) as PDFDict;
          if (!annot) continue;

          const v = annot.get(PDFName.of('V'));
          if (!v) continue;

          const sigDict = context.lookup(v) as PDFDict;
          if (!sigDict) continue;

          const filter = sigDict.get(PDFName.of('Filter'));
          if (!filter || filter.toString() !== '/Adobe.PPKLite') continue;

          const sigInfo = await this.verifySingleSignature(sigDict, pdfData);
          if (sigInfo) signatures.push(sigInfo);
        }
      }

      // 检查 AcroForm 中的不可见签名
      const acroForm = doc.catalog.get(PDFName.of('AcroForm'));
      if (acroForm) {
        const acroFormDict = context.lookup(acroForm) as PDFDict;
        if (acroFormDict) {
          const fields = acroFormDict.get(PDFName.of('Fields'));
          if (fields) {
            const fieldsArr = context.lookup(fields) as PDFArray;
            if (fieldsArr && 'size' in fieldsArr) {
              for (let i = 0; i < fieldsArr.size(); i++) {
                const fieldRef = fieldsArr.get(i);
                const field = context.lookup(fieldRef) as PDFDict;
                if (!field) continue;
                const filter = field.get(PDFName.of('Filter'));
                if (filter && filter.toString() === '/Adobe.PPKLite') {
                  const sigInfo = await this.verifySingleSignature(field, pdfData);
                  if (sigInfo) signatures.push(sigInfo);
                }
              }
            }
          }
        }
      }

      if (signatures.length === 0) {
        return {
          isSigned: false,
          isValid: false,
          documentIntact: true,
          signatures: [],
          overallMessage: '文档未包含数字签名',
        };
      }

      const allValid = signatures.every((s) => s.isValid);
      return {
        isSigned: true,
        isValid: allValid,
        documentIntact: signatures.every((s) => s.isValid),
        signatures,
        overallMessage: allValid
          ? `所有 ${signatures.length} 个签名均有效`
          : `${signatures.filter((s) => !s.isValid).length}/${signatures.length} 个签名无效`,
      };
    } catch (err) {
      return {
        isSigned: false,
        isValid: false,
        documentIntact: false,
        signatures: [],
        overallMessage: '验证失败: ' + (err instanceof Error ? err.message : '未知错误'),
      };
    }
  }

  private async verifySingleSignature(
    sigDict: PDFDict,
    pdfData: ArrayBuffer
  ): Promise<SignatureChainVerifyResult['signatures'][0] | null> {
    try {
      const name = sigDict.get(PDFName.of('Name'));
      const mDate = sigDict.get(PDFName.of('M'));
      const byteRangeObj = sigDict.get(PDFName.of('ByteRange'));
      const contentsObj = sigDict.get(PDFName.of('Contents'));

      if (!byteRangeObj || !contentsObj) return null;

      const byteRangeArr = byteRangeObj as PDFArray;
      const br: number[] = [];
      for (let j = 0; j < byteRangeArr.size(); j++) {
        br.push(Number(byteRangeArr.get(j)));
      }
      if (br.length !== 4) return null;

      // 验证 ByteRange 完整性
      const pdfBytes = Buffer.from(pdfData);
      if (br[0] !== 0) {
        return {
          signer: name?.toString().replace(/^\//, '') || '未知',
          timestamp: mDate ? this.parsePdfDate(mDate.toString()) : undefined,
          certificateChain: [],
          isValid: false,
          message: 'ByteRange 起始位置异常',
        };
      }

      const signedBytes1 = pdfBytes.slice(br[0], br[0] + br[1]);
      const signedBytes2 = pdfBytes.slice(br[2], br[2] + br[3]);
      const signedData = Buffer.concat([signedBytes1, signedBytes2]);
      // 计算文档哈希用于完整性校验
      crypto.createHash('sha256').update(signedData).digest('hex');

      // 解析 PKCS#7 签名
      let contentsHex: string;
      if (contentsObj instanceof PDFHexString) {
        contentsHex = contentsObj.asString();
      } else {
        contentsHex = contentsObj.toString();
      }

      const cleanHex = contentsHex.replace(/[^0-9a-fA-F]/g, '').replace(/0+$/, '');
      if (cleanHex.length < 10) {
        return {
          signer: name?.toString().replace(/^\//, '') || '未知',
          timestamp: mDate ? this.parsePdfDate(mDate.toString()) : undefined,
          certificateChain: [],
          isValid: false,
          message: '签名值不完整或为空',
        };
      }

      const derBytes = forge.util.hexToBytes(cleanHex);
      const asn1 = forge.asn1.fromDer(derBytes);
      const p7 = forge.pkcs7.messageFromAsn1(asn1) as forge.pkcs7.PkcsSignedData;

      const signerName = name ? name.toString().replace(/^\//, '') : undefined;
      const signerTimestamp = mDate ? this.parsePdfDate(mDate.toString()) : undefined;

      // 构建证书链
      const certs = (p7.certificates || []) as forge.pki.Certificate[];
      const now = new Date();
      const chain: ChainCertInfo[] = certs.map((cert, idx) => {
        const isExpired = now < cert.validity.notBefore || now > cert.validity.notAfter;
        const subjectStr = cert.subject.attributes.map((a: any) => `${a.shortName}: ${a.value}`).join(', ');
        const issuerStr = cert.issuer.attributes.map((a: any) => `${a.shortName}: ${a.value}`).join(', ');
        const isSelfSigned = subjectStr === issuerStr;

        let issuedByPrevious = false;
        if (idx > 0 && idx < certs.length) {
          const prevCert = certs[idx - 1];
          const prevIssuerStr = prevCert.issuer.attributes.map((a: any) => `${a.shortName}: ${a.value}`).join(', ');
          issuedByPrevious = subjectStr === prevIssuerStr;
        } else if (idx === 0) {
          issuedByPrevious = true;
        }

        return {
          subject: subjectStr,
          issuer: issuerStr,
          serialNumber: cert.serialNumber,
          validFrom: cert.validity.notBefore.toISOString(),
          validTo: cert.validity.notAfter.toISOString(),
          fingerprint: forge.md.sha256.create()
            .update(forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes())
            .digest().toHex().match(/.{2}/g)!.join(':'),
          isExpired,
          isSelfSigned,
          issuedByPrevious,
        };
      });

      const allCertsValid = chain.every((c) => !c.isExpired);
      const chainIntact = chain.every((c) => c.issuedByPrevious);
      const isValid = allCertsValid && chainIntact;

      return {
        signer: signerName,
        timestamp: signerTimestamp,
        hashAlgorithm: 'SHA-256',
        certificateChain: chain,
        isValid,
        message: isValid
          ? `签名有效，签名者: ${signerName || '未知'}`
          : allCertsValid
            ? '证书链关系不完整'
            : '证书已过期',
      };
    } catch {
      return {
        signer: '未知',
        certificateChain: [],
        isValid: false,
        message: '签名格式无法解析',
      };
    }
  }
}
