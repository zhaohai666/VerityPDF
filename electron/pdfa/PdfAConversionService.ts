/**
 * PdfAConversionService
 *
 * 将标准 PDF 转换为 PDF/A 合规文档。
 *
 * 支持两种转换引擎：
 * 1. Ghostscript（生产级）- 完整字体嵌入、色彩空间转换、
 *    JS/透明度/注释剥离、ICC 配置文件嵌入
 * 2. pdf-lib（降级）- 仅 XMP 元数据 + OutputIntent 占位
 *
 * 支持 VeraPDF 验证：
 * - 调用 veraPDF CLI 工具验证 PDF/A 合规性
 * - 返回详细的合规报告
 */

import {
  PDFDocument,
  PDFName,
  PDFString,
  PDFContext,
} from 'pdf-lib';
import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { promisify } from 'util';
import { app } from 'electron';

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type PdfAConformance = 'pdfa-1b' | 'pdfa-2b' | 'pdfa-3b';

export interface PdfAConvertOptions {
  /** Target PDF/A conformance level. */
  conformance: PdfAConformance;
  /** Whether to embed an XMP metadata packet declaring PDF/A conformance. */
  includeXmp: boolean;
  /** Force Ghostscript engine even if pdf-lib fallback is available. */
  preferGhostscript?: boolean;
  /** ICC profile path for color conversion (default: sRGB IEC61966-2.1). */
  iccProfilePath?: string;
}

export interface PdfAConvertResult {
  /** The converted PDF bytes. */
  pdfData: ArrayBuffer;
  /** The conformance level that was applied (e.g. "PDF/A-2b"). */
  conformance: string;
  /** Human-readable message describing the result and any caveats. */
  message: string;
  /** Which engine was used for conversion. */
  engine: 'ghostscript' | 'pdf-lib';
}

export interface PdfAValidationResult {
  /** Whether the PDF is PDF/A compliant. */
  compliant: boolean;
  /** Conformance level detected (e.g. "PDF/A-2B"). */
  conformanceLevel: string | null;
  /** Total number of validation checks performed. */
  totalChecks: number;
  /** Number of failed checks. */
  failedChecks: number;
  /** Detailed list of validation failures. */
  failures: PdfAValidationFailure[];
  /** VeraPDF raw output (XML or JSON). */
  rawOutput: string;
  /** Human-readable summary. */
  message: string;
}

