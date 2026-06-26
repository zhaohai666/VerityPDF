import { PDFDocument, PDFName } from 'pdf-lib';

export interface CsvExportOptions {
  /** Pages to extract (0-indexed), empty = all */
  pageIndices?: number[];
  /** Delimiter (default: ',') */
  delimiter: string;
  /** Whether to include header row detection */
  detectHeaders: boolean;
  /** Row detection mode: 'y-position' groups text by Y coordinate */
  rowDetectionTolerance: number; // points tolerance for grouping into same row
  /** Column detection mode */
  columnDetectionMode: 'auto' | 'tab' | 'fixed';
  /** Include page number column */
  includePageNumber: boolean;
  /** Include coordinates */
  includeCoordinates: boolean;
}

export interface TextItem {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  pageIndex: number;
}

export interface CsvExportResult {
  csv: string;
  rowCount: number;
  columnCount: number;
  pagesProcessed: number;
  tablesDetected: number;
}

export class CsvExportService {
  /**
   * Extract text items with positions from PDF pages.
   * Uses pdf-lib to traverse content streams and extract text operators.
   */
  private async extractTextItems(pdfData: ArrayBuffer, pageIndices?: number[]): Promise<TextItem[]> {
    const pdfDoc = await PDFDocument.load(pdfData, { ignoreEncryption: true });
    const items: TextItem[] = [];
    const pages = pageIndices && pageIndices.length > 0
      ? pageIndices.map(i => pdfDoc.getPage(i))
      : pdfDoc.getPages();

    for (let pi = 0; pi < pages.length; pi++) {
      const page = pages[pi];
      const pageIndex = pageIndices && pageIndices.length > 0 ? pageIndices[pi] : pi;
      const { height: pageHeight } = page.getSize();

      // Extract text from content stream
      const contentStream = page.node.get(PDFName.of('Contents'));
      if (!contentStream) continue;

      // Try to get text from page resources and content
      // pdf-lib doesn't have built-in text extraction, so we parse the content stream
      try {
        const streamObj = pdfDoc.context.lookup(contentStream);
        if (!streamObj) continue;

        let streamData = '';
        if ('contents' in streamObj) {
          streamData = Buffer.from((streamObj as any).contents).toString('utf-8');
        }

        // Parse PDF text operators: Tj, TJ, ', "
        const textItems = this.parseContentStream(streamData, pageIndex, pageHeight);
        items.push(...textItems);
      } catch {
        // Skip pages that can't be parsed
      }
    }

    return items;
  }

  /**
   * Parse PDF content stream for text operators
   */
  private parseContentStream(stream: string, pageIndex: number, pageHeight: number): TextItem[] {
    const items: TextItem[] = [];
    let currentX = 0;
    let currentY = 0;

    // Track text position from Td/TD/Tm operators
    const lines = stream.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Text position: Td (translate)
      const tdMatch = trimmed.match(/^([\d.\-]+)\s+([\d.\-]+)\s+Td$/);
      if (tdMatch) {
        currentX += parseFloat(tdMatch[1]);
        currentY += parseFloat(tdMatch[2]);
        continue;
      }

      // Text position: TD (translate + set leading)
      const tdUpperMatch = trimmed.match(/^([\d.\-]+)\s+([\d.\-]+)\s+TD$/);
      if (tdUpperMatch) {
        currentX += parseFloat(tdUpperMatch[1]);
        currentY += parseFloat(tdUpperMatch[2]);
        continue;
      }

      // Text matrix: Tm
      const tmMatch = trimmed.match(/^([\d.\-]+)\s+([\d.\-]+)\s+([\d.\-]+)\s+([\d.\-]+)\s+([\d.\-]+)\s+([\d.\-]+)\s+Tm$/);
      if (tmMatch) {
        currentX = parseFloat(tmMatch[5]);
        currentY = parseFloat(tmMatch[6]);
        continue;
      }

      // Show text: Tj
      const tjMatch = trimmed.match(/^\(([^)]*)\)\s+Tj$/);
      if (tjMatch) {
        const text = this.unescapePdfString(tjMatch[1]);
        if (text.trim()) {
          items.push({
            text,
            x: currentX,
            y: pageHeight - currentY, // Convert to top-left origin
            width: text.length * 6, // Approximate width
            height: 12, // Approximate height
            pageIndex,
          });
        }
        continue;
      }

