import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TokensBar } from '../components/TokensBar'
import { useChatStore } from '../store/useChatStore'

/**
 * Tests the scenario where the user switches to a session that has
 * estimated_context_tokens and total_cost in the session_info response.
 */
describe('TokensBar display after session switch', () => {
  beforeEach(() => {
    useChatStore.setState({
      messages: [],
      sessionId: 'sess-a',
      sessions: [
        { id: 'sess-a', name: 'Session A', model: 'gpt-4o' },
        { id: 'sess-b', name: 'Session B', model: 'claude-3' },
      ],
      sessionEstimatedTokens: {},
      sessionTotalCost: {},
      sessionMessages: {},
    })
  })

  it('should extract tokens from session_info response', () => {
    // Switch from sess-a to sess-b via get_session + session_info
    useChatStore.getState().handleCommandResult('get_session', {
      session: { id: 'sess-b', name: 'Session B', model: 'claude-3' },
      messages: [],
    })

    // Server sends session_info with token/cost data
    useChatStore.getState().handleCommandResult('session_info', {
      session: {
        id: 'sess-b',
        name: 'Session B',
        model: 'claude-3',
        estimated_context_tokens: 42000,
        total_cost: 0.00150,
      },
      _frameSessionId: 'sess-b',
    })

    const { rerender } = render(<TokensBar />)
    expect(screen.getByText('claude-3')).toBeInTheDocument()
    expect(screen.getByText('42000')).toBeInTheDocument()
    expect(screen.getByText('$0.00')).toBeInTheDocument()
  })

  it('should extract tokens from get_session session object', () => {
    // Switch to sess-b where the session object itself has token data
    useChatStore.getState().handleCommandResult('get_session', {
      session: {
        id: 'sess-b',
        name: 'Session B',
        model: 'claude-3',
        estimated_context_tokens: 50000,
        total_cost: 0.00250,
      },
      messages: [],
    })

    const { rerender } = render(<TokensBar />)
    expect(screen.getByText('claude-3')).toBeInTheDocument()
    expect(screen.getByText('50000')).toBeInTheDocument()
    expect(screen.getByText('$0.00')).toBeInTheDocument()
  })

  it('should show tokens and cost after complete switch flow', () => {
    // Simulate the full flow:
    // 1. Session A has tokens from streaming
    useChatStore.getState().setEstimatedContextTokens(1000, 'sess-a')
    useChatStore.getState().setTotalCost(0.01, 'sess-a')

    const { rerender } = render(<TokensBar />)
    expect(screen.getByText('1000')).toBeInTheDocument()
    expect(screen.getByText('$0.01')).toBeInTheDocument()

    // 2. Switch to session B via get_session with events
    useChatStore.getState().handleCommandResult('get_session', {
      session: { id: 'sess-b', name: 'Session B', model: 'claude-3' },
      events: [
        { type: 'chat', text: 'Hello' },
        { type: 'delta', text: 'Hi' },
        { type: 'usage', estimated_context_tokens: 42000, total_cost: 0.00150 },
        { type: 'done' },
      ],
    })

    rerender(<TokensBar />)

    // TokensBar should now show B's tokens
    expect(screen.getByText('42000')).toBeInTheDocument()
    expect(screen.getByText('$0.00')).toBeInTheDocument()
    expect(screen.getByText('claude-3')).toBeInTheDocument()
    expect(screen.queryByText('1000')).not.toBeInTheDocument()
  })
})
