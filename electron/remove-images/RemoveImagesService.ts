import { PDFDocument, PDFName, PDFDict } from 'pdf-lib';

export interface RemoveImagesOptions {
  pageIndices?: number[];
}

export interface RemoveImagesResult {
  pdfData: ArrayBuffer;
  removedCount: number;
  pagesProcessed: number;
}

// Minimal 1x1 white PNG (67 bytes)
const WHITE_PNG = new Uint8Array([
  0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
  0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1
  0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, // 8-bit RGB
  0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41, // IDAT chunk
  0x54, 0x08, 0xD7, 0x63, 0xF8, 0xCF, 0xC0, 0x00,
  0x00, 0x00, 0x02, 0x00, 0x01, 0xE2, 0x21, 0xBC,
  0x33, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E,
  0x44, 0xAE, 0x42, 0x60, 0x82, // IEND chunk
]);

export class RemoveImagesService {
  async removeImages(
    pdfData: ArrayBuffer,
    options: RemoveImagesOptions = {}
  ): Promise<RemoveImagesResult> {
    const pdfDoc = await PDFDocument.load(pdfData);
    const pages = pdfDoc.getPages();
    const context = pdfDoc.context;

    const whitePngImage = await pdfDoc.embedPng(WHITE_PNG);

    const pageIndices = options.pageIndices ?? pages.map((_, i) => i);
    let removedCount = 0;
    let pagesProcessed = 0;

    for (const index of pageIndices) {
      if (index < 0 || index >= pages.length) {
        continue;
      }

      const page = pages[index];
      const resourcesRef = page.node.get(PDFName.of('Resources'));
      if (!resourcesRef) continue;

      const resources = context.lookup(resourcesRef) as PDFDict | undefined;
      if (!resources) continue;

      const xObjectDictRef = resources.get(PDFName.of('XObject'));
      if (!xObjectDictRef) continue;

      const xObjectDict = context.lookup(xObjectDictRef) as PDFDict | undefined;
      if (!xObjectDict) continue;

      const entries = Array.from(xObjectDict.entries());

      for (const [name, value] of entries) {
        const stream = context.lookup(value) as PDFDict | undefined;
        if (!stream) continue;

        const subtype = stream.get(PDFName.of('Subtype'));
        if (subtype && subtype.toString() === '/Image') {
          const ref = context.register(whitePngImage.ref as any);
          xObjectDict.set(name, ref);
          removedCount++;
        }
      }

      pagesProcessed++;
    }

    const savedPdf = await pdfDoc.save();
    return {
      pdfData: savedPdf.buffer.slice(
        savedPdf.byteOffset,
        savedPdf.byteOffset + savedPdf.byteLength,
      ) as ArrayBuffer,
      removedCount,
      pagesProcessed,
    };
  }
}
