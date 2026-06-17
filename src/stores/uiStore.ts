import { create } from 'zustand';
import type { Theme, SidebarTab } from '@/types';

interface UIState {
  theme: Theme;
  sidebarVisible: boolean;
  sidebarTab: SidebarTab;
  searchPanelVisible: boolean;
  propertiesPanelVisible: boolean;

  setTheme: (theme: Theme) => void;
  toggleSidebar: () => void;
  setSidebarVisible: (visible: boolean) => void;
  setSidebarTab: (tab: SidebarTab) => void;
  toggleSearchPanel: () => void;
  togglePropertiesPanel: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  theme: 'light',
  sidebarVisible: true,
  sidebarTab: 'thumbnails',
  searchPanelVisible: false,
  propertiesPanelVisible: true,

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
}));
