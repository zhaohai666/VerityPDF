import { PDFDocument, rgb, StandardFonts, PDFPage, PDFFont } from 'pdf-lib';
import fs from 'fs';
import path from 'path';

/** 标注数据（从渲染进程接收） */
interface ExportAnnotation {
  id: string;
  type: string;
  page: number;
  position: { x: number; y: number };
  size: { width: number; height: number };
  style: {
    stroke: string;
    strokeWidth: number;
    fill: string;
    opacity: number;
    dash?: number[];
    fontSize?: number;
    fontFamily?: string;
  };
  content?: string;
  endPoint?: { x: number; y: number };
  points?: Array<{ x: number; y: number }>;
  collapsed?: boolean;
  imagePath?: string;
}

// ─── 颜色解析 ────────────────────────────────────

function parseColor(color: string): { r: number; g: number; b: number } {
  if (!color || color === 'transparent' || color === 'none') {
    return { r: 0, g: 0, b: 0 };
  }

  // #RRGGBB
  if (color.startsWith('#') && color.length === 7) {
    return {
      r: parseInt(color.slice(1, 3), 16) / 255,
      g: parseInt(color.slice(3, 5), 16) / 255,
      b: parseInt(color.slice(5, 7), 16) / 255,
    };
  }

  // #RGB
  if (color.startsWith('#') && color.length === 4) {
    return {
      r: parseInt(color[1] + color[1], 16) / 255,
      g: parseInt(color[2] + color[2], 16) / 255,
      b: parseInt(color[3] + color[3], 16) / 255,
    };
  }

  // rgb(r, g, b) 或 rgba(r, g, b, a)
  const rgbMatch = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgbMatch) {
    return {
      r: parseInt(rgbMatch[1]) / 255,
      g: parseInt(rgbMatch[2]) / 255,
      b: parseInt(rgbMatch[3]) / 255,
    };
  }

  return { r: 0, g: 0, b: 0 };
}

// ─── 坐标转换 ────────────────────────────────────

/**
 * 归一化坐标 (0-1, 原点左上角) → PDF 坐标 (原点左下角)
 */
function toPdf(normX: number, normY: number, pw: number, ph: number) {
  return { x: normX * pw, y: ph - normY * ph };
}

// ─── 主导出函数 ──────────────────────────────────

export async function exportPDF(
  pdfData: ArrayBuffer,
  annotations: ExportAnnotation[]
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfData, { ignoreEncryption: true });
  const pages = pdfDoc.getPages();

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // 按页分组
  const byPage = new Map<number, ExportAnnotation[]>();
  for (const ann of annotations) {
    const idx = ann.page - 1;
    if (!byPage.has(idx)) byPage.set(idx, []);
    byPage.get(idx)!.push(ann);
  }

  // 逐页绘制
  byPage.forEach((anns, idx) => {
    if (idx < 0 || idx >= pages.length) return;
    const page = pages[idx];
    const { width: pw, height: ph } = page.getSize();
    for (const ann of anns) {
      try {
        drawAnnotation(page, ann, pw, ph, font, boldFont, pdfDoc);
      } catch (err) {
        console.error(`[Export] ann ${ann.id} (${ann.type}):`, err);
      }
    }
  });

  return pdfDoc.save();
}

// ─── 单标注绘制 ──────────────────────────────────

