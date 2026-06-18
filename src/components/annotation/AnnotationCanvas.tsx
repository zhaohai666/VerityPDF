import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { useToolStore } from '@/stores/toolStore';
import { useAnnotationStore } from '@/stores/annotationStore';
import type { Annotation, ToolType, Point, MeasureUnit } from '@/types';
import { createDefaultMetadata } from '@/types';
import { calcDistance, calcArea, calcAngle, formatMeasure } from '@/utils/Measurement';

interface DrawingState {
  isDrawing: boolean;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

interface DragState {
  isDragging: boolean;
  annotationId: string;
  offsetX: number;
  offsetY: number;
}

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  annotationId: string;
}

const DRAW_TOOLS: ToolType[] = ['rect', 'ellipse', 'arrow', 'line', 'freehand', 'highlight', 'redaction', 'wavyLine', 'measureDistance'];
const CLICK_TOOLS: ToolType[] = ['text', 'stickyNote'];

let annotationIdCounter = 0;
function generateId(): string {
  return `ann_${Date.now()}_${++annotationIdCounter}`;
}

/** 默认测量单位 */
const DEFAULT_MEASURE_UNIT: MeasureUnit = 'cm';

/** 生成波浪线路径点 */
function getWavyLinePoints(
  start: Point, end: Point, amplitude = 0.004, wavelength = 0.015,
): Point[] {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 0.001) return [start, end];
  const nx = -dy / dist;
  const ny = dx / dist;
  const steps = Math.max(20, Math.ceil(dist / wavelength * 4));
  const pts: Point[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const wave = Math.sin(t * dist / wavelength * Math.PI * 2) * amplitude;
    pts.push({ x: start.x + dx * t + nx * wave, y: start.y + dy * t + ny * wave });
  }
  return pts;
}

interface AnnotationCanvasProps {
  pageNumber: number;
  containerRef: React.RefObject<HTMLDivElement>;
}

// ---- Canvas 2D 绘制工具函数 ----

