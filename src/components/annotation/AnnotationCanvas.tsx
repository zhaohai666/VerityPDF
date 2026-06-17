import React, { useRef, useState, useCallback, useEffect, useMemo, memo } from 'react';
import { useToolStore } from '@/stores/toolStore';
import { useAnnotationStore } from '@/stores/annotationStore';
import type { Annotation, ToolType, AnnotationStyle } from '@/types';
import { createDefaultMetadata } from '@/types';

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

const DRAW_TOOLS: ToolType[] = ['rect', 'ellipse', 'arrow', 'line', 'freehand', 'highlight'];
const CLICK_TOOLS: ToolType[] = ['text', 'stickyNote'];

let annotationIdCounter = 0;
function generateId(): string {
  return `ann_${Date.now()}_${++annotationIdCounter}`;
}

interface AnnotationCanvasProps {
  pageNumber: number;
  containerRef: React.RefObject<HTMLDivElement>;
}

function styleToCSS(s: AnnotationStyle): React.CSSProperties {
  return {
    stroke: s.stroke,
    strokeWidth: s.strokeWidth,
    fill: s.fill === 'transparent' ? 'none' : s.fill,
    opacity: s.opacity,
    strokeDasharray: s.dash?.length ? s.dash.join(',') : undefined,
  };
}

interface SingleAnnotationProps {
  annotation: Annotation;
  isSelected: boolean;
}

