import { PDFDocument, PDFName } from 'pdf-lib';
import { createCanvas, loadImage } from 'canvas';

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

  /**
   * 旋转页面中的图片
   */
  async rotateImage(
    pdfData: ArrayBuffer,
    pageIndex: number,
    imageRef: string,
    angle: number
  ): Promise<ReplaceImageResult> {
    const images = await this.extractPageImages(pdfData, pageIndex);
    const target = images.find(img => img.ref === imageRef || img.ref === `/${imageRef}` || `/${img.ref}` === imageRef);
    if (!target) throw new Error(`未找到图片: ${imageRef}`);

    // Decode image, rotate, re-encode
    const imgBuffer = Buffer.from(target.data, 'base64');
    const img = await loadImage(imgBuffer);
    const canvas = createCanvas(img.width, img.height);
    const ctx = canvas.getContext('2d');

    // Rotate around center
    ctx.translate(img.width / 2, img.height / 2);
    ctx.rotate((angle * Math.PI) / 180);
    ctx.drawImage(img, -img.width / 2, -img.height / 2);

    const outputBuffer = target.format === 'png' ? canvas.toBuffer('image/png') : canvas.toBuffer('image/jpeg');
    const base64 = outputBuffer.toString('base64');

    return this.replaceImage(pdfData, pageIndex, imageRef, base64, target.format);
  }

  /**
   * 裁剪页面中的图片
   */
  async cropImage(
    pdfData: ArrayBuffer,
    pageIndex: number,
    imageRef: string,
    cropRect: { x: number; y: number; width: number; height: number }
  ): Promise<ReplaceImageResult> {
    const images = await this.extractPageImages(pdfData, pageIndex);
    const target = images.find(img => img.ref === imageRef || img.ref === `/${imageRef}` || `/${img.ref}` === imageRef);
    if (!target) throw new Error(`未找到图片: ${imageRef}`);

    const imgBuffer = Buffer.from(target.data, 'base64');
    const img = await loadImage(imgBuffer);

    // Scale crop rect from PDF coordinates to pixel coordinates
    const scaleX = img.width / target.originalWidth;
    const scaleY = img.height / target.originalHeight;
    const sx = Math.round(cropRect.x * scaleX);
    const sy = Math.round(cropRect.y * scaleY);
    const sw = Math.round(cropRect.width * scaleX);
    const sh = Math.round(cropRect.height * scaleY);

    const canvas = createCanvas(sw, sh);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

    const outputBuffer = target.format === 'png' ? canvas.toBuffer('image/png') : canvas.toBuffer('image/jpeg');
    const base64 = outputBuffer.toString('base64');

    return this.replaceImage(pdfData, pageIndex, imageRef, base64, target.format);
  }

  /**
   * 缩放页面中的图片
   */
  async scaleImage(
    pdfData: ArrayBuffer,
    pageIndex: number,
    imageRef: string,
    scale: number
  ): Promise<ReplaceImageResult> {
    const images = await this.extractPageImages(pdfData, pageIndex);
    const target = images.find(img => img.ref === imageRef || img.ref === `/${imageRef}` || `/${img.ref}` === imageRef);
    if (!target) throw new Error(`未找到图片: ${imageRef}`);

    const imgBuffer = Buffer.from(target.data, 'base64');
    const img = await loadImage(imgBuffer);

    const newWidth = Math.round(img.width * scale);
    const newHeight = Math.round(img.height * scale);
    if (newWidth <= 0 || newHeight <= 0) throw new Error('缩放后的尺寸无效');

    const canvas = createCanvas(newWidth, newHeight);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, newWidth, newHeight);

    const outputBuffer = target.format === 'png' ? canvas.toBuffer('image/png') : canvas.toBuffer('image/jpeg');
    const base64 = outputBuffer.toString('base64');

    return this.replaceImage(pdfData, pageIndex, imageRef, base64, target.format);
  }

  /**
   * 对页面中的图片应用滤镜
   */
  async applyImageFilter(
    pdfData: ArrayBuffer,
    pageIndex: number,
    imageRef: string,
    filter: 'brightness' | 'contrast' | 'grayscale' | 'sepia' | 'invert' | 'blur' | 'sharpen',
    value?: number
  ): Promise<ReplaceImageResult> {
    const images = await this.extractPageImages(pdfData, pageIndex);
    const target = images.find(img => img.ref === imageRef || img.ref === `/${imageRef}` || `/${img.ref}` === imageRef);
    if (!target) throw new Error(`未找到图片: ${imageRef}`);

    const imgBuffer = Buffer.from(target.data, 'base64');
    const img = await loadImage(imgBuffer);

    const canvas = createCanvas(img.width, img.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);

    // Apply filter using pixel manipulation
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    switch (filter) {
      case 'brightness': {
        const factor = value ?? 1.0;
        for (let i = 0; i < data.length; i += 4) {
          data[i] = Math.min(255, Math.max(0, data[i] * factor));
          data[i + 1] = Math.min(255, Math.max(0, data[i + 1] * factor));
          data[i + 2] = Math.min(255, Math.max(0, data[i + 2] * factor));
        }
        break;
      }
      case 'contrast': {
        const factor = value ?? 1.0;
        const intercept = 128 * (1 - factor);
        for (let i = 0; i < data.length; i += 4) {
          data[i] = Math.min(255, Math.max(0, data[i] * factor + intercept));
          data[i + 1] = Math.min(255, Math.max(0, data[i + 1] * factor + intercept));
          data[i + 2] = Math.min(255, Math.max(0, data[i + 2] * factor + intercept));
        }
        break;
      }
      case 'grayscale': {
        for (let i = 0; i < data.length; i += 4) {
          const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          data[i] = data[i + 1] = data[i + 2] = gray;
        }
        break;
      }
      case 'sepia': {
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i + 1], b = data[i + 2];
          data[i] = Math.min(255, 0.393 * r + 0.769 * g + 0.189 * b);
          data[i + 1] = Math.min(255, 0.349 * r + 0.686 * g + 0.168 * b);
          data[i + 2] = Math.min(255, 0.272 * r + 0.534 * g + 0.131 * b);
        }
        break;
      }
      case 'invert': {
        for (let i = 0; i < data.length; i += 4) {
          data[i] = 255 - data[i];
          data[i + 1] = 255 - data[i + 1];
          data[i + 2] = 255 - data[i + 2];
        }
        break;
      }
      case 'blur': {
        const radius = Math.max(1, Math.round((value ?? 2) * 2 + 1));
        this.applyBoxBlur(data, canvas.width, canvas.height, radius);
        break;
      }
      case 'sharpen': {
        this.applySharpen(data, canvas.width, canvas.height);
        break;
      }
    }

    ctx.putImageData(imageData, 0, 0);

    const outputBuffer = target.format === 'png' ? canvas.toBuffer('image/png') : canvas.toBuffer('image/jpeg');
    const base64 = outputBuffer.toString('base64');

    return this.replaceImage(pdfData, pageIndex, imageRef, base64, target.format);
  }

  /**
   * 批量对页面中的所有图片应用滤镜
   */
  async applyFilterToAllImages(
    pdfData: ArrayBuffer,
    pageIndex: number,
    filter: 'brightness' | 'contrast' | 'grayscale' | 'sepia' | 'invert' | 'blur' | 'sharpen',
    value?: number
  ): Promise<ReplaceImageResult> {
    const images = await this.extractPageImages(pdfData, pageIndex);
    let currentData = pdfData;
    let totalReplaced = 0;

    for (const img of images) {
      const result = await this.applyImageFilter(currentData, pageIndex, img.ref, filter, value);
      currentData = result.pdfData;
      totalReplaced += result.replacedCount;
    }

    return { pdfData: currentData, replacedCount: totalReplaced };
  }

  // ---- Private filter helpers ----

  private applyBoxBlur(data: Uint8ClampedArray, width: number, height: number, radius: number): void {
    const temp = new Uint8ClampedArray(data.length);
    // Horizontal pass
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let r = 0, g = 0, b = 0, count = 0;
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = Math.min(width - 1, Math.max(0, x + dx));
          const idx = (y * width + nx) * 4;
          r += data[idx]; g += data[idx + 1]; b += data[idx + 2]; count++;
        }
        const idx = (y * width + x) * 4;
        temp[idx] = r / count; temp[idx + 1] = g / count; temp[idx + 2] = b / count; temp[idx + 3] = data[idx + 3];
      }
    }
    // Vertical pass
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let r = 0, g = 0, b = 0, count = 0;
        for (let dy = -radius; dy <= radius; dy++) {
          const ny = Math.min(height - 1, Math.max(0, y + dy));
          const idx = (ny * width + x) * 4;
          r += temp[idx]; g += temp[idx + 1]; b += temp[idx + 2]; count++;
        }
        const idx = (y * width + x) * 4;
        data[idx] = r / count; data[idx + 1] = g / count; data[idx + 2] = b / count;
      }
    }
  }

  private applySharpen(data: Uint8ClampedArray, width: number, height: number): void {
    // 3x3 sharpen kernel: [0, -1, 0, -1, 5, -1, 0, -1, 0]
    const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];
    const temp = new Uint8ClampedArray(data);

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        for (let c = 0; c < 3; c++) {
          let sum = 0;
          for (let ky = -1; ky <= 1; ky++) {
            for (let kx = -1; kx <= 1; kx++) {
              const idx = ((y + ky) * width + (x + kx)) * 4 + c;
              sum += temp[idx] * kernel[(ky + 1) * 3 + (kx + 1)];
            }
          }
          const idx = (y * width + x) * 4 + c;
          data[idx] = Math.min(255, Math.max(0, sum));
        }
      }
    }
  }
}
