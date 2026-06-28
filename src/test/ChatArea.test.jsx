import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ChatArea } from '../components/ChatArea'
import { useChatStore } from '../store/useChatStore'

describe('ChatArea', () => {
  beforeEach(() => {
    useChatStore.setState({ messages: [] })
  })

  it('should show empty state', () => {
    render(<ChatArea />)
    expect(screen.getByText(/no messages/i)).toBeInTheDocument()
  })

  it('should render user and assistant messages', () => {
    useChatStore.setState({
      messages: [
        { id: '1', role: 'user', content: 'Hello!', timestamp: 1000 },
        { id: '2', role: 'assistant', content: 'Hi there!', timestamp: 1001, toolCalls: [] },
      ],
    })
    render(<ChatArea />)
    expect(screen.getByText('Hello!')).toBeInTheDocument()
    expect(screen.getByText('Hi there!')).toBeInTheDocument()
  })

  it('should render partial content while streaming', () => {
    useChatStore.setState({
      messages: [
        { id: '1', role: 'user', content: 'Count to 3', timestamp: 1000 },
        { id: '2', role: 'assistant', content: '1, 2', timestamp: 1001, toolCalls: [] },
      ],
      isStreaming: true,
    })
    render(<ChatArea />)
    expect(screen.getByText('1, 2')).toBeInTheDocument()
  })

  it('should render tool call events', () => {
    useChatStore.setState({
      messages: [
        { id: '1', role: 'user', content: 'Read file', timestamp: 1000 },
        {
          id: '2',
          role: 'assistant',
          content: 'Reading...',
          timestamp: 1001,
          toolCalls: [
            { tool: 'read_file', status: 'ok', exec_snippet: 'read_file /tmp/x.txt', timestamp: 1003 },
          ],
        },
      ],
    })
    render(<ChatArea />)
    // The tool call renders as "tool_name snippet" — look for the tool call element
    const toolElements = screen.getAllByText(/read_file/)
    expect(toolElements.length).toBeGreaterThanOrEqual(1)
  })

  it('should scroll to bottom instantly (not smoothly) when messages change', () => {
    // In jsdom, scrollIntoView doesn't exist by default
    const scrollIntoView = vi.fn()
    const origScrollIntoView = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = scrollIntoView

    // Initial render with no messages — empty state, no ref div, scrollIntoView not called
    const { rerender } = render(<ChatArea />)
    expect(scrollIntoView).toHaveBeenCalledTimes(0)

    // Add a message — ref div appears, scrollIntoView called instantly
    useChatStore.setState({
      messages: [
        { id: '1', role: 'user', content: 'First message', timestamp: 1001 },
      ],
    })
    rerender(<ChatArea />)

    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    // Should be called with no arguments (instant, not { behavior: 'smooth' })
    expect(scrollIntoView).toHaveBeenLastCalledWith()

    Element.prototype.scrollIntoView = origScrollIntoView
  })
})
