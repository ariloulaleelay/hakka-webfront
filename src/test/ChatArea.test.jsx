import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
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

  it('should show a copy button on user messages that copies raw markdown to clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      writable: true,
      configurable: true,
    })

    useChatStore.setState({
      messages: [
        { id: '1', role: 'user', content: 'Hello **world**!', timestamp: 1000 },
      ],
    })
    render(<ChatArea />)
    const copyBtn = screen.getByTitle('Copy markdown')
    expect(copyBtn).toBeInTheDocument()
    // Default state shows IconCopy
    expect(copyBtn.querySelector('svg')).toBeInTheDocument()

    fireEvent.click(copyBtn)

    expect(writeText).toHaveBeenCalledWith('Hello **world**!')
    // After click, button gets --copied class and shows IconCheck (green check)
    await waitFor(() => {
      expect(copyBtn).toHaveClass('message__copy-btn--copied')
    })
  })

  it('should show a copy button on assistant messages that copies raw markdown to clipboard', () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      writable: true,
      configurable: true,
    })

    useChatStore.setState({
      messages: [
        {
          id: '2',
          role: 'assistant',
          content: 'Here is some `code` and **bold**',
          timestamp: 1001,
          toolCalls: [],
        },
      ],
    })
    render(<ChatArea />)
    const copyBtn = screen.getByTitle('Copy markdown')
    expect(copyBtn).toBeInTheDocument()

    fireEvent.click(copyBtn)
    expect(writeText).toHaveBeenCalledWith('Here is some `code` and **bold**')
  })

  it('should strip tool call markers when copying assistant message with tool calls', () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      writable: true,
      configurable: true,
    })

    useChatStore.setState({
      messages: [
        {
          id: '2',
          role: 'assistant',
          content: 'I\'ll read that file.\x00TOOL:0\x00Here\'s what I found:\n\n**Important**',
          timestamp: 1001,
          toolCalls: [
            { tool: 'read_file', status: 'ok', exec_snippet: '/tmp/x.txt', timestamp: 1003 },
          ],
        },
      ],
    })
    render(<ChatArea />)
    const copyBtn = screen.getByTitle('Copy markdown')

    fireEvent.click(copyBtn)
    // Tool call markers should be replaced with a single \n\n separator
    expect(writeText).toHaveBeenCalledWith("I'll read that file.\n\nHere's what I found:\n\n**Important**")
  })

  it('should collapse consecutive tool markers into a single separator', () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      writable: true,
      configurable: true,
    })

    useChatStore.setState({
      messages: [
        {
          id: '2',
          role: 'assistant',
          content: 'text1\n\x00TOOL:0\x00\n\x00TOOL:1\x00\n\x00TOOL:2\x00\n\x00TOOL:3\x00\n\ntext2',
          timestamp: 1001,
          toolCalls: [
            { tool: 'read_file', status: 'ok', exec_snippet: '/tmp/x.txt', timestamp: 1003 },
            { tool: 'shell', status: 'ok', exec_snippet: 'ls -la', timestamp: 1004 },
            { tool: 'grep', status: 'ok', exec_snippet: 'grep foo', timestamp: 1005 },
            { tool: 'write_file', status: 'ok', exec_snippet: '/tmp/y.txt', timestamp: 1006 },
          ],
        },
      ],
    })
    render(<ChatArea />)
    const copyBtn = screen.getByTitle('Copy markdown')

    fireEvent.click(copyBtn)
    // Multiple consecutive tool markers should collapse to a single \n\n
    expect(writeText).toHaveBeenCalledWith('text1\n\ntext2')
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

  describe('timestamp display', () => {
    it('should show ISO time for today\'s messages', () => {
      const now = Date.now()
      useChatStore.setState({
        messages: [
          { id: '1', role: 'user', content: 'Hello!', timestamp: now },
        ],
      })
      render(<ChatArea />)

      const timeElements = document.querySelectorAll('.message__time')
      expect(timeElements.length).toBe(1)
      // Today's messages show just the time in ISO format (e.g. "14:34:22")
      expect(timeElements[0].textContent).toMatch(/^\d{2}:\d{2}:\d{2}$/)
    })

    it('should show ISO date + time for older messages', () => {
      // Timestamp for 2020-06-15 10:30 UTC — definitely not today
      const ts = new Date('2020-06-15T10:30:00Z').getTime()
      useChatStore.setState({
        messages: [
          {
            id: '2',
            role: 'assistant',
            content: 'Hi there!',
            timestamp: ts,
            toolCalls: [],
          },
        ],
      })
      render(<ChatArea />)

      const timeElements = document.querySelectorAll('.message__time')
      expect(timeElements.length).toBe(1)
      // Non-today — should show ISO date + time with seconds
      expect(timeElements[0].textContent).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
    })

    it('should not show time when timestamp is missing', () => {
      useChatStore.setState({
        messages: [
          { id: '1', role: 'user', content: 'Hello!', timestamp: undefined },
        ],
      })
      render(<ChatArea />)

      const timeElements = document.querySelectorAll('.message__time')
      expect(timeElements.length).toBe(0)
    })

    it('should render time in every bubble', () => {
      const now = Date.now()
      useChatStore.setState({
        messages: [
          { id: '1', role: 'user', content: 'Hey', timestamp: now },
          { id: '2', role: 'assistant', content: 'Hello', timestamp: now, toolCalls: [] },
        ],
      })
      render(<ChatArea />)

      const timeElements = document.querySelectorAll('.message__time')
      expect(timeElements.length).toBe(2)
    })
  })
})
