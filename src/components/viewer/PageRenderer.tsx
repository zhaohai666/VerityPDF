import React, { useRef, useEffect, useCallback, useMemo, memo } from 'react';
import { PDFService } from '@/services/pdf/PDFService';
import { AnnotationCanvas } from '@/components/annotation/AnnotationCanvas';
import { useToolStore } from '@/stores/toolStore';
import { usePdfStore } from '@/stores/pdfStore';

interface PageRendererProps {
  pageNumber: number;
  pdfService: PDFService;
  zoom: number;
  rotation: number;
  containerWidth?: number;
  zoomMode: string;
}

interface PageModeProps {
  pageNumber: number;
  containerRef: React.RefObject<HTMLDivElement>;
}

/**
 * 统一 scale 计算：根据 zoomMode 从 pageSize + 容器宽度导出实际缩放比例
 * 消除 PageRenderer 中两处独立计算 scale 的重复逻辑
 */
function computeScale(
  pageSize: { width: number; height: number },
  zoom: number,
  zoomMode: string,
  containerWidth?: number,
  lowMemoryMode?: boolean
): number {
  let scale: number;
  if (zoomMode === 'fitWidth' && containerWidth && containerWidth > 0) {
    scale = (containerWidth - 40) / pageSize.width;
  } else if (zoomMode === 'fitPage') {
    const availH = window.innerHeight - 160;
    const availW = containerWidth ? containerWidth - 40 : 800;
    scale = Math.min(availH / pageSize.height, availW / pageSize.width);
  } else {
    scale = zoom;
  }
  // 低内存模式：限制渲染精度上限 1.5
  if (lowMemoryMode && scale > 1.5) {
    scale = 1.5;
  }
  return scale;
}

const PageModeContext: React.FC<PageModeProps> = memo(({ pageNumber, containerRef }) => {
  const activeTool = useToolStore((s) => s.activeTool);
  const isSelectMode = activeTool === 'select' || activeTool === 'pan';

  return (
    <div className={`pdf-page-container ${isSelectMode ? 'select-mode' : 'annotate-mode'}`} ref={containerRef}>
      <div className="layer layer-background" />
      <canvas className="layer layer-canvas" />
      <div className="layer layer-text" />
      <div className="layer layer-annotation">
        <AnnotationCanvas
          pageNumber={pageNumber}
          containerRef={containerRef}
        />
      </div>
    </div>
  );
});

PageModeContext.displayName = 'PageModeContext';

export const PageRenderer = memo(({
  pageNumber,
  pdfService,
  zoom,
  rotation,
  containerWidth,
  zoomMode,
}: PageRendererProps) => {
  const pageContainerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const renderingRef = useRef(false);
  const pendingRef = useRef(false);
  const lastScaleRef = useRef<number>(0);
  // 单独跟踪 TextLayer 的比例/旋转，避免与 Canvas 同步触发不必要的重建
  const textLayerScaleRef = useRef<number>(0);
  const textLayerRotationRef = useRef<number>(-1);
  const lowMemoryMode = usePdfStore((s) => s.lowMemoryMode);

  const needsWidth = (zoomMode === 'fitWidth' || zoomMode === 'fitPage');
  const ready = !needsWidth || (containerWidth !== undefined && containerWidth > 0);

  // scale 变化触发器：依赖项变化时重新计算 scale，作为 useEffect 依赖
  const scaleTrigger = useMemo(() => ({ zoom, zoomMode, containerWidth }), [zoom, zoomMode, containerWidth]);

  const doRender = useCallback(async () => {
    if (!canvasRef.current || !textLayerRef.current) return;

    const pageSize = await pdfService.getPageSize(pageNumber);
    const scale = computeScale(pageSize, zoom, zoomMode, containerWidth, lowMemoryMode);

    if (Math.abs(scale - lastScaleRef.current) < 0.001 && rotation === 0) return;
    lastScaleRef.current = scale;

    await pdfService.renderPage(pageNumber, canvasRef.current, scale, rotation);

    // TextLayer 单独跟踪：仅在比例/旋转实际变化时重建
    const textScaleChanged = Math.abs(scale - textLayerScaleRef.current) >= 0.001;
    const textRotChanged = Math.abs(rotation - textLayerRotationRef.current) >= 0.001;
    if (textScaleChanged || textRotChanged) {
      await pdfService.renderTextLayer(pageNumber, textLayerRef.current, scale, rotation);
      textLayerScaleRef.current = scale;
      textLayerRotationRef.current = rotation;
    }
  }, [pageNumber, pdfService, zoom, rotation, containerWidth, zoomMode, lowMemoryMode]);

  useEffect(() => {
    if (!ready) return;

    const run = async () => {
      if (renderingRef.current) {
        pendingRef.current = true;
        return;
      }

      renderingRef.current = true;
      try {
        await doRender();
      } catch {
        // 组件可能已卸载
      } finally {
        renderingRef.current = false;
      }

      if (pendingRef.current) {
        pendingRef.current = false;
        setTimeout(run, 10);
      }
    };

    const timer = setTimeout(run, pageNumber * 50);
    return () => {
      clearTimeout(timer);
    };
  }, [ready, doRender, pageNumber]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = pageContainerRef.current;
    const textLayer = textLayerRef.current;

    if (!canvas || !container) return;

    const updateDimensions = async () => {
      try {
        const pageSize = await pdfService.getPageSize(pageNumber);
        const scale = computeScale(pageSize, zoom, zoomMode, containerWidth, lowMemoryMode);

        const width = pageSize.width * scale;
        const height = pageSize.height * scale;

        canvas.width = width;
        canvas.height = height;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;

        if (container) {
          container.style.width = `${width}px`;
          container.style.height = `${height}px`;
        }
        if (textLayer) {
          textLayer.style.width = `${width}px`;
          textLayer.style.height = `${height}px`;
        }
      } catch {
        // ignore
      }
    };

    updateDimensions();
  }, [pageNumber, pdfService, scaleTrigger, rotation, containerWidth]);

  return (
    <div className="pdf-page-wrapper" data-page={pageNumber}>
      <div className={`pdf-page-container select-mode`} ref={pageContainerRef}>
        <div className="layer layer-background" />
        <canvas ref={canvasRef} className="layer layer-canvas" />
        <div ref={textLayerRef} className="layer layer-text" />
        <div className="layer layer-annotation">
          <AnnotationCanvas
            pageNumber={pageNumber}
            containerRef={pageContainerRef}
          />
        </div>
      </div>
      <div className="page-number-label">第 {pageNumber} 页</div>
    </div>
  );
});

PageRenderer.displayName = 'PageRenderer';