      // Show text with individual glyph positioning: TJ
      const tjArrayMatch = trimmed.match(/^\[(.+)\]\s+TJ$/);
      if (tjArrayMatch) {
        const text = this.parseTJArray(tjArrayMatch[1]);
        if (text.trim()) {
          items.push({
            text,
            x: currentX,
            y: pageHeight - currentY,
            width: text.length * 6,
            height: 12,
            pageIndex,
          });
        }
      }
    }

    return items;
  }

  /**
   * Parse TJ array which contains alternating strings and positioning numbers
   */
  private parseTJArray(raw: string): string {
    let result = '';
    // Match strings in parentheses
    const stringRegex = /\(([^)]*)\)/g;
    let match;
    while ((match = stringRegex.exec(raw)) !== null) {
      result += this.unescapePdfString(match[1]);
    }
    return result;
  }

  /**
   * Unescape PDF string special characters
   */
  private unescapePdfString(str: string): string {
    return str
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\\(/g, '(')
      .replace(/\\\)/g, ')')
      .replace(/\\\\/g, '\\');
  }

  /**
   * Group text items into rows based on Y position tolerance
   */
  private groupIntoRows(items: TextItem[], tolerance: number): TextItem[][] {
    if (items.length === 0) return [];

    // Sort by Y descending (top to bottom)
    const sorted = [...items].sort((a, b) => b.y - a.y);
    const rows: TextItem[][] = [];
    let currentRow: TextItem[] = [sorted[0]];
    let currentY = sorted[0].y;

    for (let i = 1; i < sorted.length; i++) {
      if (Math.abs(sorted[i].y - currentY) <= tolerance) {
        currentRow.push(sorted[i]);
      } else {
        // Sort row items by X position (left to right)
        currentRow.sort((a, b) => a.x - b.x);
        rows.push(currentRow);
        currentRow = [sorted[i]];
        currentY = sorted[i].y;
      }
    }
    if (currentRow.length > 0) {
      currentRow.sort((a, b) => a.x - b.x);
      rows.push(currentRow);
    }

    return rows;
  }

  /**
   * Detect column boundaries from text item X positions
   */
  private detectColumns(rows: TextItem[][]): number[] {
    // Collect all X positions
    const xPositions: number[] = [];
    for (const row of rows) {
      for (const item of row) {
        xPositions.push(item.x);
      }
    }

    if (xPositions.length === 0) return [];

    // Cluster X positions into column boundaries
    xPositions.sort((a, b) => a - b);
    const columns: number[] = [xPositions[0]];
    const clusterTolerance = 10; // points

    for (const x of xPositions) {
      if (x - columns[columns.length - 1] > clusterTolerance) {
        columns.push(x);
      }
    }

    return columns;
  }

  /**
   * Build CSV from rows and columns
   */
  private buildCsv(rows: TextItem[][], columns: number[], delimiter: string): string {
    const csvLines: string[] = [];

    for (const row of rows) {
      const cells: string[] = [];
      
      for (let col = 0; col < columns.length; col++) {
        const colStart = columns[col];
        const colEnd = col < columns.length - 1 ? columns[col + 1] : Infinity;
        
        // Find text items that fall within this column
        const cellTexts: string[] = [];
        for (const item of row) {
          if (item.x >= colStart - 5 && item.x < colEnd) {
            cellTexts.push(item.text);
          }
        }
        
        cells.push(cellTexts.join(' '));
      }

      // Escape cells for CSV
      const escapedCells = cells.map(cell => {
        if (cell.includes(delimiter) || cell.includes('"') || cell.includes('\n')) {
          return `"${cell.replace(/"/g, '""')}"`;
        }
        return cell;
      });

      csvLines.push(escapedCells.join(delimiter));
    }

    return csvLines.join('\n');
  }

  /**
   * Main export method
   */
  async exportToCsv(pdfData: ArrayBuffer, options: CsvExportOptions): Promise<CsvExportResult> {
    const {
      pageIndices,
      delimiter = ',',
      rowDetectionTolerance = 5,
      includePageNumber = false,
      includeCoordinates = false,
    } = options;

    // Extract text items with positions
    const textItems = await this.extractTextItems(pdfData, pageIndices);
    
    if (textItems.length === 0) {
      return {
        csv: '',
        rowCount: 0,
        columnCount: 0,
        pagesProcessed: 0,
        tablesDetected: 0,
      };
    }

    // Group into rows
    const rows = this.groupIntoRows(textItems, rowDetectionTolerance);

    // Detect columns
    const columns = this.detectColumns(rows);

    // Build CSV
    let csv = this.buildCsv(rows, columns, delimiter);

    // Add page number column if requested
    if (includePageNumber) {
      const lines = csv.split('\n');
      const withPageNum = lines.map((line, idx) => {
        const pageNum = rows[idx] ? rows[idx][0].pageIndex + 1 : 0;
        return `${pageNum}${delimiter}${line}`;
      });
      csv = withPageNum.join('\n');
    }

    // Add coordinates if requested
    if (includeCoordinates) {
      const lines = csv.split('\n');
      const withCoords = lines.map((line, idx) => {
        if (!rows[idx]) return line;
        const firstItem = rows[idx][0];
        return `${Math.round(firstItem.x)},${Math.round(firstItem.y)}${delimiter}${line}`;
      });
      csv = withCoords.join('\n');
    }

    const uniquePages = new Set(textItems.map(i => i.pageIndex));

    return {
      csv,
      rowCount: rows.length,
      columnCount: columns.length,
      pagesProcessed: uniquePages.size,
      tablesDetected: rows.length > 1 ? 1 : 0,
    };
  }
}
