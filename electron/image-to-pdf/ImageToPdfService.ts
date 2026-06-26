import { PDFDocument } from 'pdf-lib';

export interface ImageToPdfOptions {
  /** Array of image data as base64 strings */
  images: Array<{
    data: string; // base64
    format: 'png' | 'jpeg';
    name: string;
  }>;
  /** Page size: 'original' uses image dimensions, or specify width/height in points */
  pageSize: 'original' | 'a4' | 'letter' | 'fit';
  /** DPI for converting pixels to points (default: 72) */
  dpi: number;
  /** Margin in points (default: 0) */
  margin: number;
  /** Image fit mode */
  fitMode: 'stretch' | 'contain' | 'cover';
}

export interface ImageToPdfResult {
  pdfData: ArrayBuffer;
  pageCount: number;
  totalImages: number;
}

export class ImageToPdfService {
  async convertToPdf(options: ImageToPdfOptions): Promise<ImageToPdfResult> {
    const pdfDoc = await PDFDocument.create();
    const { images, pageSize, dpi = 72, margin = 0, fitMode = 'contain' } = options;

    for (const img of images) {
      const imgBytes = Buffer.from(img.data, 'base64');
      
      // Embed image based on format
      const embedded = img.format === 'png'
        ? await pdfDoc.embedPng(imgBytes)
        : await pdfDoc.embedJpg(imgBytes);

      // Determine page dimensions
      let pageWidth: number;
      let pageHeight: number;

      if (pageSize === 'original') {
        // Convert pixel dimensions to points using DPI
        pageWidth = (embedded.width / dpi) * 72 + margin * 2;
        pageHeight = (embedded.height / dpi) * 72 + margin * 2;
      } else if (pageSize === 'a4') {
        pageWidth = 595.28; // A4 width in points
        pageHeight = 841.89; // A4 height in points
      } else if (pageSize === 'letter') {
        pageWidth = 612; // Letter width in points
        pageHeight = 792; // Letter height in points
      } else {
        // 'fit' - use image pixel dimensions as points
        pageWidth = embedded.width + margin * 2;
        pageHeight = embedded.height + margin * 2;
      }

      const page = pdfDoc.addPage([pageWidth, pageHeight]);

      // Calculate image placement
      const availWidth = pageWidth - margin * 2;
      const availHeight = pageHeight - margin * 2;

      let drawWidth: number;
      let drawHeight: number;
      let drawX: number;
      let drawY: number;

      if (fitMode === 'stretch') {
        drawWidth = availWidth;
        drawHeight = availHeight;
        drawX = margin;
        drawY = margin;
      } else if (fitMode === 'cover') {
        // Scale to cover entire area, crop overflow
        const scale = Math.max(availWidth / embedded.width, availHeight / embedded.height);
        drawWidth = embedded.width * scale;
        drawHeight = embedded.height * scale;
        drawX = margin + (availWidth - drawWidth) / 2;
        drawY = margin + (availHeight - drawHeight) / 2;
      } else {
        // 'contain' - scale to fit within area
        const scale = Math.min(availWidth / embedded.width, availHeight / embedded.height);
        drawWidth = embedded.width * scale;
        drawHeight = embedded.height * scale;
        drawX = margin + (availWidth - drawWidth) / 2;
        drawY = margin + (availHeight - drawHeight) / 2;
      }

      page.drawImage(embedded, {
        x: drawX,
        y: drawY,
        width: drawWidth,
        height: drawHeight,
      });
    }

    const pdfBytes = await pdfDoc.save();
    return {
      pdfData: pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength) as ArrayBuffer,
      pageCount: pdfDoc.getPageCount(),
      totalImages: images.length,
    };
  }
}
