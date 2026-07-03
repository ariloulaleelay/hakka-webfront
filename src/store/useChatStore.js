import { create } from 'zustand'

/**
 * Generate a unique message ID.
 * Uses crypto.randomUUID() in secure contexts (HTTPS), falls back to
 * crypto.getRandomValues() for HTTP (where randomUUID is not available).
 */
function genId() {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // Fallback for insecure contexts (HTTP) — UUID v4 via getRandomValues
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40 // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80 // variant 10
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`
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
    // Preserve arguments/args for expandable details
    args: tc.arguments || tc.args || '',
  }))
}

/**
 * Normalize messages from the server (e.g. from get_session).
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
          updated[existingIdx] = {
            ...updated[existingIdx],
            status: m.status || 'ok',
            // Preserve result/output/data from tool response for expandable details
            data: m.data || m.output || m.result || m.content,
            output: m.output || m.content || '',
            content: m.content || '',
          }
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
          toolCalls: [{
            ...toolCall,
            data: m.data || m.output || m.result || m.content,
            output: m.output || m.content || '',
            content: m.content || '',
          }],
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
 * Replay events array from get_session to produce normalized messages.
 *
 * Mirrors the live streaming code path (handleV2Frame) but synchronous —
 * directly computes the messages array instead of calling store actions.
 *
 * Event types: chat, delta, tool (start/ok/err), usage, done.
 *
 * @param {Array} events - Array of typed event objects
 * @returns {Array} Normalized messages array (same format as normalizeMessages)
 */
export function replayEvents(events) {
  const result = []
  let currentAssistant = null

  for (const event of events || []) {
    switch (event.type) {
      case 'chat': {
        const msg = {
          id: genId(),
          role: 'user',
          content: event.text || '',
          timestamp: event.ts !== undefined ? event.ts : Date.now(),
        }
        const last = result[result.length - 1]
        if (last && last.role === 'user') {
          last.content += (last.content ? '\n' : '') + msg.content
        } else {
          result.push(msg)
        }
        currentAssistant = null
        break
      }

      case 'delta': {
        if (!currentAssistant) {
          currentAssistant = {
            id: genId(),
            role: 'assistant',
            content: '',
            toolCalls: [],
            timestamp: event.ts !== undefined ? event.ts : Date.now(),
          }
          result.push(currentAssistant)
        }
        currentAssistant.content += (event.text || '')
        break
      }

      case 'tool': {
        if (!currentAssistant) {
          currentAssistant = {
            id: genId(),
            role: 'assistant',
            content: '',
            toolCalls: [],
            timestamp: Date.now(),
          }
          result.push(currentAssistant)
        }
        const toolCalls = currentAssistant.toolCalls

        if (event.status === 'start') {
          const entry = {
            tool: event.tool,
            status: 'start',
            args: event.args,
            exec_snippet: event.snippet,
            tool_call_id: event.id,
            data: undefined,
            result: undefined,
            error: undefined,
            id: genId(),
            timestamp: event.ts !== undefined ? event.ts : Date.now(),
          }
          toolCalls.push(entry)
          currentAssistant.content += toolMarker(toolCalls.length - 1)
        } else {
          // Match by id (tool_call_id)
          const existingIdx = event.id
            ? toolCalls.findLastIndex((tc) => tc.tool_call_id === event.id)
            : -1
          if (existingIdx >= 0) {
            // Only update fields that change on ok/err — preserve args, snippet, tool_call_id from start
            toolCalls[existingIdx] = {
              ...toolCalls[existingIdx],
              status: event.status || 'ok',
              result: event.result,
              error: event.error,
              data: event.result || event.error
                ? { result: event.result, error: event.error }
                : undefined,
            }
          }
        }
        break
      }

      case 'usage':
        // Tokens/cost are tracked per-session in the store, not in messages array.
        // The caller extracts usage from events separately.
        break

      case 'done':
        // Bare done — no text or stats. Just reset current assistant tracker
        // so subsequent chat/delta events create new messages.
        currentAssistant = null
        break
    }
  }

  return result
}

/**
 * Sort sessions by updated_at descending (most recent first).
 * Sessions without updated_at are placed at the end.
 */
/**
 * Sort sessions: newest updated_at first, sessions without updated_at
 * (newly created) at the very top.
 */
function sortSessionsByUpdated(sessions) {
  if (!sessions) return sessions
  return [...sessions].sort((a, b) => {
    // Sessions without updated_at go first (newly created / never updated)
    if (!a.updated_at && !b.updated_at) {
      // Tiebreaker for sessions without dates
      return tiebreak(a, b)
    }
    if (!a.updated_at) return -1
    if (!b.updated_at) return 1
    // Both have updated_at — compare descending
    const diff = new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    if (diff !== 0) return diff
    return tiebreak(a, b)
  })
}

/** Deterministic tiebreaker for sessions with equal sort keys. */
function tiebreak(a, b) {
  // message_count descending
  if ((a.message_count || 0) !== (b.message_count || 0)) {
    return (b.message_count || 0) - (a.message_count || 0)
  }
  // name ascending
  const aName = a.name || a.short_id || a.id || ''
  const bName = b.name || b.short_id || b.id || ''
  if (aName !== bName) return aName.localeCompare(bName)
  // id ascending (final tiebreaker)
  return (a.id || '').localeCompare(b.id || '')
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

function loadPrompts() {
  try {
    const raw = localStorage.getItem('hakka_prompts')
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function savePrompts(prompts) {
  try {
    localStorage.setItem('hakka_prompts', JSON.stringify(prompts))
  } catch {
    // localStorage may be unavailable
  }
}

/**
 * Bump updated_at on a session to now, then re-sort the session list.
 * Call from actions that modify messages for a session.
 */
function touchSession(state, sessionId) {
  if (!sessionId) return {}
  return {
    sessions: sortSessionsByUpdated(
      state.sessions.map((s) =>
        s.id === sessionId ? { ...s, updated_at: new Date().toISOString() } : s
      )
    ),
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
  sessionEstimatedTokens: {},
  sessionTotalCost: {},
  sessionUnread: {},
  sessionId: null,
  connectionStatus: 'disconnected',
  isStreaming: false,
  isCancelling: false,
  error: null,

  sessions: [],
  cwd: null,
  tools: [],
  models: [],
  /** Prompt templates persisted to localStorage. */
  prompts: loadPrompts(),
  /** When set, InputBar picks this up as text to paste. */
  draftText: null,

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
        ...touchSession(state, sessionId || state.sessionId),
        error: null,
      }
    })
    return msg
  },

  startAssistantMessage: (sessionId, ts) => {
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
        ...touchSession(state, sessionId || state.sessionId),
      })
      return last
    }
    const msg = {
      id: genId(),
      role: 'assistant',
      content: '',
      toolCalls: [],
      timestamp: ts !== undefined ? ts : Date.now(),
    }
    const sid = sessionId || state.sessionId
    const isBackground = sessionId && sessionId !== state.sessionId
    set((state) => ({
      ...setSessionMsgs(state, sid, [...getSessionMsgs(state, sid), msg]),
      isStreaming: !sessionId || sessionId === state.sessionId,
      isCancelling: false,
      sessionStatus: { ...state.sessionStatus, [sid]: 'streaming' },
      ...touchSession(state, sid),
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
        ...touchSession(state, sessionId || state.sessionId),
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
        ...touchSession(state, sid),
        sessionUnread: isBackground
          ? { ...state.sessionUnread, [sid]: true }
          : state.sessionUnread,
      }
    })
  },

  appendAssistantMessage: (content, sessionId) => {
    const msg = {
      id: genId(),
      role: 'assistant',
      content,
      toolCalls: [],
      timestamp: Date.now(),
    }
    const sid = sessionId || get().sessionId
    set((state) => ({
      ...setSessionMsgs(state, sid, [...getSessionMsgs(state, sid), msg]),
      isCancelling: false,
    }))
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
      const entry = { ...event, id: genId(), timestamp: event.timestamp !== undefined ? event.timestamp : Date.now() }

      if (event.status === 'start') {
        toolCalls.push(entry)
        last.content += toolMarker(toolCalls.length - 1)
      } else {
        // Match by tool_call_id (v2: unique id per tool call), then by snippet+name
        const existingIdx = event.tool_call_id
          ? toolCalls.findLastIndex(
              (tc) => tc.tool_call_id === event.tool_call_id
            )
          : event.exec_snippet
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
          toolCalls[existingIdx] = { ...toolCalls[existingIdx], status: entry.status, result: entry.result, error: entry.error, data: entry.data }
        } else {
          toolCalls.push(entry)
        }
      }

      msgs[msgs.length - 1] = { ...last, toolCalls }
      const isBackground = sessionId && sessionId !== state.sessionId
      return {
        ...setSessionMsgs(state, sessionId, msgs),
        ...touchSession(state, sessionId || state.sessionId),
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
      case 'get_session':
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
            const newSessionTokens = { ...state.sessionEstimatedTokens }
            if (oldId && state.sessionEstimatedTokens[state.sessionId] !== undefined) {
              newSessionTokens[oldId] = state.sessionEstimatedTokens[state.sessionId]
            }
            const newSessionCosts = { ...state.sessionTotalCost }
            if (oldId && state.sessionTotalCost[state.sessionId] !== undefined) {
              newSessionCosts[oldId] = state.sessionTotalCost[state.sessionId]
            }
            const targetId = data.session.id
            const cached = newSessionMessages[targetId]
            let targetMessages
            let isInFlight = false
            if (data.events && !cached) {
              targetMessages = replayEvents(data.events)
              // Detect in-flight session: events array doesn't end with {"type":"done"}
              const lastEvent = data.events[data.events.length - 1]
              isInFlight = !(lastEvent && lastEvent.type === 'done')
            } else {
              targetMessages = cached || normalizeMessages(data.messages)
            }
            // Always extract token/cost data from usage events when events are available,
            // even if the session is cached. This ensures tokens/cost are populated
            // when switching to a cached session that didn't have them stored yet.
            if (data.events) {
              for (const event of data.events) {
                if (event.type === 'usage') {
                  if (event.estimated_context_tokens !== undefined) {
                    newSessionTokens[targetId] = event.estimated_context_tokens
                  }
                  if (event.total_cost !== undefined) {
                    newSessionCosts[targetId] = event.total_cost
                  }
                }
              }
            }
            // Also extract token/cost data from the session object itself,
            // in case the server includes it directly (e.g. from session_info
            // data or enriched session metadata).
            const sess = data.session
            if (sess.estimated_context_tokens !== undefined) {
              newSessionTokens[targetId] = sess.estimated_context_tokens
            }
            if (sess.total_cost !== undefined) {
              newSessionCosts[targetId] = sess.total_cost
            }
            const targetCwd = data.session.client_cwd || newSessionCwds[targetId] || state.cwd
            const newSessions = state.sessions.some(s => s.id === targetId)
              ? sortSessionsByUpdated(state.sessions.map(s => s.id === targetId ? { ...s, ...data.session } : s))
              : sortSessionsByUpdated([...state.sessions, data.session])
            const newUnread = { ...state.sessionUnread }
            delete newUnread[targetId]
            const result = {
              sessionId: targetId,
              messages: targetMessages,
              sessionMessages: newSessionMessages,
              sessionCwds: newSessionCwds,
              sessionEstimatedTokens: newSessionTokens,
              sessionTotalCost: newSessionCosts,
              sessions: newSessions,
              cwd: targetCwd,
              isStreaming: state.sessionStatus[targetId] === 'streaming' || isInFlight,
              sessionUnread: newUnread,
            }
            if (isInFlight) {
              result.sessionStatus = { ...state.sessionStatus, [targetId]: 'streaming' }
            }
            return result
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
            const newSessionTokens = { ...state.sessionEstimatedTokens }
            delete newSessionTokens[data.deleted]
            const newSessionCosts = { ...state.sessionTotalCost }
            delete newSessionCosts[data.deleted]
            const newUnread = { ...state.sessionUnread }
            delete newUnread[data.deleted]
            return {
              sessions: state.sessions.filter(s => s.id !== data.deleted),
              sessionId: data.active_cleared ? null : state.sessionId,
              messages: data.active_cleared ? [] : state.messages,
              sessionMessages: newSessionMessages,
              sessionStatus: newSessionStatus,
              sessionCwds: newSessionCwds,
              sessionEstimatedTokens: newSessionTokens,
              sessionTotalCost: newSessionCosts,
              sessionUnread: newUnread,
            }
          })
        }
        break
      case 'session_info':
        if (data.session) {
          set((state) => {
            const serverCwd = data.session.client_cwd
            const sid = data._frameSessionId || state.sessionId
            const sess = data.session
            return {
              sessions: sortSessionsByUpdated(state.sessions.map(s =>
                s.id === sess.id ? { ...s, ...sess } : s
              )),
              cwd: serverCwd || state.cwd,
              sessionCwds: sid && serverCwd
                ? { ...state.sessionCwds, [sid]: serverCwd }
                : state.sessionCwds,
              sessionEstimatedTokens: sess.estimated_context_tokens !== undefined
                ? { ...state.sessionEstimatedTokens, [sess.id]: sess.estimated_context_tokens }
                : state.sessionEstimatedTokens,
              sessionTotalCost: sess.total_cost !== undefined
                ? { ...state.sessionTotalCost, [sess.id]: sess.total_cost }
                : state.sessionTotalCost,
            }
          })
        }
        break
      case 'session_rename':
      case 'session_autorename':
        if (data.session) {
          set((state) => ({
            sessions: sortSessionsByUpdated(state.sessions.map(s =>
              s.id === data.session.id ? { ...s, name: data.session.name } : s
            )),
          }))
        }
        break
      case 'tool_list':
        if (Array.isArray(data.tools)) {
          set({ tools: data.tools.map((t) => ({ ...t, enabled: !!t.enabled })) })
        }
        break
      case 'tool_allow':
        if (Array.isArray(data.allowed)) {
          set((state) => ({
            tools: state.tools.map((t) =>
              data.allowed.includes(t.name) ? { ...t, enabled: true } : t
            ),
          }))
        }
        break
      case 'tool_deny':
        if (Array.isArray(data.denied)) {
          set((state) => ({
            tools: state.tools.map((t) =>
              data.denied.includes(t.name) ? { ...t, enabled: false } : t
            ),
          }))
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
      case 'model_list':
        if (Array.isArray(data.models)) {
          set({ models: data.models })
        }
        break
      case 'model_switch':
        if (data.model) {
          set((state) => ({
            models: (state.models || []).map((m) => ({
              ...m,
              current: (m.name || m.model) === data.model,
            })),
          }))
        }
        break
      case 'cwd_set':
        if (data.cwd) {
          set((state) => {
            const sid = data._frameSessionId || state.sessionId
            return {
              cwd: data.cwd,
              sessionCwds: sid
                ? { ...state.sessionCwds, [sid]: data.cwd }
                : state.sessionCwds,
            }
          })
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
  /** Set estimated context tokens for a session. */
  setEstimatedContextTokens: (count, sessionId) => {
    set((state) => ({
      sessionEstimatedTokens: {
        ...state.sessionEstimatedTokens,
        [sessionId || state.sessionId]: count,
      },
    }))
  },
  /** Set total cost for a session. */
  setTotalCost: (cost, sessionId) => {
    set((state) => ({
      sessionTotalCost: {
        ...state.sessionTotalCost,
        [sessionId || state.sessionId]: cost,
      },
    }))
  },
  /** Set model name for a session in the sessions list. */
  setModel: (sessionId, model) => {
    set((state) => ({
      sessions: sortSessionsByUpdated(state.sessions.map((s) =>
        s.id === sessionId ? { ...s, model } : s
      )),
    }))
  },
  clearMessages: () => set({ messages: [] }),
  /** Set isStreaming without creating a message (for immediate Cancel button). */
  setStreaming: (val) => set({ isStreaming: val }),

  requestCancel: () => set({ isCancelling: true }),
  handleCancelResponse: () => set({ isCancelling: false, isStreaming: false }),

  handleSessionRenamed: (sessionId, newName) => {
    set((state) => ({
      sessions: sortSessionsByUpdated(state.sessions.map((s) =>
        s.id === sessionId ? { ...s, name: newName } : s
      )),
    }))
  },

  // --- Prompt Templates ---

  /** Add a new prompt template. */
  addPrompt: (prompt) => {
    const newPrompt = { ...prompt, id: prompt.id || genId() }
    set((state) => {
      const updated = [...state.prompts, newPrompt]
      savePrompts(updated)
      return { prompts: updated }
    })
    return newPrompt
  },

  /** Update an existing prompt template. */
  updatePrompt: (id, changes) => {
    set((state) => {
      const updated = state.prompts.map((p) =>
        p.id === id ? { ...p, ...changes } : p
      )
      savePrompts(updated)
      return { prompts: updated }
    })
  },

  /** Delete a prompt template by id. */
  deletePrompt: (id) => {
    set((state) => {
      const updated = state.prompts.filter((p) => p.id !== id)
      savePrompts(updated)
      return { prompts: updated }
    })
  },

  /** Set draft text — InputBar will pick it up and paste it. */
  setDraftText: (text) => set({ draftText: text }),

  /** Clear draft text (called by InputBar after consuming it). */
  clearDraftText: () => set({ draftText: null }),
}))
