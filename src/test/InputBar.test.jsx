import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { InputBar } from '../components/InputBar'
import { useChatStore } from '../store/useChatStore'

describe('InputBar', () => {
  beforeEach(() => {
    useChatStore.setState({
      messages: [],
      isStreaming: false,
      isCancelling: false,
      connectionStatus: 'connected',
    })
  })

  it('should render input field', () => {
    render(<InputBar />)
    expect(screen.getByPlaceholderText(/type a message/i)).toBeInTheDocument()
    // No Send button — removed per UX decision
    expect(screen.queryByRole('button', { name: /send/i })).not.toBeInTheDocument()
  })

  it('should send a message on Enter', () => {
    const onSend = vi.fn()
    render(<InputBar onSend={onSend} />)

    const input = screen.getByPlaceholderText(/type a message/i)
    fireEvent.change(input, { target: { value: 'Hello Hakka!' } })
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: false })

    expect(onSend).toHaveBeenCalledWith('Hello Hakka!')
  })

  it('should not send empty message', () => {
    const onSend = vi.fn()
    render(<InputBar onSend={onSend} />)

    const input = screen.getByPlaceholderText(/type a message/i)
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: false })

    expect(onSend).not.toHaveBeenCalled()
  })

  it('should send on Enter (without Shift)', () => {
    const onSend = vi.fn()
    render(<InputBar onSend={onSend} />)

    const input = screen.getByPlaceholderText(/type a message/i)
    fireEvent.change(input, { target: { value: 'Hello' } })
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: false })

    expect(onSend).toHaveBeenCalledWith('Hello')
  })

  it('should not send on Shift+Enter', () => {
    const onSend = vi.fn()
    render(<InputBar onSend={onSend} />)

    const input = screen.getByPlaceholderText(/type a message/i)
    fireEvent.change(input, { target: { value: 'Hello' } })
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })

    expect(onSend).not.toHaveBeenCalled()
  })

  it('should clear input after sending', () => {
    const onSend = vi.fn()
    render(<InputBar onSend={onSend} />)

    const input = screen.getByPlaceholderText(/type a message/i)
    fireEvent.change(input, { target: { value: 'Hello' } })
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: false })

    expect(input).toHaveValue('')
  })

  it('should be disabled while streaming', () => {
    useChatStore.setState({ isStreaming: true })
    const onSend = vi.fn()
    render(<InputBar onSend={onSend} />)

    const input = screen.getByPlaceholderText(/type a message/i)
    expect(input).toBeDisabled()

    // Cancel button is shown instead of the old Send button
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
  })

  it('should show cancel button when streaming', () => {
    useChatStore.setState({ isStreaming: true })
    render(<InputBar />)

    const cancelBtn = screen.getByRole('button', { name: /cancel request/i })
    expect(cancelBtn).toBeInTheDocument()
  })

  it('should call onCancel when cancel button is clicked', () => {
    useChatStore.setState({ isStreaming: true })
    const onCancel = vi.fn()
    render(<InputBar onCancel={onCancel} />)

    const cancelBtn = screen.getByRole('button', { name: /cancel request/i })
    fireEvent.click(cancelBtn)

    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('should show cancelling state while cancelling', () => {
    useChatStore.setState({ isStreaming: true, isCancelling: true })
    const onCancel = vi.fn()
    render(<InputBar onCancel={onCancel} />)

    const cancelBtn = screen.getByRole('button', { name: /cancel request/i })
    expect(cancelBtn).toBeDisabled() // disabled while cancelling
  })
})
