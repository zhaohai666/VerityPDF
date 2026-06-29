import { PDFDocument, PDFName } from 'pdf-lib';

export interface PageImageInfo {
  ref: string;
  x: number;
  y: number;
  width: number;
  height: number;
  data: string;
  format: 'png' | 'jpeg';
  originalWidth: number;
  originalHeight: number;
}

export interface ReplaceImageResult {
  pdfData: ArrayBuffer;
  replacedCount: number;
}

export interface ImageLayoutItem {
  ref: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export class ImageEditService {
  async extractPageImages(pdfData: ArrayBuffer, pageIndex: number): Promise<PageImageInfo[]> {
    const pdfDoc = await PDFDocument.load(pdfData, { ignoreEncryption: true });
    const pages = pdfDoc.getPages();
    if (pageIndex < 0 || pageIndex >= pages.length) return [];

    const page = pages[pageIndex];
    const context = pdfDoc.context;
    const pageNode = page.node;
    const resources = pageNode.get(PDFName.of('Resources'));
    if (!resources) return [];

    const resourcesDict = context.lookup(resources) as any;
    if (!resourcesDict?.get) return [];

    const xObjectRef = resourcesDict.get(PDFName.of('XObject'));
    if (!xObjectRef) return [];

    const xObjectDict = context.lookup(xObjectRef) as any;
    if (!xObjectDict?.enumerate) return [];

    const layout = await this.getPageImageLayout(pdfData, pageIndex);
    const layoutMap = new Map(layout.map(l => [l.ref, l]));
    const images: PageImageInfo[] = [];

    for (const [nameObj, valueRef] of xObjectDict.enumerate()) {
      const value = context.lookup(valueRef) as any;
      if (!value) continue;

      const subtype = value.get ? value.get(PDFName.of('Subtype')) : null;
      if (!subtype || subtype.toString() !== '/Image') continue;

      const refStr = nameObj.toString ? nameObj.toString() : String(nameObj);

      const widthObj = value.get(PDFName.of('Width'));
      const heightObj = value.get(PDFName.of('Height'));
      const origWidth = widthObj ? (widthObj as any).value || Number(widthObj) : 0;
      const origHeight = heightObj ? (heightObj as any).value || Number(heightObj) : 0;

      const filter = value.get(PDFName.of('Filter'));
      let format: 'png' | 'jpeg' = 'jpeg';
      if (filter) {
        const filterStr = filter.toString ? filter.toString() : String(filter);
        if (filterStr.includes('FlateDecode') || filterStr.includes('Flate')) format = 'png';
      }

      let imageData = '';
      try {
        if (value.contents) {
          imageData = Buffer.from(value.contents).toString('base64');
        } else if (value.getContents) {
          imageData = Buffer.from(value.getContents()).toString('base64');
        }
      } catch { continue; }

      if (!imageData) continue;

      const layoutItem = layoutMap.get(refStr) || layoutMap.get(`/${refStr}`);

      images.push({
        ref: refStr,
        x: layoutItem?.x || 0,
        y: layoutItem?.y || 0,
        width: layoutItem?.width || origWidth,
        height: layoutItem?.height || origHeight,
        data: imageData,
        format,
        originalWidth: origWidth,
        originalHeight: origHeight,
      });
    }

    return images;
  }

  async replaceImage(
    pdfData: ArrayBuffer,
    pageIndex: number,
    imageRef: string,
    newImageBase64: string,
    format: 'png' | 'jpeg'
  ): Promise<ReplaceImageResult> {
    const pdfDoc = await PDFDocument.load(pdfData, { ignoreEncryption: true });
    const pages = pdfDoc.getPages();
    if (pageIndex < 0 || pageIndex >= pages.length) {
      return { pdfData, replacedCount: 0 };
    }

    const newImageBytes = Buffer.from(newImageBase64, 'base64');
    let embeddedImage;
    if (format === 'png') {
      embeddedImage = await pdfDoc.embedPng(newImageBytes);
    } else {
      embeddedImage = await pdfDoc.embedJpg(newImageBytes);
    }

    const page = pages[pageIndex];
    const context = pdfDoc.context;
    const pageNode = page.node;
    const resources = pageNode.get(PDFName.of('Resources'));
    if (!resources) return { pdfData, replacedCount: 0 };

    const resourcesDict = context.lookup(resources) as any;
    if (!resourcesDict?.get) return { pdfData, replacedCount: 0 };

    const xObjectRef = resourcesDict.get(PDFName.of('XObject'));
    if (!xObjectRef) return { pdfData, replacedCount: 0 };

    const xObjectDict = context.lookup(xObjectRef) as any;
    if (!xObjectDict?.enumerate) return { pdfData, replacedCount: 0 };

    let replacedCount = 0;
    const cleanRef = imageRef.startsWith('/') ? imageRef : `/${imageRef}`;

    for (const [nameObj, valueRef] of xObjectDict.enumerate()) {
      const refStr = nameObj.toString ? nameObj.toString() : String(nameObj);
      if (refStr === imageRef || refStr === cleanRef || `/${refStr}` === cleanRef) {
        const value = context.lookup(valueRef) as any;
        if (value?.ref) {
          const newImageRef = (embeddedImage as any).ref;
          if (newImageRef) {
            const newImageObj = context.lookup(newImageRef) as any;
            if (newImageObj?.contents && value.contents !== undefined) {
              value.contents = newImageObj.contents;
              replacedCount++;
            }
          }
        }
      }
    }

    const bytes = await pdfDoc.save();
    return {
      pdfData: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
      replacedCount,
    };
  }

  async getPageImageLayout(pdfData: ArrayBuffer, pageIndex: number): Promise<ImageLayoutItem[]> {
    const pdfDoc = await PDFDocument.load(pdfData, { ignoreEncryption: true });
    const pages = pdfDoc.getPages();
    if (pageIndex < 0 || pageIndex >= pages.length) return [];

    const page = pages[pageIndex];
    const context = pdfDoc.context;
    const { height: pageHeight } = page.getSize();

    const contentStreamRef = page.node.get(PDFName.of('Contents'));
    if (!contentStreamRef) return [];

    let streamData = '';
    const streamObj = context.lookup(contentStreamRef) as any;
    if (!streamObj) return [];

    if (streamObj.contents) {
      streamData = Buffer.from(streamObj.contents).toString('utf-8');
    } else if (streamObj.getContents) {
      streamData = Buffer.from(streamObj.getContents()).toString('utf-8');
    }
    if (!streamData) return [];

    const items: ImageLayoutItem[] = [];
    const lines = streamData.split('\n');
    let ct = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
    const stack: typeof ct[] = [];

    for (const line of lines) {
      const t = line.trim();
      if (t === 'q') { stack.push({ ...ct }); continue; }
      if (t === 'Q') { const s = stack.pop(); if (s) ct = s; continue; }

      const cm = t.match(/^([\d.\-]+)\s+([\d.\-]+)\s+([\d.\-]+)\s+([\d.\-]+)\s+([\d.\-]+)\s+([\d.\-]+)\s+cm$/);
      if (cm) {
        const [a, b, c, d, e, f] = cm.slice(1).map(Number);
        ct = {
          a: ct.a * a + ct.c * b,
          b: ct.b * a + ct.d * b,
          c: ct.a * c + ct.c * d,
          d: ct.b * c + ct.d * d,
          e: ct.a * e + ct.c * f + ct.e,
          f: ct.b * e + ct.d * f + ct.f,
        };
        continue;
      }

      const doM = t.match(/^\/(\S+)\s+Do$/);
      if (doM) {
        const w = Math.abs(ct.a), h = Math.abs(ct.d);
        if (w > 0 && h > 0) {
          items.push({
            ref: doM[1],
            x: Math.round(ct.e * 100) / 100,
            y: Math.round((pageHeight - ct.f) * 100) / 100,
            width: Math.round(w * 100) / 100,
            height: Math.round(h * 100) / 100,
          });
        }
      }
    }

    return items;
  }
}
