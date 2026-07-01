import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useWebSocket } from '../hooks/useWebSocket'
import { useChatStore } from '../store/useChatStore'

describe('type:session with top-level session/messages (session switch)', () => {
  beforeEach(() => {
    useChatStore.setState({
      messages: [],
      sessionId: null,
      sessionMessages: {},
      sessionStatus: {},
      sessionCwds: {},
      sessionEstimatedTokens: {},
      sessionTotalCost: {},
      sessionUnread: {},
      connectionStatus: 'disconnected',
      isStreaming: false,
      isCancelling: false,
      error: null,
      cwd: null,
      models: [],
      sessions: [],
    })
    localStorage.clear()
  })

  it('should handle type:session with data.messages and data.session and switch sessions', async () => {
    // Set up a current session with messages
    const store = useChatStore.getState()
    store.handleCommandResult('session_create', {
      session: { id: 'sess-a', short_id: 'sess-a', name: 'Session A' },
    })
    store.sendMessage('Message A1')
    store.startAssistantMessage()
    store.appendDelta('Response A1')
    store.finalizeMessage()

    expect(useChatStore.getState().sessionId).toBe('sess-a')
    expect(useChatStore.getState().messages).toHaveLength(2)

    const { result } = renderHook(() => useWebSocket('ws://localhost/ws'))

    await act(async () => {
      await new Promise((r) => setTimeout(r, 1))
    })

    const ws = globalThis.WebSocket.instances.at(-1)

    // Simulate server sending type:session with session and messages at top level
    // (actual server format — no event field)
    act(() => {
      ws.onmessage({
        data: JSON.stringify({
          type: 'session',
          session_id: 'sess-b',
          session: {
            id: 'sess-b',
            short_id: 'sess-b',
            name: 'Session B',
            client_cwd: '/home/project',
          },
          messages: [
            { role: 'user', content: 'Hello from B' },
            { role: 'assistant', content: 'Response from B' },
          ],
        }),
      })
    })

    const state = useChatStore.getState()

    // Session should have switched to sess-b
    expect(state.sessionId).toBe('sess-b')

    // Messages should show sess-b's content
    expect(state.messages).toHaveLength(2)
    expect(state.messages[0].content).toBe('Hello from B')
    expect(state.messages[1].content).toBe('Response from B')

    // sess-a should be cached
    expect(state.sessionMessages['sess-a']).toBeDefined()
    expect(state.sessionMessages['sess-a']).toHaveLength(2)
    expect(state.sessionMessages['sess-a'][0].content).toBe('Message A1')
    expect(state.sessionMessages['sess-a'][1].content).toBe('Response A1')

    // CWD should be updated from session data
    expect(state.cwd).toBe('/home/project')
  })

  it('should switch to empty session via type:session with empty messages', async () => {
    const store = useChatStore.getState()
    store.handleCommandResult('session_create', {
      session: { id: 'sess-old', short_id: 'sess-old', name: 'Old Session' },
    })
    store.sendMessage('Old msg')

    const { result } = renderHook(() => useWebSocket('ws://localhost/ws'))

    await act(async () => {
      await new Promise((r) => setTimeout(r, 1))
    })

    const ws = globalThis.WebSocket.instances.at(-1)

    act(() => {
      ws.onmessage({
        data: JSON.stringify({
          type: 'session',
          session_id: 'sess-new',
          session: {
            id: 'sess-new',
            short_id: 'sess-new',
            name: 'New Session',
          },
          messages: [],
        }),
      })
    })

    const state = useChatStore.getState()
    expect(state.sessionId).toBe('sess-new')
    expect(state.messages).toHaveLength(0)
    expect(state.sessionMessages['sess-old']).toBeDefined()
    expect(state.sessionMessages['sess-old']).toHaveLength(1)
  })

  it('should handle type:session with data.session only (no messages field)', async () => {
    const store = useChatStore.getState()
    store.handleCommandResult('session_create', {
      session: { id: 'sess-a' },
    })

    const { result } = renderHook(() => useWebSocket('ws://localhost/ws'))

    await act(async () => {
      await new Promise((r) => setTimeout(r, 1))
    })

    const ws = globalThis.WebSocket.instances.at(-1)

    // Server sends just the session data without messages
    act(() => {
      ws.onmessage({
        data: JSON.stringify({
          type: 'session',
          session_id: 'sess-b',
          session: { id: 'sess-b', name: 'Session B' },
        }),
      })
    })

    const state = useChatStore.getState()
    expect(state.sessionId).toBe('sess-b')
    expect(state.messages).toHaveLength(0)
  })
})
