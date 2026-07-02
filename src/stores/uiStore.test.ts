import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useUIStore } from './uiStore'

describe('UI Store', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useUIStore.setState({
      theme: 'light',
      sidebarVisible: true,
      sidebarTab: 'thumbnails',
      searchPanelVisible: false,
      propertiesPanelVisible: true,
      toasts: [],
    })
    vi.clearAllTimers()
    // Mock document.documentElement.setAttribute
    Object.defineProperty(document, 'documentElement', {
      value: {
        setAttribute: vi.fn(),
      },
      writable: true,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should initialize with default state', () => {
    const state = useUIStore.getState()
    expect(state.theme).toBe('light')
    expect(state.sidebarVisible).toBe(true)
    expect(state.sidebarTab).toBe('thumbnails')
    expect(state.searchPanelVisible).toBe(false)
    expect(state.propertiesPanelVisible).toBe(true)
    expect(state.toasts).toEqual([])
  })

  it('should set theme', () => {
    useUIStore.getState().setTheme('dark')
    expect(useUIStore.getState().theme).toBe('dark')
    expect(document.documentElement.setAttribute).toHaveBeenCalledWith('data-theme', 'dark')
  })

  it('should set system theme', () => {
    useUIStore.getState().setTheme('system')
    expect(useUIStore.getState().theme).toBe('system')
    expect(document.documentElement.setAttribute).toHaveBeenCalledWith('data-theme', '')
  })

  it('should toggle sidebar', () => {
    const initial = useUIStore.getState().sidebarVisible
    useUIStore.getState().toggleSidebar()
    expect(useUIStore.getState().sidebarVisible).toBe(!initial)

    useUIStore.getState().toggleSidebar()
    expect(useUIStore.getState().sidebarVisible).toBe(initial)
  })

  it('should set sidebar visible', () => {
    useUIStore.getState().setSidebarVisible(false)
    expect(useUIStore.getState().sidebarVisible).toBe(false)

    useUIStore.getState().setSidebarVisible(true)
    expect(useUIStore.getState().sidebarVisible).toBe(true)
  })

  it('should set sidebar tab and make sidebar visible', () => {
    useUIStore.getState().setSidebarVisible(false)
    useUIStore.getState().setSidebarTab('bookmarks')

    const state = useUIStore.getState()
    expect(state.sidebarTab).toBe('bookmarks')
    expect(state.sidebarVisible).toBe(true)
  })

  it('should toggle search panel', () => {
    const initial = useUIStore.getState().searchPanelVisible
    useUIStore.getState().toggleSearchPanel()
    expect(useUIStore.getState().searchPanelVisible).toBe(!initial)

    useUIStore.getState().toggleSearchPanel()
    expect(useUIStore.getState().searchPanelVisible).toBe(initial)
  })

  it('should toggle properties panel', () => {
    const initial = useUIStore.getState().propertiesPanelVisible
    useUIStore.getState().togglePropertiesPanel()
    expect(useUIStore.getState().propertiesPanelVisible).toBe(!initial)

    useUIStore.getState().togglePropertiesPanel()
    expect(useUIStore.getState().propertiesPanelVisible).toBe(initial)
  })

  it('should show toast with default values', () => {
    useUIStore.getState().showToast('Test message')

    const toasts = useUIStore.getState().toasts
    expect(toasts).toHaveLength(1)
    expect(toasts[0].message).toBe('Test message')
    expect(toasts[0].type).toBe('info')
    expect(toasts[0].duration).toBe(3000)
    expect(toasts[0].id).toMatch(/^toast_\d+_[a-z0-9]+$/)
  })

  it('should show toast with custom type and duration', () => {
    useUIStore.getState().showToast('Error message', 'error', 5000)

    const toasts = useUIStore.getState().toasts
    expect(toasts).toHaveLength(1)
    expect(toasts[0].message).toBe('Error message')
    expect(toasts[0].type).toBe('error')
    expect(toasts[0].duration).toBe(5000)
  })

  it('should show multiple toasts', () => {
    useUIStore.getState().showToast('First')
    useUIStore.getState().showToast('Second')
    useUIStore.getState().showToast('Third')

    const toasts = useUIStore.getState().toasts
    expect(toasts).toHaveLength(3)
    expect(toasts[0].message).toBe('First')
    expect(toasts[1].message).toBe('Second')
    expect(toasts[2].message).toBe('Third')
  })

  it('should dismiss specific toast', () => {
    useUIStore.getState().showToast('First')
    useUIStore.getState().showToast('Second')
    useUIStore.getState().showToast('Third')

    const toasts = useUIStore.getState().toasts
    const secondToast = toasts[1]

    useUIStore.getState().dismissToast(secondToast.id)

    const remainingToasts = useUIStore.getState().toasts
    expect(remainingToasts).toHaveLength(2)
    expect(remainingToasts[0].message).toBe('First')
    expect(remainingToasts[1].message).toBe('Third')
  })

  it('should clear all toasts', () => {
    useUIStore.getState().showToast('First')
    useUIStore.getState().showToast('Second')
    useUIStore.getState().showToast('Third')

    expect(useUIStore.getState().toasts).toHaveLength(3)

    useUIStore.getState().clearToasts()

    expect(useUIStore.getState().toasts).toHaveLength(0)
  })

  it('should auto-dismiss toast after duration', () => {
    useUIStore.getState().showToast('Auto dismiss toast', 'info', 1000)

    expect(useUIStore.getState().toasts).toHaveLength(1)

    vi.advanceTimersByTime(1000)

    expect(useUIStore.getState().toasts).toHaveLength(0)
  })

  it('should not auto-dismiss toast with duration 0', () => {
    useUIStore.getState().showToast('Permanent toast', 'info', 0)

    expect(useUIStore.getState().toasts).toHaveLength(1)

    vi.advanceTimersByTime(5000)

    expect(useUIStore.getState().toasts).toHaveLength(1)
  })

  it('should not auto-dismiss toast when duration is positive but timer not triggered', () => {
    useUIStore.getState().showToast('Will dismiss later', 'info', 3000)

    expect(useUIStore.getState().toasts).toHaveLength(1)

    vi.advanceTimersByTime(1000)

    expect(useUIStore.getState().toasts).toHaveLength(1)
  })

  it('should handle dismissing non-existent toast gracefully', () => {
    useUIStore.getState().showToast('Test toast')

    expect(useUIStore.getState().toasts).toHaveLength(1)

    useUIStore.getState().dismissToast('non-existent-id')

    expect(useUIStore.getState().toasts).toHaveLength(1)
  })

  it('should handle multiple auto-dismissals correctly', () => {
    useUIStore.getState().showToast('Toast 1', 'info', 1000)
    useUIStore.getState().showToast('Toast 2', 'info', 2000)
    useUIStore.getState().showToast('Toast 3', 'info', 1500)

    expect(useUIStore.getState().toasts).toHaveLength(3)

    vi.advanceTimersByTime(1000)
    expect(useUIStore.getState().toasts).toHaveLength(2)

    vi.advanceTimersByTime(500)
    expect(useUIStore.getState().toasts).toHaveLength(1)

    vi.advanceTimersByTime(500)
    expect(useUIStore.getState().toasts).toHaveLength(0)
  })

  it('should generate unique toast IDs', () => {
    const ids = new Set<string>()

    for (let i = 0; i < 100; i++) {
      useUIStore.getState().showToast(`Toast ${i}`)
    }

    const toasts = useUIStore.getState().toasts
    toasts.forEach(toast => ids.add(toast.id))

    expect(ids.size).toBe(100)
  })

  it('should generate toast IDs with correct format', () => {
    useUIStore.getState().showToast('Test')

    const toast = useUIStore.getState().toasts[0]
    const idParts = toast.id.split('_')

    expect(idParts).toHaveLength(3)
    expect(idParts[0]).toBe('toast')
    expect(idParts[1]).toMatch(/^\d+$/)
    expect(idParts[2]).toMatch(/^[a-z0-9]+$/)
  })
})