async function drawAnnotation(
  page: PDFPage,
  ann: ExportAnnotation,
  pw: number,
  ph: number,
  font: PDFFont,
  boldFont: PDFFont,
  pdfDoc: PDFDocument
): Promise<void> {
  const sc = parseColor(ann.style.stroke);
  const fc = parseColor(ann.style.fill);
  const op = ann.style.opacity ?? 1;
  const sw = ann.style.strokeWidth ?? 2;
  const dash = ann.style.dash?.length ? ann.style.dash : undefined;
  const hasFill = ann.style.fill && ann.style.fill !== 'transparent' && ann.style.fill !== 'none';

  // position = top-left for rect/highlight/text/stickyNote
  // position = center for ellipse
  // position = start for arrow/line/freehand
  const tl = toPdf(ann.position.x, ann.position.y, pw, ph);
  const w = ann.size.width * pw;
  const h = ann.size.height * ph;

  switch (ann.type) {
    // ── 矩形: position = 左上角 ──
    case 'rect': {
      page.drawRectangle({
        x: tl.x,
        y: tl.y - h, // PDF 左下角 → 矩形左下角 = topY - height
        width: w,
        height: h,
        borderColor: rgb(sc.r, sc.g, sc.b),
        borderWidth: sw,
        color: hasFill ? rgb(fc.r, fc.g, fc.b) : undefined,
        opacity: op,
        borderOpacity: op,
        borderDashArray: dash,
      });
      break;
    }

    // ── 椭圆: position = 中心点 ──
    case 'ellipse': {
      const cx = tl.x;
      const cy = tl.y; // position.y is already center, just flip Y
      page.drawEllipse({
        x: cx,
        y: cy,
        xScale: w / 2,
        yScale: h / 2,
        borderColor: rgb(sc.r, sc.g, sc.b),
        borderWidth: sw,
        color: hasFill ? rgb(fc.r, fc.g, fc.b) : undefined,
        opacity: op,
        borderOpacity: op,
        borderDashArray: dash,
      });
      break;
    }

    // ── 直线: position = 起点, endPoint = 终点 ──
    case 'line': {
      if (!ann.endPoint) break;
      const s = toPdf(ann.position.x, ann.position.y, pw, ph);
      const e = toPdf(ann.endPoint.x, ann.endPoint.y, pw, ph);
      page.drawLine({ start: s, end: e, thickness: sw, color: rgb(sc.r, sc.g, sc.b), opacity: op, dashArray: dash });
      break;
    }

    // ── 箭头: position = 起点, endPoint = 终点 + 箭头头 ──
    case 'arrow': {
      if (!ann.endPoint) break;
      const s = toPdf(ann.position.x, ann.position.y, pw, ph);
      const e = toPdf(ann.endPoint.x, ann.endPoint.y, pw, ph);
      page.drawLine({ start: s, end: e, thickness: sw, color: rgb(sc.r, sc.g, sc.b), opacity: op, dashArray: dash });
      // 箭头头部
      const dx = e.x - s.x;
      const dy = e.y - s.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > 0) {
        const aSize = Math.min(15, len * 0.3);
        const angle = Math.atan2(dy, dx);
        for (const sign of [1, -1]) {
          const a = angle + Math.PI * 0.85 * sign;
          page.drawLine({
            start: e,
            end: { x: e.x + aSize * Math.cos(a), y: e.y + aSize * Math.sin(a) },
            thickness: sw,
            color: rgb(sc.r, sc.g, sc.b),
            opacity: op,
          });
        }
      }
      break;
    }

    // ── 自由画笔: points = 归一化绝对坐标 ──
    case 'freehand': {
      if (!ann.points || ann.points.length < 2) break;
      for (let i = 1; i < ann.points.length; i++) {
        const p1 = toPdf(ann.points[i - 1].x, ann.points[i - 1].y, pw, ph);
        const p2 = toPdf(ann.points[i].x, ann.points[i].y, pw, ph);
        page.drawLine({ start: p1, end: p2, thickness: sw, color: rgb(sc.r, sc.g, sc.b), opacity: op });
      }
      break;
    }

    // ── 高亮: position = 左上角, 半透明填充 ──
    case 'highlight': {
      const hc = parseColor(ann.style.fill || ann.style.stroke);
      page.drawRectangle({
        x: tl.x,
        y: tl.y - h,
        width: w,
        height: h,
        color: rgb(hc.r, hc.g, hc.b),
        opacity: ann.style.opacity || 0.3,
        borderWidth: 0,
      });
      break;
    }

    // ── 文本: position = 左上角, 支持多行 ──
    case 'text': {
      if (!ann.content) break;
      const fontSize = ann.style.fontSize || 14;
      const tc = parseColor(ann.style.stroke);
      const lines = wrapText(ann.content, font, fontSize, w > 0 ? w : pw * 0.5);
      for (let i = 0; i < lines.length; i++) {
        page.drawText(lines[i], {
          x: tl.x,
          y: tl.y - fontSize - i * (fontSize * 1.3),
          size: fontSize,
          font,
          color: rgb(tc.r, tc.g, tc.b),
          opacity: op,
        });
      }
      break;
    }

    // ── 便签: position = 左上角, 黄色背景 + 文本 ──
    case 'stickyNote': {
      const nw = Math.max(w, 80);
      const nh = Math.max(h, 60);
      page.drawRectangle({
        x: tl.x,
        y: tl.y - nh,
        width: nw,
        height: nh,
        color: rgb(253 / 255, 230 / 255, 138 / 255),
        borderColor: rgb(184 / 255, 134 / 255, 11 / 255),
        borderWidth: 1,
        opacity: 0.9,
      });
      if (ann.content) {
        const fs = 10;
        const lines = wrapText(ann.content, font, fs, nw - 8);
        for (let i = 0; i < lines.length; i++) {
          page.drawText(lines[i], {
            x: tl.x + 4,
            y: tl.y - fs - 4 - i * (fs + 2),
            size: fs,
            font,
            color: rgb(0.2, 0.2, 0.2),
            opacity: 0.9,
          });
        }
      }
      break;
    }

    // ── 印章: 嵌入图片 ──
    case 'stamp': {
      await drawImageAnnotation(page, ann, pw, ph, tl, w, h, pdfDoc);
      break;
    }

    // ── 签名: 嵌入图片 ──
    case 'signature': {
      await drawImageAnnotation(page, ann, pw, ph, tl, w, h, pdfDoc);
      break;
    }

    default:
      console.warn(`[Export] Unsupported type: ${ann.type}`);
  }
}

