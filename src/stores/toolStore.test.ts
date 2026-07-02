import { describe, it, expect, beforeEach } from 'vitest'
import { useToolStore } from './toolStore'
import { DEFAULT_ANNOTATION_STYLE } from '@/types'

describe('Tool Store', () => {
  beforeEach(() => {
    useToolStore.setState({
      activeTool: 'select',
      toolStyle: { ...DEFAULT_ANNOTATION_STYLE },
      keepToolActive: false,
    })
  })

  it('should initialize with default state', () => {
    const state = useToolStore.getState()
    expect(state.activeTool).toBe('select')
    expect(state.toolStyle).toEqual(DEFAULT_ANNOTATION_STYLE)
    expect(state.keepToolActive).toBe(false)
  })

  it('should set active tool', () => {
    useToolStore.getState().setActiveTool('rect')
    expect(useToolStore.getState().activeTool).toBe('rect')
    
    useToolStore.getState().setActiveTool('highlight')
    expect(useToolStore.getState().activeTool).toBe('highlight')
    
    useToolStore.getState().setActiveTool('text')
    expect(useToolStore.getState().activeTool).toBe('text')
  })

  it('should set tool style with partial updates', () => {
    useToolStore.getState().setToolStyle({ stroke: '#FF0000' })
    expect(useToolStore.getState().toolStyle.stroke).toBe('#FF0000')
    
    // Verify other properties remain unchanged
    expect(useToolStore.getState().toolStyle.fill).toBe(DEFAULT_ANNOTATION_STYLE.fill)
    expect(useToolStore.getState().toolStyle.strokeWidth).toBe(DEFAULT_ANNOTATION_STYLE.strokeWidth)
  })

  it('should merge multiple style properties', () => {
    useToolStore.getState().setToolStyle({
      stroke: '#0000FF',
      fill: '#FF0000',
      strokeWidth: 5,
    })
    
    const style = useToolStore.getState().toolStyle
    expect(style.stroke).toBe('#0000FF')
    expect(style.fill).toBe('#FF0000')
    expect(style.strokeWidth).toBe(5)
    
    // Verify other properties remain unchanged
    expect(style.opacity).toBe(DEFAULT_ANNOTATION_STYLE.opacity)
  })

  it('should reset style to default', () => {
    // First modify the style
    useToolStore.getState().setToolStyle({
      stroke: '#123456',
      fill: '#654321',
      strokeWidth: 10,
    })
    
    // Then reset
    useToolStore.getState().resetStyle()
    
    expect(useToolStore.getState().toolStyle).toEqual(DEFAULT_ANNOTATION_STYLE)
  })

  it('should set keep tool active flag', () => {
    useToolStore.getState().setKeepToolActive(true)
    expect(useToolStore.getState().keepToolActive).toBe(true)
    
    useToolStore.getState().setKeepToolActive(false)
    expect(useToolStore.getState().keepToolActive).toBe(false)
  })

  it('should handle style updates without affecting other state', () => {
    // Set a different tool first
    useToolStore.getState().setActiveTool('circle')
    useToolStore.getState().setKeepToolActive(true)
    
    // Update style
    useToolStore.getState().setToolStyle({ stroke: '#ABCDEF' })
    
    // Verify other state remains unchanged
    expect(useToolStore.getState().activeTool).toBe('circle')
    expect(useToolStore.getState().keepToolActive).toBe(true)
    expect(useToolStore.getState().toolStyle.stroke).toBe('#ABCDEF')
  })

  it('should handle multiple partial style updates', () => {
    useToolStore.getState().setToolStyle({ stroke: '#111111' })
    useToolStore.getState().setToolStyle({ fill: '#222222' })
    useToolStore.getState().setToolStyle({ strokeWidth: 8 })
    
    const style = useToolStore.getState().toolStyle
    expect(style.stroke).toBe('#111111')
    expect(style.fill).toBe('#222222')
    expect(style.strokeWidth).toBe(8)
  })

  it('should override previous style updates', () => {
    useToolStore.getState().setToolStyle({ stroke: '#111111' })
    useToolStore.getState().setToolStyle({ stroke: '#222222' })
    
    expect(useToolStore.getState().toolStyle.stroke).toBe('#222222')
  })

  it('should handle invalid style properties gracefully', () => {
    // Should not break on setting undefined or null
    expect(() => {
      useToolStore.getState().setToolStyle({} as any)
    }).not.toThrow()
  })

  it('should preserve tool style object reference stability when setting same values', () => {
    const initialStyle = useToolStore.getState().toolStyle
    
    // Set the same values
    useToolStore.getState().setToolStyle({
      stroke: initialStyle.stroke,
      fill: initialStyle.fill,
    })
    
    // Object should be merged but not identical
    const newStyle = useToolStore.getState().toolStyle
    expect(newStyle).not.toBe(initialStyle)
    expect(newStyle).toEqual(initialStyle)
  })
})