export interface PdfAValidationFailure {
  /** Rule ID that failed (e.g. "6.7.3-1"). */
  ruleId: string;
  /** Test description. */
  test: string;
  /** Page/object where the failure occurred. */
  location: string;
  /** Detailed error message. */
  message: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Map a conformance option to the numeric part and letter used in XMP.
 *
 *   pdfa-1b  -> part 1, conformance B
 *   pdfa-2b  -> part 2, conformance B
 *   pdfa-3b  -> part 3, conformance B
 */
function normalizeConformance(conformance: string): PdfAConformance {
  // Normalize formats like "2b", "2B", "PDF/A-2b" to "pdfa-2b"
  const normalized = conformance.toLowerCase().replace(/[^a-z0-9]/g, '');
  const match = normalized.match(/^(\d)([ab])$/);
  if (match) {
    return `pdfa-${match[1]}${match[2]}` as PdfAConformance;
  }
  if (normalized.startsWith('pdfa')) {
    return normalized as PdfAConformance;
  }
  return 'pdfa-2b' as PdfAConformance; // default fallback
}

function conformanceToXmpValues(
  conformance: PdfAConformance,
): { part: string; conformanceLetter: string } {
  const map: Record<PdfAConformance, { part: string; conformanceLetter: string }> = {
    'pdfa-1b': { part: '1', conformanceLetter: 'B' },
    'pdfa-2b': { part: '2', conformanceLetter: 'B' },
    'pdfa-3b': { part: '3', conformanceLetter: 'B' },
  };
  return map[conformance] || { part: '2', conformanceLetter: 'B' };
}

/**
 * Build a human-readable label from the option, e.g. "PDF/A-2b".
 */
function conformanceLabel(conformance: PdfAConformance): string {
  return `PDF/A-${conformance.replace('pdfa-', '')}`;
}

/**
 * Map conformance to Ghostscript -dPDFA value.
 *   pdfa-1b -> 1
 *   pdfa-2b -> 2
 *   pdfa-3b -> 3
 */
function conformanceToGsPdfA(conformance: PdfAConformance): number {
  const map: Record<PdfAConformance, number> = {
    'pdfa-1b': 1,
    'pdfa-2b': 2,
    'pdfa-3b': 3,
  };
  return map[conformance] || 2;
}

/**
 * Map conformance to Ghostscript compatibility level.
 *   pdfa-1b -> 1.4
 *   pdfa-2b -> 1.7
 *   pdfa-3b -> 1.7
 */
function conformanceToGsCompat(conformance: PdfAConformance): string {
  return conformance === 'pdfa-1b' ? '1.4' : '1.7';
}

/**
 * Build a conforming XMP metadata packet for PDF/A.
 *
 * The packet follows the ISO 19005 specification structure:
 *   - Standard XMP boilerplate (x:xmpmeta, rdf:RDF)
 *   - pdf:Description block with dc:title, pdf:Producer, etc.
 *   - pdfaExtension:pdfaSchema block that declares the PDF/A identification
 *     schema (pdfaSchema, pdfaProperty) and the actual pdfaid:part /
 *     pdfaid:conformance values.
 */
function buildXmpPacket(
  part: string,
  conformanceLetter: string,
  producer = 'VerityPDF PdfAConversionService',
): string {
  // NOTE: The XMP packet must be wrapped in the standard <?xpacket?> delimiters
  // for validators to recognise it.
  return `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">

    <!-- PDF/A identification -->
    <rdf:Description rdf:about=""
        xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">
      <pdfaid:part>${part}</pdfaid:part>
      <pdfaid:conformance>${conformanceLetter}</pdfaid:conformance>
    </rdf:Description>

    <!-- Document properties -->
    <rdf:Description rdf:about=""
        xmlns:dc="http://purl.org/dc/elements/1.1/">
      <dc:title>
        <rdf:Alt>
          <rdf:li xml:lang="x-default">PDF/A-${part}${conformanceLetter} Document</rdf:li>
        </rdf:Alt>
      </dc:title>
      <dc:creator>
        <rdf:Seq>
          <rdf:li>${producer}</rdf:li>
        </rdf:Seq>
      </dc:creator>
    </rdf:Description>

    <rdf:Description rdf:about=""
        xmlns:pdf="http://ns.adobe.com/pdf/1.3/">
      <pdf:Producer>${producer}</pdf:Producer>
      <pdf:PDFAVersion>${part}.0</pdf:PDFAVersion>
    </rdf:Description>

    <rdf:Description rdf:about=""
        xmlns:xmp="http://ns.adobe.com/xap/1.0/">
      <xmp:CreatorTool>${producer}</xmp:CreatorTool>
      <xmp:ModifyDate>2024-01-01T00:00:00Z</xmp:ModifyDate>
    </rdf:Description>

    <!--
      pdfaExtension schema declaration.
      Validators look for this block to confirm that the document explicitly
      declares its PDF/A identification schema properties.
    -->
    <rdf:Description rdf:about=""
        xmlns:pdfaExtension="http://www.aiim.org/pdfa/ns/extension/"
        xmlns:pdfaSchema="http://www.aiim.org/pdfa/ns/schema#"
        xmlns:pdfaProperty="http://www.aiim.org/pdfa/ns/property#">
      <pdfaExtension:schemas>
        <rdf:Bag>
          <rdf:li rdf:parseType="Resource">
            <pdfaSchema:schema>PDF/A ID Schema</pdfaSchema:schema>
            <pdfaSchema:namespaceURI>http://www.aiim.org/pdfa/ns/id/</pdfaSchema:namespaceURI>
            <pdfaSchema:prefix>pdfaid</pdfaSchema:prefix>
            <pdfaSchema:property>
              <rdf:Seq>
                <rdf:li rdf:parseType="Resource">
                  <pdfaProperty:name>part</pdfaProperty:name>
                  <pdfaProperty:valueType>Integer</pdfaProperty:valueType>
                  <pdfaProperty:category>internal</pdfaProperty:category>
                  <pdfaProperty:description>PDF/A version part number</pdfaProperty:description>
                </rdf:li>
                <rdf:li rdf:parseType="Resource">
                  <pdfaProperty:name>conformance</pdfaProperty:name>
                  <pdfaProperty:valueType>Text</pdfaProperty:valueType>
                  <pdfaProperty:category>internal</pdfaProperty:category>
                  <pdfaProperty:description>PDF/A conformance level</pdfaProperty:description>
                </rdf:li>
              </rdf:Seq>
            </pdfaSchema:property>
          </rdf:li>
          <rdf:li rdf:parseType="Resource">
            <pdfaSchema:schema>PDF/A Extension Schema</pdfaSchema:schema>
            <pdfaSchema:namespaceURI>http://www.aiim.org/pdfa/ns/extension/</pdfaSchema:namespaceURI>
            <pdfaSchema:prefix>pdfaExtension</pdfaSchema:prefix>
            <pdfaSchema:property>
              <rdf:Seq>
                <rdf:li rdf:parseType="Resource">
                  <pdfaProperty:name>schemas</pdfaProperty:name>
                  <pdfaProperty:valueType>Bag</pdfaProperty:valueType>
                  <pdfaProperty:category>external</pdfaProperty:category>
                  <pdfaProperty:description>Schema array</pdfaProperty:description>
                </rdf:li>
              </rdf:Seq>
            </pdfaSchema:property>
          </rdf:li>
        </rdf:Bag>
      </pdfaExtension:schemas>
    </rdf:Description>

  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class PdfAConversionService {
  private gsPath: string | null = null;
  private gsAvailable: boolean | null = null;
  private veraPdfPath: string | null = null;
  private veraPdfAvailable: boolean | null = null;

  constructor() {
    this.gsPath = this.findGs();
    this.veraPdfPath = this.findVeraPdf();
  }

  // =========================================================================
  // Ghostscript engine
  // =========================================================================

  /**
   * 查找 Ghostscript 可执行文件
   * 搜索顺序: vendor/gs/ (内置) -> 系统 PATH
   */
  private findGs(): string | null {
    const exeName = process.platform === 'win32' ? 'gswin64c.exe'
      : process.platform === 'darwin' ? 'gs' : 'gs';

    const candidates: string[] = [];

    if (app.isPackaged) {
      const resourcesPath = path.join(process.resourcesPath || '', 'vendor', 'gs');
      candidates.push(path.join(resourcesPath, exeName));
      candidates.push(path.join(resourcesPath, 'bin', exeName));
      candidates.push(path.join(resourcesPath, 'bin', 'gswin64c.exe'));
      candidates.push(path.join(resourcesPath, 'bin', 'gswin32c.exe'));
    }

    const devVendorPath = path.join(app.getAppPath(), 'vendor', 'gs');
    candidates.push(path.join(devVendorPath, exeName));
    candidates.push(path.join(devVendorPath, 'bin', exeName));
    candidates.push(path.join(devVendorPath, 'bin', 'gswin64c.exe'));
    candidates.push(path.join(devVendorPath, 'bin', 'gswin32c.exe'));

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    // 系统 PATH 回退
    return process.platform === 'win32' ? 'gswin64c.exe' : 'gs';
  }

  /**
   * 查找 VeraPDF 可执行文件
   * 搜索顺序: vendor/verapdf/ (内置) -> 系统 PATH
   */
  private findVeraPdf(): string | null {
    const isWin = process.platform === 'win32';
    const exeName = isWin ? 'verapdf.bat' : 'verapdf';

    const candidates: string[] = [];

    if (app.isPackaged) {
      const resourcesPath = path.join(process.resourcesPath || '', 'vendor', 'verapdf');
      candidates.push(path.join(resourcesPath, exeName));
      candidates.push(path.join(resourcesPath, 'bin', exeName));
    }

    const devVendorPath = path.join(app.getAppPath(), 'vendor', 'verapdf');
    candidates.push(path.join(devVendorPath, exeName));
    candidates.push(path.join(devVendorPath, 'bin', exeName));

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    // 系统 PATH 回退
    return isWin ? 'verapdf.bat' : 'verapdf';
  }

  /**
   * 检测 Ghostscript 是否可用
   */
  async isGhostscriptAvailable(): Promise<{ available: boolean; version?: string }> {
    if (this.gsAvailable === false) {
      return { available: false };
    }
    if (!this.gsPath) {
      this.gsAvailable = false;
      return { available: false };
    }
    try {
      const { stdout, stderr } = await execFileAsync(this.gsPath, ['--version'], {
        timeout: 10000,
        windowsHide: true,
      });
      this.gsAvailable = true;
      const version = (stdout || stderr).trim();
      return { available: true, version };
    } catch {
      this.gsAvailable = false;
      return { available: false };
    }
  }

  /**
   * 检测 VeraPDF 是否可用
   */
  async isVeraPdfAvailable(): Promise<{ available: boolean; version?: string }> {
    if (this.veraPdfAvailable === false) {
      return { available: false };
    }
    if (!this.veraPdfPath) {
      this.veraPdfAvailable = false;
      return { available: false };
    }
    try {
      const { stdout, stderr } = await execFileAsync(this.veraPdfPath, ['--version'], {
        timeout: 15000,
        windowsHide: true,
      });
      this.veraPdfAvailable = true;
      const version = (stdout || stderr).trim().split('\n')[0];
      return { available: true, version };
    } catch {
      this.veraPdfAvailable = false;
      return { available: false };
    }
  }

  /**
   * 使用 Ghostscript 将 PDF 转换为 PDF/A
   *
   * GS PDF/A 转换参数：
   *   -dPDFA=<1|2|3>          PDF/A 版本
   *   -dPDFACompatibilityPolicy=1  遇到不合规特性时自动修正
   *   -sColorConversionStrategy=UseImageInfo  色彩策略
   *   -sOutputICCProfile      ICC 配置文件路径
   *   -dEmbedAllFonts=true    嵌入所有字体
   *   -dSubsetFonts=true      字体子集化
   *   -dAutoRotatePages=/None 禁止自动旋转
   *   -dNOPAUSE -dBATCH -dQUIET  批处理模式
   */
  private async convertWithGhostscript(
    inputPath: string,
    outputPath: string,
    options: PdfAConvertOptions,
  ): Promise<void> {
    if (!this.gsPath) {
      throw new Error('Ghostscript 路径未找到');
    }

    const normalizedConformance = normalizeConformance(options.conformance);
    const pdfaLevel = conformanceToGsPdfA(normalizedConformance);
    const compatLevel = conformanceToGsCompat(normalizedConformance);

    // 查找 ICC 配置文件
    const iccProfilePath = options.iccProfilePath || this.findIccProfile();

    const args: string[] = [
      '-sDEVICE=pdfwrite',
      `-dCompatibilityLevel=${compatLevel}`,
      '-dNOPAUSE',
      '-dQUIET',
      '-dBATCH',
      '-dSAFER',

      // PDF/A 设置
      `-dPDFA=${pdfaLevel}`,
      '-dPDFACompatibilityPolicy=1',

      // 色彩转换策略
      '-sColorConversionStrategy=UseImageInfo',
      '-dConvertCMYKImagesToRGB=true',

      // ICC 配置文件
      iccProfilePath ? `-sOutputICCProfile=${iccProfilePath}` : '',

      // 字体嵌入
      '-dEmbedAllFonts=true',
      '-dSubsetFonts=true',

      // 禁止自动旋转
      '-dAutoRotatePages=/None',

      // 图片处理
      '-dDownsampleColorImages=false',
      '-dDownsampleGrayImages=false',
      '-dDownsampleMonoImages=false',
      '-dAutoFilterColorImages=false',
      '-dAutoFilterGrayImages=false',

      // 输出文件
      `-sOutputFile=${outputPath}`,
      inputPath,
    ].filter(Boolean);

    await execFileAsync(this.gsPath, args, {
      timeout: 600000, // 10 分钟超时（大文件转换较慢）
      maxBuffer: 100 * 1024 * 1024,
      windowsHide: true,
    });

    if (!fs.existsSync(outputPath)) {
      throw new Error('Ghostscript PDF/A 转换完成但未找到输出文件');
    }
  }

  /**
   * 查找 sRGB ICC 配置文件
   */
  private findIccProfile(): string | null {
    const candidates: string[] = [];

    // 内置 ICC 配置文件
    if (app.isPackaged) {
      candidates.push(path.join(process.resourcesPath || '', 'icc', 'sRGB.icc'));
      candidates.push(path.join(process.resourcesPath || '', 'icc', 'sRGB2014.icc'));
    }

    const devPath = path.join(app.getAppPath(), 'resources', 'icc');
    candidates.push(path.join(devPath, 'sRGB.icc'));
    candidates.push(path.join(devPath, 'sRGB2014.icc'));

    // macOS 系统路径
    if (process.platform === 'darwin') {
      candidates.push('/System/Library/ColorSync/Profiles/sRGB Profile.icc');
      candidates.push('/Library/ColorSync/Profiles/sRGB Profile.icc');
    }

    // Linux 系统路径
    if (process.platform === 'linux') {
      candidates.push('/usr/share/color/icc/sRGB.icc');
      candidates.push('/usr/share/color/icc/colord/sRGB.icc');
      candidates.push('/usr/share/color/icc/OpenICC/sRGB.icc');
    }

    // Windows 系统路径
    if (process.platform === 'win32') {
      const winDir = process.env.WINDIR || 'C:\\Windows';
      candidates.push(path.join(winDir, 'System32', 'spool', 'drivers', 'color', 'sRGB Color Space Profile.icm'));
    }

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    return null;
  }

  // =========================================================================
  // VeraPDF validation
  // =========================================================================

  /**
   * 使用 VeraPDF 验证 PDF/A 合规性
   *
   * @param pdfData  要验证的 PDF 数据
   * @param flavour  PDF/A 版本 (1b, 2b, 3b)，不指定则自动检测
   * @returns        验证结果
   */
  async validateWithVeraPdf(
    pdfData: ArrayBuffer,
    flavour?: '1b' | '2b' | '3b',
  ): Promise<PdfAValidationResult> {
    const check = await this.isVeraPdfAvailable();
    if (!check.available) {
      return {
        compliant: false,
        conformanceLevel: null,
        totalChecks: 0,
        failedChecks: 0,
        failures: [],
        rawOutput: '',
        message: 'VeraPDF 不可用，无法验证 PDF/A 合规性。请安装 VeraPDF 并确保其在系统 PATH 中。',
      };
    }

    // 写临时文件
    const tmpDir = os.tmpdir();
    const id = `verity_verapdf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const inputPath = path.join(tmpDir, `${id}_input.pdf`);

    try {
      fs.writeFileSync(inputPath, Buffer.from(pdfData));

      const args: string[] = [
        '--format', 'json',
        '--flavour', flavour || 'auto',
        inputPath,
      ];

      const { stdout, stderr } = await execFileAsync(this.veraPdfPath!, args, {
        timeout: 120000, // 2 分钟超时
        maxBuffer: 50 * 1024 * 1024,
        windowsHide: true,
      });

      const rawOutput = stdout || stderr;

      // 解析 VeraPDF JSON 输出
      return this.parseVeraPdfOutput(rawOutput);
    } catch (err) {
      // VeraPDF 返回非零退出码时表示验证失败
      const errorMsg = err instanceof Error ? err.message : String(err);

      // 尝试从错误输出中解析结果
      if (err && typeof err === 'object' && 'stdout' in err) {
        const output = (err as { stdout?: string }).stdout || '';
        if (output) {
          return this.parseVeraPdfOutput(output);
        }
      }

      return {
        compliant: false,
        conformanceLevel: null,
        totalChecks: 0,
        failedChecks: 0,
        failures: [],
        rawOutput: errorMsg,
        message: `VeraPDF 验证执行失败: ${errorMsg}`,
      };
    } finally {
      this.cleanupFile(inputPath);
    }
  }

