import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useWebSocket } from '../hooks/useWebSocket'
import { useChatStore } from '../store/useChatStore'

describe('useWebSocket', () => {
  beforeEach(() => {
    useChatStore.setState({
      messages: [],
      sessionId: null,
      connectionStatus: 'disconnected',
      isStreaming: false,
      isCancelling: false,
      error: null,
      cwd: null,
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

  it('should not double-append output when streaming deltas were received', async () => {
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

    // The frame below has both output AND done, but since we already received
    // streaming deltas (deltasReceivedRef[sid] = true), the output should NOT be appended.
    act(() => {
      ws.onmessage({ data: JSON.stringify({ output: 'should not append', done: true, session_id: 'sess-1' }) })
    })

    state = useChatStore.getState()
    // Content should remain 'Hello world' — the output was not double-appended
    expect(state.messages[1].content).toBe('Hello world')
    expect(state.isStreaming).toBe(false)
  })

  it('should not double-append output after session switch while streaming', async () => {
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

    // Session switch to sess-2 — this should cache sess-1 messages and switch context
    act(() => {
      ws.onmessage({
        data: JSON.stringify({
          event: 'session_switch',
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
    // Since we switched away, it should not affect sess-2's messages
    act(() => {
      ws.onmessage({ data: JSON.stringify({ output: 'final', done: true, session_id: 'sess-1' }) })
    })

    state = useChatStore.getState()
    expect(state.messages).toHaveLength(0)
    // sess-1's cached messages should have the content
    expect(state.sessionMessages['sess-1'][0].content).toBe('part1 final')
    expect(state.isStreaming).toBe(false)
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
