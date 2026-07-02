import { describe, it, expect, beforeEach } from 'vitest'
import { useFormStore } from './formStore'
import type { FormFieldInfo } from '@/services/form/FormService'

const mockFields: FormFieldInfo[] = [
  {
    name: 'firstName',
    type: 'text',
    value: 'John',
    readOnly: false,
    required: true,
    page: 1,
  },
  {
    name: 'lastName',
    type: 'text',
    value: 'Doe',
    readOnly: false,
    required: true,
    page: 1,
  },
  {
    name: 'agree',
    type: 'checkbox',
    value: false,
    readOnly: false,
    required: false,
    page: 1,
  },
]

describe('Form Store', () => {
  beforeEach(() => {
    useFormStore.getState().reset()
  })

  it('should initialize with default state', () => {
    const state = useFormStore.getState()
    expect(state.fields).toEqual([])
    expect(state.editedValues).toEqual({})
    expect(state.isDetecting).toBe(false)
    expect(state.hasForm).toBe(false)
  })

  it('should set fields and initialize editedValues from field values', () => {
    useFormStore.getState().setFields(mockFields)

    const state = useFormStore.getState()
    expect(state.fields).toEqual(mockFields)
    expect(state.editedValues).toEqual({
      firstName: 'John',
      lastName: 'Doe',
      agree: false,
    })
    expect(state.hasForm).toBe(true)
  })

  it('should set hasForm to false when fields is empty', () => {
    useFormStore.getState().setFields([])
    expect(useFormStore.getState().hasForm).toBe(false)
  })

  it('should set a single edited value', () => {
    useFormStore.getState().setFields(mockFields)
    useFormStore.getState().setEditedValue('firstName', 'Jane')

    expect(useFormStore.getState().editedValues.firstName).toBe('Jane')
    // Other values unchanged
    expect(useFormStore.getState().editedValues.lastName).toBe('Doe')
  })

  it('should set multiple edited values at once', () => {
    useFormStore.getState().setFields(mockFields)
    useFormStore.getState().setEditedValues({
      firstName: 'Alice',
      lastName: 'Smith',
    })

    const values = useFormStore.getState().editedValues
    expect(values.firstName).toBe('Alice')
    expect(values.lastName).toBe('Smith')
  })

  it('should set isDetecting', () => {
    useFormStore.getState().setIsDetecting(true)
    expect(useFormStore.getState().isDetecting).toBe(true)

    useFormStore.getState().setIsDetecting(false)
    expect(useFormStore.getState().isDetecting).toBe(false)
  })

  it('should reset edits to original field values', () => {
    useFormStore.getState().setFields(mockFields)
    useFormStore.getState().setEditedValue('firstName', 'Changed')

    expect(useFormStore.getState().editedValues.firstName).toBe('Changed')

    useFormStore.getState().resetEdits()

    // Should revert to original field values
    expect(useFormStore.getState().editedValues.firstName).toBe('John')
    expect(useFormStore.getState().editedValues.lastName).toBe('Doe')
  })

  it('should reset all state', () => {
    useFormStore.getState().setFields(mockFields)
    useFormStore.getState().setEditedValue('firstName', 'Changed')
    useFormStore.getState().setIsDetecting(true)

    useFormStore.getState().reset()

    const state = useFormStore.getState()
    expect(state.fields).toEqual([])
    expect(state.editedValues).toEqual({})
    expect(state.isDetecting).toBe(false)
    expect(state.hasForm).toBe(false)
  })

  it('should handle checkbox value edits', () => {
    useFormStore.getState().setFields(mockFields)
    useFormStore.getState().setEditedValue('agree', true)

    expect(useFormStore.getState().editedValues.agree).toBe(true)
  })

  it('should handle setEditedValue before setFields', () => {
    useFormStore.getState().setEditedValue('unknown', 'value')
    expect(useFormStore.getState().editedValues.unknown).toBe('value')
  })
})