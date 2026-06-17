import { create } from 'zustand';
import type { Theme, SidebarTab } from '@/types';

interface ToastMessage {
  id: string;
  type: 'error' | 'success' | 'warning' | 'info';
  message: string;
  duration?: number;
}

interface UIState {
  theme: Theme;
  sidebarVisible: boolean;
  sidebarTab: SidebarTab;
  searchPanelVisible: boolean;
  propertiesPanelVisible: boolean;
  toasts: ToastMessage[];

  setTheme: (theme: Theme) => void;
  toggleSidebar: () => void;
  setSidebarVisible: (visible: boolean) => void;
  setSidebarTab: (tab: SidebarTab) => void;
  toggleSearchPanel: () => void;
  togglePropertiesPanel: () => void;
  showToast: (message: string, type?: 'error' | 'success' | 'warning' | 'info', duration?: number) => void;
  dismissToast: (id: string) => void;
  clearToasts: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  theme: 'light',
  sidebarVisible: true,
  sidebarTab: 'thumbnails',
  searchPanelVisible: false,
  propertiesPanelVisible: true,
  toasts: [],

  setTheme: (theme) => {
    set({ theme });
    document.documentElement.setAttribute('data-theme', theme === 'system' ? '' : theme);
  },

  toggleSidebar: () => set((state) => ({ sidebarVisible: !state.sidebarVisible })),
  setSidebarVisible: (visible) => set({ sidebarVisible: visible }),
  setSidebarTab: (tab) => set({ sidebarTab: tab, sidebarVisible: true }),
  toggleSearchPanel: () => set((state) => ({ searchPanelVisible: !state.searchPanelVisible })),
  togglePropertiesPanel: () =>
    set((state) => ({ propertiesPanelVisible: !state.propertiesPanelVisible })),

  showToast: (message, type = 'info', duration = 3000) => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    set((state) => ({ toasts: [...state.toasts, { id, type, message, duration }] }));
    if (duration > 0) {
      setTimeout(() => {
        set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
      }, duration);
    }
  },

  dismissToast: (id) => {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  },

  clearToasts: () => set({ toasts: [] }),
}));