function drawAnnotationOnCanvas(
  ctx: CanvasRenderingContext2D,
  ann: Annotation,
  w: number,
  h: number,
  isSelected: boolean,
  commentCount = 0,
) {
  const { style: s, position: p, size: sz } = ann;
  ctx.save();
  ctx.globalAlpha = s.opacity;
  ctx.strokeStyle = s.stroke;
  ctx.lineWidth = s.strokeWidth;
  ctx.fillStyle = s.fill === 'transparent' ? 'transparent' : (s.fill || 'transparent');
  if (s.dash && s.dash.length > 0) {
    ctx.setLineDash(s.dash);
  }

  const px = p.x * w, py = p.y * h;
  const sw = sz.width * w, sh = sz.height * h;

  switch (ann.type) {
    case 'rect':
      if (s.fill && s.fill !== 'transparent') ctx.fillRect(px, py, sw, sh);
      ctx.strokeRect(px, py, sw, sh);
      break;
    case 'ellipse': {
      const cx = px, cy = py;
      const rx = (sz.width / 2) * w, ry = (sz.height / 2) * h;
      ctx.beginPath();
      ctx.ellipse(cx, cy, Math.abs(rx), Math.abs(ry), 0, 0, Math.PI * 2);
      if (s.fill && s.fill !== 'transparent') ctx.fill();
      ctx.stroke();
      break;
    }
    case 'arrow':
    case 'line': {
      const x1 = p.x * w, y1 = p.y * h;
      const x2 = (ann.endPoint?.x ?? p.x) * w, y2 = (ann.endPoint?.y ?? p.y) * h;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      // 箭头头部
      if (ann.type === 'arrow') {
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const headLen = 10;
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fillStyle = s.stroke;
        ctx.fill();
      }
      break;
    }
    case 'freehand': {
      const pts = ann.points;
      if (pts && pts.length >= 2) {
        ctx.beginPath();
        ctx.moveTo(pts[0].x * w, pts[0].y * h);
        for (let i = 1; i < pts.length; i++) {
          ctx.lineTo(pts[i].x * w, pts[i].y * h);
        }
        ctx.stroke();
      }
      break;
    }
    case 'highlight':
      ctx.globalAlpha = s.opacity || 0.3;
      ctx.fillStyle = s.fill || s.stroke;
      ctx.fillRect(px, py, sw, sh);
      break;
    case 'text': {
      ctx.globalAlpha = 1;
      ctx.fillStyle = s.stroke;
      ctx.font = `${s.fontSize || 14}px ${s.fontFamily || 'sans-serif'}`;
      ctx.textBaseline = 'top';
      ctx.fillText(ann.content || '', px, py);
      break;
    }
    case 'stickyNote': {
      // 便签背景
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = '#FDE68A';
      ctx.strokeStyle = '#B8860B';
      ctx.lineWidth = 1;
      const radius = 2;
      ctx.beginPath();
      ctx.moveTo(px + radius, py);
      ctx.lineTo(px + sw - radius, py);
      ctx.quadraticCurveTo(px + sw, py, px + sw, py + radius);
      ctx.lineTo(px + sw, py + sh - radius);
      ctx.quadraticCurveTo(px + sw, py + sh, px + sw - radius, py + sh);
      ctx.lineTo(px + radius, py + sh);
      ctx.quadraticCurveTo(px, py + sh, px, py + sh - radius);
      ctx.lineTo(px, py + radius);
      ctx.quadraticCurveTo(px, py, px + radius, py);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // 便签文字
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#333';
      ctx.font = '11px sans-serif';
      ctx.textBaseline = 'top';
      const text = ann.content || '';
      const lines = text.split('\n');
      const lineH = 13;
      const padX = 3, padY = 3;
      for (let i = 0; i < lines.length; i++) {
        const ty = py + padY + i * lineH;
        if (ty + lineH > py + sh) break;
        ctx.fillText(lines[i], px + padX, ty, sw - padX * 2);
      }
      break;
    }
    case 'redaction': {
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#000000';
      ctx.fillRect(px, py, sw, sh);
      break;
    }
    case 'wavyLine': {
      const ep = ann.endPoint ?? { x: p.x, y: p.y };
      const wavyPts = getWavyLinePoints(p, ep);
      ctx.beginPath();
      ctx.moveTo(wavyPts[0].x * w, wavyPts[0].y * h);
      for (let i = 1; i < wavyPts.length; i++) {
        ctx.lineTo(wavyPts[i].x * w, wavyPts[i].y * h);
      }
      ctx.stroke();
      break;
    }
    case 'measureDistance': {
      const ep = ann.endPoint ?? { x: p.x, y: p.y };
      const x1 = p.x * w, y1 = p.y * h;
      const x2 = ep.x * w, y2 = ep.y * h;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      // 端点标记
      ctx.fillStyle = s.stroke;
      for (const [ex, ey] of [[x1, y1], [x2, y2]]) {
        ctx.beginPath();
        ctx.arc(ex, ey, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      // 距离标签
      const dist = calcDistance(p, ep);
      const label = formatMeasure(dist, ann.unit ?? DEFAULT_MEASURE_UNIT);
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(mx - 2, my - 12, ctx.measureText(label).width + 8, 16);
      ctx.fillStyle = s.stroke;
      ctx.font = '12px sans-serif';
      ctx.textBaseline = 'top';
      ctx.fillText(label, mx + 2, my - 10);
      break;
    }
    case 'measureArea': {
      const pts = ann.points ?? [];
      if (pts.length >= 2) {
        ctx.beginPath();
        ctx.moveTo(pts[0].x * w, pts[0].y * h);
        for (let i = 1; i < pts.length; i++) {
          ctx.lineTo(pts[i].x * w, pts[i].y * h);
        }
        ctx.closePath();
        ctx.globalAlpha = 0.15;
        ctx.fillStyle = s.stroke;
        ctx.fill();
        ctx.globalAlpha = s.opacity;
        ctx.stroke();
      }
      // 面积标签
      if (pts.length >= 3) {
        const area = calcArea(pts);
        const label = formatMeasure(area, ann.unit ?? DEFAULT_MEASURE_UNIT) + '²';
        const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length * w;
        const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length * h;
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(cx - 2, cy - 12, ctx.measureText(label).width + 8, 16);
        ctx.fillStyle = s.stroke;
        ctx.font = '12px sans-serif';
        ctx.textBaseline = 'top';
        ctx.fillText(label, cx + 2, cy - 10);
      }
      break;
    }
    case 'measureAngle': {
      const sp = ann.startPoint ?? p;
      const mp = ann.midPoint ?? p;
      const ep = ann.endPoint ?? p;
      const sx = sp.x * w, sy = sp.y * h;
      const mx = mp.x * w, my = mp.y * h;
      const ex = ep.x * w, ey = ep.y * h;
      // 两条线段
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(mx, my);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      // 弧线
      const a1 = Math.atan2(sy - my, sx - mx);
      const a2 = Math.atan2(ey - my, ex - mx);
      const arcR = 20;
      ctx.beginPath();
      ctx.arc(mx, my, arcR, Math.min(a1, a2), Math.max(a1, a2));
      ctx.stroke();
      // 角度标签
      const angle = calcAngle(sp, mp, ep);
      const label = `${angle.toFixed(1)}°`;
      const lx = mx + 25, ly = my - 10;
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(lx - 2, ly - 2, ctx.measureText(label).width + 8, 16);
      ctx.fillStyle = s.stroke;
      ctx.font = '12px sans-serif';
      ctx.textBaseline = 'top';
      ctx.fillText(label, lx + 2, ly);
      break;
    }
  }

  // 选中标注的选择框
  if (isSelected) {
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#1677ff';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 2]);
    const margin = 3;
    ctx.strokeRect(px - margin, py - margin, sw + margin * 2, sh + margin * 2);
  }

  // 评论指示器：右上角小圆点 + 数量
  if (commentCount > 0) {
    ctx.globalAlpha = 1;
    const bx = px + sw - 4;
    const by = py - 4;
    const radius = 8;
    ctx.beginPath();
    ctx.arc(bx, by, radius, 0, Math.PI * 2);
    ctx.fillStyle = '#1677ff';
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 10px sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(String(commentCount), bx, by);
    ctx.textAlign = 'start';
  }

  ctx.restore();
}

export const AnnotationCanvas: React.FC<AnnotationCanvasProps> = ({ pageNumber, containerRef }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const activeTool = useToolStore((s) => s.activeTool);
  const toolStyle = useToolStore((s) => s.toolStyle);
  const setActiveTool = useToolStore((s) => s.setActiveTool);
  const { addAnnotation, updateAnnotation, removeAnnotation, selectAnnotation, clearSelection, selectedIds, annotations, comments } = useAnnotationStore();

  const [drawing, setDrawing] = useState<DrawingState>({ isDrawing: false, startX: 0, startY: 0, currentX: 0, currentY: 0 });
  // 使用 ref 存储 freehand 点序列，避免每次 mousemove 触发字符串重建 O(n) 开销
  const freehandPointsRef = useRef<Array<{x: number; y: number}>>([]);
  const [freehandVersion, setFreehandVersion] = useState(0); // 触发重渲染的版本号
  const [drag, setDrag] = useState<DragState>({ isDragging: false, annotationId: '', offsetX: 0, offsetY: 0 });
  const [editingText, setEditingText] = useState<{ visible: boolean; x: number; y: number; value: string; id?: string }>({ visible: false, x: 0, y: 0, value: '' });
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ visible: false, x: 0, y: 0, annotationId: '' });

  // 多点击测量工具状态
  const measureClicksRef = useRef<Point[]>([]);
  const [measureClickPoints, setMeasureClickPoints] = useState<Point[]>([]);

  // RAF 节流：将 mousemove 更新对齐到浏览器帧率（60fps），避免 240Hz 鼠标触发冗余渲染
  const rafRef = useRef<number>(0);
  const pendingCoordsRef = useRef<{ x: number; y: number } | null>(null);

  const isDrawTool = DRAW_TOOLS.includes(activeTool);
  const isClickTool = CLICK_TOOLS.includes(activeTool);

  // 组件卸载时清理未完成的 RAF
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const pageAnnotations = useMemo(() => {
    return annotations.filter((a) => a.page === pageNumber);
  }, [annotations, pageNumber]);

  // ---- Canvas 绘制逻辑 ----
  const canvasSizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });

  // 重绘离屏 Canvas（静态标注缓存）
  const redrawStaticAnnotations = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    if (w <= 0 || h <= 0) return;

    // 初始化或更新离屏 Canvas 尺寸
    if (!offscreenCanvasRef.current) {
      offscreenCanvasRef.current = document.createElement('canvas');
    }
    const oc = offscreenCanvasRef.current;
    const dpr = window.devicePixelRatio || 1;
    oc.width = w * dpr;
    oc.height = h * dpr;
    canvasSizeRef.current = { w: w * dpr, h: h * dpr };

    const ctx = oc.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, oc.width, oc.height);
    ctx.save();
    ctx.scale(dpr, dpr);

    for (const ann of pageAnnotations) {
      const count = comments.filter((c) => c.annotationId === ann.id).length;
      drawAnnotationOnCanvas(ctx, ann, w, h, false, count);
    }

    ctx.restore();
  }, [pageAnnotations, comments, containerRef]);

  // 将离屏 Canvas composite 到可见 Canvas + 绘制选中标注
  const compositeToVisible = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const rect = container.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    if (w <= 0 || h <= 0) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Composite 离屏缓存
    if (offscreenCanvasRef.current) {
      ctx.drawImage(offscreenCanvasRef.current, 0, 0);
    }

    // 绘制选中标注（覆盖选择框）
    ctx.save();
    ctx.scale(dpr, dpr);
    for (const ann of pageAnnotations) {
      if (selectedIds.includes(ann.id)) {
        const count = comments.filter((c) => c.annotationId === ann.id).length;
        drawAnnotationOnCanvas(ctx, ann, w, h, true, count);
      }
    }
    ctx.restore();
  }, [pageAnnotations, selectedIds, comments, containerRef]);

  // 标注变化时重绘离屏 + composite
  useEffect(() => {
    redrawStaticAnnotations();
    compositeToVisible();
  }, [redrawStaticAnnotations, compositeToVisible]);

  // 窗口 resize 时重绘
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => {
      redrawStaticAnnotations();
      compositeToVisible();
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [containerRef, redrawStaticAnnotations, compositeToVisible]);

  // 切换工具时清除多点击测量状态
  useEffect(() => {
    measureClicksRef.current = [];
    setMeasureClickPoints([]);
  }, [activeTool]);

  const getRelativeCoords = useCallback((e: React.MouseEvent | MouseEvent): { x: number; y: number } | null => {
    const container = containerRef.current;
    if (!container) return null;
    const rect = container.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    };
  }, [containerRef]);

  const findAnnotationAt = useCallback((x: number, y: number): Annotation | null => {
    const threshold = 0.02;
    for (let i = pageAnnotations.length - 1; i >= 0; i--) {
      const ann = pageAnnotations[i];
      const { position: p, size: s } = ann;
      if (ann.type === 'arrow' || ann.type === 'line') {
        if (Math.abs(p.x - x) < threshold && Math.abs(p.y - y) < threshold) return ann;
        if (ann.endPoint) {
          if (Math.abs(ann.endPoint.x - x) < threshold && Math.abs(ann.endPoint.y - y) < threshold) return ann;
          const minX = Math.min(p.x, ann.endPoint.x) - threshold;
          const maxX = Math.max(p.x, ann.endPoint.x) + threshold;
          const minY = Math.min(p.y, ann.endPoint.y) - threshold;
          const maxY = Math.max(p.y, ann.endPoint.y) + threshold;
          if (x >= minX && x <= maxX && y >= minY && y <= maxY) return ann;
        }
      } else {
        if (x >= p.x - threshold && x <= p.x + s.width + threshold &&
          y >= p.y - threshold && y <= p.y + s.height + threshold) return ann;
      }
    }
    return null;
  }, [pageAnnotations]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 2) return;
    const coords = getRelativeCoords(e);
    if (!coords) return;
    setContextMenu({ visible: false, x: 0, y: 0, annotationId: '' });

    if (activeTool === 'select') {
      const ann = findAnnotationAt(coords.x, coords.y);
      if (ann) {
        selectAnnotation(ann.id, e.shiftKey);
        setDrag({ isDragging: true, annotationId: ann.id, offsetX: coords.x - ann.position.x, offsetY: coords.y - ann.position.y });
      } else {
        clearSelection();
      }
      return;
    }

    if (activeTool === 'eraser') {
      const ann = findAnnotationAt(coords.x, coords.y);
      if (ann) removeAnnotation(ann.id);
      return;
    }

    if (isClickTool) {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      setEditingText({ visible: true, x: e.clientX - rect.left, y: e.clientY - rect.top, value: '', });
      return;
    }

    // 多点击测量工具：累积点击点
    if (activeTool === 'measureArea') {
      measureClicksRef.current.push({ x: coords.x, y: coords.y });
      setMeasureClickPoints([...measureClicksRef.current]);
      return;
    }
    if (activeTool === 'measureAngle') {
      measureClicksRef.current.push({ x: coords.x, y: coords.y });
      const pts = measureClicksRef.current;
      setMeasureClickPoints([...pts]);
      if (pts.length === 3) {
        // 三次点击完成：创建角度标注
        const meta = createDefaultMetadata();
        addAnnotation({
          id: generateId(), type: 'measureAngle', page: pageNumber,
          position: { x: pts[0].x, y: pts[0].y }, size: { width: 0, height: 0 },
          style: { ...toolStyle }, metadata: meta, rotation: 0, zIndex: 0,
          startPoint: pts[0], midPoint: pts[1], endPoint: pts[2],
        });
        measureClicksRef.current = [];
        setMeasureClickPoints([]);
        if (!useToolStore.getState().keepToolActive) setActiveTool('select');
      }
      return;
    }

    if (!isDrawTool) return;
    e.preventDefault();
    setDrawing({ isDrawing: true, startX: coords.x, startY: coords.y, currentX: coords.x, currentY: coords.y });
    if (activeTool === 'freehand') {
      freehandPointsRef.current = [{ x: coords.x, y: coords.y }];
      setFreehandVersion((v) => v + 1);
    }
  }, [activeTool, isDrawTool, isClickTool, getRelativeCoords, findAnnotationAt, selectAnnotation, clearSelection, removeAnnotation, containerRef, addAnnotation, pageNumber, toolStyle, setActiveTool]);

  // RAF 节流：mousemove 事件对齐到浏览器帧率，避免高频鼠标（240Hz+）触发冗余渲染
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const coords = getRelativeCoords(e);
    if (!coords) return;
    pendingCoordsRef.current = coords;

    if (!rafRef.current) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0;
        const c = pendingCoordsRef.current;
        pendingCoordsRef.current = null;
        if (!c) return;

        if (drag.isDragging) {
          const newX = Math.max(0, Math.min(1, c.x - drag.offsetX));
          const newY = Math.max(0, Math.min(1, c.y - drag.offsetY));
          updateAnnotation(drag.annotationId, { position: { x: newX, y: newY } });
          return;
        }

        if (!drawing.isDrawing) return;
        setDrawing((prev) => ({ ...prev, currentX: c.x, currentY: c.y }));
        if (activeTool === 'freehand') {
          freehandPointsRef.current.push({ x: c.x, y: c.y });
          setFreehandVersion((v) => v + 1);
        }
      });
    }
  }, [drawing.isDrawing, drag, getRelativeCoords, updateAnnotation, activeTool]);

  const handleMouseUp = useCallback(() => {
    // 刷新未处理的 RAF 帧，确保最后一次移动位置被应用
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }

    if (drag.isDragging) {
      setDrag({ isDragging: false, annotationId: '', offsetX: 0, offsetY: 0 });
      return;
    }

    if (!drawing.isDrawing) return;

    const { startX, startY, currentX, currentY } = drawing;
    const x = Math.min(startX, currentX);
    const y = Math.min(startY, currentY);
    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);

    if (width < 0.005 && height < 0.005 && activeTool !== 'freehand') {
      setDrawing({ isDrawing: false, startX: 0, startY: 0, currentX: 0, currentY: 0 });
      return;
    }

    const meta = createDefaultMetadata();
    const base = { id: generateId(), style: { ...toolStyle }, metadata: meta, rotation: 0, zIndex: 0 };
    let annotation: Annotation | null = null;

    switch (activeTool) {
      case 'rect':
        annotation = { ...base, type: 'rect', page: pageNumber, position: { x, y }, size: { width, height } };
        break;
      case 'ellipse':
        annotation = { ...base, type: 'ellipse', page: pageNumber, position: { x: x + width / 2, y: y + height / 2 }, size: { width, height } };
        break;
      case 'arrow':
        annotation = { ...base, type: 'arrow', page: pageNumber, position: { x: startX, y: startY }, size: { width, height }, endPoint: { x: currentX, y: currentY } };
        break;
      case 'line':
        annotation = { ...base, type: 'line', page: pageNumber, position: { x: startX, y: startY }, size: { width, height }, endPoint: { x: currentX, y: currentY } };
        break;
      case 'highlight':
        annotation = { ...base, type: 'highlight', page: pageNumber, position: { x, y }, size: { width, height }, style: { ...toolStyle, opacity: 0.3, fill: toolStyle.stroke } };
        break;
      case 'freehand': {
        // 从 ref 读取点序列（避免每次 mousemove 的 O(n) 字符串重建）
        const pts = freehandPointsRef.current;
        annotation = {
          ...base, type: 'freehand', page: pageNumber,
          position: { x, y }, size: { width, height },
          points: pts.length > 1 ? pts : [{ x: startX, y: startY }, { x: currentX, y: currentY }],
        };
        break;
      }
      case 'redaction':
        annotation = { ...base, type: 'redaction', page: pageNumber, position: { x, y }, size: { width, height } };
        break;
      case 'wavyLine':
        annotation = { ...base, type: 'wavyLine', page: pageNumber, position: { x: startX, y: startY }, size: { width, height }, endPoint: { x: currentX, y: currentY } };
        break;
      case 'measureDistance':
        annotation = {
          ...base, type: 'measureDistance', page: pageNumber,
          position: { x: startX, y: startY }, size: { width, height },
          endPoint: { x: currentX, y: currentY }, unit: DEFAULT_MEASURE_UNIT,
        };
        break;
    }

    if (annotation) {
      addAnnotation(annotation);
      if (!useToolStore.getState().keepToolActive) {
        setActiveTool('select');
      }
    }

    setDrawing({ isDrawing: false, startX: 0, startY: 0, currentX: 0, currentY: 0 });
    freehandPointsRef.current = [];
  }, [drawing, drag, activeTool, pageNumber, toolStyle, addAnnotation, updateAnnotation, setActiveTool]);

  const handleTextSubmit = useCallback(() => {
    if (!editingText.value.trim()) {
      setEditingText({ visible: false, x: 0, y: 0, value: '' });
      return;
    }

    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const relX = editingText.x / rect.width;
    const relY = editingText.y / rect.height;

    if (editingText.id) {
      updateAnnotation(editingText.id, { content: editingText.value });
    } else if (activeTool === 'text') {
      const meta = createDefaultMetadata();
      addAnnotation({
        id: generateId(), type: 'text', page: pageNumber,
        position: { x: relX, y: relY }, size: { width: 0.15, height: 0.03 },
        style: { ...toolStyle }, metadata: meta, rotation: 0,
        content: editingText.value,
      });
    } else if (activeTool === 'stickyNote') {
      const meta = createDefaultMetadata();
      addAnnotation({
        id: generateId(), type: 'stickyNote', page: pageNumber,
        position: { x: relX, y: relY }, size: { width: 0.12, height: 0.1 },
        style: { ...toolStyle, fill: '#FDE68A', stroke: '#B8860B' }, metadata: meta, rotation: 0,
        content: editingText.value, collapsed: true,
      });
    }

    setEditingText({ visible: false, x: 0, y: 0, value: '' });
    if (!useToolStore.getState().keepToolActive) {
      setActiveTool('select');
    }
  }, [editingText, activeTool, pageNumber, toolStyle, addAnnotation, updateAnnotation, setActiveTool, containerRef]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const coords = getRelativeCoords(e);
    if (!coords) return;
    const ann = findAnnotationAt(coords.x, coords.y);
    if (ann) {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      setContextMenu({ visible: true, x: e.clientX - rect.left, y: e.clientY - rect.top, annotationId: ann.id });
      selectAnnotation(ann.id);
    }
  }, [getRelativeCoords, findAnnotationAt, selectAnnotation, containerRef]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.length > 0) {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        selectedIds.forEach((id) => removeAnnotation(id));
        clearSelection();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedIds, removeAnnotation, clearSelection]);

  // 从 ref 构建 freehand SVG path（仅在版本变化时重算，避免每次 mousemove 的字符串拼接）
  const freehandPathD = useMemo(() => {
    if (!drawing.isDrawing || activeTool !== 'freehand') return '';
    return freehandPointsRef.current
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x * 100} ${p.y * 100}`)
      .join(' ');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawing.isDrawing, activeTool, freehandVersion]);

  // 双击完成面积测量
  const handleDoubleClick = useCallback(() => {
    if (activeTool !== 'measureArea' || measureClicksRef.current.length < 3) return;
    const pts = measureClicksRef.current;
    const xs = pts.map(p => p.x);
    const ys = pts.map(p => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const meta = createDefaultMetadata();
    addAnnotation({
      id: generateId(), type: 'measureArea', page: pageNumber,
      position: { x: minX, y: minY }, size: { width: maxX - minX, height: maxY - minY },
      style: { ...toolStyle }, metadata: meta, rotation: 0, zIndex: 0,
      points: [...pts], unit: DEFAULT_MEASURE_UNIT,
    });
    measureClicksRef.current = [];
    setMeasureClickPoints([]);
    if (!useToolStore.getState().keepToolActive) setActiveTool('select');
  }, [activeTool, pageNumber, toolStyle, addAnnotation, setActiveTool]);

  // SVG 预览样式（仅用于绘制中的临时形状）
  const previewStyle = useMemo(() => ({
    stroke: toolStyle.stroke,
    strokeWidth: toolStyle.strokeWidth,
    fill: toolStyle.fill === 'transparent' ? 'none' : toolStyle.fill,
    opacity: toolStyle.opacity,
    strokeDasharray: toolStyle.dash?.length ? toolStyle.dash.join(',') : undefined,
  }), [toolStyle]);

  const renderPreview = useMemo(() => {
    if (!drawing.isDrawing) return null;
    const { startX, startY, currentX, currentY } = drawing;
    const x = Math.min(startX, currentX) * 100;
    const y = Math.min(startY, currentY) * 100;
    const w = Math.abs(currentX - startX) * 100;
    const h = Math.abs(currentY - startY) * 100;
    const st = previewStyle;

    switch (activeTool) {
      case 'rect':
        return <rect x={`${x}%`} y={`${y}%`} width={`${w}%`} height={`${h}%`} style={st} />;
      case 'ellipse':
        return <ellipse cx={`${x + w / 2}%`} cy={`${y + h / 2}%`} rx={`${w / 2}%`} ry={`${h / 2}%`} style={st} />;
      case 'arrow':
      case 'line':
        return (
          <line x1={`${startX * 100}%`} y1={`${startY * 100}%`} x2={`${currentX * 100}%`} y2={`${currentY * 100}%`}
            style={st} markerEnd={activeTool === 'arrow' ? 'url(#arrowhead)' : undefined} />
        );
      case 'highlight':
        return <rect x={`${x}%`} y={`${y}%`} width={`${w}%`} height={`${h}%`} fill={toolStyle.stroke} opacity={0.3} />;
      case 'freehand':
        return freehandPathD ? <path d={freehandPathD} style={st} /> : null;
      case 'redaction':
        return <rect x={`${x}%`} y={`${y}%`} width={`${w}%`} height={`${h}%`} fill="#000" opacity={0.8} />;
      case 'wavyLine': {
        const wp = getWavyLinePoints(
          { x: startX, y: startY }, { x: currentX, y: currentY },
        );
        const d = wp.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x * 100} ${p.y * 100}`).join(' ');
        return <path d={d} style={st} fill="none" />;
      }
      case 'measureDistance':
        return (
          <>
            <line x1={`${startX * 100}%`} y1={`${startY * 100}%`} x2={`${currentX * 100}%`} y2={`${currentY * 100}%`} style={st} />
            <circle cx={`${startX * 100}%`} cy={`${startY * 100}%`} r="3" fill={toolStyle.stroke} />
            <circle cx={`${currentX * 100}%`} cy={`${currentY * 100}%`} r="3" fill={toolStyle.stroke} />
          </>
        );
      default:
        return null;
    }
  }, [drawing, activeTool, previewStyle, toolStyle.stroke, freehandPathD]);

  const isMeasureClickTool = activeTool === 'measureArea' || activeTool === 'measureAngle';
  const isInteractive = activeTool === 'select' || activeTool === 'eraser' || isDrawTool || isClickTool || isMeasureClickTool;
  const cursor = activeTool === 'select' ? (drag.isDragging ? 'grabbing' : 'default')
    : activeTool === 'eraser' ? 'crosshair'
    : isDrawTool ? 'crosshair'
    : isClickTool ? 'text'
    : isMeasureClickTool ? 'crosshair'
    : 'default';

  return (
    <>
      {/* Canvas 层：静态标注高性能渲染（不受 DOM 节点数量限制） */}
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`第 ${pageNumber} 页标注层，包含 ${pageAnnotations.length} 个标注`}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
        }}
      />

      {/* SVG 层：仅用于绘制预览（交互式临时形状） */}
      <svg
        ref={svgRef}
        className="annotation-svg"
        role="img"
        aria-hidden={!drawing.isDrawing}
        style={{
          cursor,
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: isInteractive ? 'auto' : 'none',
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
      >
        <defs>
          <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill={toolStyle.stroke} />
          </marker>
        </defs>
        {renderPreview}
        {/* 多点击测量工具预览：显示已累积的点击点和连线 */}
        {measureClickPoints.length > 0 && (activeTool === 'measureArea' || activeTool === 'measureAngle') && (
          <g>
            {measureClickPoints.map((p, i) => (
              <circle key={i} cx={`${p.x * 100}%`} cy={`${p.y * 100}%`} r="4" fill={toolStyle.stroke} />
            ))}
            {measureClickPoints.length >= 2 && (
              <polyline
                points={measureClickPoints.map(p => `${p.x * 100},${p.y * 100}`).join(' ')}
                fill="none"
                stroke={toolStyle.stroke}
                strokeWidth={toolStyle.strokeWidth}
                strokeDasharray="4 2"
              />
            )}
            {activeTool === 'measureArea' && measureClickPoints.length >= 3 && (
              <polygon
                points={measureClickPoints.map(p => `${p.x * 100},${p.y * 100}`).join(' ')}
                fill={toolStyle.stroke}
                fillOpacity={0.1}
                stroke={toolStyle.stroke}
                strokeWidth={toolStyle.strokeWidth}
                strokeDasharray="4 2"
              />
            )}
          </g>
        )}
      </svg>

      {editingText.visible && (
        <div className="text-edit-overlay" style={{ left: editingText.x, top: editingText.y }}>
          <textarea
            className="text-edit-input"
            value={editingText.value}
            onChange={(e) => setEditingText((prev) => ({ ...prev, value: e.target.value }))}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleTextSubmit(); } if (e.key === 'Escape') setEditingText({ visible: false, x: 0, y: 0, value: '' }); }}
            onBlur={handleTextSubmit}
            autoFocus
            placeholder={activeTool === 'stickyNote' ? '输入便签内容...' : '输入文本...'}
          />
        </div>
      )}

      {contextMenu.visible && (
        <div className="context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}
          onMouseLeave={() => setContextMenu({ visible: false, x: 0, y: 0, annotationId: '' })}>
          <button className="context-menu-item" onClick={() => {
            const ann = annotations.find((a) => a.id === contextMenu.annotationId);
            if (ann) {
              const container = containerRef.current;
              if (container) {
                const rect = container.getBoundingClientRect();
                setEditingText({ visible: true, x: ann.position.x * rect.width, y: ann.position.y * rect.height, value: ann.content || '', id: ann.id });
              }
            }
            setContextMenu({ visible: false, x: 0, y: 0, annotationId: '' });
          }}>编辑内容</button>
          <button className="context-menu-item" onClick={() => {
            removeAnnotation(contextMenu.annotationId);
            setContextMenu({ visible: false, x: 0, y: 0, annotationId: '' });
          }}>删除标注</button>
          <div className="context-menu-divider" />
          <button className="context-menu-item" onClick={() => {
            const ann = annotations.find((a) => a.id === contextMenu.annotationId);
            if (ann) updateAnnotation(ann.id, { style: { ...ann.style, ...toolStyle } });
            setContextMenu({ visible: false, x: 0, y: 0, annotationId: '' });
          }}>应用当前样式</button>
        </div>
      )}
    </>
  );
};
