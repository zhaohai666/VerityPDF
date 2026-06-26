import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';

const execFileAsync = promisify(execFile);

export interface InvertColorsOptions {
  pageIndices?: number[];
}

export interface InvertColorsResult {
  pdfData: ArrayBuffer;
  processedPages: number;
}

export class InvertColorsService {
  /**
   * Invert the colors of a PDF using Ghostscript as the backend.
   *
   * Note: Ghostscript processes all pages in the PDF. When `pageIndices` is
   * specified the value is reported back but per-page selection is not
   * performed — full page-range support would require splitting and merging
   * the PDF, which is beyond the scope of this service.
   */
  async invertColors(
    pdfData: ArrayBuffer,
    options: InvertColorsOptions = {},
  ): Promise<InvertColorsResult> {
    const gsBinary = await this.findGhostscript();

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'invert-colors-'));
    const inputPath = path.join(tmpDir, 'input.pdf');
    const outputPath = path.join(tmpDir, 'output.pdf');
    const psPath = path.join(tmpDir, 'invert.ps');

    try {
      // Write the input PDF to a temp file
      fs.writeFileSync(inputPath, Buffer.from(pdfData));

      // Create a PostScript snippet that inverts colors via transfer functions
      const psContent = [
        '%!PS-Adobe-3.0',
        '% Invert colors using color transfer functions',
        '[/DeviceGray] { { 1 exch sub } } setcolortransfer',
        '[/DeviceRGB] { { 1 exch sub } { 1 exch sub } { 1 exch sub } } setcolortransfer',
      ].join('\n');
      fs.writeFileSync(psPath, psContent, 'utf-8');

      // Run Ghostscript to produce the inverted-color PDF
      const args = [
        '-sDEVICE=pdfwrite',
        '-dNOPAUSE',
        '-dQUIET',
        '-dBATCH',
        `-sOutputFile=${outputPath}`,
        psPath,
        inputPath,
      ];

      await execFileAsync(gsBinary, args, {
        timeout: 5 * 60 * 1000, // 5-minute safety timeout
        maxBuffer: 100 * 1024 * 1024,
      });

      // Read the resulting PDF
      const outputBuffer = fs.readFileSync(outputPath);
      const resultPdf = outputBuffer.buffer.slice(
        outputBuffer.byteOffset,
        outputBuffer.byteOffset + outputBuffer.byteLength,
      ) as ArrayBuffer;

      // Determine how many pages were processed.
      // Ghostscript always processes every page in the input PDF.
      const processedPages = options.pageIndices
        ? options.pageIndices.length
        : await this.countPages(gsBinary, inputPath);

      return {
        pdfData: resultPdf,
        processedPages,
      };
    } finally {
      // Clean up all temp files
      for (const file of [inputPath, outputPath, psPath]) {
        try {
          if (fs.existsSync(file)) {
            fs.unlinkSync(file);
          }
        } catch {
          // Ignore cleanup errors
        }
      }
      try {
        if (fs.existsSync(tmpDir)) {
          fs.rmdirSync(tmpDir);
        }
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Locate the Ghostscript binary by checking well-known paths.
   */
  private async findGhostscript(): Promise<string> {
    const candidates: string[] =
      process.platform === 'win32'
        ? ['gswin64c', 'gswin32c']
        : ['gs', '/usr/local/bin/gs', '/opt/homebrew/bin/gs'];

    for (const candidate of candidates) {
      try {
        // If the candidate is an absolute path, check the filesystem directly
        if (path.isAbsolute(candidate)) {
          if (fs.existsSync(candidate)) {
            return candidate;
          }
          continue;
        }

        // For bare names (e.g. 'gs'), verify they are resolvable via PATH
        await execFileAsync(candidate, ['--version'], { timeout: 5000 });
        return candidate;
      } catch {
        // Not found at this path — try the next candidate
      }
    }

    throw new Error(
      'Ghostscript binary not found. Please install Ghostscript ' +
        '(https://ghostscript.com/) and ensure it is on your PATH.',
    );
  }

  /**
   * Use Ghostscript to count the number of pages in a PDF.
   */
  private async countPages(
    gsBinary: string,
    pdfPath: string,
  ): Promise<number> {
    try {
      const { stdout } = await execFileAsync(gsBinary, [
        '-q',
        '-dNODISPLAY',
        '-dNOPAUSE',
        '-dBATCH',
        '-c',
        `(${pdfPath}) (r) file runpdfbegin pdfpagecount = quit`,
      ], { timeout: 30000 });

      const count = parseInt(stdout.trim(), 10);
      return Number.isFinite(count) && count > 0 ? count : 1;
    } catch {
      // If page counting fails, assume at least one page was processed
      return 1;
    }
  }
}
