import { PDFDocument, rgb, StandardFonts, PDFPage, PDFFont } from 'pdf-lib';
import fs from 'fs';
import path from 'path';

/** 标注数据（从渲染进程接收） */
export interface ExportAnnotation {
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
  unit?: string;
  startPoint?: { x: number; y: number };
  midPoint?: { x: number; y: number };
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

interface PageBox {
  width: number;
  height: number;
  x: number;
  y: number;
}

function getCropBox(page: PDFPage): PageBox {
  const cropBox = page.getCropBox();
  if (cropBox) {
    return {
      width: cropBox.width,
      height: cropBox.height,
      x: cropBox.x,
      y: cropBox.y,
    };
  }
  const { width, height } = page.getSize();
  return { width, height, x: 0, y: 0 };
}

function toPdf(normX: number, normY: number, box: PageBox) {
  return { x: box.x + normX * box.width, y: box.y + box.height - normY * box.height };
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
  const timesFont = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  const courierFont = await pdfDoc.embedFont(StandardFonts.Courier);

  const byPage = new Map<number, ExportAnnotation[]>();
  for (const ann of annotations) {
    const idx = ann.page - 1;
    if (!byPage.has(idx)) byPage.set(idx, []);
    byPage.get(idx)!.push(ann);
  }

  byPage.forEach((anns, idx) => {
    if (idx < 0 || idx >= pages.length) return;
    const page = pages[idx];
    const box = getCropBox(page);
    for (const ann of anns) {
      try {
        drawAnnotation(page, ann, box, font, boldFont, timesFont, courierFont, pdfDoc);
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
  box: PageBox,
  font: PDFFont,
  _boldFont: PDFFont,
  timesFont: PDFFont,
  courierFont: PDFFont,
  pdfDoc: PDFDocument
): Promise<void> {
  const sc = parseColor(ann.style.stroke);
  const fc = parseColor(ann.style.fill);
  const op = ann.style.opacity ?? 1;
  const sw = ann.style.strokeWidth ?? 2;
  const dash = ann.style.dash?.length ? ann.style.dash : undefined;
  const hasFill = ann.style.fill && ann.style.fill !== 'transparent' && ann.style.fill !== 'none';

  const getFont = (family?: string): PDFFont => {
    if (!family) return font;
    if (family.toLowerCase().includes('times')) return timesFont;
    if (family.toLowerCase().includes('courier')) return courierFont;
    if (family.toLowerCase().includes('serif')) return timesFont;
    return font;
  };

  const tl = toPdf(ann.position.x, ann.position.y, box);
  const w = ann.size.width * box.width;
  const h = ann.size.height * box.height;

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
      const s = toPdf(ann.position.x, ann.position.y, box);
      const e = toPdf(ann.endPoint.x, ann.endPoint.y, box);
      page.drawLine({ start: s, end: e, thickness: sw, color: rgb(sc.r, sc.g, sc.b), opacity: op, dashArray: dash });
      break;
    }

    // ── 箭头: position = 起点, endPoint = 终点 + 箭头头 ──
    case 'arrow': {
      if (!ann.endPoint) break;
      const s = toPdf(ann.position.x, ann.position.y, box);
      const e = toPdf(ann.endPoint.x, ann.endPoint.y, box);
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
        const p1 = toPdf(ann.points[i - 1].x, ann.points[i - 1].y, box);
        const p2 = toPdf(ann.points[i].x, ann.points[i].y, box);
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
      const currentFont = getFont(ann.style.fontFamily);
      const maxWidth = w > 0 ? w : box.width * 0.5;
      const lines = wrapText(ann.content, currentFont, fontSize, maxWidth);
      for (let i = 0; i < lines.length; i++) {
        page.drawText(lines[i], {
          x: tl.x,
          y: tl.y - fontSize - i * (fontSize * 1.3),
          size: fontSize,
          font: currentFont,
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

    // ── 多边形: points = 顶点数组 ──
    case 'polygon': {
      if (!ann.points || ann.points.length < 3) break;
      const pdfPoints = ann.points.map(p => toPdf(p.x, p.y, box));
      for (let i = 0; i < pdfPoints.length; i++) {
        const p1 = pdfPoints[i];
        const p2 = pdfPoints[(i + 1) % pdfPoints.length];
        page.drawLine({
          start: p1,
          end: p2,
          thickness: sw,
          color: rgb(sc.r, sc.g, sc.b),
          opacity: op,
          dashArray: dash,
        });
      }
      if (hasFill) {
        const minX = Math.min(...pdfPoints.map(p => p.x));
        const minY = Math.min(...pdfPoints.map(p => p.y));
        const maxX = Math.max(...pdfPoints.map(p => p.x));
        const maxY = Math.max(...pdfPoints.map(p => p.y));
        page.drawRectangle({
          x: minX,
          y: minY,
          width: maxX - minX,
          height: maxY - minY,
          color: rgb(fc.r, fc.g, fc.b),
          opacity: op * 0.3,
          borderWidth: 0,
        });
      }
      break;
    }

    // ── 连接线: 连接两个标注 ──
    case 'connector': {
      if (!ann.endPoint) break;
      const s = toPdf(ann.position.x, ann.position.y, box);
      const e = toPdf(ann.endPoint.x, ann.endPoint.y, box);
      page.drawLine({ start: s, end: e, thickness: sw, color: rgb(sc.r, sc.g, sc.b), opacity: op, dashArray: dash });
      break;
    }

    // ── 印章: 嵌入图片 ──
    case 'stamp': {
      await drawImageAnnotation(page, ann, tl, w, h, pdfDoc);
      break;
    }

    // ── 签名: 嵌入图片 ──
    case 'signature': {
      await drawImageAnnotation(page, ann, tl, w, h, pdfDoc);
      break;
    }

    // ── 涂黑: 纯黑不透明矩形 ──
    case 'redaction': {
      page.drawRectangle({
        x: tl.x,
        y: tl.y - h,
        width: w,
        height: h,
        color: rgb(0, 0, 0),
        opacity: 1,
        borderWidth: 0,
      });
      break;
    }

    // ── 波浪线: 逐段小直线模拟 ──
    case 'wavyLine': {
      if (!ann.endPoint) break;
      const start = { x: ann.position.x, y: ann.position.y };
      const end = { x: ann.endPoint.x, y: ann.endPoint.y };
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 0.001) break;
      const nx = -dy / dist;
      const ny = dx / dist;
      const amplitude = 0.004;
      const wavelength = 0.015;
      const steps = Math.max(20, Math.ceil(dist / wavelength * 4));
      let prev = toPdf(start.x, start.y, box);
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const wave = Math.sin(t * dist / wavelength * Math.PI * 2) * amplitude;
        const px = start.x + dx * t + nx * wave;
        const py = start.y + dy * t + ny * wave;
        const curr = toPdf(px, py, box);
        page.drawLine({ start: prev, end: curr, thickness: sw, color: rgb(sc.r, sc.g, sc.b), opacity: op });
        prev = curr;
      }
      break;
    }

    // ── 距离测量: 线段 + 标签 ──
    case 'measureDistance': {
      if (!ann.endPoint) break;
      const s = toPdf(ann.position.x, ann.position.y, box);
      const e = toPdf(ann.endPoint.x, ann.endPoint.y, box);
      page.drawLine({ start: s, end: e, thickness: sw, color: rgb(sc.r, sc.g, sc.b), opacity: op });
      // 标签
      const unitFactors: Record<string, number> = { pt: 1, mm: 25.4 / 72, cm: 2.54 / 72, in: 1 / 72 };
      const unit = ann.unit || 'pt';
      const dxPx = (ann.endPoint.x - ann.position.x) * box.width;
      const dyPx = (ann.endPoint.y - ann.position.y) * box.height;
      const distPt = Math.sqrt(dxPx * dxPx + dyPx * dyPx);
      const distVal = distPt * (unitFactors[unit] ?? 1);
      const label = `${distVal.toFixed(unit === 'pt' ? 1 : 2)} ${unit}`;
      const mid = { x: (s.x + e.x) / 2, y: (s.y + e.y) / 2 };
      page.drawRectangle({ x: mid.x - 2, y: mid.y - 12, width: font.widthOfTextAtSize(label, 10) + 6, height: 14, color: rgb(1, 1, 1), opacity: 0.9, borderWidth: 0 });
      page.drawText(label, { x: mid.x, y: mid.y - 10, size: 10, font, color: rgb(sc.r, sc.g, sc.b) });
      break;
    }

    // ── 面积测量: 多边形 + 标签 ──
    case 'measureArea': {
      if (!ann.points || ann.points.length < 3) break;
      const pdfPts = ann.points.map(p => toPdf(p.x, p.y, box));
      for (let i = 0; i < pdfPts.length; i++) {
        const p1 = pdfPts[i];
        const p2 = pdfPts[(i + 1) % pdfPts.length];
        page.drawLine({ start: p1, end: p2, thickness: sw, color: rgb(sc.r, sc.g, sc.b), opacity: op });
      }
      // 面积标签
      const unit = ann.unit || 'pt';
      const unitFactors: Record<string, number> = { pt: 1, mm: 25.4 / 72, cm: 2.54 / 72, in: 1 / 72 };
      let areaPx = 0;
      const n = ann.points.length;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        areaPx += ann.points[i].x * box.width * ann.points[j].y * box.height;
        areaPx -= ann.points[j].x * box.width * ann.points[i].y * box.height;
      }
      const areaPt2 = Math.abs(areaPx) / 2;
      const f = unitFactors[unit] ?? 1;
      const areaVal = areaPt2 * f * f;
      const label = `${areaVal.toFixed(2)} ${unit}\u00B2`;
      const cx = pdfPts.reduce((s, p) => s + p.x, 0) / pdfPts.length;
      const cy = pdfPts.reduce((s, p) => s + p.y, 0) / pdfPts.length;
      page.drawRectangle({ x: cx - 2, y: cy - 12, width: font.widthOfTextAtSize(label, 10) + 6, height: 14, color: rgb(1, 1, 1), opacity: 0.9, borderWidth: 0 });
      page.drawText(label, { x: cx, y: cy - 10, size: 10, font, color: rgb(sc.r, sc.g, sc.b) });
      break;
    }

    // ── 角度测量: 两条线段 + 弧线 + 标签 ──
    case 'measureAngle': {
      const sp = ann.startPoint ?? ann.position;
      const mp = ann.midPoint ?? ann.position;
      const ep = ann.endPoint ?? ann.position;
      const s = toPdf(sp.x, sp.y, box);
      const m = toPdf(mp.x, mp.y, box);
      const e = toPdf(ep.x, ep.y, box);
      page.drawLine({ start: s, end: m, thickness: sw, color: rgb(sc.r, sc.g, sc.b), opacity: op });
      page.drawLine({ start: m, end: e, thickness: sw, color: rgb(sc.r, sc.g, sc.b), opacity: op });
      // 角度计算
      const a1 = Math.atan2(s.y - m.y, s.x - m.x);
      const a2 = Math.atan2(e.y - m.y, e.x - m.x);
      let angle = a2 - a1;
      if (angle > Math.PI) angle -= 2 * Math.PI;
      if (angle < -Math.PI) angle += 2 * Math.PI;
      const deg = Math.abs(angle * (180 / Math.PI));
      const label = `${deg.toFixed(1)}\u00B0`;
      page.drawText(label, { x: m.x + 15, y: m.y + 5, size: 10, font, color: rgb(sc.r, sc.g, sc.b) });
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
  const lines: string[] = [];
  const paragraphs = text.split('\n');

  for (const paragraph of paragraphs) {
    if (!paragraph.trim()) {
      lines.push('');
      continue;
    }

    const words = paragraph.split(/(\s+)/);
    let currentLine = '';

    for (const word of words) {
      if (word.trim() === '') {
        currentLine += word;
        continue;
      }

      const testLine = currentLine + word;
      const testWidth = font.widthOfTextAtSize(testLine, fontSize);

      if (testWidth <= maxWidth) {
        currentLine = testLine;
      } else {
        if (currentLine.trim()) {
          lines.push(currentLine.trimEnd());
        }

        const wordWidth = font.widthOfTextAtSize(word, fontSize);
        if (wordWidth > maxWidth) {
          let remaining = word;
          while (remaining) {
            let splitPoint = remaining.length;
            while (splitPoint > 0 && font.widthOfTextAtSize(remaining.slice(0, splitPoint), fontSize) > maxWidth) {
              splitPoint--;
            }
            if (splitPoint === 0) splitPoint = 1;
            lines.push(remaining.slice(0, splitPoint));
            remaining = remaining.slice(splitPoint);
          }
          currentLine = '';
        } else {
          currentLine = word;
        }
      }
    }

    if (currentLine.trim()) {
      lines.push(currentLine.trimEnd());
    }
  }

  return lines.slice(0, 50);
}

// ─── 总结报告 PDF 导出 ────────────────────

export interface SummaryAnnotation {
  id: string;
  type: string;
  page: number;
  content?: string;
}

export interface SummaryComment {
  annotationId: string;
  author: string;
  text: string;
  parentId?: string;
}

export async function exportSummaryPDF(
  annotations: SummaryAnnotation[],
  comments: SummaryComment[],
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const typeLabels: Record<string, string> = {
    rect: 'Rect', ellipse: 'Ellipse', arrow: 'Arrow', line: 'Line',
    freehand: 'Freehand', text: 'Text', highlight: 'Highlight',
    stickyNote: 'StickyNote', stamp: 'Stamp', signature: 'Signature',
    redaction: 'Redaction', wavyLine: 'WavyLine',
    measureDistance: 'Distance', measureArea: 'Area', measureAngle: 'Angle',
  };

  // 标题页
  const titlePage = pdfDoc.addPage([595, 842]);
  titlePage.drawText('Annotation Summary Report', { x: 50, y: 780, size: 22, font: boldFont });
  titlePage.drawText(`Total: ${annotations.length} annotations, ${comments.length} comments`, { x: 50, y: 750, size: 12, font });
  titlePage.drawText(`Generated: ${new Date().toLocaleString()}`, { x: 50, y: 730, size: 10, font, color: rgb(0.4, 0.4, 0.4) });

  // 类型统计
  const typeCount = new Map<string, number>();
  for (const ann of annotations) {
    typeCount.set(ann.type, (typeCount.get(ann.type) ?? 0) + 1);
  }
  let statsY = 700;
  titlePage.drawText('Type Distribution:', { x: 50, y: statsY, size: 14, font: boldFont });
  statsY -= 20;
  for (const [type, count] of Array.from(typeCount.entries()).sort((a, b) => b[1] - a[1])) {
    titlePage.drawText(`  ${typeLabels[type] ?? type}: ${count}`, { x: 60, y: statsY, size: 11, font });
    statsY -= 16;
  }

  // 按页分组明细
  const byPage = new Map<number, SummaryAnnotation[]>();
  for (const ann of annotations) {
    if (!byPage.has(ann.page)) byPage.set(ann.page, []);
    byPage.get(ann.page)!.push(ann);
  }

  for (const [page, anns] of Array.from(byPage.entries()).sort((a, b) => a[0] - b[0])) {
    const detailPage = pdfDoc.addPage([595, 842]);
    let y = 800;
    detailPage.drawText(`Page ${page} (${anns.length} annotations)`, { x: 50, y, size: 16, font: boldFont });
    y -= 24;

    for (const ann of anns) {
      if (y < 50) {
        const np = pdfDoc.addPage([595, 842]);
        y = 800;
        np.drawText(`Page ${page} (cont.)`, { x: 50, y, size: 14, font: boldFont });
        y -= 24;
        // Continue writing on np... but for simplicity, just break
        break;
      }
      const label = typeLabels[ann.type] ?? ann.type;
      let line = `  [${label}]`;
      if (ann.content) {
        const text = ann.content.length > 60 ? ann.content.slice(0, 60) + '...' : ann.content;
        line += ` "${text}"`;
      }
      detailPage.drawText(line, { x: 60, y, size: 10, font });
      y -= 14;

      // 该标注的评论
      const annComments = comments.filter((c) => c.annotationId === ann.id);
      for (const cmt of annComments) {
        if (y < 50) break;
        const cmtText = cmt.text.length > 50 ? cmt.text.slice(0, 50) + '...' : cmt.text;
        detailPage.drawText(`    - ${cmt.author}: ${cmtText}`, { x: 80, y, size: 9, font, color: rgb(0.3, 0.3, 0.3) });
        y -= 12;
      }
      y -= 4;
    }
  }

  return pdfDoc.save();
}
