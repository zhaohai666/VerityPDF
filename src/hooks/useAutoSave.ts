import { useEffect, useRef } from 'react';
import { useAnnotationStore } from '@/stores/annotationStore';

const SAVE_DEBOUNCE = 30000; // 30 seconds

export const useAutoSave = (saveCallback: () => void | Promise<void>) => {
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const isDirty = useAnnotationStore((s) => s.isDirty);

  useEffect(() => {
    if (!isDirty) return;

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(() => {
      saveCallback();
    }, SAVE_DEBOUNCE);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [isDirty, saveCallback]);

  return {
    flush: () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
        saveCallback();
      }
    },
  };
};