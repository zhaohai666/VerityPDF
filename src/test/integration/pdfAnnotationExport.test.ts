import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { usePdfStore } from '@/stores/pdfStore';
import { useAnnotationStore } from '@/stores/annotationStore';
import { ExportService } from '@/services/export/ExportService';
import type { Annotation } from '@/types';

describe('Integration: PDF Annotation Export Flow', () => {
  const mockPdfData = new ArrayBuffer(10); // Minimal fake PDF

  const mockAnnotations: Annotation[] = [
    {
      id: 'ann1',
      type: 'rect',
      page: 1,
      position: { x: 10, y: 20 },
      size: { width: 100, height: 50 },
      rotation: 0,
      style: { stroke: '#FF0000', strokeWidth: 2, fill: 'transparent', opacity: 1 },
      metadata: {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        author: 'test',
        locked: false,
      },
    },
    {
      id: 'ann2',
      type: 'text',
      page: 1,
      position: { x: 150, y: 200 },
      size: { width: 200, height: 50 },
      rotation: 0,
      style: { stroke: '#000000', strokeWidth: 1, fill: '#FFFFFF', opacity: 1, fontSize: 14 },
      metadata: {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        author: 'test',
        locked: false,
      },
      content: 'Sample text',
    },
  ];

  beforeEach(() => {
    // Reset stores
    usePdfStore.getState().reset();
    useAnnotationStore.getState().reset();

    // Mock window.verityAPI
    vi.stubGlobal('verityAPI', {
      readFile: vi.fn().mockResolvedValue(mockPdfData),
      exportPDF: vi.fn().mockResolvedValue('/tmp/output.pdf'),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should export annotations with PDF', async () => {
    // 1. Load PDF (simulate via pdfStore - setFilePath + setLoaded)
    const pdfStore = usePdfStore.getState();
    pdfStore.setFilePath('/fake/path.pdf');
    pdfStore.setLoaded(true);

    expect(usePdfStore.getState().filePath).toBe('/fake/path.pdf');

    // 2. Add annotations
    const annotationStore = useAnnotationStore.getState();
    mockAnnotations.forEach((ann) => {
      annotationStore.addAnnotation(ann);
    });

    expect(useAnnotationStore.getState().annotations.length).toBe(mockAnnotations.length);

    // 3. Export PDF with annotations
    const exportService = new ExportService();
    const store = usePdfStore.getState();
    const pdfArrayBuffer = await window.verityAPI.readFile(store.filePath!);
    if (!pdfArrayBuffer) throw new Error('Failed to read PDF');
    const pdfBytes = new Uint8Array(pdfArrayBuffer);
    let binary = '';
    for (let i = 0; i < pdfBytes.length; i++) {
      binary += String.fromCharCode(pdfBytes[i]);
    }
    const pdfBase64 = btoa(binary);

    // Filter annotations (as in ExportDialog)
    const filtered = exportService.filterAnnotations(
      useAnnotationStore.getState().annotations,
      {
        includeTypes: ['rect', 'text'], // All types we have
        pageRange: '', // All pages
        totalPages: 1,
      }
    );

    // Expect all annotations to be included
    expect(filtered).toHaveLength(mockAnnotations.length);

    // 4. Call exportPDF (this is what the ExportDialog does)
    await window.verityAPI.exportPDF(
      pdfBase64,
      filtered as unknown[], // Note: ExportDialog casts to unknown[]
      'output.pdf'
    );

    // 5. Verify exportPDF was called with correct parameters
    expect(window.verityAPI.exportPDF).toHaveBeenCalledTimes(1);
    expect(window.verityAPI.exportPDF).toHaveBeenCalledWith(
      pdfBase64,
      expect.any(Array),
      'output.pdf'
    );

    // Check the arguments passed to exportPDF
    const callArgs = window.verityAPI.exportPDF.mock.calls[0];
    expect(callArgs[0]).toBe(pdfBase64); // PDF base64
    expect(callArgs[1]).toHaveLength(mockAnnotations.length); // Annotations array
    expect(callArgs[2]).toBe('output.pdf'); // Output filename

    // Optionally, check the annotation structure in the call
    const passedAnnotations = callArgs[1] as Annotation[];
    expect(passedAnnotations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'ann1', type: 'rect' }),
        expect.objectContaining({ id: 'ann2', type: 'text' }),
      ])
    );
  });
});