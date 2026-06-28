import { describe, it, expect, beforeEach } from 'vitest'
import { useChatStore } from '../store/useChatStore'

describe('useChatStore', () => {
  beforeEach(() => {
    useChatStore.setState({
      messages: [],
      sessionId: null,
      sessions: [],
      sessionMessages: {},
      sessionStatus: {},
      sessionUnread: {},
      connectionStatus: 'disconnected',
      isStreaming: false,
      isCancelling: false,
      error: null,
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
    useChatStore.getState().addToolEvent({ tool: 'shell', status: 'start', exec_snippet: 'curl wttr.in' })
    useChatStore.getState().addToolEvent({ tool: 'shell', status: 'ok' })
    useChatStore.getState().finalizeMessage()
    const toolCalls = useChatStore.getState().messages[1].toolCalls
    expect(toolCalls).toHaveLength(1)
    expect(toolCalls[0].status).toBe('ok')
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

  it('should handle session_switch command result with messages and set cwd', () => {
    useChatStore.getState().handleCommandResult('session_switch', {
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

  it('should handle session_switch without client_cwd (keep current cwd)', () => {
    useChatStore.setState({ cwd: '/my/current/dir' })
    useChatStore.getState().handleCommandResult('session_switch', {
      session: { id: 'switched', name: 'Other' },
      messages: [],
    })
    expect(useChatStore.getState().sessionId).toBe('switched')
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

  it('should merge tool messages and consecutive assistants via session_switch', () => {
    const store = useChatStore.getState()
    store.handleCommandResult('session_switch', {
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
    store.handleCommandResult('session_switch', {
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
    store.handleCommandResult('session_switch', {
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
    store.handleCommandResult('session_switch', {
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

  it('should save current messages to cache and load target on session_switch', () => {
    const store = useChatStore.getState()
    store.handleCommandResult('session_create', {
      session: { id: 'session-a', short_id: 'a' },
    })
    store.sendMessage('Hello from A')
    store.startAssistantMessage()
    store.appendDelta('Response from A')
    store.finalizeMessage()

    store.handleCommandResult('session_switch', {
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

    store.handleCommandResult('session_switch', {
      session: { id: 'session-b', short_id: 'b' },
      messages: [{ role: 'user', content: 'Msg B1' }],
    })

    store.handleCommandResult('session_switch', {
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

    store.handleCommandResult('session_switch', {
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
    store.handleCommandResult('session_switch', {
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

    store.handleCommandResult('session_switch', {
      session: { id: 'sess-b', short_id: 'b' },
      messages: [{ role: 'user', content: 'B says hi' }],
    })

    expect(useChatStore.getState().sessionStatus['sess-a']).toBe('streaming')
    expect(useChatStore.getState().isStreaming).toBe(false)

    store.handleCommandResult('session_switch', {
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

    store.handleCommandResult('session_switch', {
      session: { id: 'sess-beta' },
      messages: [{ role: 'user', content: 'Beta first' }],
    })

    let state = useChatStore.getState()
    expect(state.sessionId).toBe('sess-beta')
    expect(state.messages).toHaveLength(1)
    expect(state.messages[0].content).toBe('Beta first')

    store.handleCommandResult('session_switch', {
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

    store.handleCommandResult('session_switch', {
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

  it('should put sessions without updated_at at the end', () => {
    const store = useChatStore.getState()
    store.handleCommandResult('session_list', {
      sessions: [
        { id: 'has-date', name: 'Has Date', updated_at: '2025-01-01T00:00:00Z' },
        { id: 'no-date', name: 'No Date' },
      ],
    })
    const sessions = useChatStore.getState().sessions
    expect(sessions).toHaveLength(2)
    expect(sessions[0].id).toBe('has-date')
    expect(sessions[1].id).toBe('no-date')
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
    store.handleCommandResult('session_switch', { session: { id: 'sess-b' }, messages: [] })

    store.startAssistantMessage('sess-a')
    expect(useChatStore.getState().sessionUnread['sess-a']).toBe(true)
  })

  it('should mark background session as unread on appendDelta', () => {
    const store = useChatStore.getState()
    store.handleCommandResult('session_create', { session: { id: 'sess-a' } })
    store.startAssistantMessage('sess-a')
    store.handleCommandResult('session_switch', { session: { id: 'sess-b' }, messages: [] })

    store.appendDelta('new data', 'sess-a')
    expect(useChatStore.getState().sessionUnread['sess-a']).toBe(true)
  })

  it('should mark background session as unread on addToolEvent', () => {
    const store = useChatStore.getState()
    store.handleCommandResult('session_create', { session: { id: 'sess-a' } })
    store.startAssistantMessage('sess-a')
    store.handleCommandResult('session_switch', { session: { id: 'sess-b' }, messages: [] })

    store.addToolEvent({ tool: 'shell', status: 'start', exec_snippet: 'ls' }, 'sess-a')
    expect(useChatStore.getState().sessionUnread['sess-a']).toBe(true)
  })

  it('should mark background session as unread on finalizeMessage', () => {
    const store = useChatStore.getState()
    store.handleCommandResult('session_create', { session: { id: 'sess-a' } })
    store.startAssistantMessage('sess-a')
    store.handleCommandResult('session_switch', { session: { id: 'sess-b' }, messages: [] })

    store.finalizeMessage('sess-a')
    expect(useChatStore.getState().sessionUnread['sess-a']).toBe(true)
  })

  it('should clear unread when switching to a session', () => {
    const store = useChatStore.getState()
    store.handleCommandResult('session_create', { session: { id: 'sess-a' } })
    store.handleCommandResult('session_switch', { session: { id: 'sess-b' }, messages: [] })

    // Background activity on A
    store.startAssistantMessage('sess-a')
    store.appendDelta('data', 'sess-a')
    store.finalizeMessage('sess-a')
    expect(useChatStore.getState().sessionUnread['sess-a']).toBe(true)

    // Switch back to A — should clear unread
    store.handleCommandResult('session_switch', { session: { id: 'sess-a' }, messages: [] })

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
    store.handleCommandResult('session_switch', { session: { id: 'sess-b' }, messages: [] })

    store.startAssistantMessage('sess-a')
    expect(useChatStore.getState().sessionUnread['sess-a']).toBe(true)

    store.markSessionSeen('sess-a')
    expect(useChatStore.getState().sessionUnread['sess-a']).toBeUndefined()
  })

  it('should clean up unread on session_delete', () => {
    const store = useChatStore.getState()
    store.handleCommandResult('session_create', { session: { id: 'sess-a' } })
    store.handleCommandResult('session_switch', { session: { id: 'sess-b' }, messages: [] })
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
})
