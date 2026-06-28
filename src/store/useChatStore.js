import { create } from 'zustand'

/**
 * Generate a unique message ID using crypto.randomUUID().
 */
function genId() {
  return crypto.randomUUID()
}

/**
 * Marker inserted into message content where a tool call was invoked.
 * The index refers to the toolCalls array on the same message.
 * Rendering splits on this marker to interleave ToolCall components inline.
 */
function toolMarker(idx) {
  return `\x00TOOL:${idx}\x00`
}

/**
 * Get a display snippet for a tool call from raw server data.
 */
function getToolSnippet(m) {
  if (m.exec_snippet) return m.exec_snippet
  if (m.snippet) return m.snippet
  return m.tool || m.name || ''
}

/**
 * Convert snake_case `tool_calls` (server format) to our internal toolCalls format.
 */
function convertToolCalls(toolCalls) {
  if (!toolCalls || !Array.isArray(toolCalls)) return []
  return toolCalls.map((tc) => ({
    tool: tc.name || '',
    status: 'start',
    exec_snippet: getToolSnippet(tc),
    tool_call_id: tc.id || '',
  }))
}

/**
 * Normalize messages from the server (e.g. from session_switch).
 */
function normalizeMessages(rawMessages) {
  const result = []
  for (const m of rawMessages || []) {
    if (m.role === 'tool') {
      const last = result[result.length - 1]
      let execSnippet = getToolSnippet(m)
      let toolName = m.tool || m.name || ''

      if (last && last.role === 'assistant' && m.tool_call_id) {
        const match = (last.toolCalls || []).find(
          (tc) => tc.tool_call_id === m.tool_call_id
        )
        if (match) {
          execSnippet = match.exec_snippet || execSnippet
          toolName = match.tool || toolName
        }
      }

      const toolCall = {
        tool: toolName,
        status: m.status || 'ok',
        exec_snippet: execSnippet,
      }

      if (last && last.role === 'assistant') {
        const existingIdx = m.tool_call_id
          ? (last.toolCalls || []).findIndex(
              (tc) => tc.tool_call_id === m.tool_call_id
            )
          : -1

        if (existingIdx >= 0) {
          const updated = [...last.toolCalls]
          updated[existingIdx] = { ...updated[existingIdx], status: m.status || 'ok' }
          last.toolCalls = updated
        } else {
          last.toolCalls = [...(last.toolCalls || []), toolCall]
          last.content += toolMarker(last.toolCalls.length - 1)
        }
      } else {
        result.push({
          id: genId(),
          role: 'assistant',
          content: toolMarker(0),
          toolCalls: [toolCall],
          timestamp: m.timestamp || Date.now(),
        })
      }
    } else {
      const last = result[result.length - 1]
      if (last && last.role === m.role) {
        const sep = last.content && m.content ? '\n' : ''
        last.content += sep + (m.content || '')

        const converted = convertToolCalls(m.tool_calls)
        if (converted.length > 0) {
          const startIdx = (last.toolCalls || []).length
          last.toolCalls = [...(last.toolCalls || []), ...converted]
          converted.forEach((_, idx) => {
            last.content += toolMarker(startIdx + idx)
          })
        }
        if (m.toolCalls && m.toolCalls.length > 0) {
          last.toolCalls = [...(last.toolCalls || []), ...m.toolCalls]
        }
      } else {
        let toolCalls = m.toolCalls || []
        const converted = convertToolCalls(m.tool_calls)
        if (converted.length > 0) {
          toolCalls = [...toolCalls, ...converted]
        }
        let content = m.content || ''
        toolCalls.forEach((_, idx) => {
          content += toolMarker(idx)
        })
        result.push({
          id: m.id || genId(),
          role: m.role,
          content,
          toolCalls,
          timestamp: m.timestamp || Date.now(),
        })
      }
    }
  }
  return result
}

/**
 * Sort sessions by updated_at descending (most recent first).
 * Sessions without updated_at are placed at the end.
 */
function sortSessionsByUpdated(sessions) {
  if (!sessions) return sessions
  return [...sessions].sort((a, b) => {
    if (!a.updated_at && !b.updated_at) return 0
    if (!a.updated_at) return 1
    if (!b.updated_at) return -1
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  })
}

/**
 * Check if a session has a human-readable name (non-empty, not matching
 * shortId or a UUID pattern).
 */
