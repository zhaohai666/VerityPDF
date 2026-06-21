import { create } from 'zustand';
import type { OCRResult } from '@/services/ocr/OCRService';
import { type PreprocessOptions, DEFAULT_PREPROCESS_OPTIONS } from '@/services/ocr/ImagePreprocessor';

interface OCRState {
  isRecognizing: boolean;
  progress: { status: string; progress: number };
  result: OCRResult | null;
  selectedPage: number;
  selectedRegion: { x: number; y: number; width: number; height: number } | null;
  language: string;
  panelVisible: boolean;
  regionMode: boolean;
  preprocessOptions: PreprocessOptions;

  setIsRecognizing: (v: boolean) => void;
  setProgress: (p: { status: string; progress: number }) => void;
  setResult: (r: OCRResult | null) => void;
  setSelectedPage: (p: number) => void;
  setSelectedRegion: (r: { x: number; y: number; width: number; height: number } | null) => void;
  setLanguage: (l: string) => void;
  setPanelVisible: (v: boolean) => void;
  setRegionMode: (v: boolean) => void;
  setPreprocessOptions: (opts: PreprocessOptions) => void;
  reset: () => void;
}

export const useOCRStore = create<OCRState>((set) => ({
  isRecognizing: false,
  progress: { status: '', progress: 0 },
  result: null,
  selectedPage: 1,
  selectedRegion: null,
  language: 'eng+chi_sim',
  panelVisible: false,
  regionMode: false,
  preprocessOptions: { ...DEFAULT_PREPROCESS_OPTIONS },

  setIsRecognizing: (v) => set({ isRecognizing: v }),
  setProgress: (p) => set({ progress: p }),
  setResult: (r) => set({ result: r }),
  setSelectedPage: (p) => set({ selectedPage: p }),
  setSelectedRegion: (r) => set({ selectedRegion: r }),
  setLanguage: (l) => set({ language: l }),
  setPanelVisible: (v) => set({ panelVisible: v }),
  setRegionMode: (v) => set({ regionMode: v, selectedRegion: v ? null : undefined as unknown as null }),
  setPreprocessOptions: (opts) => set({ preprocessOptions: opts }),
  reset: () => set({
    isRecognizing: false,
    progress: { status: '', progress: 0 },
    result: null,
    selectedRegion: null,
    regionMode: false,
  }),
}));
