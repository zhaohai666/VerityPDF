import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useTaskStore } from './taskStore'
import type { TaskItemInfo, WorkflowTemplate, PipelineStep } from '@/types/electron'

const mockTask: TaskItemInfo = {
  id: 'test-task-1',
  status: 'pending',
  progress: 0,
  name: 'Test Task',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  type: 'compress',
  fileCount: 1,
  totalSize: 1024,
}

const mockStep: PipelineStep = {
  id: 'step-1',
  type: 'compress',
  config: { quality: 'high' },
}

const mockTemplate: WorkflowTemplate = {
  id: 'template-1',
  name: 'Test Template',
  steps: [mockStep],
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
}

describe('Task Store', () => {
  beforeEach(() => {
    // Reset localStorage mock
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(),
      setItem: vi.fn(),
    })
    
    // Reset store state
    useTaskStore.setState({
      tasks: [],
      templates: [],
      dialogVisible: false,
      pipelineDialogVisible: false,
      listenersInitialized: false,
    })
  })

  it('should initialize with default state', () => {
    const state = useTaskStore.getState()
    expect(state.tasks).toEqual([])
    expect(state.templates).toEqual([])
    expect(state.dialogVisible).toBe(false)
    expect(state.pipelineDialogVisible).toBe(false)
    expect(state.listenersInitialized).toBe(false)
  })

  it('should set tasks', () => {
    const tasks = [mockTask]
    useTaskStore.getState().setTasks(tasks)
    expect(useTaskStore.getState().tasks).toEqual(tasks)
  })

  it('should update existing task', () => {
    // First add a task
    useTaskStore.getState().setTasks([mockTask])
    
    // Then update it
    const updatedTask = { ...mockTask, status: 'completed' as const }
    useTaskStore.getState().updateTask(updatedTask)
    
    const tasks = useTaskStore.getState().tasks
    expect(tasks).toHaveLength(1)
    expect(tasks[0].status).toBe('completed')
  })

  it('should add new task', () => {
    useTaskStore.getState().addTask(mockTask)
    
    const tasks = useTaskStore.getState().tasks
    expect(tasks).toHaveLength(1)
    expect(tasks[0]).toEqual(mockTask)
  })

  it('should add task to existing tasks', () => {
    const task2 = { ...mockTask, id: 'test-task-2' }
    
    useTaskStore.getState().addTask(mockTask)
    useTaskStore.getState().addTask(task2)
    
    const tasks = useTaskStore.getState().tasks
    expect(tasks).toHaveLength(2)
    expect(tasks[0]).toEqual(mockTask)
    expect(tasks[1]).toEqual(task2)
  })

  it('should remove task from store', () => {
    const task2 = { ...mockTask, id: 'test-task-2' }
    
    useTaskStore.getState().addTask(mockTask)
    useTaskStore.getState().addTask(task2)
    expect(useTaskStore.getState().tasks).toHaveLength(2)
    
    useTaskStore.getState().removeTaskFromStore('test-task-1')
    
    const tasks = useTaskStore.getState().tasks
    expect(tasks).toHaveLength(1)
    expect(tasks[0].id).toBe('test-task-2')
  })

  it('should set dialog visibility', () => {
    useTaskStore.getState().setDialogVisible(true)
    expect(useTaskStore.getState().dialogVisible).toBe(true)
    
    useTaskStore.getState().setDialogVisible(false)
    expect(useTaskStore.getState().dialogVisible).toBe(false)
  })

  it('should set pipeline dialog visibility', () => {
    useTaskStore.getState().setPipelineDialogVisible(true)
    expect(useTaskStore.getState().pipelineDialogVisible).toBe(true)
    
    useTaskStore.getState().setPipelineDialogVisible(false)
    expect(useTaskStore.getState().pipelineDialogVisible).toBe(false)
  })

  it('should save template', () => {
    const result = useTaskStore.getState().saveTemplate({
      name: 'New Template',
      steps: [mockStep],
    })
    
    expect(result.name).toBe('New Template')
    expect(result.steps).toEqual([mockStep])
    expect(result.id).toBeDefined()
    expect(result.createdAt).toBeDefined()
    expect(result.updatedAt).toBeDefined()
    
    const templates = useTaskStore.getState().templates
    expect(templates).toHaveLength(1)
    expect(templates[0]).toEqual(result)
  })

  it('should update template', () => {
    // First save a template
    const savedTemplate = useTaskStore.getState().saveTemplate({
      name: 'Original Template',
      steps: [mockStep],
    })
    
    // Then update it
    useTaskStore.getState().updateTemplate(savedTemplate.id, {
      name: 'Updated Template',
    })
    
    const templates = useTaskStore.getState().templates
    expect(templates).toHaveLength(1)
    expect(templates[0].name).toBe('Updated Template')
  })

  it('should delete template', () => {
    // First save a template
    const savedTemplate = useTaskStore.getState().saveTemplate({
      name: 'Template to Delete',
      steps: [mockStep],
    })
    
    expect(useTaskStore.getState().templates).toHaveLength(1)
    
    // Then delete it
    useTaskStore.getState().deleteTemplate(savedTemplate.id)
    
    expect(useTaskStore.getState().templates).toHaveLength(0)
  })

  it('should handle removing non-existent task gracefully', () => {
    useTaskStore.getState().addTask(mockTask)
    expect(useTaskStore.getState().tasks).toHaveLength(1)
    
    // Try to remove a task that doesn't exist
    useTaskStore.getState().removeTaskFromStore('non-existent-id')
    
    // Should still have the original task
    expect(useTaskStore.getState().tasks).toHaveLength(1)
  })

  it('should handle updating non-existent task', () => {
    useTaskStore.getState().addTask(mockTask)
    const updatedTask = { ...mockTask, id: 'different-id', status: 'completed' as const }
    
    useTaskStore.getState().updateTask(updatedTask)
    
    // Should have original task plus new task (added, not updated)
    const tasks = useTaskStore.getState().tasks
    expect(tasks).toHaveLength(2)
    expect(tasks[0]).toEqual(mockTask)
    expect(tasks[1]).toEqual(updatedTask)
  })

  it('should handle updating template that does not exist', () => {
    useTaskStore.getState().saveTemplate({
      name: 'Existing Template',
      steps: [mockStep],
    })
    
    // Try to update non-existent template
    useTaskStore.getState().updateTemplate('non-existent-id', {
      name: 'Updated Name',
    })
    
    // Should still have original template unchanged
    expect(useTaskStore.getState().templates).toHaveLength(1)
    expect(useTaskStore.getState().templates[0].name).toBe('Existing Template')
  })

  it('should handle deleting non-existent template', () => {
    useTaskStore.getState().saveTemplate({
      name: 'Existing Template',
      steps: [mockStep],
    })
    
    // Try to delete non-existent template
    useTaskStore.getState().deleteTemplate('non-existent-id')
    
    // Should still have original template
    expect(useTaskStore.getState().templates).toHaveLength(1)
  })
})