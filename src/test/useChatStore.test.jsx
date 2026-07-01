import { describe, it, expect, beforeEach } from 'vitest'
import { useChatStore, replayEvents } from '../store/useChatStore'

describe('useChatStore', () => {
  beforeEach(() => {
    useChatStore.setState({
      messages: [],
      sessionId: null,
      sessions: [],
      sessionMessages: {},
      sessionStatus: {},
      sessionEstimatedTokens: {},
      sessionTotalCost: {},
      sessionUnread: {},
      connectionStatus: 'disconnected',
      isStreaming: false,
      isCancelling: false,
      error: null,
      models: [],
    })
  })

  it('should start with empty state', () => {
    const state = useChatStore.getState()
    expect(state.messages).toEqual([])
    expect(state.sessionId).toBeNull()
    expect(state.sessions).toEqual([])
    expect(state.sessionMessages).toEqual({})
    expect(state.sessionStatus).toEqual({})
    expect(state.sessionUnread).toEqual({})
    expect(state.connectionStatus).toBe('disconnected')
    expect(state.isStreaming).toBe(false)
    expect(state.isCancelling).toBe(false)
    expect(state.error).toBeNull()
  })

  it('should add a user message', () => {
    useChatStore.getState().sendMessage('Hello!')
    const msgs = useChatStore.getState().messages
    expect(msgs).toHaveLength(1)
    expect(msgs[0]).toMatchObject({ role: 'user', content: 'Hello!' })
  })

  it('should merge consecutive user messages', () => {
    const store = useChatStore.getState()
    store.sendMessage('First')
    store.sendMessage('Second')
    store.sendMessage('Third')
    const msgs = useChatStore.getState().messages
    expect(msgs).toHaveLength(1)
    expect(msgs[0].role).toBe('user')
    expect(msgs[0].content).toBe('First\nSecond\nThird')
  })

  it('should stream assistant messages', () => {
    useChatStore.getState().sendMessage('Hi')
    useChatStore.getState().startAssistantMessage()
    useChatStore.getState().appendDelta('Hello')
    useChatStore.getState().appendDelta(' there')
    useChatStore.getState().finalizeMessage()
    const msgs = useChatStore.getState().messages
    expect(msgs[1].content).toBe('Hello there')
    expect(useChatStore.getState().isStreaming).toBe(false)
  })

  it('should reuse existing assistant message on startAssistantMessage', () => {
    const store = useChatStore.getState()
    store.sendMessage('Hi')
    store.startAssistantMessage()
    store.appendDelta('First')
    store.startAssistantMessage()
    store.appendDelta(' + Second')
    store.finalizeMessage()

    const msgs = useChatStore.getState().messages
    expect(msgs).toHaveLength(2)
    expect(msgs[1].content).toBe('First + Second')
  })

  it('should merge tool events by tool name', () => {
    useChatStore.getState().sendMessage('Do')
    useChatStore.getState().startAssistantMessage()
    useChatStore.getState().addToolEvent({ tool: 'shell', status: 'start', exec_snippet: 'curl wttr.in', args: { url: 'wttr.in' }, tool_call_id: 'call_001' })
    useChatStore.getState().addToolEvent({ tool: 'shell', status: 'ok', tool_call_id: 'call_001', result: 'Weather data' })
    useChatStore.getState().finalizeMessage()
    const toolCalls = useChatStore.getState().messages[1].toolCalls
    expect(toolCalls).toHaveLength(1)
    expect(toolCalls[0].status).toBe('ok')
    expect(toolCalls[0].args).toEqual({ url: 'wttr.in' })
    expect(toolCalls[0].result).toBe('Weather data')
    expect(toolCalls[0].exec_snippet).toBe('curl wttr.in')
    expect(toolCalls[0].tool_call_id).toBe('call_001')
  })

  it('should embed tool marker in content on addToolEvent start', () => {
    const store = useChatStore.getState()
    store.sendMessage('Run')
    store.startAssistantMessage()
    store.appendDelta('Checking...')
    store.addToolEvent({ tool: 'shell', status: 'start', exec_snippet: 'ls -la' })
    store.appendDelta(' Done')
    store.finalizeMessage()

    const msgs = useChatStore.getState().messages
    expect(msgs[1].content).toBe('Checking...\x00TOOL:0\x00 Done')
    expect(msgs[1].toolCalls).toHaveLength(1)
    expect(msgs[1].toolCalls[0].tool).toBe('shell')
  })

  it('should handle session_list command result', () => {
    useChatStore.getState().handleCommandResult('session_list', {
      sessions: [
        { id: 'aaa', short_id: 'aaa', name: 'Chat 1', current: true },
        { id: 'bbb', short_id: 'bbb', name: 'Chat 2' },
      ],
    })
    expect(useChatStore.getState().sessions).toHaveLength(2)
  })

  it('should handle session_create command result', () => {
    useChatStore.getState().handleCommandResult('session_create', {
      session: { id: 'new-session', short_id: 'new' },
    })
    expect(useChatStore.getState().sessionId).toBe('new-session')
    expect(useChatStore.getState().messages).toEqual([])
  })

  it('should handle get_session command result with messages and set cwd', () => {
    useChatStore.getState().handleCommandResult('get_session', {
      session: { id: 'switched', name: 'Old Chat', client_cwd: '/home/user/project' },
      messages: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi' },
      ],
    })
    expect(useChatStore.getState().sessionId).toBe('switched')
    expect(useChatStore.getState().messages).toHaveLength(2)
    expect(useChatStore.getState().cwd).toBe('/home/user/project')
  })

  it('should handle get_session without client_cwd (keep current cwd)', () => {
    useChatStore.setState({ cwd: '/my/current/dir' })
    useChatStore.getState().handleCommandResult('get_session', {
      session: { id: 'switched', name: 'Other' },
      messages: [],
    })
    expect(useChatStore.getState().sessionId).toBe('switched')
    // Should preserve the current cwd when neither server nor cache provides one
    expect(useChatStore.getState().cwd).toBe('/my/current/dir')
  })

  it('should handle session_create and set cwd from session', () => {
    useChatStore.getState().handleCommandResult('session_create', {
      session: { id: 'new-session', short_id: 'new', client_cwd: '/workspace' },
    })
    expect(useChatStore.getState().sessionId).toBe('new-session')
    expect(useChatStore.getState().messages).toEqual([])
    expect(useChatStore.getState().cwd).toBe('/workspace')
  })

  it('should handle session_delete command result', () => {
    useChatStore.setState({
      sessions: [{ id: 'aaa' }, { id: 'bbb' }],
      sessionId: 'aaa',
    })
    useChatStore.getState().handleCommandResult('session_delete', { deleted: 'aaa', active_cleared: true })
    expect(useChatStore.getState().sessions).toHaveLength(1)
    expect(useChatStore.getState().sessionId).toBeNull()
  })

  it('should set isCancelling on requestCancel', () => {
    useChatStore.getState().requestCancel()
    expect(useChatStore.getState().isCancelling).toBe(true)
  })

  it('should clear isCancelling and isStreaming on handleCancelResponse', () => {
    useChatStore.setState({ isCancelling: true, isStreaming: true })
    useChatStore.getState().handleCancelResponse()
    const state = useChatStore.getState()
    expect(state.isCancelling).toBe(false)
    expect(state.isStreaming).toBe(false)
  })

  it('should clear isCancelling and isStreaming on setError', () => {
    useChatStore.setState({ isCancelling: true, isStreaming: true })
    useChatStore.getState().setError('something broke')
    const state = useChatStore.getState()
    expect(state.isCancelling).toBe(false)
    expect(state.isStreaming).toBe(false)
    expect(state.error).toBe('something broke')
  })

  it('should clear isCancelling on startAssistantMessage', () => {
    useChatStore.setState({ isCancelling: true })
    useChatStore.getState().startAssistantMessage()
    expect(useChatStore.getState().isCancelling).toBe(false)
  })

  it('should merge role:tool and consecutive same-role messages via setMessages', () => {
    const store = useChatStore.getState()
    store.setMessages([
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Let me check' },
      { role: 'tool', tool: 'read_file', status: 'ok', exec_snippet: 'read_file /tmp/x.txt' },
      { role: 'assistant', content: 'Here is the content' },
    ])
    const msgs = useChatStore.getState().messages
    expect(msgs).toHaveLength(2)
    expect(msgs[0].role).toBe('user')
    expect(msgs[1].role).toBe('assistant')
    expect(msgs[1].content).toContain('Let me check')
    expect(msgs[1].content).toContain('\x00TOOL:0\x00')
    expect(msgs[1].content).toContain('Here is the content')
    expect(msgs[1].toolCalls).toHaveLength(1)
    expect(msgs[1].toolCalls[0]).toMatchObject({
      tool: 'read_file',
      status: 'ok',
      exec_snippet: 'read_file /tmp/x.txt',
    })
  })

  it('should merge tool messages and consecutive assistants via get_session', () => {
    const store = useChatStore.getState()
    store.handleCommandResult('get_session', {
      session: { id: 'sess-1' },
      messages: [
        { role: 'user', content: 'Hi' },
        { role: 'assistant', content: 'Running...' },
        { role: 'tool', tool: 'shell', status: 'done', exec_snippet: 'ls -la' },
        { role: 'assistant', content: 'Done' },
      ],
    })
    const msgs = useChatStore.getState().messages
    expect(msgs).toHaveLength(2)
    expect(msgs[1].toolCalls).toHaveLength(1)
    expect(msgs[1].toolCalls[0].tool).toBe('shell')
    expect(msgs[1].content).toContain('\x00TOOL:0\x00')
  })

  it('should handle multiple tool messages merged into same assistant', () => {
    const store = useChatStore.getState()
    store.handleCommandResult('get_session', {
      session: { id: 'sess-1' },
      messages: [
        { role: 'user', content: 'Do tools' },
        { role: 'assistant', content: 'Running tools...' },
        { role: 'tool', tool: 'read_file', status: 'ok', exec_snippet: 'read_file /tmp/a.txt' },
        { role: 'tool', tool: 'shell', status: 'ok', exec_snippet: 'grep foo /tmp/a.txt' },
        { role: 'assistant', content: 'Results' },
      ],
    })
    const msgs = useChatStore.getState().messages
    expect(msgs).toHaveLength(2)
    expect(msgs[1].toolCalls).toHaveLength(2)
    expect(msgs[1].content).toContain('\x00TOOL:0\x00')
    expect(msgs[1].content).toContain('\x00TOOL:1\x00')
  })

  it('should handle tool message without preceding assistant (fallback)', () => {
    const store = useChatStore.getState()
    store.setMessages([
      { role: 'user', content: 'Hi' },
      { role: 'tool', tool: 'shell', status: 'ok', exec_snippet: 'curl wttr.in' },
    ])
    const msgs = useChatStore.getState().messages
    expect(msgs).toHaveLength(2)
    expect(msgs[1].role).toBe('assistant')
    expect(msgs[1].toolCalls).toHaveLength(1)
  })

  it('should merge consecutive same-role messages in history', () => {
    const store = useChatStore.getState()
    store.setMessages([
      { role: 'user', content: 'Part 1' },
      { role: 'user', content: 'Part 2' },
      { role: 'assistant', content: 'Response A' },
      { role: 'assistant', content: 'Response B' },
      { role: 'assistant', content: 'Response C' },
    ])
    const msgs = useChatStore.getState().messages
    expect(msgs).toHaveLength(2)
    expect(msgs[0].content).toBe('Part 1\nPart 2')
    expect(msgs[1].content).toBe('Response A\nResponse B\nResponse C')
  })

  it('should handle snake_case tool_calls from server history and match by tool_call_id', () => {
    const store = useChatStore.getState()
    store.handleCommandResult('get_session', {
      session: { id: 'sess-1' },
      messages: [
        { role: 'user', content: 'Read a file' },
        {
          role: 'assistant',
          content: 'Let me read it',
          tool_calls: [
            {
              name: 'read_file',
              arguments: '{"path": "src/foo.txt"}',
              exec_snippet: 'src/foo.txt',
              id: 'call_001',
            },
          ],
        },
        {
          role: 'tool',
          name: 'read_file',
          content: 'file contents here',
          tool_call_id: 'call_001',
        },
        { role: 'assistant', content: 'Here is the content' },
      ],
    })
    const msgs = useChatStore.getState().messages
    expect(msgs).toHaveLength(2)
    expect(msgs[1].toolCalls).toHaveLength(1)
    expect(msgs[1].toolCalls[0].exec_snippet).toBe('src/foo.txt')
    expect(msgs[1].toolCalls[0].tool).toBe('read_file')
    expect(msgs[1].toolCalls[0].status).toBe('ok')
    expect(msgs[1].content).toContain('\x00TOOL:0\x00')
    expect(msgs[1].content).toContain('Here is the content')
  })

  it('should handle multiple snake_case tool_calls with matching tool messages', () => {
    const store = useChatStore.getState()
    store.handleCommandResult('get_session', {
      session: { id: 'sess-2' },
      messages: [
        { role: 'user', content: 'Do both' },
        {
          role: 'assistant',
          content: 'Running...',
          tool_calls: [
            { name: 'read_file', arguments: '{"path":"a.txt"}', exec_snippet: 'read_file a.txt', id: 'c1' },
            { name: 'shell', arguments: '{"command":"ls"}', exec_snippet: 'ls -la', id: 'c2' },
          ],
        },
        { role: 'tool', name: 'read_file', content: 'a', tool_call_id: 'c1' },
        { role: 'tool', name: 'shell', content: 'result', tool_call_id: 'c2' },
        { role: 'assistant', content: 'Done' },
      ],
    })
    const msgs = useChatStore.getState().messages
    expect(msgs).toHaveLength(2)
    expect(msgs[1].toolCalls).toHaveLength(2)
    expect(msgs[1].toolCalls[0].exec_snippet).toBe('read_file a.txt')
    expect(msgs[1].toolCalls[1].exec_snippet).toBe('ls -la')
    expect(msgs[1].toolCalls[0].status).toBe('ok')
    expect(msgs[1].toolCalls[1].status).toBe('ok')
    expect(msgs[1].content).toContain('\x00TOOL:0\x00')
    expect(msgs[1].content).toContain('\x00TOOL:1\x00')
  })

  // --- New parallel session tests ---

  it('should save current messages to cache and load target on get_session', () => {
    const store = useChatStore.getState()
    store.handleCommandResult('session_create', {
      session: { id: 'session-a', short_id: 'a' },
    })
    store.sendMessage('Hello from A')
    store.startAssistantMessage()
    store.appendDelta('Response from A')
    store.finalizeMessage()

    store.handleCommandResult('get_session', {
      session: { id: 'session-b', short_id: 'b' },
      messages: [
        { role: 'user', content: 'Hello from B' },
      ],
    })

    const state = useChatStore.getState()
    expect(state.sessionId).toBe('session-b')
    expect(state.messages).toHaveLength(1)
    expect(state.messages[0].content).toBe('Hello from B')

    expect(state.sessionMessages['session-a']).toBeDefined()
    expect(state.sessionMessages['session-a']).toHaveLength(2)
    expect(state.sessionMessages['session-a'][0].content).toBe('Hello from A')
    expect(state.sessionMessages['session-a'][1].content).toBe('Response from A')
  })

  it('should restore cached messages when switching back to a previous session', () => {
    const store = useChatStore.getState()
    store.handleCommandResult('session_create', {
      session: { id: 'session-a', short_id: 'a' },
    })
    store.sendMessage('Msg A1')
    store.startAssistantMessage()
    store.appendDelta('Resp A1')
    store.finalizeMessage()

    store.handleCommandResult('get_session', {
      session: { id: 'session-b', short_id: 'b' },
      messages: [{ role: 'user', content: 'Msg B1' }],
    })

    store.handleCommandResult('get_session', {
      session: { id: 'session-a', short_id: 'a' },
      messages: [],
    })

    const state = useChatStore.getState()
    expect(state.sessionId).toBe('session-a')
    expect(state.messages).toHaveLength(2)
    expect(state.messages[0].content).toBe('Msg A1')
    expect(state.messages[1].content).toBe('Resp A1')
  })

  it('should route stream events to cached session via sessionId parameter', () => {
    const store = useChatStore.getState()
    store.handleCommandResult('session_create', {
      session: { id: 'session-a', short_id: 'a' },
    })
    store.sendMessage('Hi')
    store.finalizeMessage()

    store.handleCommandResult('get_session', {
      session: { id: 'session-b', short_id: 'b' },
      messages: [],
    })

    store.startAssistantMessage('session-a')
    store.appendDelta('Background streaming...', 'session-a')
    store.addToolEvent({ tool: 'shell', status: 'start', exec_snippet: 'ls' }, 'session-a')
    store.finalizeMessage('session-a')

    const cachedA = useChatStore.getState().sessionMessages['session-a']
    expect(cachedA).toHaveLength(2)
    expect(cachedA[1].content).toContain('Background streaming...')
    expect(cachedA[1].toolCalls).toHaveLength(1)
    expect(cachedA[1].toolCalls[0].tool).toBe('shell')

    const active = useChatStore.getState().messages
    expect(active).toHaveLength(0)
  })

  it('should track per-session streaming status', () => {
    const store = useChatStore.getState()
    store.handleCommandResult('session_create', {
      session: { id: 'sess-1', short_id: '1' },
    })

    store.startAssistantMessage()
    expect(useChatStore.getState().sessionStatus['sess-1']).toBe('streaming')
    expect(useChatStore.getState().isStreaming).toBe(true)

    store.finalizeMessage()
    expect(useChatStore.getState().sessionStatus['sess-1']).toBe('idle')
    expect(useChatStore.getState().isStreaming).toBe(false)
  })

  it('should track streaming status for non-active sessions', () => {
    const store = useChatStore.getState()
    store.handleCommandResult('session_create', {
      session: { id: 'sess-a', short_id: 'a' },
    })
    store.handleCommandResult('get_session', {
      session: { id: 'sess-b', short_id: 'b' },
      messages: [],
    })

    store.startAssistantMessage('sess-a')
    expect(useChatStore.getState().sessionStatus['sess-a']).toBe('streaming')
    expect(useChatStore.getState().isStreaming).toBe(false)

    store.finalizeMessage('sess-a')
    expect(useChatStore.getState().sessionStatus['sess-a']).toBe('idle')
  })

  it('should restore isStreaming when switching back to a streaming session', () => {
    const store = useChatStore.getState()
    store.handleCommandResult('session_create', {
      session: { id: 'sess-a', short_id: 'a' },
    })

    store.sendMessage('Hello')
    store.startAssistantMessage()
    store.appendDelta('Thinking...')

    store.handleCommandResult('get_session', {
      session: { id: 'sess-b', short_id: 'b' },
      messages: [{ role: 'user', content: 'B says hi' }],
    })

    expect(useChatStore.getState().sessionStatus['sess-a']).toBe('streaming')
    expect(useChatStore.getState().isStreaming).toBe(false)

    store.handleCommandResult('get_session', {
      session: { id: 'sess-a', short_id: 'a' },
      messages: [],
    })

    expect(useChatStore.getState().isStreaming).toBe(true)
  })

  it('should send message to a specific session via sessionId parameter', () => {
    const store = useChatStore.getState()
    store.handleCommandResult('session_create', {
      session: { id: 'sess-1' },
    })

    store.sendMessage('Direct to session 2', 'sess-2')

    expect(useChatStore.getState().messages).toHaveLength(0)

    expect(useChatStore.getState().sessionMessages['sess-2']).toBeDefined()
    expect(useChatStore.getState().sessionMessages['sess-2'][0].content).toBe('Direct to session 2')
  })

  // --- Fix: messages change on session switch ---

  it('should change messages when switching between sessions', () => {
    const store = useChatStore.getState()

    store.handleCommandResult('session_create', {
      session: { id: 'sess-alpha' },
    })
    store.sendMessage('Alpha first')
    store.startAssistantMessage()
    store.appendDelta('Alpha response')
    store.finalizeMessage()

    store.handleCommandResult('get_session', {
      session: { id: 'sess-beta' },
      messages: [{ role: 'user', content: 'Beta first' }],
    })

    let state = useChatStore.getState()
    expect(state.sessionId).toBe('sess-beta')
    expect(state.messages).toHaveLength(1)
    expect(state.messages[0].content).toBe('Beta first')

    store.handleCommandResult('get_session', {
      session: { id: 'sess-alpha' },
      messages: [],
    })

    state = useChatStore.getState()
    expect(state.sessionId).toBe('sess-alpha')
    expect(state.messages).toHaveLength(2)
    expect(state.messages[0].content).toBe('Alpha first')
    expect(state.messages[1].content).toBe('Alpha response')
  })

  // --- Bug fix: delayed stream events should not leak into active session ---

  it('should not leak delayed stream events from background session into active session', () => {
    const store = useChatStore.getState()

    store.handleCommandResult('session_create', {
      session: { id: 'sess-a' },
    })
    store.sendMessage('Question in A')
    store.startAssistantMessage('sess-a')
    store.appendDelta('Response from A', 'sess-a')

    store.handleCommandResult('get_session', {
      session: { id: 'sess-b' },
      messages: [{ role: 'user', content: 'Hello in B' }],
    })

    store.setSessionId('sess-a')
    store.appendDelta(' LATE from A', 'sess-a')

    const state = useChatStore.getState()
    expect(state.messages).toHaveLength(1)
    expect(state.messages[0].content).toBe('Hello in B')

    const cachedA = state.sessionMessages['sess-a']
    expect(cachedA).toBeDefined()
    expect(cachedA).toHaveLength(2)
    expect(cachedA[0].content).toBe('Question in A')
    expect(cachedA[1].content).toBe('Response from A LATE from A')
  })

  // --- Session ordering by updated_at ---

  it('should sort sessions by updated_at descending from session_list', () => {
    const store = useChatStore.getState()
    store.handleCommandResult('session_list', {
      sessions: [
        { id: 'old', name: 'Old', updated_at: '2024-01-01T00:00:00Z' },
        { id: 'mid', name: 'Mid', updated_at: '2024-06-01T00:00:00Z' },
        { id: 'new', name: 'New', updated_at: '2025-01-01T00:00:00Z' },
      ],
    })
    const sessions = useChatStore.getState().sessions
    expect(sessions).toHaveLength(3)
    expect(sessions[0].id).toBe('new')
    expect(sessions[1].id).toBe('mid')
    expect(sessions[2].id).toBe('old')
  })

  it('should put sessions without updated_at at the top (new sessions first)', () => {
    const store = useChatStore.getState()
    store.handleCommandResult('session_list', {
      sessions: [
        { id: 'has-date', name: 'Has Date', updated_at: '2025-01-01T00:00:00Z' },
        { id: 'no-date', name: 'No Date' },
      ],
    })
    const sessions = useChatStore.getState().sessions
    expect(sessions).toHaveLength(2)
    expect(sessions[0].id).toBe('no-date')
    expect(sessions[1].id).toBe('has-date')
  })

  it('should use deterministic tiebreaker for sessions without updated_at', () => {
    const store = useChatStore.getState()
    store.handleCommandResult('session_list', {
      sessions: [
        { id: 'c', name: 'Gamma' },
        { id: 'a', name: 'Alpha' },
        { id: 'b', name: 'Beta' },
        { id: 'd', name: 'Gamma', message_count: 5 },
      ],
    })
    const sessions = useChatStore.getState().sessions
    expect(sessions).toHaveLength(4)
    // All without updated_at — tiebreak by message_count desc, then name, then id
    expect(sessions[0].id).toBe('d')  // message_count=5, highest
    expect(sessions[1].id).toBe('a')  // Alpha
    expect(sessions[2].id).toBe('b')  // Beta
    expect(sessions[3].id).toBe('c')  // Gamma (same name as d, but d has higher message_count)
  })

  it('should keep sessions sorted after session_create adds a new one', () => {
    const store = useChatStore.getState()
    store.handleCommandResult('session_list', {
      sessions: [
        { id: 'old', name: 'Old', updated_at: '2024-01-01T00:00:00Z' },
        { id: 'mid', name: 'Mid', updated_at: '2024-06-01T00:00:00Z' },
      ],
    })
    store.handleCommandResult('session_create', {
      session: { id: 'new', name: 'New', updated_at: '2025-01-01T00:00:00Z' },
    })

    const sessions = useChatStore.getState().sessions
    expect(sessions).toHaveLength(3)
    expect(sessions[0].id).toBe('new')
    expect(sessions[1].id).toBe('mid')
    expect(sessions[2].id).toBe('old')
  })

  it('should sort sessions passed to setSessions', () => {
    const store = useChatStore.getState()
    store.setSessions([
      { id: 'z', name: 'Z', updated_at: '2023-01-01T00:00:00Z' },
      { id: 'a', name: 'A', updated_at: '2025-01-01T00:00:00Z' },
    ])
    const sessions = useChatStore.getState().sessions
    expect(sessions[0].id).toBe('a')
    expect(sessions[1].id).toBe('z')
  })

  // --- Session unread tracking ---

  it('should mark background session as unread on startAssistantMessage', () => {
    const store = useChatStore.getState()
    store.handleCommandResult('session_create', { session: { id: 'sess-a' } })
    store.handleCommandResult('get_session', { session: { id: 'sess-b' }, messages: [] })

    store.startAssistantMessage('sess-a')
    expect(useChatStore.getState().sessionUnread['sess-a']).toBe(true)
  })

  it('should mark background session as unread on appendDelta', () => {
    const store = useChatStore.getState()
    store.handleCommandResult('session_create', { session: { id: 'sess-a' } })
    store.startAssistantMessage('sess-a')
    store.handleCommandResult('get_session', { session: { id: 'sess-b' }, messages: [] })

    store.appendDelta('new data', 'sess-a')
    expect(useChatStore.getState().sessionUnread['sess-a']).toBe(true)
  })

  it('should mark background session as unread on addToolEvent', () => {
    const store = useChatStore.getState()
    store.handleCommandResult('session_create', { session: { id: 'sess-a' } })
    store.startAssistantMessage('sess-a')
    store.handleCommandResult('get_session', { session: { id: 'sess-b' }, messages: [] })

    store.addToolEvent({ tool: 'shell', status: 'start', exec_snippet: 'ls' }, 'sess-a')
    expect(useChatStore.getState().sessionUnread['sess-a']).toBe(true)
  })

  it('should mark background session as unread on finalizeMessage', () => {
    const store = useChatStore.getState()
    store.handleCommandResult('session_create', { session: { id: 'sess-a' } })
    store.startAssistantMessage('sess-a')
    store.handleCommandResult('get_session', { session: { id: 'sess-b' }, messages: [] })

    store.finalizeMessage('sess-a')
    expect(useChatStore.getState().sessionUnread['sess-a']).toBe(true)
  })

  it('should clear unread when switching to a session', () => {
    const store = useChatStore.getState()
    store.handleCommandResult('session_create', { session: { id: 'sess-a' } })
    store.handleCommandResult('get_session', { session: { id: 'sess-b' }, messages: [] })

    // Background activity on A
    store.startAssistantMessage('sess-a')
    store.appendDelta('data', 'sess-a')
    store.finalizeMessage('sess-a')
    expect(useChatStore.getState().sessionUnread['sess-a']).toBe(true)

    // Switch back to A — should clear unread
    store.handleCommandResult('get_session', { session: { id: 'sess-a' }, messages: [] })

    const unread = useChatStore.getState().sessionUnread
    expect(unread['sess-a']).toBeUndefined()
  })

  it('should not mark active session as unread', () => {
    const store = useChatStore.getState()
    store.handleCommandResult('session_create', { session: { id: 'sess-a' } })

    store.startAssistantMessage()
    expect(useChatStore.getState().sessionUnread['sess-a']).toBeUndefined()

    store.appendDelta('data')
    expect(useChatStore.getState().sessionUnread['sess-a']).toBeUndefined()

    store.addToolEvent({ tool: 'shell', status: 'start', exec_snippet: 'ls' })
    expect(useChatStore.getState().sessionUnread['sess-a']).toBeUndefined()

    store.finalizeMessage()
    expect(useChatStore.getState().sessionUnread['sess-a']).toBeUndefined()
  })

  it('should clear unread via markSessionSeen', () => {
    const store = useChatStore.getState()
    store.handleCommandResult('session_create', { session: { id: 'sess-a' } })
    store.handleCommandResult('get_session', { session: { id: 'sess-b' }, messages: [] })

    store.startAssistantMessage('sess-a')
    expect(useChatStore.getState().sessionUnread['sess-a']).toBe(true)

    store.markSessionSeen('sess-a')
    expect(useChatStore.getState().sessionUnread['sess-a']).toBeUndefined()
  })

  it('should clean up unread on session_delete', () => {
    const store = useChatStore.getState()
    store.handleCommandResult('session_create', { session: { id: 'sess-a' } })
    store.handleCommandResult('get_session', { session: { id: 'sess-b' }, messages: [] })
    store.startAssistantMessage('sess-a')
    expect(useChatStore.getState().sessionUnread['sess-a']).toBe(true)

    store.handleCommandResult('session_delete', { deleted: 'sess-a', active_cleared: false })
    expect(useChatStore.getState().sessionUnread['sess-a']).toBeUndefined()
  })

  it('should start with sessionUnread empty in initialState', () => {
    expect(useChatStore.getState().sessionUnread).toEqual({})
  })

  it('should not set unread for session_create (new session is active and seen)', () => {
    const store = useChatStore.getState()
    store.handleCommandResult('session_create', { session: { id: 'sess-new' } })
    expect(useChatStore.getState().sessionUnread['sess-new']).toBeUndefined()
  })

  describe('tool commands', () => {
    it('should populate tools from tool_list', () => {
      const store = useChatStore.getState()
      store.handleCommandResult('tool_list', {
        tools: [
          { name: 'read_file', description: 'Read a file', enabled: true, tags: ['fs'] },
          { name: 'shell', description: 'Run shell', enabled: false, tags: ['exec'] },
        ],
      })
      const state = useChatStore.getState()
      expect(state.tools).toHaveLength(2)
      expect(state.tools[0].name).toBe('read_file')
      expect(state.tools[0].enabled).toBe(true)
      expect(state.tools[1].name).toBe('shell')
      expect(state.tools[1].enabled).toBe(false)
    })

    it('should handle empty tool_list', () => {
      const store = useChatStore.getState()
      store.handleCommandResult('tool_list', { tools: [] })
      expect(useChatStore.getState().tools).toEqual([])
    })

    it('should handle tool_list with missing tools field', () => {
      const store = useChatStore.getState()
      store.handleCommandResult('tool_list', {})
      // Should not crash, tools should remain unchanged
      expect(useChatStore.getState().tools).toEqual([])
    })

    it('should enable tools from tool_enable', () => {
      useChatStore.setState({
        tools: [
          { name: 'read_file', enabled: false },
          { name: 'shell', enabled: false },
        ],
      })
      const store = useChatStore.getState()
      store.handleCommandResult('tool_enable', { enabled: ['read_file'] })
      const state = useChatStore.getState()
      expect(state.tools[0].enabled).toBe(true)
      expect(state.tools[1].enabled).toBe(false)
    })

    it('should disable tools from tool_disable', () => {
      useChatStore.setState({
        tools: [
          { name: 'read_file', enabled: true },
          { name: 'shell', enabled: true },
        ],
      })
      const store = useChatStore.getState()
      store.handleCommandResult('tool_disable', { disabled: ['shell'] })
      const state = useChatStore.getState()
      expect(state.tools[0].enabled).toBe(true)
      expect(state.tools[1].enabled).toBe(false)
    })

    it('should allow tools from tool_allow', () => {
      useChatStore.setState({
        tools: [
          { name: 'read_file', enabled: false },
          { name: 'shell', enabled: false },
        ],
      })
      const store = useChatStore.getState()
      store.handleCommandResult('tool_allow', { allowed: ['read_file'] })
      const state = useChatStore.getState()
      expect(state.tools[0].enabled).toBe(true)
      expect(state.tools[1].enabled).toBe(false)
    })

    it('should deny tools from tool_deny', () => {
      useChatStore.setState({
        tools: [
          { name: 'read_file', enabled: true },
          { name: 'shell', enabled: true },
        ],
      })
      const store = useChatStore.getState()
      store.handleCommandResult('tool_deny', { denied: ['shell'] })
      const state = useChatStore.getState()
      expect(state.tools[0].enabled).toBe(true)
      expect(state.tools[1].enabled).toBe(false)
    })

    it('should coerce string enabled to boolean', () => {
      const store = useChatStore.getState()
      store.handleCommandResult('tool_list', {
        tools: [
          { name: 'read_file', enabled: 'true' },
          { name: 'shell', enabled: '' },
        ],
      })
      const state = useChatStore.getState()
      expect(state.tools[0].enabled).toBe(true)
      expect(state.tools[1].enabled).toBe(false)
    })
  })

  // --- Purple dot / streaming status on active session ---

  it('should preserve sessionStatus when switching via get_session', () => {
    const store = useChatStore.getState()
    store.handleCommandResult('session_create', { session: { id: 'sess-a' } })
    store.sendMessage('Hello')
    store.startAssistantMessage()
    store.appendDelta('Thinking...')

    // Session A should be streaming
    expect(useChatStore.getState().sessionStatus['sess-a']).toBe('streaming')
    expect(useChatStore.getState().isStreaming).toBe(true)

    // Switch to session B
    store.handleCommandResult('get_session', {
      session: { id: 'sess-b' },
      messages: [],
    })

    // After switch: session A's status should still be 'streaming' (preserved in sessionStatus)
    expect(useChatStore.getState().sessionStatus['sess-a']).toBe('streaming')
    // isStreaming reflects the active session (B), which is not streaming
    expect(useChatStore.getState().isStreaming).toBe(false)

    // Switch back to session A
    store.handleCommandResult('get_session', {
      session: { id: 'sess-a' },
      messages: [],
    })

    // Session A should still be streaming
    expect(useChatStore.getState().sessionStatus['sess-a']).toBe('streaming')
    expect(useChatStore.getState().isStreaming).toBe(true)

    // Now finalize A (stream finished)
    store.finalizeMessage()
    expect(useChatStore.getState().sessionStatus['sess-a']).toBe('idle')
    expect(useChatStore.getState().isStreaming).toBe(false)
  })

  it('should keep sessionStatus streaming when get_session loads same session', () => {
    const store = useChatStore.getState()
    store.handleCommandResult('session_create', { session: { id: 'sess-a' } })
    store.sendMessage('Hi')
    store.startAssistantMessage()
    store.appendDelta('streaming...')

    expect(useChatStore.getState().sessionStatus['sess-a']).toBe('streaming')

    // Simulate get_session for the SAME session (e.g., on reconnect)
    store.handleCommandResult('get_session', {
      session: { id: 'sess-a' },
      messages: [{ role: 'user', content: 'Restored' }],
    })

    // sessionStatus should still be 'streaming' (the handler preserves it)
    expect(useChatStore.getState().sessionStatus['sess-a']).toBe('streaming')
    expect(useChatStore.getState().isStreaming).toBe(true)
  })

  it('should set isStreaming=false after get_session switches to non-streaming session, then true again on send', () => {
    const store = useChatStore.getState()
    store.handleCommandResult('session_create', { session: { id: 'sess-a' } })
    store.handleCommandResult('get_session', { session: { id: 'sess-b' }, messages: [] })

    // B is not streaming
    expect(useChatStore.getState().isStreaming).toBe(false)
    expect(useChatStore.getState().sessionStatus['sess-b']).toBeUndefined()

    // Simulate user sending a message (like send() does)
    const state = useChatStore.getState()
    state.sendMessage('Hello B', 'sess-b')
    state.setStreaming(true)
    useChatStore.setState({
      sessionStatus: { ...state.sessionStatus, 'sess-b': 'streaming' },
    })

    // Now B should be streaming
    expect(useChatStore.getState().sessionStatus['sess-b']).toBe('streaming')
    expect(useChatStore.getState().isStreaming).toBe(true)
  })

  it('should keep sessionStatus for all sessions during get_session switch', () => {
    const store = useChatStore.getState()
    store.handleCommandResult('session_create', { session: { id: 'sess-a' } })
    store.startAssistantMessage()
    store.handleCommandResult('get_session', { session: { id: 'sess-b' }, messages: [] })
    store.startAssistantMessage('sess-b')

    // Both sessions should show as streaming
    expect(useChatStore.getState().sessionStatus['sess-a']).toBe('streaming')
    expect(useChatStore.getState().sessionStatus['sess-b']).toBe('streaming')

    // Switch to a third session C
    store.handleCommandResult('get_session', { session: { id: 'sess-c' }, messages: [] })

    // A and B should still be streaming
    expect(useChatStore.getState().sessionStatus['sess-a']).toBe('streaming')
    expect(useChatStore.getState().sessionStatus['sess-b']).toBe('streaming')
    expect(useChatStore.getState().sessionStatus['sess-c']).toBeUndefined()
    expect(useChatStore.getState().isStreaming).toBe(false)
  })

  // --- Estimated Context Tokens ---

  it('should start with sessionEstimatedTokens as empty map', () => {
    expect(useChatStore.getState().sessionEstimatedTokens).toEqual({})
  })

  it('should set estimated context tokens per session', () => {
    const store = useChatStore.getState()
    store.setEstimatedContextTokens(12345, 'session-1')
    expect(useChatStore.getState().sessionEstimatedTokens['session-1']).toBe(12345)
  })

  it('should set estimated context tokens for active session when sessionId omitted', () => {
    useChatStore.setState({ sessionId: 'sess-active' })
    const store = useChatStore.getState()
    store.setEstimatedContextTokens(500)
    expect(useChatStore.getState().sessionEstimatedTokens['sess-active']).toBe(500)
  })

  it('should set estimated context tokens to 0', () => {
    const store = useChatStore.getState()
    store.setEstimatedContextTokens(0, 'session-1')
    expect(useChatStore.getState().sessionEstimatedTokens['session-1']).toBe(0)
  })

  it('should preserve estimated context tokens across session switch', () => {
    const store = useChatStore.getState()
    // Create session A and set tokens
    store.handleCommandResult('session_create', { session: { id: 'sess-a' } })
    store.setEstimatedContextTokens(100, 'sess-a')

    // Switch to session B
    store.handleCommandResult('get_session', { session: { id: 'sess-b' }, messages: [] })

    // Set tokens for B
    store.setEstimatedContextTokens(200, 'sess-b')

    // Switch back to A - should restore tokens
    store.handleCommandResult('get_session', { session: { id: 'sess-a' }, messages: [] })

    expect(useChatStore.getState().sessionEstimatedTokens['sess-a']).toBe(100)
    expect(useChatStore.getState().sessionEstimatedTokens['sess-b']).toBe(200)
  })

  it('should extract estimated context tokens from usage events in get_session events', () => {
    const store = useChatStore.getState()

    // Switch to a session that has events with usage data
    store.handleCommandResult('get_session', {
      session: { id: 'sess-events', name: 'Events Session', model: 'gpt-4o' },
      events: [
        { type: 'chat', text: 'Hello' },
        { type: 'delta', text: 'Hi there' },
        {
          type: 'usage',
          estimated_context_tokens: 42000,
          total_cost: 0.00150,
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
          cost: 0.00050,
        },
        { type: 'done' },
      ],
    })

    const state = useChatStore.getState()
    expect(state.sessionId).toBe('sess-events')
    expect(state.messages).toHaveLength(2)
    // Tokens and cost should be extracted from the usage event
    expect(state.sessionEstimatedTokens['sess-events']).toBe(42000)
    expect(state.sessionTotalCost['sess-events']).toBe(0.00150)
  })

  it('should extract total_cost from the LAST usage event in get_session events (cumulative)', () => {
    const store = useChatStore.getState()

    // Multiple usage events — the last one has the cumulative total_cost
    store.handleCommandResult('get_session', {
      session: { id: 'sess-multi-usage' },
      events: [
        { type: 'chat', text: 'Do two things' },
        { type: 'delta', text: 'First...' },
        { type: 'tool', id: 'c1', tool: 'read_file', status: 'start', args: { path: 'a.txt' }, snippet: "read_file 'a.txt'" },
        { type: 'tool', id: 'c1', tool: 'read_file', status: 'ok', result: 'data' },
        { type: 'usage', estimated_context_tokens: 10000, total_cost: 0.00050, total_tokens: 50 },
        { type: 'delta', text: 'Second...' },
        { type: 'tool', id: 'c2', tool: 'shell', status: 'start', args: { command: 'ls' }, snippet: 'ls' },
        { type: 'tool', id: 'c2', tool: 'shell', status: 'ok', result: 'files' },
        { type: 'usage', estimated_context_tokens: 20000, total_cost: 0.00100, total_tokens: 100 },
        { type: 'done' },
      ],
    })

    const state = useChatStore.getState()
    // Should have the LAST usage event's values (cumulative totals)
    expect(state.sessionEstimatedTokens['sess-multi-usage']).toBe(20000)
    expect(state.sessionTotalCost['sess-multi-usage']).toBe(0.00100)
  })

  it('should preserve existing tokens/cost when get_session events have no usage events', () => {
    const store = useChatStore.getState()

    // First, set some tokens for sess-no-usage
    useChatStore.setState({
      sessionEstimatedTokens: { 'sess-no-usage': 5000 },
      sessionTotalCost: { 'sess-no-usage': 0.25 },
    })

    // Switch to sess-no-usage with events that have NO usage
    store.handleCommandResult('get_session', {
      session: { id: 'sess-no-usage' },
      events: [
        { type: 'chat', text: 'Hi' },
        { type: 'delta', text: 'Hello' },
        { type: 'done' },
      ],
    })

    const state = useChatStore.getState()
    // Existing tokens should be preserved
    expect(state.sessionEstimatedTokens['sess-no-usage']).toBe(5000)
    expect(state.sessionTotalCost['sess-no-usage']).toBe(0.25)
  })

  it('should clean up estimated context tokens on session_delete', () => {
    const store = useChatStore.getState()
    store.handleCommandResult('session_create', { session: { id: 'sess-a' } })
    store.setEstimatedContextTokens(999, 'sess-a')

    store.handleCommandResult('session_delete', { deleted: 'sess-a', active_cleared: true })

    expect(useChatStore.getState().sessionEstimatedTokens['sess-a']).toBeUndefined()
  })

  // --- Total Cost ---

  it('should start with sessionTotalCost as empty map', () => {
    expect(useChatStore.getState().sessionTotalCost).toEqual({})
  })

  it('should set total cost per session', () => {
    const store = useChatStore.getState()
    store.setTotalCost(1.50, 'session-1')
    expect(useChatStore.getState().sessionTotalCost['session-1']).toBe(1.50)
  })

  it('should set total cost for active session when sessionId omitted', () => {
    useChatStore.setState({ sessionId: 'sess-active' })
    const store = useChatStore.getState()
    store.setTotalCost(0.75)
    expect(useChatStore.getState().sessionTotalCost['sess-active']).toBe(0.75)
  })

  it('should set total cost to 0', () => {
    const store = useChatStore.getState()
    store.setTotalCost(0, 'session-1')
    expect(useChatStore.getState().sessionTotalCost['session-1']).toBe(0)
  })

  it('should preserve total cost across session switch', () => {
    const store = useChatStore.getState()
    store.handleCommandResult('session_create', { session: { id: 'sess-a' } })
    store.setTotalCost(0.25, 'sess-a')

    store.handleCommandResult('get_session', { session: { id: 'sess-b' }, messages: [] })
    store.setTotalCost(0.75, 'sess-b')

    store.handleCommandResult('get_session', { session: { id: 'sess-a' }, messages: [] })

    expect(useChatStore.getState().sessionTotalCost['sess-a']).toBe(0.25)
    expect(useChatStore.getState().sessionTotalCost['sess-b']).toBe(0.75)
  })

  it('should clean up total cost on session_delete', () => {
    const store = useChatStore.getState()
    store.handleCommandResult('session_create', { session: { id: 'sess-a' } })
    store.setTotalCost(0.50, 'sess-a')

    store.handleCommandResult('session_delete', { deleted: 'sess-a', active_cleared: true })

    expect(useChatStore.getState().sessionTotalCost['sess-a']).toBeUndefined()
  })

  // --- get_session preserves model in sessions list ---

  it('should preserve model from get_session when session already exists in list', () => {
    // Simulate initial session_list response (no model field)
    useChatStore.getState().handleCommandResult('session_list', {
      sessions: [
        { id: 'sess-1', short_id: 'sess-1', name: 'Chat 1' },
      ],
    })

    // Now get_session returns the session WITH a model field
    useChatStore.getState().handleCommandResult('get_session', {
      session: { id: 'sess-1', name: 'Chat 1', model: 'gpt-4o' },
      messages: [{ role: 'user', content: 'Hello' }],
    })

    const sessions = useChatStore.getState().sessions
    const session = sessions.find(s => s.id === 'sess-1')
    expect(session).toBeDefined()
    expect(session.model).toBe('gpt-4o')
  })

  it('should preserve model from get_session even when session is new (not in list)', () => {
    const store = useChatStore.getState()
    store.handleCommandResult('get_session', {
      session: { id: 'sess-new', name: 'New Chat', model: 'claude-3.5' },
      messages: [],
    })

    const sessions = useChatStore.getState().sessions
    const session = sessions.find(s => s.id === 'sess-new')
    expect(session).toBeDefined()
    expect(session.model).toBe('claude-3.5')
  })

  it('should update model in sessions list when get_session returns updated data', () => {
    // Start with a session that has no model
    useChatStore.getState().handleCommandResult('session_list', {
      sessions: [
        { id: 'sess-1', short_id: 'sess-1', name: 'Chat 1' },
      ],
    })

    // First get_session without model
    useChatStore.getState().handleCommandResult('get_session', {
      session: { id: 'sess-1', name: 'Chat 1' },
      messages: [],
    })

    // Later get_session with model (server has updated info)
    useChatStore.getState().handleCommandResult('get_session', {
      session: { id: 'sess-1', name: 'Chat 1', model: 'gpt-4o-mini' },
      messages: [],
    })

    const sessions = useChatStore.getState().sessions
    const session = sessions.find(s => s.id === 'sess-1')
    expect(session.model).toBe('gpt-4o-mini')
  })

  // --- CWD fixes: server is source of truth, sessionCwds cache must stay in sync ---

  it('should prefer server client_cwd over cached cwd in get_session', () => {
    const store = useChatStore.getState()
    // Start with session A, set its CWD via setCwd (cached)
    store.handleCommandResult('session_create', { session: { id: 'sess-a' } })
    store.setCwd('/local/cached/path')

    // Switch to session B which has server client_cwd
    store.handleCommandResult('get_session', {
      session: { id: 'sess-b', client_cwd: '/server/path' },
      messages: [],
    })

    // Server client_cwd should win over any local cache
    expect(useChatStore.getState().cwd).toBe('/server/path')
  })

  it('should use cached cwd when server does not provide client_cwd and session was visited before', () => {
    const store = useChatStore.getState()
    // Create session A and set its CWD
    store.handleCommandResult('session_create', { session: { id: 'sess-a' } })
    store.setCwd('/cached/path')

    // Switch away to B
    store.handleCommandResult('get_session', { session: { id: 'sess-b' }, messages: [] })

    // Switch back to A — server provides no client_cwd, should use cached
    store.handleCommandResult('get_session', { session: { id: 'sess-a' }, messages: [] })

    expect(useChatStore.getState().cwd).toBe('/cached/path')
  })

  it('should cwd_set handler update both global cwd and sessionCwds cache', () => {
    const store = useChatStore.getState()
    store.handleCommandResult('session_create', { session: { id: 'sess-a' } })

    // Set CWD via server command result (simulating /cwd response)
    store.handleCommandResult('cwd_set', { cwd: '/confirmed/path' })

    const state = useChatStore.getState()
    expect(state.cwd).toBe('/confirmed/path')
    expect(state.sessionCwds['sess-a']).toBe('/confirmed/path')
  })

  it('should session_info handler update both global cwd and sessionCwds cache', () => {
    const store = useChatStore.getState()
    store.handleCommandResult('session_create', { session: { id: 'sess-a' } })

    // Simulate session_info response with client_cwd (result frame carries session_id)
    store.handleCommandResult('session_info', {
      session: { id: 'sess-a', client_cwd: '/info/path' },
      _frameSessionId: 'sess-a',
    })

    const state = useChatStore.getState()
    expect(state.cwd).toBe('/info/path')
    expect(state.sessionCwds['sess-a']).toBe('/info/path')
  })

  it('should preserve cwd across session switch and back when server always provides client_cwd', () => {
    const store = useChatStore.getState()

    // Create session A with server-provided CWD
    store.handleCommandResult('session_create', { session: { id: 'sess-a', client_cwd: '/a/path' } })

    // Switch to session B with server-provided CWD
    store.handleCommandResult('get_session', {
      session: { id: 'sess-b', client_cwd: '/b/path' },
      messages: [],
    })
    expect(useChatStore.getState().cwd).toBe('/b/path')

    // Switch back to A — should get /a/path from server (authoritative)
    store.handleCommandResult('get_session', {
      session: { id: 'sess-a', client_cwd: '/a/path' },
      messages: [],
    })
    expect(useChatStore.getState().cwd).toBe('/a/path')
  })

  it('should use cached cwd when switching back after cwd_set updated it', () => {
    const store = useChatStore.getState()

    // Create session A
    store.handleCommandResult('session_create', { session: { id: 'sess-a' } })
    store.setCwd('/initial/a')

    // Switch to B
    store.handleCommandResult('get_session', { session: { id: 'sess-b' }, messages: [] })

    // Server confirms CWD change for A (result frame carries session_id: 'sess-a')
    store.handleCommandResult('cwd_set', { cwd: '/updated/a', _frameSessionId: 'sess-a' })

    // Now sessionCwds['sess-a'] should be '/updated/a'
    expect(useChatStore.getState().sessionCwds['sess-a']).toBe('/updated/a')

    // Switch back to A — should use the cache since server provides no client_cwd
    store.handleCommandResult('get_session', { session: { id: 'sess-a' }, messages: [] })
    expect(useChatStore.getState().cwd).toBe('/updated/a')
  })
})

