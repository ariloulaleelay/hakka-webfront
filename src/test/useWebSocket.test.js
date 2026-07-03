import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useWebSocket } from '../hooks/useWebSocket'
import { useChatStore } from '../store/useChatStore'

describe('useWebSocket v2 protocol', () => {
  beforeEach(() => {
    useChatStore.setState({
      messages: [],
      sessionId: null,
      sessionEstimatedTokens: {},
      sessionTotalCost: {},
      connectionStatus: 'disconnected',
      isStreaming: false,
      isCancelling: false,
      error: null,
      cwd: null,
      models: [],
      sessions: [],
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

  it('should send chat messages with type:"chat" and no cwd', async () => {
    const { result } = renderHook(() => useWebSocket('ws://localhost/ws'))

    await act(async () => {
      await new Promise((r) => setTimeout(r, 1))
    })

    await act(async () => {
      result.current.send(null, 'hello')
    })

    const ws = globalThis.WebSocket.instances.at(-1)
    const sendCalls = ws.send.mock.calls
    const helloCall = sendCalls.find((c) => {
      const p = JSON.parse(c[0])
      return p.input === 'hello'
    })
    expect(helloCall).toBeDefined()
    const sent = JSON.parse(helloCall[0])
    expect(sent.type).toBe('chat')
    expect(sent.input).toBe('hello')
    // cwd should NOT be in the payload anymore
    expect(sent.cwd).toBeUndefined()
  })

  it('should not send session_list on connect (server pushes welcome)', async () => {
    const { result } = renderHook(() => useWebSocket('ws://localhost/ws'))

    await act(async () => {
      await new Promise((r) => setTimeout(r, 1))
    })

    const ws = globalThis.WebSocket.instances.at(-1)
    const sendCalls = ws.send.mock.calls
    // No session_list command should be sent automatically
    const sessionListCall = sendCalls.find((c) => {
      const p = JSON.parse(c[0])
      return p.command && p.command.cmd === 'session_list'
    })
    expect(sessionListCall).toBeUndefined()
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

  it('should clear isStreaming when done frame arrives', async () => {
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

    await act(async () => {
      result.current.send(null, 'Hi')
    })
    expect(useChatStore.getState().isStreaming).toBe(true)

    // v2: delta frame uses type and text
    act(() => { ws.onmessage({ data: JSON.stringify({ type: 'delta', session_id: 'sess-1', text: 'Hello' }) }) })
    expect(useChatStore.getState().isStreaming).toBe(true)

    // v2: done is its own terminal frame
    act(() => { ws.onmessage({ data: JSON.stringify({ type: 'done', session_id: 'sess-1', stats: {} }) }) })

    expect(useChatStore.getState().isStreaming).toBe(false)
  })

  it('should send structured command frames via execute with type:"cmd"', async () => {
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
    expect(sent.type).toBe('cmd')
    expect(sent.command.cmd).toBe('session_list')
    expect(sent.command.params).toEqual({})
    // cwd should NOT be in command frames
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

  it('should handle done frame with cancelled:true', async () => {
    useChatStore.setState({ isStreaming: true, isCancelling: false, sessionId: 'sess-1' })
    const { result } = renderHook(() => useWebSocket('ws://localhost/ws'))

    await act(async () => {
      await new Promise((r) => setTimeout(r, 1))
    })

    const ws = globalThis.WebSocket.instances.at(-1)

    // v2: cancel response is a done frame with cancelled:true
    act(() => {
      ws.onmessage({
        data: JSON.stringify({
          type: 'done',
          session_id: 'sess-1',
          cancelled: true,
          stats: {},
        }),
      })
    })

    const state = useChatStore.getState()
    expect(state.isCancelling).toBe(false)
    expect(state.isStreaming).toBe(false)
  })

  it('should extract usage data from usage frame', async () => {
    const { result } = renderHook(() => useWebSocket('ws://localhost/ws'))

    await act(async () => {
      await new Promise((r) => setTimeout(r, 1))
    })

    const ws = globalThis.WebSocket.instances.at(-1)
    useChatStore.setState({ sessionId: 'sess-1' })

    expect(useChatStore.getState().sessionEstimatedTokens).toEqual({})
    expect(useChatStore.getState().sessionTotalCost).toEqual({})

    // v2: usage is a single frame with both token counts and cost
    act(() => {
      ws.onmessage({
        data: JSON.stringify({
          type: 'usage',
          session_id: 'sess-1',
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
          estimated_context_tokens: 12345,
          cost: 0.0005,
          total_cost: 1.50,
        }),
      })
    })

    const state = useChatStore.getState()
    expect(state.sessionEstimatedTokens['sess-1']).toBe(12345)
    expect(state.sessionTotalCost['sess-1']).toBe(1.50)
    // isStreaming should be unchanged
    expect(state.isStreaming).toBe(false)
    expect(state.error).toBeNull()
  })

  it('should handle usage frame without cost fields', async () => {
    const { result } = renderHook(() => useWebSocket('ws://localhost/ws'))

    await act(async () => {
      await new Promise((r) => setTimeout(r, 1))
    })

    const ws = globalThis.WebSocket.instances.at(-1)
    useChatStore.setState({ sessionId: 'sess-1' })

    // usage without estimated_context_tokens and total_cost
    act(() => {
      ws.onmessage({
        data: JSON.stringify({
          type: 'usage',
          session_id: 'sess-1',
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
        }),
      })
    })

    const state = useChatStore.getState()
    // Should not crash, values unchanged
    expect(state.sessionEstimatedTokens).toEqual({})
    expect(state.sessionTotalCost).toEqual({})
  })

  it('should respond to req with resp unsupported', async () => {
    const { result } = renderHook(() => useWebSocket('ws://localhost/ws'))

    await act(async () => {
      await new Promise((r) => setTimeout(r, 1))
    })

    const ws = globalThis.WebSocket.instances.at(-1)

    // v2: client request is type:"req"
    act(() => {
      ws.onmessage({
        data: JSON.stringify({
          type: 'req',
          session_id: 'sess-1',
          request_id: 'req-123',
          command: 'return vim.api.nvim_buf_get_name(0)',
        }),
      })
    })

    // Should send a resp with unsupported error
    const sendCalls = ws.send.mock.calls
    const responseCall = sendCalls.find((c) => {
      const p = JSON.parse(c[0])
      return p.type === 'resp' && p.request_id === 'req-123'
    })
    expect(responseCall).toBeDefined()
    const sent = JSON.parse(responseCall[0])
    expect(sent.type).toBe('resp')
    expect(sent.request_id).toBe('req-123')
    expect(sent.error).toBe('unsupported')
    expect(sent.result).toBeUndefined()
  })

  it('should handle output frame then done frame (non-stream path)', async () => {
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

    // v2: output is its own frame (not combined with done)
    act(() => {
      ws.onmessage({ data: JSON.stringify({ type: 'output', session_id: 'sess-1', text: 'Complete response' }) })
    })

    let state = useChatStore.getState()
    expect(state.messages).toHaveLength(2)
    expect(state.messages[1].role).toBe('assistant')
    expect(state.messages[1].content).toBe('Complete response')
    // Still streaming — done hasn't arrived yet
    expect(state.isStreaming).toBe(true)

    // Now done arrives
    act(() => {
      ws.onmessage({ data: JSON.stringify({ type: 'done', session_id: 'sess-1', stats: { total_tokens: 100 } }) })
    })

    state = useChatStore.getState()
    expect(state.isStreaming).toBe(false)
    // Content unchanged
    expect(state.messages[1].content).toBe('Complete response')
  })

  it('should handle output+done with tool event (output creates assistant message)', async () => {
    useChatStore.setState({
      sessionId: 'sess-1',
      messages: [
        { id: 'user-1', role: 'user', content: 'Read file' },
      ],
    })
    const { result } = renderHook(() => useWebSocket('ws://localhost/ws'))

    await act(async () => {
      await new Promise((r) => setTimeout(r, 1))
    })

    const ws = globalThis.WebSocket.instances.at(-1)

    // v2: tool frame with id field
    act(() => {
      ws.onmessage({
        data: JSON.stringify({
          type: 'tool',
          session_id: 'sess-1',
          id: 'call_001',
          tool: 'read_file',
          status: 'start',
          args: { path: '/tmp/x.txt' },
          snippet: "read_file '/tmp/x.txt'",
        }),
      })
    })

    let state = useChatStore.getState()
    expect(state.messages).toHaveLength(2)
    expect(state.messages[1].toolCalls).toHaveLength(1)
    expect(state.messages[1].toolCalls[0].tool).toBe('read_file')
    expect(state.messages[1].toolCalls[0].tool_call_id).toBe('call_001')
    expect(state.messages[1].content).toContain('\x00TOOL:0\x00')

    // tool ok frame with same id
    act(() => {
      ws.onmessage({
        data: JSON.stringify({
          type: 'tool',
          session_id: 'sess-1',
          id: 'call_001',
          tool: 'read_file',
          status: 'ok',
          result: 'file content here',
        }),
      })
    })

    state = useChatStore.getState()
    expect(state.messages[1].toolCalls).toHaveLength(1)
    expect(state.messages[1].toolCalls[0].status).toBe('ok')

    // output frame
    act(() => {
      ws.onmessage({ data: JSON.stringify({ type: 'output', session_id: 'sess-1', text: 'File contains...' }) })
    })

    state = useChatStore.getState()
    expect(state.messages[1].content).toContain('File contains...')

    // done frame
    act(() => {
      ws.onmessage({ data: JSON.stringify({ type: 'done', session_id: 'sess-1', stats: {} }) })
    })

    state = useChatStore.getState()
    expect(state.isStreaming).toBe(false)
  })

  it('should match tool frames by id (not by snippet)', async () => {
    useChatStore.setState({
      sessionId: 'sess-1',
      messages: [
        { id: 'user-1', role: 'user', content: 'Run tools' },
      ],
    })
    const { result } = renderHook(() => useWebSocket('ws://localhost/ws'))

    await act(async () => {
      await new Promise((r) => setTimeout(r, 1))
    })

    const ws = globalThis.WebSocket.instances.at(-1)

    // Two concurrent tools with different ids
    act(() => {
      ws.onmessage({
        data: JSON.stringify({
          type: 'tool', session_id: 'sess-1', id: 'call_a',
          tool: 'read_file', status: 'start', args: { path: 'a.txt' }, snippet: "read_file 'a.txt'",
        }),
      })
    })
    act(() => {
      ws.onmessage({
        data: JSON.stringify({
          type: 'tool', session_id: 'sess-1', id: 'call_b',
          tool: 'shell', status: 'start', args: { command: 'ls' }, snippet: 'ls -la',
        }),
      })
    })

    let state = useChatStore.getState()
    expect(state.messages[1].toolCalls).toHaveLength(2)
    expect(state.messages[1].toolCalls[0].tool_call_id).toBe('call_a')
    expect(state.messages[1].toolCalls[1].tool_call_id).toBe('call_b')

    // Finish in reverse order — should still match by id
    act(() => {
      ws.onmessage({
        data: JSON.stringify({
          type: 'tool', session_id: 'sess-1', id: 'call_b',
          tool: 'shell', status: 'ok', result: 'file list',
        }),
      })
    })
    act(() => {
      ws.onmessage({
        data: JSON.stringify({
          type: 'tool', session_id: 'sess-1', id: 'call_a',
          tool: 'read_file', status: 'err', error: 'not found',
        }),
      })
    })

    state = useChatStore.getState()
    expect(state.messages[1].toolCalls[0].status).toBe('err')
    expect(state.messages[1].toolCalls[1].status).toBe('ok')
  })

  it('should handle get_session via result frame and persist last session', async () => {
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

    // v2: command_result is now type:"result"
    act(() => {
      ws.onmessage({
        data: JSON.stringify({
          type: 'result',
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

  it('should handle session lifecycle events (created/renamed/deleted)', async () => {
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

    // v2: session renamed via type:"session" with event:"renamed"
    act(() => {
      ws.onmessage({
        data: JSON.stringify({
          type: 'session',
          session_id: 'sess-1',
          event: 'renamed',
          old_name: 'old-name',
          name: 'New Session Name',
        }),
      })
    })

    let state = useChatStore.getState()
    const renamed = state.sessions.find(s => s.id === 'sess-1')
    expect(renamed).toBeDefined()
    expect(renamed.name).toBe('New Session Name')
    // Other sessions unchanged
    const other = state.sessions.find(s => s.id === 'sess-2')
    expect(other.name).toBe('other')
  })

  it('should handle session created lifecycle event', async () => {
    const { result } = renderHook(() => useWebSocket('ws://localhost/ws'))

    await act(async () => {
      await new Promise((r) => setTimeout(r, 1))
    })

    const ws = globalThis.WebSocket.instances.at(-1)

    // v2: session created
    act(() => {
      ws.onmessage({
        data: JSON.stringify({
          type: 'session',
          session_id: 'new-uuid',
          event: 'created',
          name: 'New Chat',
          model: 'deepseek',
          message_count: 0,
        }),
      })
    })

    const state = useChatStore.getState()
    const created = state.sessions.find(s => s.id === 'new-uuid')
    expect(created).toBeDefined()
    expect(created.name).toBe('New Chat')
    expect(created.model).toBe('deepseek')
  })

  it('should handle session deleted lifecycle event', async () => {
    useChatStore.setState({
      sessions: [
        { id: 'sess-1', name: 'Chat 1' },
        { id: 'sess-2', name: 'Chat 2' },
      ],
      sessionId: 'sess-1',
    })
    const { result } = renderHook(() => useWebSocket('ws://localhost/ws'))

    await act(async () => {
      await new Promise((r) => setTimeout(r, 1))
    })

    const ws = globalThis.WebSocket.instances.at(-1)

    act(() => {
      ws.onmessage({
        data: JSON.stringify({
          type: 'session',
          session_id: 'sess-1',
          event: 'deleted',
        }),
      })
    })

    const state = useChatStore.getState()
    expect(state.sessions.find(s => s.id === 'sess-1')).toBeUndefined()
    expect(state.sessions).toHaveLength(1)
    expect(state.sessionId).toBeNull()
  })

  it('should handle welcome frame on connect with in_flight session', async () => {
    const { result } = renderHook(() => useWebSocket('ws://localhost/ws'))

    await act(async () => {
      await new Promise((r) => setTimeout(r, 1))
    })

    const ws = globalThis.WebSocket.instances.at(-1)

    // v2: welcome frame instead of session_list
    act(() => {
      ws.onmessage({
        data: JSON.stringify({
          type: 'welcome',
          namespace: 'default',
          sessions: [
            { id: 'sess-inflight', short_id: 'inflight', name: 'Active Chat', in_flight: true },
            { id: 'sess-other', short_id: 'other', name: 'Old Chat' },
          ],
        }),
      })
    })

    // Should have sent a get_session for the in_flight session
    const sendCalls = ws.send.mock.calls
    const getSessionCall = sendCalls.find((c) => {
      const p = JSON.parse(c[0])
      return p.command && p.command.cmd === 'get_session'
    })
    expect(getSessionCall).toBeDefined()
    const sent = JSON.parse(getSessionCall[0])
    expect(sent.type).toBe('cmd')
    expect(sent.command.params.id).toBe('sess-inflight')
  })

  it('should fall back to last session from localStorage when no in_flight', async () => {
    localStorage.setItem('hakka_last_session_id', 'sess-last')

    const { result } = renderHook(() => useWebSocket('ws://localhost/ws'))

    await act(async () => {
      await new Promise((r) => setTimeout(r, 1))
    })

    const ws = globalThis.WebSocket.instances.at(-1)

    // Welcome with no in_flight
    act(() => {
      ws.onmessage({
        data: JSON.stringify({
          type: 'welcome',
          namespace: 'default',
          sessions: [
            { id: 'sess-1', short_id: 's1', name: 'Chat 1' },
            { id: 'sess-2', short_id: 's2', name: 'Chat 2' },
          ],
        }),
      })
    })

    // Should load localStorage session
    const sendCalls = ws.send.mock.calls
    const getSessionCall = sendCalls.find((c) => {
      const p = JSON.parse(c[0])
      return p.command && p.command.cmd === 'get_session'
    })
    expect(getSessionCall).toBeDefined()
    const sent = JSON.parse(getSessionCall[0])
    expect(sent.command.params.id).toBe('sess-last')
  })

  it('should keep current session if no in_flight and sessionId already set', async () => {
    useChatStore.setState({ sessionId: 'sess-current' })

    const { result } = renderHook(() => useWebSocket('ws://localhost/ws'))

    await act(async () => {
      await new Promise((r) => setTimeout(r, 1))
    })

    const ws = globalThis.WebSocket.instances.at(-1)

    // Welcome with no in_flight
    act(() => {
      ws.onmessage({
        data: JSON.stringify({
          type: 'welcome',
          sessions: [
            { id: 'sess-current', short_id: 'cur', name: 'Current' },
            { id: 'sess-other', short_id: 'oth', name: 'Other' },
          ],
        }),
      })
    })

    // Should NOT send get_session — current session is already active
    const sendCalls = ws.send.mock.calls
    const getSessionCall = sendCalls.find((c) => {
      const p = JSON.parse(c[0])
      return p.command && p.command.cmd === 'get_session'
    })
    expect(getSessionCall).toBeUndefined()
  })

  it('should prefer in_flight session over localStorage', async () => {
    localStorage.setItem('hakka_last_session_id', 'sess-stored')

    const { result } = renderHook(() => useWebSocket('ws://localhost/ws'))

    await act(async () => {
      await new Promise((r) => setTimeout(r, 1))
    })

    const ws = globalThis.WebSocket.instances.at(-1)

    // Welcome with in_flight pointing to a different session
    act(() => {
      ws.onmessage({
        data: JSON.stringify({
          type: 'welcome',
          sessions: [
            { id: 'sess-active', short_id: 'act', name: 'Active', in_flight: true },
            { id: 'sess-stored', short_id: 'sto', name: 'Stored' },
          ],
        }),
      })
    })

    const sendCalls = ws.send.mock.calls
    const getSessionCall = sendCalls.find((c) => {
      const p = JSON.parse(c[0])
      return p.command && p.command.cmd === 'get_session'
    })
    expect(getSessionCall).toBeDefined()
    const sent = JSON.parse(getSessionCall[0])
    // Should load in_flight, not localStorage
    expect(sent.command.params.id).toBe('sess-active')
  })

  it('should not reload in_flight session if already active', async () => {
    useChatStore.setState({ sessionId: 'sess-active' })

    const { result } = renderHook(() => useWebSocket('ws://localhost/ws'))

    await act(async () => {
      await new Promise((r) => setTimeout(r, 1))
    })

    const ws = globalThis.WebSocket.instances.at(-1)

    act(() => {
      ws.onmessage({
        data: JSON.stringify({
          type: 'welcome',
          sessions: [
            { id: 'sess-active', short_id: 'act', name: 'Active', in_flight: true },
          ],
        }),
      })
    })

    const sendCalls = ws.send.mock.calls
    const getSessionCall = sendCalls.find((c) => {
      const p = JSON.parse(c[0])
      return p.command && p.command.cmd === 'get_session'
    })
    expect(getSessionCall).toBeUndefined()
  })

  it('should handle done frame with stats and update session metadata', async () => {
    useChatStore.setState({
      sessionId: 'sess-1',
      sessions: [{ id: 'sess-1', name: 'Chat' }],
      messages: [
        { id: 'user-1', role: 'user', content: 'Hello' },
      ],
    })
    const { result } = renderHook(() => useWebSocket('ws://localhost/ws'))

    await act(async () => {
      await new Promise((r) => setTimeout(r, 1))
    })

    const ws = globalThis.WebSocket.instances.at(-1)

    // Start streaming
    await act(async () => {
      result.current.send(null, 'Hi')
    })

    act(() => { ws.onmessage({ data: JSON.stringify({ type: 'delta', session_id: 'sess-1', text: 'Hello' }) }) })

    // v2: done frame with stats
    act(() => {
      ws.onmessage({
        data: JSON.stringify({
          type: 'done',
          session_id: 'sess-1',
          stats: {
            total_tokens: 150,
            total_cost: 0.0015,
            estimated_context_tokens: 5000,
            model: 'deepseek',
          },
        }),
      })
    })

    const state = useChatStore.getState()
    expect(state.isStreaming).toBe(false)
    expect(state.sessionEstimatedTokens['sess-1']).toBe(5000)
    expect(state.sessionTotalCost['sess-1']).toBe(0.0015)
    // Model should be updated in sessions list
    const session = state.sessions.find(s => s.id === 'sess-1')
    expect(session?.model).toBe('deepseek')
  })

  it('should handle done frame with error', async () => {
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

    // v2: error done frame
    act(() => {
      ws.onmessage({
        data: JSON.stringify({
          type: 'done',
          session_id: 'sess-1',
          error: 'something went wrong',
          stats: {},
        }),
      })
    })

    const state = useChatStore.getState()
    expect(state.isStreaming).toBe(false)
    expect(state.error).toBe('something went wrong')
  })

  it('should handle type:"error" frame (before any turn)', async () => {
    useChatStore.setState({
      sessionId: 'sess-1',
      isStreaming: false,
    })
    const { result } = renderHook(() => useWebSocket('ws://localhost/ws'))

    await act(async () => {
      await new Promise((r) => setTimeout(r, 1))
    })

    const ws = globalThis.WebSocket.instances.at(-1)

    // v2: error frame with explicit type
    act(() => {
      ws.onmessage({
        data: JSON.stringify({
          type: 'error',
          session_id: 'sess-1',
          error: 'tool not found: unknown_tool',
        }),
      })
    })

    const state = useChatStore.getState()
    expect(state.error).toBe('tool not found: unknown_tool')
    expect(state.isStreaming).toBe(false)
  })

  it('should format tool_list result frame as assistant message', async () => {
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

    // v2: result frame
    act(() => {
      ws.onmessage({
        data: JSON.stringify({
          type: 'result',
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

  it('should handle streaming: delta frames then done', async () => {
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

    // v2: delta frames with text field
    act(() => { ws.onmessage({ data: JSON.stringify({ type: 'delta', session_id: 'sess-1', text: 'Hello ' } ) }) })
    let state = useChatStore.getState()
    expect(state.messages[1].content).toBe('Hello ')

    act(() => { ws.onmessage({ data: JSON.stringify({ type: 'delta', session_id: 'sess-1', text: 'world' } ) }) })
    state = useChatStore.getState()
    expect(state.messages[1].content).toBe('Hello world')

    // done frame
    act(() => {
      ws.onmessage({
        data: JSON.stringify({ type: 'done', session_id: 'sess-1', stats: { total_tokens: 50 } }),
      })
    })

    state = useChatStore.getState()
    expect(state.isStreaming).toBe(false)
    expect(state.messages[1].content).toBe('Hello world')
  })

  it('should handle output before done (non-stream, no tools)', async () => {
    useChatStore.setState({
      sessionId: 'sess-1',
      messages: [
        { id: 'user-1', role: 'user', content: 'Hello' },
      ],
      isStreaming: true,
    })
    const { result } = renderHook(() => useWebSocket('ws://localhost/ws'))

    await act(async () => {
      await new Promise((r) => setTimeout(r, 1))
    })

    const ws = globalThis.WebSocket.instances.at(-1)

    // v2: output frame first
    act(() => {
      ws.onmessage({
        data: JSON.stringify({ type: 'output', session_id: 'sess-1', text: 'Complete response' }),
      })
    })

    let state = useChatStore.getState()
    expect(state.messages[1].content).toBe('Complete response')
    expect(state.isStreaming).toBe(true) // not done yet

    // Then done
    act(() => {
      ws.onmessage({
        data: JSON.stringify({ type: 'done', session_id: 'sess-1', stats: {} }),
      })
    })

    state = useChatStore.getState()
    expect(state.isStreaming).toBe(false)
  })

  it('should ignore output when streaming deltas were already received', async () => {
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

    // Receive stream deltas
    act(() => { ws.onmessage({ data: JSON.stringify({ type: 'delta', session_id: 'sess-1', text: 'Hello ' }) }) })
    act(() => { ws.onmessage({ data: JSON.stringify({ type: 'delta', session_id: 'sess-1', text: 'world' }) }) })

    let state = useChatStore.getState()
    expect(state.messages[1].content).toBe('Hello world')

    // output frame after deltas — should be ignored to preserve tool markers
    act(() => {
      ws.onmessage({ data: JSON.stringify({ type: 'output', session_id: 'sess-1', text: 'should not appear' }) })
    })

    // Then done
    act(() => {
      ws.onmessage({ data: JSON.stringify({ type: 'done', session_id: 'sess-1', stats: {} }) })
    })

    state = useChatStore.getState()
    expect(state.messages[1].content).toBe('Hello world')
    expect(state.isStreaming).toBe(false)
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
    act(() => { ws.onmessage({ data: JSON.stringify({ type: 'delta', session_id: 'sess-1', text: 'part1 ' }) }) })
    let state = useChatStore.getState()
    expect(state.messages[1].content).toBe('part1 ')

    // Session switch to sess-2 via result frame (get_session)
    act(() => {
      ws.onmessage({
        data: JSON.stringify({
          type: 'result',
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

    // Now sess-1's output+done arrives
    // Since deltas were received for sess-1, the output should be skipped
    act(() => {
      ws.onmessage({ data: JSON.stringify({ type: 'output', session_id: 'sess-1', text: 'should not double' }) })
    })
    act(() => {
      ws.onmessage({ data: JSON.stringify({ type: 'done', session_id: 'sess-1', stats: {} }) })
    })

    state = useChatStore.getState()
    expect(state.messages).toHaveLength(0)
    // sess-1's cached messages should keep the accumulated deltas (with tool markers)
    expect(state.sessionMessages['sess-1'][1].content).toBe('part1 ')
    expect(state.isStreaming).toBe(false)
  })

  // --- Timestamp (ts) propagation from frames ---

  it('should pass ts from delta frame to startAssistantMessage on first delta', async () => {
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

    // First delta with ts — should create assistant message with that timestamp
    act(() => {
      ws.onmessage({
        data: JSON.stringify({
          type: 'delta', session_id: 'sess-1', text: 'Hello ', ts: 1700000000001,
        }),
      })
    })

    const state = useChatStore.getState()
    expect(state.messages[1].timestamp).toBe(1700000000001)

    // Second delta without ts — should not change timestamp
    act(() => {
      ws.onmessage({
        data: JSON.stringify({
          type: 'delta', session_id: 'sess-1', text: 'world',
        }),
      })
    })

    const state2 = useChatStore.getState()
    expect(state2.messages[1].timestamp).toBe(1700000000001)
    expect(state2.messages[1].content).toBe('Hello world')
  })

  it('should pass ts from tool frame to addToolEvent', async () => {
    useChatStore.setState({
      sessionId: 'sess-1',
      messages: [
        { id: 'user-1', role: 'user', content: 'Run tool' },
      ],
    })
    const { result } = renderHook(() => useWebSocket('ws://localhost/ws'))

    await act(async () => {
      await new Promise((r) => setTimeout(r, 1))
    })

    const ws = globalThis.WebSocket.instances.at(-1)

    // Tool start with ts
    act(() => {
      ws.onmessage({
        data: JSON.stringify({
          type: 'tool', session_id: 'sess-1', id: 'c1',
          tool: 'shell', status: 'start', args: {}, snippet: 'ls',
          ts: 1700000000050,
        }),
      })
    })

    const state = useChatStore.getState()
    expect(state.messages[1].toolCalls).toHaveLength(1)
    expect(state.messages[1].toolCalls[0].timestamp).toBe(1700000000050)
  })
})
