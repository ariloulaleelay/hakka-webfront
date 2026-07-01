import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PromptDialog } from '../components/PromptDialog'
import { useChatStore } from '../store/useChatStore'

describe('Prompt Template Library', () => {
  beforeEach(() => {
    useChatStore.setState({
      prompts: [],
      sessionId: null,
      messages: [],
    })
  })

  it('should add a prompt via store', () => {
    const store = useChatStore.getState()
    store.addPrompt({ name: 'My Prompt', content: 'Hello world' })

    const state = useChatStore.getState()
    expect(state.prompts).toHaveLength(1)
    expect(state.prompts[0].name).toBe('My Prompt')
    expect(state.prompts[0].content).toBe('Hello world')
    expect(state.prompts[0].id).toBeDefined()
  })

  it('should update a prompt via store', () => {
    const store = useChatStore.getState()
    const p = store.addPrompt({ name: 'Old', content: 'Old content' })
    store.updatePrompt(p.id, { name: 'New', content: 'New content' })

    const state = useChatStore.getState()
    expect(state.prompts).toHaveLength(1)
    expect(state.prompts[0].name).toBe('New')
    expect(state.prompts[0].content).toBe('New content')
  })

  it('should delete a prompt via store', () => {
    const store = useChatStore.getState()
    const p1 = store.addPrompt({ name: 'A', content: 'A' })
    const p2 = store.addPrompt({ name: 'B', content: 'B' })
    store.deletePrompt(p1.id)

    const state = useChatStore.getState()
    expect(state.prompts).toHaveLength(1)
    expect(state.prompts[0].name).toBe('B')
  })

  it('should set and clear draftText', () => {
    const store = useChatStore.getState()
    store.setDraftText('Hello from prompt')
    expect(useChatStore.getState().draftText).toBe('Hello from prompt')

    store.clearDraftText()
    expect(useChatStore.getState().draftText).toBeNull()
  })

  it('should render PromptDialog in create mode', () => {
    render(<PromptDialog onSave={() => {}} onClose={() => {}} />)
    expect(screen.getByText('New Prompt')).toBeInTheDocument()
    expect(screen.getByText('Create')).toBeInTheDocument()
    expect(screen.getByText('Cancel')).toBeInTheDocument()
  })

  it('should render PromptDialog in edit mode', () => {
    render(
      <PromptDialog
        prompt={{ id: 'p1', name: 'Existing', content: 'Existing content' }}
        onSave={() => {}}
        onDelete={() => {}}
        onClose={() => {}}
      />
    )
    expect(screen.getByText('Edit Prompt')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Existing')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Existing content')).toBeInTheDocument()
    expect(screen.getByText('Save')).toBeInTheDocument()
    expect(screen.getByText('Delete')).toBeInTheDocument()
  })

  it('should call onSave with name and content', () => {
    const onSave = vi.fn()
    render(<PromptDialog onSave={onSave} onClose={() => {}} />)

    fireEvent.change(screen.getByPlaceholderText('My prompt'), { target: { value: 'My Prompt' } })
    fireEvent.change(screen.getByPlaceholderText('Write your prompt template here…'), { target: { value: 'My content' } })
    fireEvent.click(screen.getByText('Create'))

    expect(onSave).toHaveBeenCalledOnce()
    expect(onSave).toHaveBeenCalledWith({ name: 'My Prompt', content: 'My content' })
  })
})