describe('replayEvents', () => {
  it('should convert chat event to user message', () => {
    const result = replayEvents([{ type: 'chat', text: 'Hello!' }])
    expect(result).toHaveLength(1)
    expect(result[0].role).toBe('user')
    expect(result[0].content).toBe('Hello!')
  })

  it('should convert delta events to assistant message', () => {
    const result = replayEvents([
      { type: 'delta', text: 'Hello ' },
      { type: 'delta', text: 'world' },
      { type: 'done' },
    ])
    expect(result).toHaveLength(1)
    expect(result[0].role).toBe('assistant')
    expect(result[0].content).toBe('Hello world')
  })

  it('should handle chat + delta + done sequence', () => {
    const result = replayEvents([
      { type: 'chat', text: 'Hi' },
      { type: 'delta', text: 'Hello there' },
      { type: 'done' },
    ])
    expect(result).toHaveLength(2)
    expect(result[0].role).toBe('user')
    expect(result[0].content).toBe('Hi')
    expect(result[1].role).toBe('assistant')
    expect(result[1].content).toBe('Hello there')
  })

  it('should merge consecutive chat events into one user message', () => {
    const result = replayEvents([
      { type: 'chat', text: 'Part 1' },
      { type: 'chat', text: 'Part 2' },
    ])
    expect(result).toHaveLength(1)
    expect(result[0].content).toBe('Part 1\nPart 2')
  })

  it('should insert tool marker on tool start event', () => {
    const result = replayEvents([
      { type: 'chat', text: 'Read file' },
      { type: 'delta', text: 'Reading...' },
      { type: 'tool', id: 'call_1', tool: 'read_file', status: 'start', args: { path: 'README.md' }, snippet: "read_file 'README.md'" },
      { type: 'delta', text: ' Done' },
      { type: 'done' },
    ])
    expect(result).toHaveLength(2)
    expect(result[1].toolCalls).toHaveLength(1)
    expect(result[1].toolCalls[0].tool).toBe('read_file')
    expect(result[1].toolCalls[0].status).toBe('start')
    expect(result[1].toolCalls[0].tool_call_id).toBe('call_1')
    expect(result[1].toolCalls[0].exec_snippet).toBe("read_file 'README.md'")
    expect(result[1].toolCalls[0].args).toEqual({ path: 'README.md' })
    expect(result[1].content).toContain('\x00TOOL:0\x00')
  })

  it('should update tool call status on tool ok event matching by id', () => {
    const result = replayEvents([
      { type: 'chat', text: 'Do tools' },
      { type: 'delta', text: 'Running...' },
      { type: 'tool', id: 'call_1', tool: 'read_file', status: 'start', args: { path: '/tmp/x.txt' }, snippet: 'read_file' },
      { type: 'tool', id: 'call_1', tool: 'read_file', status: 'ok', result: 'file content' },
      { type: 'done' },
    ])
    expect(result[1].toolCalls).toHaveLength(1)
    expect(result[1].toolCalls[0].status).toBe('ok')
    expect(result[1].toolCalls[0].result).toBe('file content')
    expect(result[1].toolCalls[0].data).toEqual({ result: 'file content', error: undefined })
    expect(result[1].toolCalls[0].args).toEqual({ path: '/tmp/x.txt' })
    expect(result[1].content).toContain('\x00TOOL:0\x00')
  })

  it('should update tool call status on tool err event matching by id', () => {
    const result = replayEvents([
      { type: 'chat', text: 'Try' },
      { type: 'delta', text: 'Attempting...' },
      { type: 'tool', id: 'call_err', tool: 'read_file', status: 'start', args: { path: 'missing.txt' }, snippet: 'read_file' },
      { type: 'tool', id: 'call_err', tool: 'read_file', status: 'err', error: 'not found' },
      { type: 'done' },
    ])
    expect(result[1].toolCalls).toHaveLength(1)
    expect(result[1].toolCalls[0].status).toBe('err')
    expect(result[1].toolCalls[0].error).toBe('not found')
    expect(result[1].toolCalls[0].data).toEqual({ result: undefined, error: 'not found' })
    expect(result[1].toolCalls[0].args).toEqual({ path: 'missing.txt' })
  })

  it('should handle multiple concurrent tools with different ids', () => {
    const result = replayEvents([
      { type: 'chat', text: 'Run both' },
      { type: 'delta', text: 'Starting...' },
      { type: 'tool', id: 'call_a', tool: 'read_file', status: 'start', args: { path: 'a.txt' }, snippet: "read_file 'a.txt'" },
      { type: 'tool', id: 'call_b', tool: 'shell', status: 'start', args: { command: 'ls' }, snippet: 'ls -la' },
      { type: 'tool', id: 'call_a', tool: 'read_file', status: 'ok', result: 'file a' },
      { type: 'tool', id: 'call_b', tool: 'shell', status: 'err', error: 'permission denied' },
      { type: 'delta', text: ' Done' },
      { type: 'done' },
    ])
    expect(result[1].toolCalls).toHaveLength(2)
    expect(result[1].toolCalls[0].tool).toBe('read_file')
    expect(result[1].toolCalls[0].status).toBe('ok')
    expect(result[1].toolCalls[0].args).toEqual({ path: 'a.txt' })
    expect(result[1].toolCalls[0].result).toBe('file a')
    expect(result[1].toolCalls[1].tool).toBe('shell')
    expect(result[1].toolCalls[1].status).toBe('err')
    expect(result[1].toolCalls[1].args).toEqual({ command: 'ls' })
    expect(result[1].toolCalls[1].error).toBe('permission denied')
    expect(result[1].content).toContain('\x00TOOL:0\x00')
    expect(result[1].content).toContain('\x00TOOL:1\x00')
  })

  it('should handle bare done event (no text/stats)', () => {
    const result = replayEvents([
      { type: 'chat', text: 'Hi' },
      { type: 'delta', text: 'Bye' },
      { type: 'done' },
    ])
    expect(result).toHaveLength(2)
    expect(result[1].content).toBe('Bye')
  })

  it('should create assistant message when tool event arrives before any delta', () => {
    const result = replayEvents([
      { type: 'chat', text: 'Run tool' },
      { type: 'tool', id: 'c1', tool: 'shell', status: 'start', args: {}, snippet: 'ls' },
      { type: 'tool', id: 'c1', tool: 'shell', status: 'ok', result: 'output' },
      { type: 'done' },
    ])
    expect(result).toHaveLength(2)
    expect(result[1].role).toBe('assistant')
    expect(result[1].toolCalls).toHaveLength(1)
    expect(result[1].toolCalls[0].status).toBe('ok')
    expect(result[1].content).toContain('\x00TOOL:0\x00')
  })

  it('should handle usage events (not affecting messages)', () => {
    // Usage events are informational; they don't add messages
    const result = replayEvents([
      { type: 'chat', text: 'Hi' },
      { type: 'delta', text: 'Response' },
      { type: 'usage', total_tokens: 100, estimated_context_tokens: 5000 },
      { type: 'done' },
    ])
    expect(result).toHaveLength(2)
    expect(result[0].role).toBe('user')
    expect(result[1].role).toBe('assistant')
  })

  it('should preserve assistant message when no done event (in-flight)', () => {
    const result = replayEvents([
      { type: 'chat', text: 'Question' },
      { type: 'delta', text: 'Partial answer...' },
    ])
    expect(result).toHaveLength(2)
    expect(result[1].content).toBe('Partial answer...')
    // No done — message is left as-is (streaming state implied)
  })

  it('should always create new assistant message after done', () => {
    const result = replayEvents([
      { type: 'chat', text: 'First' },
      { type: 'delta', text: 'Answer 1' },
      { type: 'done' },
      { type: 'chat', text: 'Second' },
      { type: 'delta', text: 'Answer 2' },
      { type: 'done' },
    ])
    expect(result).toHaveLength(4)
    expect(result[0].content).toBe('First')
    expect(result[1].content).toBe('Answer 1')
    expect(result[2].content).toBe('Second')
    expect(result[3].content).toBe('Answer 2')
  })

  it('should handle full example from task.md', () => {
    const events = [
      { type: 'chat', text: 'Read README.md' },
      { type: 'delta', text: 'Let me check...' },
      { type: 'tool', id: 'call_1', tool: 'read_file', status: 'start', args: { path: 'README.md' }, snippet: "read_file 'README.md'" },
      { type: 'tool', id: 'call_1', tool: 'read_file', status: 'ok', result: '# Hakka\n\nA Go framework...' },
      { type: 'delta', text: "Here's what I found in README.md..." },
      { type: 'usage', prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      { type: 'done' },
    ]
    const result = replayEvents(events)
    expect(result).toHaveLength(2)
    expect(result[0].role).toBe('user')
    expect(result[0].content).toBe('Read README.md')
    expect(result[1].role).toBe('assistant')
    expect(result[1].content).toContain('Let me check...')
    expect(result[1].content).toContain('\x00TOOL:0\x00')
    expect(result[1].content).toContain("Here's what I found in README.md...")
    expect(result[1].toolCalls).toHaveLength(1)
    expect(result[1].toolCalls[0].tool).toBe('read_file')
    expect(result[1].toolCalls[0].status).toBe('ok')
    expect(result[1].toolCalls[0].tool_call_id).toBe('call_1')
  })
})
