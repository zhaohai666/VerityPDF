import { PDFDocument, PDFName, PDFDict, PDFNumber } from 'pdf-lib';
import zlib from 'zlib';

/** 提取的图片信息 */
export interface ExtractedImage {
  pageIndex: number;
  imageIndex: number;
  width: number;
  height: number;
  bitsPerComponent: number;
  colorSpace: string;
  filter: string;
  format: 'jpeg' | 'png' | 'raw';
  data: Uint8Array;
}

/**
 * PDF 嵌入图片提取服务
 * 从 PDF 内部结构中提取所有 XObject Image 资源
 */
export class ImageExtractorService {
  /**
   * 提取 PDF 中所有嵌入图片
   */
  async extractImages(pdfData: ArrayBuffer): Promise<ExtractedImage[]> {
    const doc = await PDFDocument.load(pdfData, { ignoreEncryption: true });
    const context = doc.context;
    const pages = doc.getPages();
    const images: ExtractedImage[] = [];

    for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
      const page = pages[pageIdx];
      const resources = page.node.get(PDFName.of('Resources'));
      if (!resources) continue;

      const resourcesDict = context.lookup(resources) as PDFDict;
      if (!resourcesDict) continue;

      const xObject = resourcesDict.get(PDFName.of('XObject'));
      if (!xObject) continue;

      const xObjectDict = context.lookup(xObject) as PDFDict;
      if (!xObjectDict) continue;

      // 遍历所有 XObject
      const keys = xObjectDict instanceof PDFDict ? (xObjectDict as any).dict?.keys?.() : null;
      if (!keys) continue;

      let imgIdx = 0;
      for (const key of keys) {
        const imgRef = xObjectDict.get(key);
        if (!imgRef) continue;

        const imgObj = context.lookup(imgRef);
        if (!imgObj) continue;

        // 检查是否为 Image 类型的 XObject
        const imgDict = imgObj as PDFDict;
        const subtype = imgDict.get(PDFName.of('Subtype'));
        if (!subtype || subtype.toString() !== '/Image') continue;

        try {
          const image = this.parseImage(imgDict, context);
          if (image) {
            image.pageIndex = pageIdx;
            image.imageIndex = imgIdx++;
            images.push(image);
          }
        } catch {
          // 跳过无法解析的图片
        }
      }
    }

