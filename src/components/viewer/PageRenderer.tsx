import React, { useRef, useEffect, useCallback, useMemo, memo } from 'react';
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

interface PageModeProps {
  pageNumber: number;
  containerRef: React.RefObject<HTMLDivElement>;
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

  const needsWidth = (zoomMode === 'fitWidth' || zoomMode === 'fitPage');
  const ready = !needsWidth || (containerWidth !== undefined && containerWidth > 0);

  const actualZoom = useMemo(() => {
    if (!ready) return zoom;
    if (zoomMode === 'fitWidth' && containerWidth && containerWidth > 0) {
      return (containerWidth - 40);
    }
    if (zoomMode === 'fitPage') {
      const availH = window.innerHeight - 160;
      const availW = containerWidth ? containerWidth - 40 : 800;
      return Math.min(availH, availW);
    }
    return zoom;
  }, [zoom, zoomMode, containerWidth, ready]);

  const doRender = useCallback(async () => {
    if (!canvasRef.current || !textLayerRef.current) return;

    let scale = zoom;
    if (zoomMode === 'fitWidth' && containerWidth && containerWidth > 0) {
      const pageSize = await pdfService.getPageSize(pageNumber);
      scale = (containerWidth - 40) / pageSize.width;
    } else if (zoomMode === 'fitPage') {
      const pageSize = await pdfService.getPageSize(pageNumber);
      const availH = window.innerHeight - 160;
      const availW = containerWidth ? containerWidth - 40 : 800;
      const heightFit = availH / pageSize.height;
      const widthFit = availW / pageSize.width;
      scale = Math.min(heightFit, widthFit);
    }

    if (Math.abs(scale - lastScaleRef.current) < 0.001 && rotation === 0) return;
    lastScaleRef.current = scale;

    await pdfService.renderPage(pageNumber, canvasRef.current, scale, rotation);
    await pdfService.renderTextLayer(pageNumber, textLayerRef.current, scale, rotation);
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

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = pageContainerRef.current;
    const textLayer = textLayerRef.current;

    if (!canvas || !container) return;

    const updateDimensions = async () => {
      try {
        const pageSize = await pdfService.getPageSize(pageNumber);
        let scale = zoom;
        if (zoomMode === 'fitWidth' && containerWidth && containerWidth > 0) {
          scale = (containerWidth - 40) / pageSize.width;
        } else if (zoomMode === 'fitPage') {
          const availH = window.innerHeight - 160;
          const availW = containerWidth ? containerWidth - 40 : 800;
          const heightFit = availH / pageSize.height;
          const widthFit = availW / pageSize.width;
          scale = Math.min(heightFit, widthFit);
        }

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
  }, [pageNumber, pdfService, actualZoom, rotation, containerWidth]);

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