  /**
   * 解析 VeraPDF JSON 输出
   */
  private parseVeraPdfOutput(rawOutput: string): PdfAValidationResult {
    try {
      const result = JSON.parse(rawOutput);
      const validationResult = result?.validationResult || result?.report?.validationResult;

      if (!validationResult) {
        return {
          compliant: false,
          conformanceLevel: null,
          totalChecks: 0,
          failedChecks: 0,
          failures: [],
          rawOutput,
          message: 'VeraPDF 输出格式无法解析',
        };
      }

      const compliant = validationResult.profileCompliance === 'PASS'
        || validationResult.isCompliant === true;

      const conformanceLevel = validationResult.profileName || null;
      const totalChecks = validationResult.totalChecks || 0;
      const failedChecks = validationResult.failedChecks || 0;

      // 提取失败详情
      const failures: PdfAValidationFailure[] = [];
      const details = validationResult.details || [];
      for (const detail of details) {
        if (detail.status === 'FAIL' || detail.severity === 'error') {
          failures.push({
            ruleId: detail.ruleId || detail.clause || '',
            test: detail.test || detail.description || '',
            location: detail.location || detail.objectType || '',
            message: detail.message || detail.description || detail.errorMessage || '',
          });
        }
      }

      const message = compliant
        ? `PDF/A 合规验证通过 (${conformanceLevel || '未知版本'})`
        : `PDF/A 合规验证失败: ${failedChecks} 项不合规 (${conformanceLevel || '未知版本'})`;

      return {
        compliant,
        conformanceLevel,
        totalChecks,
        failedChecks,
        failures,
        rawOutput,
        message,
      };
    } catch {
      // JSON 解析失败，尝试从文本输出推断
      const isCompliant = rawOutput.includes('"isCompliant":true')
        || rawOutput.includes('"profileCompliance":"PASS"');

      return {
        compliant: isCompliant,
        conformanceLevel: null,
        totalChecks: 0,
        failedChecks: isCompliant ? 0 : -1,
        failures: [],
        rawOutput,
        message: isCompliant
          ? 'PDF/A 合规验证通过'
          : 'VeraPDF 验证结果无法解析，可能存在合规问题',
      };
    }
  }

