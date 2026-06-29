import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useWebSocket } from '../hooks/useWebSocket'
import { useChatStore } from '../store/useChatStore'

describe('useWebSocket', () => {
  beforeEach(() => {
    useChatStore.setState({
      messages: [],
      sessionId: null,
      sessionEstimatedTokens: {},
      connectionStatus: 'disconnected',
      isStreaming: false,
      isCancelling: false,
      error: null,
      cwd: null,
      models: [],
    })
  })

  it('should return send, execute and cancel functions', () => {
    const { result } = renderHook(() => useWebSocket('ws://localhost/ws'))
    expect(result.current.send).toBeDefined()
    expect(result.current.execute).toBeDefined()
    expect(result.current.cancel).toBeDefined()
    expect(typeof result.current.send).toBe('function')
    expect(typeof result.current.execute).toBe('function')
    expect(typeof result.current.cancel).toBe('function')
  })

  it('should send cwd in payload', async () => {
    useChatStore.setState({ cwd: '/my/project' })
    const { result } = renderHook(() => useWebSocket('ws://localhost/ws'))

    await act(async () => {
      await new Promise((r) => setTimeout(r, 1))
    })

    await act(async () => {
      result.current.send(null, 'hello')
    })

    const ws = globalThis.WebSocket.instances.at(-1)
    const sendCalls = ws.send.mock.calls
    const helloCall = sendCalls.find((c) => JSON.parse(c[0]).input === 'hello')
    expect(helloCall).toBeDefined()
    const sent = JSON.parse(helloCall[0])
    expect(sent.cwd).toBe('/my/project')
  })

  it('should add user message to store when sending', async () => {
    const { result } = renderHook(() => useWebSocket('ws://localhost/ws'))

    await act(async () => {
      await new Promise((r) => setTimeout(r, 1))
    })

    await act(async () => {
      result.current.send(null, 'Hello world')
    })

    const state = useChatStore.getState()
    expect(state.messages).toHaveLength(1)
    expect(state.messages[0].content).toBe('Hello world')
    expect(state.messages[0].role).toBe('user')
  })

  it('should set isStreaming=true immediately when sending, before server response', async () => {
    const { result } = renderHook(() => useWebSocket('ws://localhost/ws'))

    await act(async () => {
      await new Promise((r) => setTimeout(r, 1))
    })

    expect(useChatStore.getState().isStreaming).toBe(false)

    await act(async () => {
      result.current.send(null, 'Hello')
    })

    expect(useChatStore.getState().isStreaming).toBe(true)
  })

  it('should clear isStreaming when streaming completes', async () => {
    useChatStore.setState({
      messages: [
        { id: 'user-1', role: 'user', content: 'Hello' },
      ],
    })
    const { result } = renderHook(() => useWebSocket('ws://localhost/ws'))

    await act(async () => {
      await new Promise((r) => setTimeout(r, 1))
    })

    const ws = globalThis.WebSocket.instances.at(-1)

    await act(async () => {
      result.current.send(null, 'Hi')
    })
    expect(useChatStore.getState().isStreaming).toBe(true)

    act(() => { ws.onmessage({ data: JSON.stringify({ delta: 'Hello' }) }) })
    expect(useChatStore.getState().isStreaming).toBe(true)

    act(() => { ws.onmessage({ data: JSON.stringify({ done: true }) }) })

    expect(useChatStore.getState().isStreaming).toBe(false)
  })

  it('should send structured command frames via execute (without cwd)', async () => {
    useChatStore.setState({ cwd: '/my/project' })
    const { result } = renderHook(() => useWebSocket('ws://localhost/ws'))

    await act(async () => {
      await new Promise((r) => setTimeout(r, 1))
    })

    await act(async () => {
      result.current.execute('session_list', {})
    })

    const ws = globalThis.WebSocket.instances.at(-1)
    const sendCalls = ws.send.mock.calls
    const execCall = sendCalls.find((c) => {
      const p = JSON.parse(c[0])
      return p.command && p.command.cmd === 'session_list'
    })
    expect(execCall).toBeDefined()
    const sent = JSON.parse(execCall[0])
    expect(sent.command.cmd).toBe('session_list')
    expect(sent.command.params).toEqual({})
    expect(sent.cwd).toBeUndefined()
  })

  it('should not show execute commands in chat', async () => {
    const { result } = renderHook(() => useWebSocket('ws://localhost/ws'))

    await act(async () => {
      await new Promise((r) => setTimeout(r, 1))
    })

    await act(async () => {
      result.current.execute('session_list', {})
    })

    const state = useChatStore.getState()
    expect(state.messages).toHaveLength(0)
  })

  it('should send a cancel frame via cancel()', async () => {
    useChatStore.setState({ sessionId: 'test-session' })
    const { result } = renderHook(() => useWebSocket('ws://localhost/ws'))

    await act(async () => {
      await new Promise((r) => setTimeout(r, 1))
    })

    await act(async () => {
      result.current.cancel('test-session')
    })

    const ws = globalThis.WebSocket.instances.at(-1)
    const sendCalls = ws.send.mock.calls
    const cancelCall = sendCalls.find((c) => {
      const p = JSON.parse(c[0])
      return p.type === 'cancel'
    })
    expect(cancelCall).toBeDefined()
    const sent = JSON.parse(cancelCall[0])
    expect(sent.type).toBe('cancel')
    expect(sent.session_id).toBe('test-session')
  })

  it('should set isCancelling when cancel() is called', async () => {
    useChatStore.setState({ sessionId: 'sess-1' })
    const { result } = renderHook(() => useWebSocket('ws://localhost/ws'))

    await act(async () => {
      await new Promise((r) => setTimeout(r, 1))
    })

    await act(async () => {
      result.current.cancel('sess-1')
    })

    const state = useChatStore.getState()
    expect(state.isCancelling).toBe(true)
  })

  it('should handle cancel event response from server', async () => {
    useChatStore.setState({ isStreaming: true, isCancelling: false })
    const { result } = renderHook(() => useWebSocket('ws://localhost/ws'))

    await act(async () => {
      await new Promise((r) => setTimeout(r, 1))
    })

    const ws = globalThis.WebSocket.instances.at(-1)

    act(() => {
      ws.onmessage({
        data: JSON.stringify({
          event: 'cancel',
          session_id: 'sess-1',
          data: { cancelled: true },
        }),
      })
    })

    const state = useChatStore.getState()
    expect(state.isCancelling).toBe(false)
    expect(state.isStreaming).toBe(false)
  })

  it('should extract estimated_context_tokens from meta events', async () => {
    const { result } = renderHook(() => useWebSocket('ws://localhost/ws'))

    await act(async () => {
      await new Promise((r) => setTimeout(r, 1))
    })

    const ws = globalThis.WebSocket.instances.at(-1)
    useChatStore.setState({ isStreaming: true, sessionId: 'sess-1' })

    expect(useChatStore.getState().sessionEstimatedTokens).toEqual({})

    act(() => {
      ws.onmessage({
        data: JSON.stringify({
          event: 'meta',
          session_id: 'sess-1',
          data: { estimated_context_tokens: 12345 },
        }),
      })
    })

    const state = useChatStore.getState()
    expect(state.sessionEstimatedTokens['sess-1']).toBe(12345)
    // Other state should be unchanged
    expect(state.isStreaming).toBe(true)
    expect(state.error).toBeNull()
  })

  it('should ignore other meta events (token usage without estimated_context_tokens)', async () => {
    const { result } = renderHook(() => useWebSocket('ws://localhost/ws'))

    await act(async () => {
      await new Promise((r) => setTimeout(r, 1))
    })

    const ws = globalThis.WebSocket.instances.at(-1)
    useChatStore.setState({ isStreaming: true, sessionId: 'sess-1' })
    useChatStore.getState().setEstimatedContextTokens(500, 'sess-1')

    act(() => {
      ws.onmessage({
        data: JSON.stringify({
          event: 'meta',
          session_id: 'sess-1',
          data: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
        }),
      })
    })

    // sessionEstimatedTokens should remain unchanged
    const state = useChatStore.getState()
    expect(state.sessionEstimatedTokens['sess-1']).toBe(500)
    expect(state.isStreaming).toBe(true)
    expect(state.error).toBeNull()
  })

  it('should respond to vim_request with unsupported error', async () => {
    const { result } = renderHook(() => useWebSocket('ws://localhost/ws'))

    await act(async () => {
      await new Promise((r) => setTimeout(r, 1))
    })

    const ws = globalThis.WebSocket.instances.at(-1)

    act(() => {
      ws.onmessage({
        data: JSON.stringify({
          event: 'vim_request',
          session_id: 'sess-1',
          vim_request: {
            request_id: 'req-123',
            command: 'read_file',
          },
        }),
      })
    })

    // Should send a response with unsupported error
    const sendCalls = ws.send.mock.calls
    const responseCall = sendCalls.find((c) => {
      const p = JSON.parse(c[0])
      return p.type === 'response' && p.request_id === 'req-123'
    })
    expect(responseCall).toBeDefined()
    const sent = JSON.parse(responseCall[0])
    expect(sent.type).toBe('response')
    expect(sent.request_id).toBe('req-123')
    expect(sent.error).toBe('unsupported')
  })

  it('should respond to client_request with unsupported error', async () => {
    const { result } = renderHook(() => useWebSocket('ws://localhost/ws'))

    await act(async () => {
      await new Promise((r) => setTimeout(r, 1))
    })

    const ws = globalThis.WebSocket.instances.at(-1)

    act(() => {
      ws.onmessage({
        data: JSON.stringify({
          event: 'client_request',
          session_id: 'sess-1',
          client_request: {
            request_id: 'req-456',
            action: 'nvim_exec',
          },
        }),
      })
    })

    // Should send a response with unsupported error
    const sendCalls = ws.send.mock.calls
    const responseCall = sendCalls.find((c) => {
      const p = JSON.parse(c[0])
      return p.type === 'response' && p.request_id === 'req-456'
    })
    expect(responseCall).toBeDefined()
    const sent = JSON.parse(responseCall[0])
    expect(sent.type).toBe('response')
    expect(sent.request_id).toBe('req-456')
    expect(sent.error).toBe('unsupported')
  })

  it('should append final output when assistant message already exists (non-stream path)', async () => {
    useChatStore.setState({
      sessionId: 'sess-1',
      messages: [
        { id: 'user-1', role: 'user', content: 'Hello' },
      ],
    })
    const { result } = renderHook(() => useWebSocket('ws://localhost/ws'))

    await act(async () => {
      await new Promise((r) => setTimeout(r, 1))
    })

    const ws = globalThis.WebSocket.instances.at(-1)

    // Tool event creates an empty assistant message
    act(() => {
      ws.onmessage({ data: JSON.stringify({ event: 'tool', tool: 'shell', status: 'ok' }) })
    })

    let state = useChatStore.getState()
    expect(state.messages).toHaveLength(2)
    expect(state.messages[1].role).toBe('assistant')
    expect(state.messages[1].content).toBe('')

    // Non-stream output with done — should append to the existing assistant msg
    act(() => {
      ws.onmessage({ data: JSON.stringify({ output: 'Done!', done: true }) })
    })

    state = useChatStore.getState()
    expect(state.messages).toHaveLength(2)
    expect(state.messages[1].content).toBe('Done!')
    expect(state.isStreaming).toBe(false)
  })

  it('should handle non-stream output without prior assistant message', async () => {
    useChatStore.setState({
      sessionId: 'sess-1',
      messages: [
        { id: 'user-1', role: 'user', content: 'Hello' },
      ],
    })
    const { result } = renderHook(() => useWebSocket('ws://localhost/ws'))

    await act(async () => {
      await new Promise((r) => setTimeout(r, 1))
    })

    const ws = globalThis.WebSocket.instances.at(-1)

    // Non-stream: just one frame with output + done
    act(() => {
      ws.onmessage({ data: JSON.stringify({ output: 'Complete response', done: true }) })
    })

    const state = useChatStore.getState()
    expect(state.messages).toHaveLength(2)
    expect(state.messages[1].content).toBe('Complete response')
    expect(state.isStreaming).toBe(false)
  })

  it('should skip output when streaming deltas were received (preserves tool markers)', async () => {
    useChatStore.setState({
      sessionId: 'sess-1',
      messages: [
        { id: 'user-1', role: 'user', content: 'Hello' },
      ],
    })
    const { result } = renderHook(() => useWebSocket('ws://localhost/ws'))

    await act(async () => {
      await new Promise((r) => setTimeout(r, 1))
    })

    const ws = globalThis.WebSocket.instances.at(-1)

    // Receive stream deltas (these use the active session_id)
    act(() => { ws.onmessage({ data: JSON.stringify({ delta: 'Hello ', session_id: 'sess-1' }) }) })
    act(() => { ws.onmessage({ data: JSON.stringify({ delta: 'world', session_id: 'sess-1' }) }) })

    let state = useChatStore.getState()
    expect(state.messages[1].content).toBe('Hello world')

    // The frame below has both output AND done — since we already received
    // streaming deltas, the output should be skipped (accumulated content
    // with tool markers is preserved).
    act(() => {
      ws.onmessage({ data: JSON.stringify({ output: 'should not appear', done: true, session_id: 'sess-1' }) })
    })

    state = useChatStore.getState()
    // Content should remain 'Hello world' — the output was skipped, preserving any
    // \x00TOOL:N\x00 markers that tool events may have added during streaming
    expect(state.messages[1].content).toBe('Hello world')
    expect(state.isStreaming).toBe(false)
  })

  it('should handle get_session via command_result and persist last session', async () => {
    useChatStore.setState({
      sessionId: 'sess-1',
      messages: [
        { id: 'user-1', role: 'user', content: 'Hello from sess-1' },
        { id: 'assist-1', role: 'assistant', content: 'Response from sess-1' },
      ],
    })
    const { result } = renderHook(() => useWebSocket('ws://localhost/ws'))

    await act(async () => {
      await new Promise((r) => setTimeout(r, 1))
    })

    const ws = globalThis.WebSocket.instances.at(-1)

    // Simulate receiving command_result for get_session
    act(() => {
      ws.onmessage({
        data: JSON.stringify({
          event: 'command_result',
          cmd: 'get_session',
          session_id: 'sess-1',
          data: {
            session: { id: 'sess-2', short_id: 'sess-2', name: 'New Session' },
            messages: [{ role: 'user', content: 'Hello from sess-2' }],
          },
        }),
      })
    })

    const state = useChatStore.getState()
    // Session should be switched
    expect(state.sessionId).toBe('sess-2')
    expect(state.messages).toHaveLength(1)
    expect(state.messages[0].content).toBe('Hello from sess-2')
    // sess-1 messages should be cached
    expect(state.sessionMessages['sess-1']).toHaveLength(2)
    // last session should be persisted
    expect(localStorage.getItem('hakka_last_session_id')).toBe('sess-2')
    expect(localStorage.getItem('hakka_pending_session')).toBeNull()
  })

  it('should skip output after session switch while streaming (preserves tool markers)', async () => {
    useChatStore.setState({
      sessionId: 'sess-1',
      messages: [
        { id: 'user-1', role: 'user', content: 'Hello' },
      ],
    })
    const { result } = renderHook(() => useWebSocket('ws://localhost/ws'))

    await act(async () => {
      await new Promise((r) => setTimeout(r, 1))
    })

    const ws = globalThis.WebSocket.instances.at(-1)

    // Start streaming in sess-1
    act(() => { ws.onmessage({ data: JSON.stringify({ delta: 'part1 ', session_id: 'sess-1' }) }) })
    let state = useChatStore.getState()
    expect(state.messages[1].content).toBe('part1 ')

    // Session switch to sess-2 via command_result (get_session)
    act(() => {
      ws.onmessage({
        data: JSON.stringify({
          event: 'command_result',
          cmd: 'get_session',
          session_id: 'sess-1',
          data: {
            session: { id: 'sess-2', short_id: 'sess-2', name: '' },
            messages: [],
          },
        }),
      })
    })

    state = useChatStore.getState()
    expect(state.sessionId).toBe('sess-2')
    expect(state.messages).toHaveLength(0)

    // Now sess-1's TurnFinished arrives with output+done
    // Since deltas were received for sess-1, the output should be skipped
    // to preserve the accumulated content with tool markers
    act(() => {
      ws.onmessage({ data: JSON.stringify({ output: 'should not double', done: true, session_id: 'sess-1' }) })
    })

    state = useChatStore.getState()
    expect(state.messages).toHaveLength(0)
    // sess-1's cached messages should keep the accumulated deltas (with tool markers)
    expect(state.sessionMessages['sess-1'][1].content).toBe('part1 ')
    expect(state.isStreaming).toBe(false)
  })

  it('should format tool_list command result as assistant message', async () => {
    useChatStore.setState({
      sessionId: 'sess-1',
      messages: [
        { id: 'user-1', role: 'user', content: '/tool list' },
      ],
    })
    const { result } = renderHook(() => useWebSocket('ws://localhost/ws'))

    await act(async () => {
      await new Promise((r) => setTimeout(r, 1))
    })

    const ws = globalThis.WebSocket.instances.at(-1)

    // Simulate receiving a command_result for tool_list
    // (triggered by execute('tool_list', {}) from parseSlashCommand)
    act(() => {
      ws.onmessage({
        data: JSON.stringify({
          event: 'command_result',
          cmd: 'tool_list',
          session_id: 'sess-1',
          data: {
            tools: [
              { name: 'read_file', enabled: true, tags: ['file'] },
              { name: 'shell', enabled: false, tags: ['system'] },
            ],
          },
        }),
      })
    })

    const state = useChatStore.getState()
    // isStreaming was never set (execute doesn't set it)
    expect(state.isStreaming).toBe(false)
    // An assistant message with the tool list should be appended
    const lastMsg = state.messages[state.messages.length - 1]
    expect(lastMsg.role).toBe('assistant')
    expect(lastMsg.content).toContain('read_file')
    expect(lastMsg.content).toContain('shell')
    expect(lastMsg.content).toContain('Available tools')
    // User message should still be there
    expect(state.messages[0].content).toBe('/tool list')
  })

  it('should update session name on session_autorename push event', async () => {
    useChatStore.setState({
      sessions: [
        { id: 'sess-1', name: 'old-name' },
        { id: 'sess-2', name: 'other' },
      ],
    })
    const { result } = renderHook(() => useWebSocket('ws://localhost/ws'))

    await act(async () => {
      await new Promise((r) => setTimeout(r, 1))
    })

    const ws = globalThis.WebSocket.instances.at(-1)

    act(() => {
      ws.onmessage({ data: JSON.stringify({
        event: 'session_autorename',
        session_id: 'sess-1',
        data: {
          session: { id: 'sess-1', name: 'Auto Renamed Session' },
        },
      }) })
    })

    const state = useChatStore.getState()
    const renamed = state.sessions.find(s => s.id === 'sess-1')
    expect(renamed).toBeDefined()
    expect(renamed.name).toBe('Auto Renamed Session')
    // Other sessions should be unchanged
    const other = state.sessions.find(s => s.id === 'sess-2')
    expect(other.name).toBe('other')
  })

  it('should update session name on session_renamed event', async () => {
    useChatStore.setState({
      sessions: [
        { id: 'sess-1', name: 'old-name' },
        { id: 'sess-2', name: 'other' },
      ],
    })
    const { result } = renderHook(() => useWebSocket('ws://localhost/ws'))

    await act(async () => {
      await new Promise((r) => setTimeout(r, 1))
    })

    const ws = globalThis.WebSocket.instances.at(-1)

    act(() => {
      ws.onmessage({ data: JSON.stringify({
        event: 'session_renamed',
        session_id: 'sess-1',
        data: {
          session_id: 'sess-1',
          old_name: 'old-name',
          name: 'New Session Name',
        },
      }) })
    })

    const state = useChatStore.getState()
    const renamed = state.sessions.find(s => s.id === 'sess-1')
    expect(renamed).toBeDefined()
    expect(renamed.name).toBe('New Session Name')
    // Other sessions should be unchanged
    const other = state.sessions.find(s => s.id === 'sess-2')
    expect(other.name).toBe('other')
  })
})
