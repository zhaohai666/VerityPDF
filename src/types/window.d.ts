import type { VerityAPI } from './electron';
import type { PDFService } from '@/services/pdf/PDFService';
import type { StoreApi, UseBoundStore } from 'zustand';

declare global {
  interface Window {
    verityAPI: VerityAPI;
    __pdfService?: PDFService;
    __annotationStore?: UseBoundStore<StoreApi<unknown>>;
    __pdfStore?: UseBoundStore<StoreApi<unknown>>;
    __toolStore?: UseBoundStore<StoreApi<unknown>>;
  }
}
