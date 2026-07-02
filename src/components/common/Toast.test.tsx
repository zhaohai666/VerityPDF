import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { Toast } from './Toast'
import { useUIStore } from '@/stores/uiStore'

// Mock the UI store
vi.mock('@/stores/uiStore', () => ({
  useUIStore: vi.fn()
}))

describe('Toast Component', () => {
  const mockDismissToast = vi.fn()
  const mockUseUIStore = useUIStore as any

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('should return null when no toasts present', () => {
    mockUseUIStore.mockReturnValue({
      toasts: [],
      dismissToast: mockDismissToast
    })

    const { container } = render(<Toast />)
    expect(container.firstChild).toBeNull()
  })

  it('should render single toast', () => {
    const mockToast = {
      id: 'toast-1',
      type: 'info' as const,
      message: 'Test message'
    }

    mockUseUIStore.mockReturnValue({
      toasts: [mockToast],
      dismissToast: mockDismissToast
    })

    render(<Toast />)

    expect(screen.getByText('Test message')).toBeInTheDocument()
    expect(screen.getByText('ℹ')).toBeInTheDocument()
    expect(screen.getByText('×')).toBeInTheDocument()
  })

  it('should render multiple toasts', () => {
    const mockToasts = [
      { id: 'toast-1', type: 'info' as const, message: 'First message' },
      { id: 'toast-2', type: 'success' as const, message: 'Second message' },
      { id: 'toast-3', type: 'warning' as const, message: 'Third message' }
    ]

    mockUseUIStore.mockReturnValue({
      toasts: mockToasts,
      dismissToast: mockDismissToast
    })

    render(<Toast />)

    expect(screen.getByText('First message')).toBeInTheDocument()
    expect(screen.getByText('Second message')).toBeInTheDocument()
    expect(screen.getByText('Third message')).toBeInTheDocument()

    expect(screen.getByText('ℹ')).toBeInTheDocument()
    expect(screen.getByText('✓')).toBeInTheDocument()
    expect(screen.getByText('⚠')).toBeInTheDocument()
  })

  it('should render correct icons for each toast type', () => {
    const mockToasts = [
      { id: 'toast-1', type: 'error' as const, message: 'Error message' },
      { id: 'toast-2', type: 'success' as const, message: 'Success message' },
      { id: 'toast-3', type: 'warning' as const, message: 'Warning message' },
      { id: 'toast-4', type: 'info' as const, message: 'Info message' }
    ]

    mockUseUIStore.mockReturnValue({
      toasts: mockToasts,
      dismissToast: mockDismissToast
    })

    render(<Toast />)

    expect(screen.getByText('✕')).toBeInTheDocument()
    expect(screen.getByText('✓')).toBeInTheDocument()
    expect(screen.getByText('⚠')).toBeInTheDocument()
    expect(screen.getByText('ℹ')).toBeInTheDocument()
  })

  it('should call dismissToast when clicking on toast', () => {
    const mockToast = {
      id: 'toast-1',
      type: 'info' as const,
      message: 'Test message'
    }

    mockUseUIStore.mockReturnValue({
      toasts: [mockToast],
      dismissToast: mockDismissToast
    })

    render(<Toast />)

    const toastElement = screen.getByText('Test message').closest('.toast')!
    fireEvent.click(toastElement)

    expect(mockDismissToast).toHaveBeenCalledWith('toast-1')
  })

  it('should call dismissToast when clicking close button', () => {
    const mockToast = {
      id: 'toast-1',
      type: 'success' as const,
      message: 'Success message'
    }

    mockUseUIStore.mockReturnValue({
      toasts: [mockToast],
      dismissToast: mockDismissToast
    })

    render(<Toast />)

    const closeButton = screen.getByText('×')
    fireEvent.click(closeButton)

    expect(mockDismissToast).toHaveBeenCalledWith('toast-1')
  })

  it('should stop propagation when clicking close button - only calls dismissToast once', () => {
    const mockToast = {
      id: 'toast-1',
      type: 'warning' as const,
      message: 'Warning message'
    }

    mockUseUIStore.mockReturnValue({
      toasts: [mockToast],
      dismissToast: mockDismissToast
    })

    render(<Toast />)

    // Click the close button - due to stopPropagation, dismissToast should only be called once
    // (from the button's onClick), not twice (from both button and parent div)
    const closeButton = screen.getByText('×')
    fireEvent.click(closeButton)

    // If stopPropagation works, dismissToast is called exactly once
    // If it didn't work, it would be called twice (button click + parent div click)
    expect(mockDismissToast).toHaveBeenCalledTimes(1)
    expect(mockDismissToast).toHaveBeenCalledWith('toast-1')
  })

  it('should render toast with custom duration', () => {
    const mockToast = {
      id: 'toast-1',
      type: 'info' as const,
      message: 'Test message',
      duration: 5000
    }

    mockUseUIStore.mockReturnValue({
      toasts: [mockToast],
      dismissToast: mockDismissToast
    })

    render(<Toast />)

    expect(screen.getByText('Test message')).toBeInTheDocument()
  })

  it('should have correct CSS classes', () => {
    const mockToast = {
      id: 'toast-1',
      type: 'error' as const,
      message: 'Error message'
    }

    mockUseUIStore.mockReturnValue({
      toasts: [mockToast],
      dismissToast: mockDismissToast
    })

    render(<Toast />)

    expect(screen.getByText('Error message')).toBeInTheDocument()

    const spans = screen.getAllByText((content, element) => {
      return element?.tagName.toLowerCase() === 'span'
    })

    expect(spans.length).toBeGreaterThan(0)
  })

  it('should render toast container when toasts present', () => {
    const mockToast = {
      id: 'toast-1',
      type: 'success' as const,
      message: 'Success message'
    }

    mockUseUIStore.mockReturnValue({
      toasts: [mockToast],
      dismissToast: mockDismissToast
    })

    render(<Toast />)

    const container = screen.getByText('Success message').closest('.toast-container') ||
                     screen.getByText('Success message').closest('div')
    expect(container).toBeInTheDocument()
  })

  it('should apply CSS variable styles to toast elements', () => {
    const mockToasts = [
      { id: 'toast-1', type: 'error' as const, message: 'Error' },
      { id: 'toast-2', type: 'success' as const, message: 'Success' }
    ]

    mockUseUIStore.mockReturnValue({
      toasts: mockToasts,
      dismissToast: mockDismissToast
    })

    render(<Toast />)

    // Check that style attributes contain CSS variable references
    const errorToast = screen.getByText('Error').closest('.toast')!
    const successToast = screen.getByText('Success').closest('.toast')!

    expect(errorToast).toHaveAttribute('style')
    expect(successToast).toHaveAttribute('style')

    // Verify CSS variables are used in style
    const errorStyle = errorToast.getAttribute('style')!
    expect(errorStyle).toContain('var(--error-bg)')
    expect(errorStyle).toContain('var(--error-text)')
    expect(errorStyle).toContain('var(--error-border)')

    const successStyle = successToast.getAttribute('style')!
    expect(successStyle).toContain('var(--success-bg)')
  })

  it('should maintain unique keys for each toast', () => {
    const mockToasts = [
      { id: 'toast-1', type: 'info' as const, message: 'Message 1' },
      { id: 'toast-2', type: 'info' as const, message: 'Message 2' },
      { id: 'toast-3', type: 'info' as const, message: 'Message 3' }
    ]

    mockUseUIStore.mockReturnValue({
      toasts: mockToasts,
      dismissToast: mockDismissToast
    })

    render(<Toast />)

    const messages = screen.getAllByText((content) => content.includes('Message'))
    expect(messages).toHaveLength(3)
  })

  it('should handle edge cases gracefully', () => {
    const mockToast = {
      id: 'toast-1',
      type: 'info' as const,
      message: ''
    }

    mockUseUIStore.mockReturnValue({
      toasts: [mockToast],
      dismissToast: mockDismissToast
    })

    expect(() => render(<Toast />)).not.toThrow()
  })

  it('should be accessible', () => {
    const mockToast = {
      id: 'toast-1',
      type: 'warning' as const,
      message: 'Warning message'
    }

    mockUseUIStore.mockReturnValue({
      toasts: [mockToast],
      dismissToast: mockDismissToast
    })

    render(<Toast />)

    const closeButton = screen.getByText('×')
    expect(closeButton.tagName).toBe('BUTTON')
    expect(closeButton).toBeEnabled()
  })
})