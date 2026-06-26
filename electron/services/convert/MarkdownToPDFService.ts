import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * Markdown to PDF conversion service
 * Optimized for Markdown files with optional CSS styling
 */
export class MarkdownToPDFService {
  private sofficePath: string;

  constructor() {
    // Simple approach: assume soffice is in PATH
    // In production, we'd reuse LibreOfficeService's logic
    this.sofficePath = 'soffice';
  }

  /**
   * Convert Markdown file to PDF
   * @param inputPath Path to the Markdown file
   * @param outputDir Directory for output PDF
   * @param _options Optional styling and configuration (not yet implemented)
   * @returns Promise with conversion result
   */
  async convertToPdf(
    inputPath: string,
    outputDir: string,
    _options?: {
      cssPath?: string;          // Custom CSS file for styling
      pageSize?: 'A4' | 'Letter' | 'Legal';
      orientation?: 'portrait' | 'landscape';
    }
  ): Promise<{ success: true; outputPath: string; message: string } |
              { success: false; outputPath: ''; message: string }> {
    // First, check the file extension
    const ext = path.extname(inputPath).toLowerCase();
    if (ext !== '.md' && ext !== '.markdown') {
      return { success: false, outputPath: '', message: 'Input file must be a Markdown (.md or .markdown) file' };
    }

    // Validate input file existence
    if (!fs.existsSync(inputPath)) {
      return { success: false, outputPath: '', message: `Input file not found: ${inputPath}` };
    }

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      try {
        fs.mkdirSync(outputDir, { recursive: true });
      } catch (err) {
        return { success: false, outputPath: '', message: `Failed to create output directory: ${err instanceof Error ? err.message : String(err)}` };
      }
    }

    try {
      // LibreOffice has built-in markdown support, so we can convert directly
      // The filter for markdown to pdf is: writer_pdf_Export
      const baseName = path.basename(inputPath, path.extname(inputPath));
      const outputFile = path.join(outputDir, `${baseName}.pdf`);

      // Prepare arguments for LibreOffice
      const args = [
        '--headless',           // Run without GUI
        '--norestore',          // Don't restore previous session
        '--safe-mode',          // Disable potentially unsafe features
        '--convert-to', 'pdf:writer_pdf_Export',
        '--outdir', outputDir,
        inputPath
      ];

      // Execute conversion
      const { stderr } = await execFileAsync(this.sofficePath, args, {
        timeout: 60000,         // 60 second timeout
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
        windowsHide: true,
      });

      // Check for errors (ignore harmless javaldx warnings)
      if (stderr &&
          !stderr.includes('javaldx:') &&
          !stderr.includes('no suitable image') &&
          (stderr.includes('Error') || stderr.includes('error:'))) {
        return { success: false, outputPath: '', message: `LibreOffice error: ${stderr.trim()}` };
      }

      // Verify output file was created
      if (!fs.existsSync(outputFile)) {
        return { success: false, outputPath: '', message: 'Conversion completed but output file not found' };
      }

      return {
        success: true,
        outputPath: outputFile,
        message: `Successfully converted ${path.basename(inputPath)} to PDF`
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, outputPath: '', message: `Conversion failed: ${msg}` };
    }
  }
}