function hasReadableName(session) {
  if (!session) return false
  if (!session.name || session.name === '') return false
  if (session.shortId && session.name === session.shortId) return false
  if (session.name === session.id) return false
  if (session.name.length > 20) return false
  return true
}

/**
 * Resolve which message array to read for a given session.
 */
function getSessionMsgs(state, sessionId) {
  if (!sessionId || sessionId === state.sessionId) {
    return state.messages
  }
  return state.sessionMessages[sessionId] || []
}

/**
 * Return a partial state update that sets the message array for the
 * given session (active or cached).
 */
function setSessionMsgs(state, sessionId, msgs) {
  if (!sessionId || sessionId === state.sessionId) {
    return { messages: msgs }
  }
  return {
    sessionMessages: { ...state.sessionMessages, [sessionId]: msgs },
  }
}

const DEFAULT_WS_URL = import.meta.env.VITE_WS_URL || 'ws://127.0.0.1:8765/ws'

function loadConfig() {
  try {
    const raw = localStorage.getItem('hakka_config')
    if (raw) {
      const parsed = JSON.parse(raw)
      return {
        wsUrl: parsed.wsUrl || DEFAULT_WS_URL,
        theme: parsed.theme || 'dark',
      }
    }
  } catch {
    // ignore parse errors
  }
  return { wsUrl: DEFAULT_WS_URL, theme: 'dark' }
}

function saveConfig(config) {
  try {
    localStorage.setItem('hakka_config', JSON.stringify(config))
  } catch {
    // localStorage may be unavailable
  }
}

/**
 * Chat store — manages messages per session, connection state, streaming,
 * session, session list, and config.
 */
