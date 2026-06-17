import React, { useRef, useEffect, useCallback, memo } from 'react';
import { PDFService } from '@/services/pdf/PDFService';
import { AnnotationCanvas } from '@/components/annotation/AnnotationCanvas';
import { useToolStore } from '@/stores/toolStore';

interface PageRendererProps {
  pageNumber: number;
  pdfService: PDFService;
  zoom: number;
  rotation: number;
  containerWidth?: number;
  zoomMode: string;
}

/**
 * 单页渲染器 - Canvas + Text Layer + Annotation Layer
 */
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
  const activeTool = useToolStore((s) => s.activeTool);
  const isSelectMode = activeTool === 'select' || activeTool === 'pan';

  // fitWidth/fitPage 模式下必须等 containerWidth 就绪
  const needsWidth = (zoomMode === 'fitWidth' || zoomMode === 'fitPage');
  const ready = !needsWidth || (containerWidth !== undefined && containerWidth > 0);

  const doRender = useCallback(async () => {
    if (!canvasRef.current || !textLayerRef.current) return;

    // 计算实际缩放比例
    let actualZoom = zoom;
    if (zoomMode === 'fitWidth' && containerWidth && containerWidth > 0) {
      const pageSize = await pdfService.getPageSize(pageNumber);
      actualZoom = (containerWidth - 40) / pageSize.width;
    } else if (zoomMode === 'fitPage') {
      const pageSize = await pdfService.getPageSize(pageNumber);
      const availH = window.innerHeight - 160;
      const availW = containerWidth ? containerWidth - 40 : 800;
      const heightFit = availH / pageSize.height;
      const widthFit = availW / pageSize.width;
      actualZoom = Math.min(heightFit, widthFit);
    }

    // 跳过与上次相同 scale 的重复渲染
    if (Math.abs(actualZoom - lastScaleRef.current) < 0.001 && rotation === 0) return;
    lastScaleRef.current = actualZoom;

    // 渲染 Canvas
    await pdfService.renderPage(pageNumber, canvasRef.current, actualZoom, rotation);

    // 渲染文本层
    await pdfService.renderTextLayer(pageNumber, textLayerRef.current, actualZoom, rotation);
  }, [pageNumber, pdfService, zoom, rotation, containerWidth, zoomMode]);

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

  return (
    <div className="pdf-page-wrapper" data-page={pageNumber}>
      <div className={`pdf-page-container ${isSelectMode ? 'select-mode' : 'annotate-mode'}`} ref={pageContainerRef}>
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
