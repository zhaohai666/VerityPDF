import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Logger } from './Logger'

describe('Logger', () => {
  let consoleSpy: Record<string, any>

  beforeEach(() => {
    // Mock console methods
    consoleSpy = {
      debug: vi.spyOn(console, 'debug').mockImplementation(() => {}),
      info: vi.spyOn(console, 'info').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    }
    
    // Reset log level to default
    Logger.setLevel('debug')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should create logger with prefix', () => {
    const logger = new Logger('TestModule')
    expect(logger).toBeInstanceOf(Logger)
  })

  describe('debug level', () => {
    it('should log debug when level is debug', () => {
      Logger.setLevel('debug')
      const logger = new Logger('TestModule')
      
      logger.debug('Debug message')
      
      expect(consoleSpy.debug).toHaveBeenCalledWith('[TestModule] [DEBUG]', 'Debug message')
      expect(consoleSpy.info).not.toHaveBeenCalled()
      expect(consoleSpy.warn).not.toHaveBeenCalled()
      expect(consoleSpy.error).not.toHaveBeenCalled()
    })

    it('should not log debug when level is higher than debug', () => {
      Logger.setLevel('info')
      const logger = new Logger('TestModule')
      
      logger.debug('Debug message')
      
      expect(consoleSpy.debug).not.toHaveBeenCalled()
    })
  })

  describe('info level', () => {
    it('should log info when level is debug or info', () => {
      Logger.setLevel('debug')
      const logger = new Logger('TestModule')
      
      logger.info('Info message')
      
      expect(consoleSpy.info).toHaveBeenCalledWith('[TestModule] [INFO]', 'Info message')
    })

    it('should log info when level is info', () => {
      Logger.setLevel('info')
      const logger = new Logger('TestModule')
      
      logger.info('Info message')
      
      expect(consoleSpy.info).toHaveBeenCalledWith('[TestModule] [INFO]', 'Info message')
    })

    it('should not log info when level is warn or higher', () => {
      Logger.setLevel('warn')
      const logger = new Logger('TestModule')
      
      logger.info('Info message')
      
      expect(consoleSpy.info).not.toHaveBeenCalled()
    })
  })

  describe('warn level', () => {
    it('should log warn when level is debug, info, or warn', () => {
      Logger.setLevel('debug')
      const logger = new Logger('TestModule')
      
      logger.warn('Warning message')
      
      expect(consoleSpy.warn).toHaveBeenCalledWith('[TestModule] [WARN]', 'Warning message')
    })

    it('should log warn when level is warn', () => {
      Logger.setLevel('warn')
      const logger = new Logger('TestModule')
      
      logger.warn('Warning message')
      
      expect(consoleSpy.warn).toHaveBeenCalledWith('[TestModule] [WARN]', 'Warning message')
    })

    it('should not log warn when level is error', () => {
      Logger.setLevel('error')
      const logger = new Logger('TestModule')
      
      logger.warn('Warning message')
      
      expect(consoleSpy.warn).not.toHaveBeenCalled()
    })
  })

  describe('error level', () => {
    it('should log error regardless of level', () => {
      Logger.setLevel('error')
      const logger = new Logger('TestModule')
      
      logger.error('Error message')
      
      expect(consoleSpy.error).toHaveBeenCalledWith('[TestModule] [ERROR]', 'Error message')
    })

    it('should log error when level is debug', () => {
      Logger.setLevel('debug')
      const logger = new Logger('TestModule')
      
      logger.error('Error message')
      
      expect(consoleSpy.error).toHaveBeenCalledWith('[TestModule] [ERROR]', 'Error message')
    })
  })

  describe('multiple arguments', () => {
    it('should handle multiple arguments in debug', () => {
      const logger = new Logger('TestModule')
      
      logger.debug('Message with data', { key: 'value' }, [1, 2, 3])
      
      expect(consoleSpy.debug).toHaveBeenCalledWith(
        '[TestModule] [DEBUG]',
        'Message with data',
        { key: 'value' },
        [1, 2, 3]
      )
    })

    it('should handle multiple arguments in info', () => {
      const logger = new Logger('TestModule')
      
      logger.info('Info with data', 42, 'extra')
      
      expect(consoleSpy.info).toHaveBeenCalledWith(
        '[TestModule] [INFO]',
        'Info with data',
        42,
        'extra'
      )
    })

    it('should handle multiple arguments in warn', () => {
      Logger.setLevel('warn')
      const logger = new Logger('TestModule')
      
      logger.warn('Warning with error', new Error('Test error'))
      
      expect(consoleSpy.warn).toHaveBeenCalledWith(
        '[TestModule] [WARN]',
        'Warning with error',
        expect.any(Error)
      )
    })

    it('should handle multiple arguments in error', () => {
      Logger.setLevel('error')
      const logger = new Logger('TestModule')
      
      logger.error('Error with details', { error: 'details' })
      
      expect(consoleSpy.error).toHaveBeenCalledWith(
        '[TestModule] [ERROR]',
        'Error with details',
        { error: 'details' }
      )
    })
  })

  describe('different logger instances', () => {
    it('should use different prefixes for different loggers', () => {
      const logger1 = new Logger('Module1')
      const logger2 = new Logger('Module2')
      
      logger1.info('Message from module 1')
      logger2.info('Message from module 2')
      
      expect(consoleSpy.info).toHaveBeenCalledWith('[Module1] [INFO]', 'Message from module 1')
      expect(consoleSpy.info).toHaveBeenCalledWith('[Module2] [INFO]', 'Message from module 2')
    })
  })

  describe('static log level changes', () => {
    it('should affect all logger instances', () => {
      const logger1 = new Logger('Module1')
      const logger2 = new Logger('Module2')
      
      Logger.setLevel('warn')
      
      logger1.info('Info 1')
      logger2.debug('Debug 2')
      logger1.warn('Warning 1')
      
      expect(consoleSpy.info).not.toHaveBeenCalled()
      expect(consoleSpy.debug).not.toHaveBeenCalled()
      expect(consoleSpy.warn).toHaveBeenCalledWith('[Module1] [WARN]', 'Warning 1')
    })

    it('should work with all log levels', () => {
      const logger = new Logger('TestModule')
      
      // Test debug level
      Logger.setLevel('debug')
      logger.debug('Debug message')
      expect(consoleSpy.debug).toHaveBeenCalledTimes(1)
      
      // Test info level
      Logger.setLevel('info')
      logger.debug('No debug')
      logger.info('Info message')
      expect(consoleSpy.debug).toHaveBeenCalledTimes(1) // No additional call
      expect(consoleSpy.info).toHaveBeenCalledTimes(1)
      
      // Test warn level
      Logger.setLevel('warn')
      logger.info('No info')
      logger.warn('Warning message')
      expect(consoleSpy.info).toHaveBeenCalledTimes(1) // No additional call
      expect(consoleSpy.warn).toHaveBeenCalledTimes(1)
      
      // Test error level
      Logger.setLevel('error')
      logger.warn('No warn')
      logger.error('Error message')
      expect(consoleSpy.warn).toHaveBeenCalledTimes(1) // No additional call
      expect(consoleSpy.error).toHaveBeenCalledTimes(1)
    })
  })

  describe('edge cases', () => {
    it('should handle empty message', () => {
      const logger = new Logger('TestModule')
      
      logger.info('')
      
      expect(consoleSpy.info).toHaveBeenCalledWith('[TestModule] [INFO]', '')
    })

    it('should handle undefined/null arguments', () => {
      const logger = new Logger('TestModule')
      
      logger.info('Message', undefined, null)
      
      expect(consoleSpy.info).toHaveBeenCalledWith('[TestModule] [INFO]', 'Message', undefined, null)
    })

    it('should handle no arguments (default to debug level)', () => {
      Logger.setLevel('debug')
      const logger = new Logger('TestModule')
      
      logger.debug('Test message')
      
      expect(consoleSpy.debug).toHaveBeenCalled()
    })
  })
})