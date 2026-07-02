import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from '../App'
import { useChatStore } from '../store/useChatStore'

describe('App', () => {
  beforeEach(() => {
    useChatStore.setState({
      messages: [],
      sessionId: null,
      sessions: [],
      connectionStatus: 'disconnected',
      isStreaming: false,
      error: null,
    })
  })

  it('should render the sidebar with title', () => {
    render(<App />)
    expect(screen.getByText('Hakka')).toBeInTheDocument()
  })

  it('should show a sidebar with "Sessions" section', () => {
    render(<App />)
    expect(screen.getByText('Sessions')).toBeInTheDocument()
  })

  it('should show CWD bar', () => {
    render(<App />)
    expect(screen.getByText('CWD')).toBeInTheDocument()
  })

  it('should show the input bar', () => {
    render(<App />)
    expect(screen.getByPlaceholderText(/type a message/i)).toBeInTheDocument()
  })

  it('should have input bar in the header (top panel)', () => {
    const { container } = render(<App />)
    const header = container.querySelector('.app__header')
    expect(header).toBeInTheDocument()
    expect(header.querySelector('.input-bar')).toBeInTheDocument()
  })

  it('should have CWD and tokens info in the footer (bottom panel)', () => {
    const { container } = render(<App />)
    const footer = container.querySelector('.app__footer')
    expect(footer).toBeInTheDocument()
    expect(footer.querySelector('.cwd-bar')).toBeInTheDocument()
  })

  it('should show error banner when there is an error', () => {
    useChatStore.setState({ error: 'Connection lost' })
    render(<App />)
    expect(screen.getByText('Connection lost')).toBeInTheDocument()
  })

  it('should show empty state when no messages', () => {
    render(<App />)
    expect(screen.getByText(/no messages/i)).toBeInTheDocument()
  })

  it('should show a new session button', () => {
    render(<App />)
    expect(screen.getByTitle('New session')).toBeInTheDocument()
  })
})