// ─── 图片标注 (stamp / signature) ────────────────

async function drawImageAnnotation(
  page: PDFPage,
  ann: ExportAnnotation,
  _pw: number,
  _ph: number,
  tl: { x: number; y: number },
  w: number,
  h: number,
  pdfDoc: PDFDocument
): Promise<void> {
  if (!ann.imagePath) {
    // 没有图片时画占位矩形
    page.drawRectangle({
      x: tl.x,
      y: tl.y - h,
      width: w || 100,
      height: h || 60,
      borderColor: rgb(0.5, 0.5, 0.5),
      borderWidth: 1,
      borderDashArray: [4, 4],
    });
    return;
  }

  try {
    // 支持 file:// 和绝对路径
    const filePath = ann.imagePath.replace(/^file:\/\//, '');
    if (!fs.existsSync(filePath)) {
      console.warn(`[Export] Image not found: ${filePath}`);
      return;
    }

    const imageBytes = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    let image;
    if (ext === '.png') {
      image = await pdfDoc.embedPng(imageBytes);
    } else {
      image = await pdfDoc.embedJpg(imageBytes);
    }

    const imgW = w || image.width;
    const imgH = h || image.height;
    page.drawImage(image, {
      x: tl.x,
      y: tl.y - imgH,
      width: imgW,
      height: imgH,
      opacity: ann.style.opacity ?? 1,
    });
  } catch (err) {
    console.error(`[Export] Image embed failed for ${ann.imagePath}:`, err);
  }
}

// ─── 文本换行 ────────────────────────────────────

function wrapText(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
  if (maxWidth <= 0) maxWidth = 200;
  const chars = text.split('');
  const lines: string[] = [];
  let current = '';

  for (const ch of chars) {
    if (ch === '\n') {
      lines.push(current);
      current = '';
      continue;
    }
    const test = current + ch;
    if (font.widthOfTextAtSize(test, fontSize) > maxWidth && current.length > 0) {
      lines.push(current);
      current = ch;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 20); // 最多 20 行
}