const SingleAnnotation = memo(({ annotation, isSelected }: SingleAnnotationProps) => {
  const st = styleToCSS(annotation.style);
  const selectionBox = isSelected ? (
    <rect
      x={`${annotation.position.x * 100 - 0.3}%`}
      y={`${annotation.position.y * 100 - 0.3}%`}
      width={`${annotation.size.width * 100 + 0.6}%`}
      height={`${annotation.size.height * 100 + 0.6}%`}
      fill="none"
      stroke="#1677ff"
      strokeWidth="1.5"
      strokeDasharray="4 2"
    />
  ) : null;

  let shape: React.ReactNode = null;
  switch (annotation.type) {
    case 'rect':
      shape = (
        <rect
          x={`${annotation.position.x * 100}%`}
          y={`${annotation.position.y * 100}%`}
          width={`${annotation.size.width * 100}%`}
          height={`${annotation.size.height * 100}%`}
          style={st}
        />
      );
      break;
    case 'ellipse':
      shape = (
        <ellipse
          cx={`${annotation.position.x * 100}%`}
          cy={`${annotation.position.y * 100}%`}
          rx={`${(annotation.size.width / 2) * 100}%`}
          ry={`${(annotation.size.height / 2) * 100}%`}
          style={st}
        />
      );
      break;
    case 'arrow':
    case 'line':
      shape = (
        <line
          x1={`${annotation.position.x * 100}%`}
          y1={`${annotation.position.y * 100}%`}
          x2={`${annotation.endPoint.x * 100}%`}
          y2={`${annotation.endPoint.y * 100}%`}
          style={st}
          markerEnd={annotation.type === 'arrow' ? 'url(#arrowhead)' : undefined}
        />
      );
      break;
    case 'freehand': {
      if (!annotation.points || annotation.points.length < 2) break;
      const d = annotation.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x * 100} ${p.y * 100}`).join(' ');
      shape = <path d={d} style={st} />;
      break;
    }
    case 'highlight':
      shape = (
        <rect
          x={`${annotation.position.x * 100}%`}
          y={`${annotation.position.y * 100}%`}
          width={`${annotation.size.width * 100}%`}
          height={`${annotation.size.height * 100}%`}
          fill={annotation.style.fill || annotation.style.stroke}
          opacity={annotation.style.opacity || 0.3}
        />
      );
      break;
    case 'text':
      shape = (
        <foreignObject
          x={`${annotation.position.x * 100}%`}
          y={`${annotation.position.y * 100}%`}
          width="30%"
          height="10%"
        >
          <div
            style={{
              fontSize: annotation.style.fontSize || 14,
              color: annotation.style.stroke,
              fontFamily: annotation.style.fontFamily || 'sans-serif',
              whiteSpace: 'nowrap',
            }}
          >
            {annotation.content}
          </div>
        </foreignObject>
      );
      break;
    case 'stickyNote':
      shape = (
        <g>
          <rect
            x={`${annotation.position.x * 100}%`}
            y={`${annotation.position.y * 100}%`}
            width={`${annotation.size.width * 100}%`}
            height={`${annotation.size.height * 100}%`}
            fill="#FDE68A"
            stroke="#B8860B"
            strokeWidth="1"
            opacity={0.9}
            rx="2"
          />
          <foreignObject
            x={`${annotation.position.x * 100 + 0.3}%`}
            y={`${annotation.position.y * 100 + 0.3}%`}
            width={`${annotation.size.width * 100 - 0.6}%`}
            height={`${annotation.size.height * 100 - 0.6}%`}
          >
            <div style={{ fontSize: 11, color: '#333', padding: '2px', overflow: 'hidden', wordBreak: 'break-all' }}>
              {annotation.content}
            </div>
          </foreignObject>
        </g>
      );
      break;
  }

  return <g key={annotation.id}>{selectionBox}{shape}</g>;
});

SingleAnnotation.displayName = 'SingleAnnotation';

export const AnnotationCanvas: React.FC<AnnotationCanvasProps> = ({ pageNumber, containerRef }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const activeTool = useToolStore((s) => s.activeTool);
  const toolStyle = useToolStore((s) => s.toolStyle);
  const setActiveTool = useToolStore((s) => s.setActiveTool);
  const { addAnnotation, updateAnnotation, removeAnnotation, selectAnnotation, clearSelection, selectedIds, annotations } = useAnnotationStore();

  const [drawing, setDrawing] = useState<DrawingState>({ isDrawing: false, startX: 0, startY: 0, currentX: 0, currentY: 0 });
  const [freehandPoints, setFreehandPoints] = useState('');
  const [drag, setDrag] = useState<DragState>({ isDragging: false, annotationId: '', offsetX: 0, offsetY: 0 });
  const [editingText, setEditingText] = useState<{ visible: boolean; x: number; y: number; value: string; id?: string }>({ visible: false, x: 0, y: 0, value: '' });
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ visible: false, x: 0, y: 0, annotationId: '' });

  const isDrawTool = DRAW_TOOLS.includes(activeTool);
  const isClickTool = CLICK_TOOLS.includes(activeTool);

  const pageAnnotations = useMemo(() => {
    return annotations.filter((a) => a.page === pageNumber);
  }, [annotations, pageNumber]);

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

    if (!isDrawTool) return;
    e.preventDefault();
    setDrawing({ isDrawing: true, startX: coords.x, startY: coords.y, currentX: coords.x, currentY: coords.y });
    if (activeTool === 'freehand') {
      setFreehandPoints(`M ${coords.x * 100} ${coords.y * 100}`);
    }
  }, [activeTool, isDrawTool, isClickTool, getRelativeCoords, findAnnotationAt, selectAnnotation, clearSelection, removeAnnotation, containerRef]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (drag.isDragging) {
      const coords = getRelativeCoords(e);
      if (!coords) return;
      const newX = Math.max(0, Math.min(1, coords.x - drag.offsetX));
      const newY = Math.max(0, Math.min(1, coords.y - drag.offsetY));
      updateAnnotation(drag.annotationId, {
        position: { x: newX, y: newY },
      });
      return;
    }

    if (!drawing.isDrawing) return;
    const coords = getRelativeCoords(e);
    if (!coords) return;
    setDrawing((prev) => ({ ...prev, currentX: coords.x, currentY: coords.y }));
    if (activeTool === 'freehand') {
      setFreehandPoints((prev) => `${prev} L ${coords.x * 100} ${coords.y * 100}`);
    }
  }, [drawing.isDrawing, drag, getRelativeCoords, updateAnnotation, activeTool]);

  const handleMouseUp = useCallback(() => {
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
        const pts = freehandPoints.split(/(?=M | L )/).map((p) => {
          const [px, py] = p.trim().replace(/^[ML]\s*/, '').split(/\s+/).map(Number);
          return { x: px / 100, y: py / 100 };
        }).filter((p) => !isNaN(p.x));
        annotation = { ...base, type: 'freehand', page: pageNumber, position: { x, y }, size: { width, height }, points: pts.length > 1 ? pts : [{ x: startX, y: startY }, { x: currentX, y: currentY }] };
        break;
      }
    }

    if (annotation) {
      addAnnotation(annotation);
      if (!useToolStore.getState().keepToolActive) {
        setActiveTool('select');
      }
    }

    setDrawing({ isDrawing: false, startX: 0, startY: 0, currentX: 0, currentY: 0 });
    setFreehandPoints('');
  }, [drawing, drag, activeTool, pageNumber, toolStyle, addAnnotation, updateAnnotation, setActiveTool, freehandPoints]);

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

  const renderPreview = useMemo(() => {
    if (!drawing.isDrawing) return null;
    const { startX, startY, currentX, currentY } = drawing;
    const x = Math.min(startX, currentX) * 100;
    const y = Math.min(startY, currentY) * 100;
    const w = Math.abs(currentX - startX) * 100;
    const h = Math.abs(currentY - startY) * 100;
    const st = styleToCSS(toolStyle);

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
        return <path d={freehandPoints} style={st} />;
      default:
        return null;
    }
  }, [drawing, activeTool, toolStyle, freehandPoints]);

  const isInteractive = activeTool === 'select' || activeTool === 'eraser' || isDrawTool || isClickTool;
  const cursor = activeTool === 'select' ? (drag.isDragging ? 'grabbing' : 'default')
    : activeTool === 'eraser' ? 'crosshair'
    : isDrawTool ? 'crosshair'
    : isClickTool ? 'text'
    : 'default';

  return (
    <>
      <svg
        ref={svgRef}
        className="annotation-svg"
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
        onContextMenu={handleContextMenu}
      >
        <defs>
          <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill={toolStyle.stroke} />
          </marker>
        </defs>
        {pageAnnotations.map((ann) => (
          <SingleAnnotation
            key={ann.id}
            annotation={ann}
            isSelected={selectedIds.includes(ann.id)}
          />
        ))}
        {renderPreview}
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