  // =========================================================================
  // Main conversion API
  // =========================================================================

  /**
   * 将 PDF 转换为 PDF/A 合规文档
   *
   * 优先使用 Ghostscript 引擎（生产级），不可用时降级到 pdf-lib（尽力而为）。
   */
  async convertToPdfA(
    pdfData: ArrayBuffer,
    options: PdfAConvertOptions,
  ): Promise<PdfAConvertResult> {
    // 优先尝试 Ghostscript
    const gsCheck = await this.isGhostscriptAvailable();
    if (gsCheck.available && options.preferGhostscript !== false) {
      try {
        return await this.convertToPdfAGhostscript(pdfData, options);
      } catch (gsError) {
        const gsMsg = gsError instanceof Error ? gsError.message : String(gsError);
        // Ghostscript 失败，降级到 pdf-lib
        console.warn(`Ghostscript PDF/A 转换失败，降级到 pdf-lib: ${gsMsg}`);
      }
    }

    // 降级到 pdf-lib 尽力而为
    return this.convertToPdfALib(pdfData, options);
  }

  /**
   * 使用 Ghostscript 执行生产级 PDF/A 转换
   */
  async convertToPdfAGhostscript(
    pdfData: ArrayBuffer,
    options: PdfAConvertOptions,
  ): Promise<PdfAConvertResult> {
    const normalizedConformance = normalizeConformance(options.conformance);
    const label = conformanceLabel(normalizedConformance);

    const tmpDir = os.tmpdir();
    const id = `verity_pdfa_gs_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const inputPath = path.join(tmpDir, `${id}_input.pdf`);
    const outputPath = path.join(tmpDir, `${id}_pdfa.pdf`);

    try {
      fs.writeFileSync(inputPath, Buffer.from(pdfData));

      await this.convertWithGhostscript(inputPath, outputPath, options);

      const resultBuffer = fs.readFileSync(outputPath);
      const pdfDataOut = resultBuffer.buffer.slice(
        resultBuffer.byteOffset,
        resultBuffer.byteOffset + resultBuffer.byteLength,
      ) as ArrayBuffer;

      return {
        pdfData: pdfDataOut,
        conformance: label,
        message: `成功使用 Ghostscript 转换为 ${label}。已完成字体嵌入、色彩空间转换和合规特性处理。`,
        engine: 'ghostscript',
      };
    } finally {
      this.cleanupFile(inputPath);
      this.cleanupFile(outputPath);
    }
  }

  /**
   * 使用 pdf-lib 执行尽力而为的 PDF/A 转换（降级方案）
   *
   * LIMITATIONS (important):
   * - Full PDF/A compliance requires ALL fonts to be embedded. pdf-lib does not
   *   provide a built-in font-embedding pipeline for arbitrary TrueType/OpenType
   *   fonts, so this service takes a best-effort approach.
   * - Color-space conversion (e.g. to sRGB) is not performed; existing color
   *   profiles are left as-is.
   * - Transparency, JavaScript, and other PDF/A-prohibited features are NOT
   *   stripped in this implementation.
   * - The XMP metadata packet is generated and attached correctly, which is the
   *   primary structural requirement for PDF/A conformance validators that check
   *   metadata only.
   */
  private async convertToPdfALib(
    pdfData: ArrayBuffer,
    options: PdfAConvertOptions,
  ): Promise<PdfAConvertResult> {
    const { conformance, includeXmp } = options;
    const normalizedConformance = normalizeConformance(conformance);
    const label = conformanceLabel(normalizedConformance);
    const { part, conformanceLetter } = conformanceToXmpValues(normalizedConformance);

    // ------------------------------------------------------------------
    // 1. Load the source PDF
    // ------------------------------------------------------------------
    let pdfDoc: PDFDocument;
    try {
      pdfDoc = await PDFDocument.load(pdfData, {
        ignoreEncryption: true,
        updateMetadata: false,
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return {
        pdfData: new ArrayBuffer(0),
        conformance: label,
        message: `Failed to load source PDF: ${errorMsg}`,
        engine: 'pdf-lib',
      };
    }

    // ------------------------------------------------------------------
    // 2. Set basic document info dictionary entries expected by PDF/A
    // ------------------------------------------------------------------
    pdfDoc.setTitle(`${label} Document`);
    pdfDoc.setProducer('VerityPDF PdfAConversionService');
    pdfDoc.setCreator('VerityPDF PdfAConversionService');

    // ------------------------------------------------------------------
    // 3. Build and attach the XMP metadata stream
    // ------------------------------------------------------------------
    if (includeXmp) {
      const xmpString = buildXmpPacket(part, conformanceLetter);
      const xmpBytes = new TextEncoder().encode(xmpString);

      const context: PDFContext = pdfDoc.context;
      const metadataStream = context.stream(xmpBytes, {
        Type: PDFName.of('Metadata'),
        Subtype: PDFName.of('XML'),
      });
      const metadataStreamRef = context.register(metadataStream);
      pdfDoc.catalog.set(PDFName.of('Metadata'), metadataStreamRef);
    }

    // ------------------------------------------------------------------
    // 4. Set the output intent (required by PDF/A)
    // ------------------------------------------------------------------
    try {
      const context = pdfDoc.context;
      const iccProfilePlaceholder = new Uint8Array(0);
      const iccStream = context.stream(iccProfilePlaceholder, {
        N: 3,
        Alternate: PDFName.of('DeviceRGB'),
      });
      const iccStreamRef = context.register(iccStream);

      const outputIntentDict = context.obj({
        Type: PDFName.of('OutputIntent'),
        S: PDFName.of('GTS_PDFA1'),
        OutputConditionIdentifier: PDFString.of('sRGB IEC61966-2.1'),
        RegistryName: PDFString.of('http://www.color.org'),
        Info: PDFString.of('sRGB IEC61966-2.1'),
        DestOutputProfile: iccStreamRef,
      });
      const outputIntentRef = context.register(outputIntentDict);
      pdfDoc.catalog.set(PDFName.of('OutputIntents'), context.obj([outputIntentRef]));
    } catch {
      // Non-fatal
    }

    // ------------------------------------------------------------------
    // 5. Mark the document structure as tagged
    // ------------------------------------------------------------------
    try {
      const context = pdfDoc.context;
      const existingMarkInfo = pdfDoc.catalog.get(PDFName.of('MarkInfo'));
      if (!existingMarkInfo) {
        pdfDoc.catalog.set(
          PDFName.of('MarkInfo'),
          context.obj({ Marked: true }),
        );
      }
    } catch {
      // Non-fatal
    }

    // ------------------------------------------------------------------
    // 6. Save the document
    // ------------------------------------------------------------------
    let outputBytes: Uint8Array;
    try {
      outputBytes = await pdfDoc.save({
        useObjectStreams: false,
        addDefaultPage: false,
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return {
        pdfData: new ArrayBuffer(0),
        conformance: label,
        message: `Failed to save converted PDF: ${errorMsg}`,
        engine: 'pdf-lib',
      };
    }

    // ------------------------------------------------------------------
    // 7. Build the result
    // ------------------------------------------------------------------
    const message = [
      `Successfully converted to ${label} (pdf-lib fallback).`,
      '',
      'IMPORTANT — best-effort conversion:',
      '  - Full PDF/A compliance requires ALL fonts to be embedded. pdf-lib',
      '    does not fully support arbitrary font embedding, so fonts in the',
      '    output document may not be embedded. Run a validator (e.g. veraPDF)',
      '    to check compliance and use a full PDF engine if font embedding is',
      '    required.',
      '  - Color-space conversion to sRGB is not performed.',
      '  - Transparency, JavaScript, and other PDF/A-prohibited features are',
      '    not stripped.',
      '  - The ICC profile in the OutputIntent is a placeholder; a real sRGB',
      '    ICC profile stream is needed for strict validator compliance.',
      '  - Install Ghostscript for production-grade PDF/A conversion.',
    ].join('\n');

    return {
      pdfData: outputBytes.buffer.slice(
        outputBytes.byteOffset,
        outputBytes.byteOffset + outputBytes.byteLength,
      ) as ArrayBuffer,
      conformance: label,
      message,
      engine: 'pdf-lib',
    };
  }

  // =========================================================================
  // Utilities
  // =========================================================================

  /** 安全清理临时文件 */
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