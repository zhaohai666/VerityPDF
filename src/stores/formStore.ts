import { create } from 'zustand';
import type { FormFieldInfo } from '@/services/form/FormService';

interface FormState {
  fields: FormFieldInfo[];
  editedValues: Record<string, string | boolean>;
  isDetecting: boolean;
  hasForm: boolean;

  setFields: (fields: FormFieldInfo[]) => void;
  setEditedValue: (name: string, value: string | boolean) => void;
  setEditedValues: (values: Record<string, string | boolean>) => void;
  setIsDetecting: (detecting: boolean) => void;
  resetEdits: () => void;
  reset: () => void;
}

export const useFormStore = create<FormState>((set, get) => ({
  fields: [],
  editedValues: {},
  isDetecting: false,
  hasForm: false,

  setFields: (fields) => {
    // 初始化编辑值为当前字段值
    const values: Record<string, string | boolean> = {};
    for (const f of fields) {
      values[f.name] = f.value;
    }
    set({ fields, editedValues: values, hasForm: fields.length > 0 });
  },

  setEditedValue: (name, value) => {
    set((state) => ({
      editedValues: { ...state.editedValues, [name]: value },
    }));
  },

  setEditedValues: (values) => set({ editedValues: values }),

  setIsDetecting: (detecting) => set({ isDetecting: detecting }),

  resetEdits: () => {
    const { fields } = get();
    const values: Record<string, string | boolean> = {};
    for (const f of fields) {
      values[f.name] = f.value;
    }
    set({ editedValues: values });
  },

  reset: () => set({ fields: [], editedValues: {}, isDetecting: false, hasForm: false }),
}));