    return images;
  }

  /**
   * 解析单个图片对象
   */
  private parseImage(imgDict: PDFDict, _context: any): ExtractedImage | null {
    const width = this.getNumber(imgDict, 'Width');
    const height = this.getNumber(imgDict, 'Height');
    if (!width || !height) return null;

    const bitsPerComponent = this.getNumber(imgDict, 'BitsPerComponent') || 8;
    const filter = imgDict.get(PDFName.of('Filter'));
    const filterStr = filter ? filter.toString().replace(/^\//, '') : '';
    const colorSpaceObj = imgDict.get(PDFName.of('ColorSpace'));
    const colorSpace = colorSpaceObj ? colorSpaceObj.toString().replace(/^\//, '') : 'DeviceRGB';

    // 获取图片流数据
    let rawData: Uint8Array;
    if ('contents' in imgDict) {
      rawData = (imgDict as any).contents;
    } else {
      return null;
    }

    let format: 'jpeg' | 'png' | 'raw';
    let data: Uint8Array;

    if (filterStr === 'DCTDecode') {
      // JPEG 图片：数据已经是 JPEG 格式
      format = 'jpeg';
      data = rawData;
    } else if (filterStr === 'JPXDecode') {
      // JPEG2000：暂不支持，跳过
      return null;
    } else if (filterStr === 'FlateDecode' || filterStr === '' || filterStr === 'LZWDecode') {
      // 已解码的原始像素数据，需要转换为 PNG
      format = 'png';
      data = this.rawToPng(rawData, width, height, bitsPerComponent, colorSpace);
    } else if (filterStr.includes('DCTDecode')) {
      // 多重滤波器中包含 DCT
      format = 'jpeg';
      data = rawData;
    } else {
      format = 'raw';
      data = rawData;
    }

    return {
      pageIndex: 0,
      imageIndex: 0,
      width,
      height,
      bitsPerComponent,
      colorSpace,
      filter: filterStr,
      format,
      data,
    };
  }

  /**
   * 将原始像素数据转换为 PNG 格式
   * 使用 canvas 进行转换
   */
  private rawToPng(
    rawData: Uint8Array,
    width: number,
    height: number,
    _bitsPerComponent: number,
    colorSpace: string
  ): Uint8Array {
    const isGray = colorSpace === 'DeviceGray' || colorSpace === 'CalGray';
    const isCMYK = colorSpace === 'DeviceCMYK';

    // 构建 RGBA 像素数据
    const rgba = new Uint8Array(width * height * 4);
    const bytesPerPixel = isGray ? 1 : isCMYK ? 4 : 3;

    for (let i = 0; i < width * height; i++) {
      const srcIdx = i * bytesPerPixel;
      const dstIdx = i * 4;
      if (srcIdx >= rawData.length) break;

      if (isGray) {
        const v = rawData[srcIdx];
        rgba[dstIdx] = v; rgba[dstIdx + 1] = v; rgba[dstIdx + 2] = v; rgba[dstIdx + 3] = 255;
      } else if (isCMYK) {
        const c = rawData[srcIdx] / 255, m = rawData[srcIdx + 1] / 255;
        const y = rawData[srcIdx + 2] / 255, k = rawData[srcIdx + 3] / 255;
        rgba[dstIdx] = Math.round(255 * (1 - c) * (1 - k));
        rgba[dstIdx + 1] = Math.round(255 * (1 - m) * (1 - k));
        rgba[dstIdx + 2] = Math.round(255 * (1 - y) * (1 - k));
        rgba[dstIdx + 3] = 255;
      } else {
        rgba[dstIdx] = rawData[srcIdx];
        rgba[dstIdx + 1] = rawData[srcIdx + 1];
        rgba[dstIdx + 2] = rawData[srcIdx + 2];
        rgba[dstIdx + 3] = 255;
      }
    }

    return this.encodePng(rgba, width, height);
  }

  /** 简易 PNG 编码器 */
  private encodePng(rgba: Uint8Array, width: number, height: number): Uint8Array {
    // 添加每行滤波器字节 (0 = None)
    const raw = new Uint8Array(height * (1 + width * 4));
    for (let y = 0; y < height; y++) {
      raw[y * (1 + width * 4)] = 0; // filter byte
      raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (1 + width * 4) + 1);
    }

    const deflated = zlib.deflateSync(Buffer.from(raw));

    const chunks: Buffer[] = [];

    // PNG signature
    chunks.push(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));

    // IHDR
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 6; // color type RGBA
    ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
    chunks.push(this.pngChunk('IHDR', ihdr));

    // IDAT
    chunks.push(this.pngChunk('IDAT', deflated));

    // IEND
    chunks.push(this.pngChunk('IEND', Buffer.alloc(0)));

    const totalLen = chunks.reduce((s, c) => s + c.length, 0);
    const result = new Uint8Array(totalLen);
    let off = 0;
    for (const c of chunks) { result.set(c, off); off += c.length; }
    return result;
  }

  private pngChunk(type: string, data: Buffer): Buffer {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuffer = Buffer.from(type, 'ascii');
    const crcInput = Buffer.concat([typeBuffer, data]);
    const crc = Buffer.alloc(4);
    crc.writeInt32BE(this.crc32(crcInput), 0);
    return Buffer.concat([len, typeBuffer, data, crc]);
  }

  private crc32(buf: Buffer): number {
    let crc = 0xFFFFFFFF;
    const table = this.getCrc32Table();
    for (let i = 0; i < buf.length; i++) {
      crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xFF];
    }
    return (crc ^ 0xFFFFFFFF) | 0;
  }

  private crc32Table: Uint32Array | null = null;
  private getCrc32Table(): Uint32Array {
    if (this.crc32Table) return this.crc32Table;
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      }
      table[n] = c >>> 0;
    }
    this.crc32Table = table;
    return table;
  }

  private getNumber(dict: PDFDict, key: string): number | null {
    const val = dict.get(PDFName.of(key));
    if (!val) return null;
    if (val instanceof PDFNumber) return val.asNumber();
    const num = Number(val);
    return isNaN(num) ? null : num;
  }
}