export const useChatStore = create((set, get) => ({
  // --- State ---
  messages: [],
  sessionMessages: {},
  sessionStatus: {},
  sessionCwds: {},
  sessionUnread: {},
  sessionId: null,
  connectionStatus: 'disconnected',
  isStreaming: false,
  isCancelling: false,
  error: null,

  sessions: [],
  cwd: null,
  tools: [],

  /** Application config (persisted to localStorage). */
  config: loadConfig(),

  // --- Actions ---

  /** Update config and persist to localStorage. */
  setConfig: (partial) => {
    set((state) => {
      const updated = { ...state.config, ...partial }
      saveConfig(updated)
      return { config: updated }
    })
  },

  markSessionSeen: (sessionId) => {
    if (!sessionId) return
    set((state) => {
      if (!state.sessionUnread[sessionId]) return {}
      const updated = { ...state.sessionUnread }
      delete updated[sessionId]
      return { sessionUnread: updated }
    })
  },

  sendMessage: (content, sessionId) => {
    const msg = {
      id: genId(),
      role: 'user',
      content,
      timestamp: Date.now(),
    }
    set((state) => {
      const msgs = getSessionMsgs(state, sessionId)
      const last = msgs[msgs.length - 1]
      let updated
      if (last && last.role === 'user') {
        const merged = [...msgs]
        merged[merged.length - 1] = {
          ...last,
          content: last.content + (last.content && content ? '\n' : '') + content,
        }
        updated = merged
      } else {
        updated = [...msgs, msg]
      }
      return {
        ...setSessionMsgs(state, sessionId, updated),
        error: null,
      }
    })
    return msg
  },

  startAssistantMessage: (sessionId) => {
    const state = get()
    const msgs = getSessionMsgs(state, sessionId)
    const last = msgs[msgs.length - 1]
    if (last && last.role === 'assistant') {
      set({
        isStreaming: !sessionId || sessionId === state.sessionId,
        isCancelling: false,
        sessionStatus: {
          ...state.sessionStatus,
          [sessionId || state.sessionId]: 'streaming',
        },
      })
      return last
    }
    const msg = {
      id: genId(),
      role: 'assistant',
      content: '',
      toolCalls: [],
      timestamp: Date.now(),
    }
    const sid = sessionId || state.sessionId
    const isBackground = sessionId && sessionId !== state.sessionId
    set((state) => ({
      ...setSessionMsgs(state, sid, [...getSessionMsgs(state, sid), msg]),
      isStreaming: !sessionId || sessionId === state.sessionId,
      isCancelling: false,
      sessionStatus: { ...state.sessionStatus, [sid]: 'streaming' },
      sessionUnread: isBackground
        ? { ...state.sessionUnread, [sid]: true }
        : state.sessionUnread,
    }))
    return msg
  },

  appendDelta: (delta, sessionId) => {
    set((state) => {
      const msgs = [...getSessionMsgs(state, sessionId)]
      if (msgs.length > 0 && msgs[msgs.length - 1].role === 'assistant') {
        const last = { ...msgs[msgs.length - 1] }
        last.content += delta
        msgs[msgs.length - 1] = last
      }
      const isBackground = sessionId && sessionId !== state.sessionId
      return {
        ...setSessionMsgs(state, sessionId, msgs),
        sessionUnread: isBackground
          ? { ...state.sessionUnread, [sessionId]: true }
          : state.sessionUnread,
      }
    })
  },

  finalizeMessage: (sessionId) => {
    set((state) => {
      const sid = sessionId || state.sessionId
      const isActive = !sessionId || sessionId === state.sessionId
      const isBackground = sessionId && sessionId !== state.sessionId
      return {
        isStreaming: isActive ? false : state.isStreaming,
        isCancelling: isActive ? false : state.isCancelling,
        sessionStatus: { ...state.sessionStatus, [sid]: 'idle' },
        sessionUnread: isBackground
          ? { ...state.sessionUnread, [sid]: true }
          : state.sessionUnread,
      }
    })
  },

  addToolEvent: (event, sessionId) => {
    set((state) => {
      const msgs = [...getSessionMsgs(state, sessionId)]
      let last = msgs[msgs.length - 1]

      // If no assistant message exists, create one
      if (!last || last.role !== 'assistant') {
        const newMsg = {
          id: genId(),
          role: 'assistant',
          content: '',
          toolCalls: [],
          timestamp: Date.now(),
        }
        msgs.push(newMsg)
        last = newMsg
      }

      const toolCalls = [...(last.toolCalls || [])]
      const entry = { ...event, id: genId(), timestamp: Date.now() }

      if (event.status === 'start') {
        toolCalls.push(entry)
        last.content += toolMarker(toolCalls.length - 1)
      } else {
        const existingIdx = event.exec_snippet
          ? toolCalls.findLastIndex(
              (tc) =>
                tc.tool === event.tool &&
                tc.exec_snippet === event.exec_snippet &&
                tc.status === 'start'
            )
          : toolCalls.findLastIndex(
              (tc) => tc.tool === event.tool && tc.status === 'start'
            )
        if (existingIdx >= 0) {
          toolCalls[existingIdx] = { ...toolCalls[existingIdx], ...entry, id: toolCalls[existingIdx].id }
        } else {
          toolCalls.push(entry)
        }
      }

      msgs[msgs.length - 1] = { ...last, toolCalls }
      const isBackground = sessionId && sessionId !== state.sessionId
      return {
        ...setSessionMsgs(state, sessionId, msgs),
        sessionUnread: isBackground
          ? { ...state.sessionUnread, [sessionId]: true }
          : state.sessionUnread,
      }
    })
  },
  setConnectionStatus: (status) => {
    set((state) => {
      const update = { connectionStatus: status }
      if (status === 'connected') {
        update.isStreaming = false
        update.isCancelling = false
      }
      return update
    })
  },

  setError: (error) => {
    set({ error, isCancelling: false, isStreaming: false })
  },

  clearError: () => set({ error: null }),

  setSessionId: (id) => {
    set((state) => {
      if (!id) return { sessionId: id }
      const exists = state.sessions.some((s) => s.id === id)
      if (exists) return {}
      return {
        sessionId: id,
        sessions: sortSessionsByUpdated([...state.sessions, { id, shortId: id.slice(0, 8), name: '' }]),
      }
    })
  },

  handleCommandResult: (cmd, data) => {
    if (!data) return
    switch (cmd) {
      case 'session_list':
        if (Array.isArray(data.sessions)) set({ sessions: sortSessionsByUpdated(data.sessions) })
        break
      case 'session_create':
        if (data.session) {
          set((state) => {
            const serverCwd = data.session.client_cwd
            const newSessions = state.sessions.some(s => s.id === data.session.id)
              ? state.sessions
              : sortSessionsByUpdated([...state.sessions, data.session])
            return {
              sessionId: data.session.id,
              messages: [],
              sessionMessages: state.sessionId && state.messages.length > 0
                ? { ...state.sessionMessages, [state.sessionId]: state.messages }
                : state.sessionMessages,
              sessionCwds: state.sessionId
                ? { ...state.sessionCwds, [state.sessionId]: state.cwd }
                : state.sessionCwds,
              sessions: newSessions,
              cwd: serverCwd || state.cwd,
            }
          })
        }
        break
      case 'session_switch':
        if (data.session) {
          set((state) => {
            const oldId = state.sessionId
            const newSessionMessages = { ...state.sessionMessages }
            if (oldId && state.messages.length > 0) {
              newSessionMessages[oldId] = state.messages
            }
            const newSessionCwds = { ...state.sessionCwds }
            if (oldId) {
              newSessionCwds[oldId] = state.cwd
            }
            const targetId = data.session.id
            const cached = newSessionMessages[targetId]
            const targetMessages = cached || normalizeMessages(data.messages)
            const targetCwd = newSessionCwds[targetId] || data.session.client_cwd || state.cwd
            const newSessions = state.sessions.some(s => s.id === targetId)
              ? state.sessions
              : sortSessionsByUpdated([...state.sessions, data.session])
            const newUnread = { ...state.sessionUnread }
            delete newUnread[targetId]
            return {
              sessionId: targetId,
              messages: targetMessages,
              sessionMessages: newSessionMessages,
              sessionCwds: newSessionCwds,
              sessions: newSessions,
              cwd: targetCwd,
              isStreaming: state.sessionStatus[targetId] === 'streaming',
              sessionUnread: newUnread,
            }
          })
        }
        break
      case 'session_delete':
        if (data.deleted) {
          set((state) => {
            const newSessionMessages = { ...state.sessionMessages }
            delete newSessionMessages[data.deleted]
            const newSessionStatus = { ...state.sessionStatus }
            delete newSessionStatus[data.deleted]
            const newSessionCwds = { ...state.sessionCwds }
            delete newSessionCwds[data.deleted]
            const newUnread = { ...state.sessionUnread }
            delete newUnread[data.deleted]
            return {
              sessions: state.sessions.filter(s => s.id !== data.deleted),
              sessionId: data.active_cleared ? null : state.sessionId,
              messages: data.active_cleared ? [] : state.messages,
              sessionMessages: newSessionMessages,
              sessionStatus: newSessionStatus,
              sessionCwds: newSessionCwds,
              sessionUnread: newUnread,
            }
          })
        }
        break
      case 'session_info':
        if (data.session) {
          set((state) => ({
            sessions: state.sessions.map(s =>
              s.id === data.session.id ? { ...s, ...data.session } : s
            ),
            cwd: data.session.client_cwd || state.cwd,
          }))
        }
        break
      case 'session_rename':
      case 'session_autorename':
        if (data.session) {
          set((state) => ({
            sessions: state.sessions.map(s =>
              s.id === data.session.id ? { ...s, name: data.session.name } : s
            ),
          }))
        }
        break
      case 'tool_list':
        if (Array.isArray(data.tools)) {
          set({ tools: data.tools.map((t) => ({ ...t, enabled: !!t.enabled })) })
        }
        break
      case 'tool_enable':
        if (Array.isArray(data.enabled)) {
          set((state) => ({
            tools: state.tools.map((t) =>
              data.enabled.includes(t.name) ? { ...t, enabled: true } : t
            ),
          }))
        }
        break
      case 'tool_disable':
        if (Array.isArray(data.disabled)) {
          set((state) => ({
            tools: state.tools.map((t) =>
              data.disabled.includes(t.name) ? { ...t, enabled: false } : t
            ),
          }))
        }
        break
    }
  },

  setMessages: (rawMessages) => {
    set({ messages: normalizeMessages(rawMessages) })
  },

  setSessions: (sessions) => set({ sessions: sortSessionsByUpdated(sessions) }),
  setTools: (tools) => set({ tools }),
  setCwd: (cwd) => {
    set((state) => ({
      cwd,
      sessionCwds: state.sessionId
        ? { ...state.sessionCwds, [state.sessionId]: cwd }
        : state.sessionCwds,
    }))
  },
  clearMessages: () => set({ messages: [] }),
  /** Set isStreaming without creating a message (for immediate Cancel button). */
  setStreaming: (val) => set({ isStreaming: val }),

  requestCancel: () => set({ isCancelling: true }),
  handleCancelResponse: () => set({ isCancelling: false, isStreaming: false }),

  handleSessionRenamed: (sessionId, newName) => {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId ? { ...s, name: newName } : s
      ),
    }))
  },
}))
