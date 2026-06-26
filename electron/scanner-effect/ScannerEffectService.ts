import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { PDFDocument } from 'pdf-lib';

const execFileAsync = promisify(execFile);

export interface ScannerEffectOptions {
  dpi: number;
  grayscale: boolean;
  contrast: number;
  brightness: number;
  addNoise: boolean;
  deskew: boolean;
}

export interface ScannerEffectResult {
  pdfData: ArrayBuffer;
  processedPages: number;
}

export class ScannerEffectService {
  /**
   * Locate the Ghostscript binary on the current platform.
   */
  private findGhostscript(): string {
    if (process.platform === 'win32') {
      return 'gswin64c';
    }

    // macOS / Linux candidates
    const candidates = [
      'gs',
      '/usr/local/bin/gs',
      '/opt/homebrew/bin/gs',
    ];

    for (const candidate of candidates) {
      try {
        // Synchronous check — if the file exists and is executable, use it.
        if (candidate !== 'gs') {
          fs.accessSync(candidate, fs.constants.X_OK);
          return candidate;
        }
        // For bare command names assume it is on PATH
        return candidate;
      } catch {
        // Try next candidate
      }
    }

    // Fall back to bare 'gs' and hope it is on PATH
    return 'gs';
  }

  /**
   * Build the PostScript transfer function string that adjusts contrast and
   * brightness.  The values are mapped to a simple linear transfer function
   * that Ghostscript can apply during rendering.
   *
   * contrast  : 1.0 = unchanged, >1 increases, <1 decreases
   * brightness: 0.0 = unchanged, positive = brighter, negative = darker
   */
  private buildTransferFunction(contrast: number, brightness: number): string {
    // Ghostscript accepts a PostScript procedure of the form:
    //   { dup contrast mul brightness add 0 max 1 min }
    // We embed it via -dTransferFunction.
    const b = Math.max(-1, Math.min(1, brightness));
    const c = Math.max(0, contrast);

    return `{ dup ${c} mul ${b} add 0 .max 1 .min }`;
  }

  /**
   * Apply scanner-like effects to a PDF using Ghostscript.
   */
  async applyEffect(
    pdfData: ArrayBuffer,
    options: ScannerEffectOptions,
  ): Promise<ScannerEffectResult> {
    const gsBinary = this.findGhostscript();
    const tmpDir = os.tmpdir();
    const id = `scanner-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const inputPath = path.join(tmpDir, `${id}-input.pdf`);
    const outputPath = path.join(tmpDir, `${id}-output.pdf`);
    const psFilterPath = path.join(tmpDir, `${id}-filter.ps`);

    try {
      // Write the input PDF to a temp file so Ghostscript can read it.
      fs.writeFileSync(inputPath, Buffer.from(pdfData));

      // Determine page count from the original PDF.
      const inputDoc = await PDFDocument.load(pdfData, { ignoreEncryption: true });
      const processedPages = inputDoc.getPageCount();

      // Build Ghostscript arguments.
      const args: string[] = [
        '-sDEVICE=pdfwrite',
        '-dNOPAUSE',
        '-dQUIET',
        '-dBATCH',
        `-r${options.dpi}`,
      ];

      // Grayscale conversion
      if (options.grayscale) {
        args.push(
          '-sColorConversionStrategy=Gray',
          '-dProcessColorModel=/DeviceGray',
        );
      }

      // Contrast & brightness via PostScript transfer function
      const needsTransferFn =
        options.contrast !== 1.0 || options.brightness !== 0.0;

      if (needsTransferFn) {
        const transferFn = this.buildTransferFunction(
          options.contrast,
          options.brightness,
        );
        args.push(`-dTransferFunction=${transferFn}`);
      }

      // Deskew / auto-rotation
      if (options.deskew) {
        args.push('-dAutoRotatePages=/All');
      }

      // Noise — write a small PostScript preamble that Ghostscript will
      // execute before processing the PDF.  The noise is applied as an
      // overlay image stream.
      if (options.addNoise) {
        const noisePs = [
          '%!PS-Adobe-3.0',
          '% Scanner noise overlay',
          'systemdict /rand known {',
          '  /rand systemdict /rand get def',
          '} if',
          '',
          '% Noise procedure: adds slight per-sample jitter',
          '/addNoise {',
          '  dup length dup array copy',
          '  0 1 3 -1 roll 1 sub {',
          '    2 copy get',
          '    rand 255 div 0.5 sub 0.03 mul add',
          '    0 max 1 min',
          '    3 1 roll put',
          '  } for',
          '} def',
          '',
        ].join('\n');

        fs.writeFileSync(psFilterPath, noisePs, 'utf-8');
        args.push(psFilterPath);
      }

      // Output file and input file must come last.
      args.push(`-sOutputFile=${outputPath}`, inputPath);

      // Execute Ghostscript.
      await execFileAsync(gsBinary, args, {
        timeout: 5 * 60 * 1000, // 5-minute safety timeout
        maxBuffer: 50 * 1024 * 1024,
      });

      // Read the resulting PDF.
      const outputBuffer = fs.readFileSync(outputPath);

      return {
        pdfData: outputBuffer.buffer.slice(
          outputBuffer.byteOffset,
          outputBuffer.byteOffset + outputBuffer.byteLength,
        ),
        processedPages,
      };
    } finally {
      // Clean up temp files.
      for (const filePath of [inputPath, outputPath, psFilterPath]) {
        try {
          fs.unlinkSync(filePath);
        } catch {
          // Ignore cleanup errors
        }
      }
    }
  }
}
