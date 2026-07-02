import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { ErrorBoundary, IpcError, normalizeError } from './ErrorBoundary'

describe('ErrorBoundary', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should render children normally when no error occurs', () => {
    render(
      <ErrorBoundary>
        <div>Normal content</div>
      </ErrorBoundary>
    )

    expect(screen.getByText('Normal content')).toBeInTheDocument()
    expect(screen.queryByText('发生了一个错误')).not.toBeInTheDocument()
  })

  it('should display default fallback UI when error occurs', () => {
    const ErrorComponent = () => {
      throw new Error('Test error')
    }

    render(
      <ErrorBoundary>
        <ErrorComponent />
      </ErrorBoundary>
    )

    expect(screen.getByText('发生了一个错误')).toBeInTheDocument()
    expect(screen.getByText('Test error')).toBeInTheDocument()
    expect(screen.getByText('重试')).toBeInTheDocument()
  })

  it('should call componentDidCatch when error occurs', () => {
    const ErrorComponent = () => {
      throw new Error('Test error')
    }

    render(
      <ErrorBoundary>
        <ErrorComponent />
      </ErrorBoundary>
    )

    expect(console.error).toHaveBeenCalledWith(
      '[ErrorBoundary] Caught rendering error:',
      expect.any(Error)
    )
    expect(console.error).toHaveBeenCalledWith(
      '[ErrorBoundary] Component stack:',
      expect.any(String)
    )
  })

  it('should reset error state when reset button is clicked', () => {
    const ErrorComponent = () => {
      throw new Error('Test error')
    }

    render(
      <ErrorBoundary>
        <ErrorComponent />
      </ErrorBoundary>
    )

    expect(screen.getByText('发生了一个错误')).toBeInTheDocument()

    const resetButton = screen.getByText('重试')
    fireEvent.click(resetButton)

    // Will still show error because component throws again
    expect(screen.getByText('发生了一个错误')).toBeInTheDocument()
  })

  it('should use custom fallback component when provided', () => {
    const CustomFallback = () => <div>Custom error message</div>

    const ErrorComponent = () => {
      throw new Error('Test error')
    }

    render(
      <ErrorBoundary fallback={<CustomFallback />}>
        <ErrorComponent />
      </ErrorBoundary>
    )

    expect(screen.getByText('Custom error message')).toBeInTheDocument()
    expect(screen.queryByText('发生了一个错误')).not.toBeInTheDocument()
  })

  it('should call fallback function when provided', () => {
    const fallbackFunction = vi.fn((error: Error, reset: () => void) => (
      <div>
        <h1>Function Fallback</h1>
        <p>Error: {error.message}</p>
        <button onClick={reset}>Reset</button>
      </div>
    ))

    let shouldThrow = true
    const ErrorComponent = () => {
      if (shouldThrow) {
        throw new Error('Function test error')
      }
      return <div>Fixed</div>
    }

    const { rerender } = render(
      <ErrorBoundary fallback={fallbackFunction}>
        <ErrorComponent />
      </ErrorBoundary>
    )

    expect(screen.getByText('Function Fallback')).toBeInTheDocument()
    expect(screen.getByText('Error: Function test error')).toBeInTheDocument()
    expect(fallbackFunction).toHaveBeenCalled()

    // Must set shouldThrow=false BEFORE clicking Reset, otherwise the re-render
    // triggered by handleReset will cause ErrorComponent to throw again,
    // putting ErrorBoundary back into error state
    shouldThrow = false
    fireEvent.click(screen.getByText('Reset'))

    expect(screen.getByText('Fixed')).toBeInTheDocument()
  })

  it('should handle different types of errors', () => {
    const ErrorWithNoMessage = () => {
      throw new Error()
    }

    render(
      <ErrorBoundary>
        <ErrorWithNoMessage />
      </ErrorBoundary>
    )

    expect(screen.getByText('发生了一个错误')).toBeInTheDocument()
  })

  it('should display error details in details element', () => {
    const ComplexErrorComponent = () => {
      throw new Error('Complex error with stack trace')
    }

    render(
      <ErrorBoundary>
        <ComplexErrorComponent />
      </ErrorBoundary>
    )

    expect(screen.getByText('Complex error with stack trace')).toBeInTheDocument()
    expect(screen.getByText('错误详情')).toBeInTheDocument()
  })

  it('should handle nested ErrorBoundary components', () => {
    const OuterErrorComponent = () => {
      throw new Error('Outer error')
    }

    const InnerErrorComponent = () => {
      throw new Error('Inner error')
    }

    render(
      <ErrorBoundary>
        <OuterErrorComponent />
        <ErrorBoundary fallback={<div>Inner fallback</div>}>
          <InnerErrorComponent />
        </ErrorBoundary>
      </ErrorBoundary>
    )

    expect(screen.getByText('发生了一个错误')).toBeInTheDocument()
    expect(screen.getByText('Outer error')).toBeInTheDocument()
    expect(screen.queryByText('Inner fallback')).not.toBeInTheDocument()
  })

  it('should preserve error information in state', () => {
    const TestWrapper = () => {
      const [, forceUpdate] = React.useReducer(() => ({}), {})

      return (
        <ErrorBoundary>
          <button onClick={() => forceUpdate()}>Force Error</button>
          <ErrorThrower />
        </ErrorBoundary>
      )
    }

    const ErrorThrower = () => {
      throw new Error('State preservation test')
    }

    render(<TestWrapper />)

    expect(screen.getByText('State preservation test')).toBeInTheDocument()
  })

  it('should render with minimal props', () => {
    const ErrorComponent = () => {
      throw new Error('Minimal props test')
    }

    expect(() => {
      render(
        <ErrorBoundary>
          <ErrorComponent />
        </ErrorBoundary>
      )
    }).not.toThrow()

    expect(screen.getByText('发生了一个错误')).toBeInTheDocument()
  })

  it('should handle malformed fallback props gracefully', () => {
    const ErrorComponent = () => {
      throw new Error('Fallback test')
    }

    render(
      <ErrorBoundary fallback={null as any}>
        <ErrorComponent />
      </ErrorBoundary>
    )

    expect(screen.getByText('发生了一个错误')).toBeInTheDocument()
  })
})

describe('IpcError', () => {
  it('should create IpcError with code and category', () => {
    const error = new IpcError('FILE_NOT_FOUND', 'File not found', 'file')

    expect(error.name).toBe('IpcError')
    expect(error.code).toBe('FILE_NOT_FOUND')
    expect(error.category).toBe('file')
    expect(error.message).toBe('File not found')
  })

  it('should default to unknown category', () => {
    const error = new IpcError('TEST', 'test message')

    expect(error.category).toBe('unknown')
  })

  it('should return user-friendly messages', () => {
    const error = new IpcError('FILE_NOT_FOUND', 'original', 'file')
    expect(error.getUserMessage()).toBe('文件不存在，请检查路径后重试')

    const pdfError = new IpcError('PDF_CORRUPTED', 'original', 'pdf')
    expect(pdfError.getUserMessage()).toBe('PDF 文件损坏，无法解析')

    const unknownError = new IpcError('CUSTOM_CODE', 'custom message', 'unknown')
    expect(unknownError.getUserMessage()).toBe('custom message')
  })
})

describe('normalizeError', () => {
  it('should return IpcError as-is', () => {
    const ipcError = new IpcError('TEST', 'test', 'file')
    expect(normalizeError(ipcError)).toBe(ipcError)
  })

  it('should normalize ENOENT errors to FILE_NOT_FOUND', () => {
    const error = normalizeError(new Error('ENOENT: no such file'))
    expect(error.code).toBe('FILE_NOT_FOUND')
    expect(error.category).toBe('file')
  })

  it('should normalize permission errors to FILE_ACCESS_DENIED', () => {
    const error = normalizeError(new Error('EACCES permission denied'))
    expect(error.code).toBe('FILE_ACCESS_DENIED')
    expect(error.category).toBe('file')
  })

  it('should normalize Invalid PDF errors to PDF_CORRUPTED', () => {
    const error = normalizeError(new Error('Invalid PDF structure'))
    expect(error.code).toBe('PDF_CORRUPTED')
    expect(error.category).toBe('pdf')
  })

  it('should normalize password errors to PDF_ENCRYPTED', () => {
    const error = normalizeError(new Error('PasswordException: password needed'))
    expect(error.code).toBe('PDF_ENCRYPTED')
    expect(error.category).toBe('pdf')
  })

  it('should normalize string errors', () => {
    const error = normalizeError('some string error')
    expect(error).toBeInstanceOf(IpcError)
    expect(error.message).toBe('some string error')
    expect(error.category).toBe('unknown')
  })

  it('should normalize unknown errors', () => {
    const error = normalizeError(new Error('something unexpected'))
    expect(error.code).toBe('UNKNOWN')
    expect(error.category).toBe('unknown')
  })
})