import { useEffect, useRef, useCallback } from 'react'
import { useChatStore } from '../store/useChatStore'

const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000]
const STORAGE_KEY_LAST_SESSION = 'hakka_last_session_id'
const STORAGE_KEY_PENDING_SESSION = 'hakka_pending_session'

function persistLastSession(id) {
  try {
    if (id) localStorage.setItem(STORAGE_KEY_LAST_SESSION, id)
    else localStorage.removeItem(STORAGE_KEY_LAST_SESSION)
  } catch {
    // localStorage may be unavailable
  }
}

function readLastSession() {
  try {
    return localStorage.getItem(STORAGE_KEY_LAST_SESSION)
  } catch {
    return null
  }
}

function persistPendingSession(sessionId) {
  try {
    if (sessionId) localStorage.setItem(STORAGE_KEY_PENDING_SESSION, sessionId)
    else localStorage.removeItem(STORAGE_KEY_PENDING_SESSION)
  } catch {
    // localStorage may be unavailable
  }
}

function readPendingSession() {
  try {
    return localStorage.getItem(STORAGE_KEY_PENDING_SESSION)
  } catch {
    return null
  }
}

function clearPendingSession() {
  try {
    localStorage.removeItem(STORAGE_KEY_PENDING_SESSION)
  } catch {
    // localStorage may be unavailable
  }
}

/**
 * Manages a WebSocket connection to a Hakka instance using the v2 JSON protocol.
 * Every frame has a mandatory `type` field.
 * Tolerates reconnections: preserves session state across disconnects and
 * automatically restores the correct session on reconnect: first checks the
 * server's welcome message for an in_flight flag, then falls back to localStorage.
 */
export function useWebSocket(url) {
  const wsRef = useRef(null)
  const retryIndexRef = useRef(0)
  const retryTimerRef = useRef(null)
  const streamingStartedRef = useRef({})
  const deltasReceivedRef = useRef({})
  const stoppedRef = useRef(false)

  function getSid(frame) {
    return frame.session_id || useChatStore.getState().sessionId
  }

  const connect = useCallback(() => {
    if (stoppedRef.current) return
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    if (wsRef.current) {
      const old = wsRef.current
      old.onopen = null
      old.onmessage = null
      old.onclose = null
      old.onerror = null
      old.close()
      wsRef.current = null
    }

    const store = useChatStore.getState()
    store.setConnectionStatus('disconnected')

    let ws
    try {
      ws = new WebSocket(url)
    } catch (e) {
      retryIndexRef.current = 0
      scheduleRetry()
      return
    }
    wsRef.current = ws

    ws.onopen = () => {
      const state = useChatStore.getState()
      state.setConnectionStatus('connected')
      retryIndexRef.current = 0
      // v2: No session_list sent on connect — server pushes welcome frame.
      // Session loading (in_flight, localStorage fallback) happens reactively
      // in the welcome handler.
    }

    ws.onmessage = (event) => {
      let frame
      try {
        frame = JSON.parse(event.data)
      } catch {
        return
      }
      handleV2Frame(frame)
    }

    ws.onclose = () => {
      const store = useChatStore.getState()
      store.setConnectionStatus('disconnected')
      if (!stoppedRef.current) {
        scheduleRetry()
      }
    }

    ws.onerror = () => {}

    function scheduleRetry() {
      if (stoppedRef.current || retryTimerRef.current) return
      const delay = RECONNECT_DELAYS[Math.min(retryIndexRef.current, RECONNECT_DELAYS.length - 1)]
      retryIndexRef.current++
      const store = useChatStore.getState()
      store.setConnectionStatus('reconnecting')
      retryTimerRef.current = setTimeout(() => {
        retryTimerRef.current = null
        connect()
      }, delay)
    }
  }, [url])

  function sendRaw(payload) {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    ws.send(JSON.stringify(payload))
  }

  /**
   * Handle incoming v2 protocol frame by dispatching on `frame.type`.
   * Every server->client frame has a mandatory `type` field.
   */
  function handleV2Frame(frame) {
    const store = useChatStore.getState()
    const sid = getSid(frame)

    switch (frame.type) {
      // --- welcome: connection greeting with session list ---
      case 'welcome': {
        const sessions = frame.sessions || []
        store.handleCommandResult('session_list', { sessions })

        const state = useChatStore.getState()
        const inFlight = sessions.find((s) => s.in_flight)

        if (inFlight) {
          // Server says this session is active — load it
          if (state.sessionId !== inFlight.id) {
            persistLastSession(inFlight.id)
            clearPendingSession()
            sendRaw({ type: 'cmd', command: { cmd: 'get_session', params: { id: inFlight.id } } })
          }
        } else if (!state.sessionId) {
          // No in_flight and no active session: fall back to localStorage
          const pendingId = readPendingSession()
          const lastId = pendingId || readLastSession()
          if (lastId) {
            sendRaw({ type: 'cmd', command: { cmd: 'get_session', params: { id: lastId } } })
          }
        }
        return
      }

      // --- delta: streaming text chunk ---
      case 'delta': {
        const targetSid = sid
        if (!streamingStartedRef.current[targetSid]) {
          streamingStartedRef.current[targetSid] = true
          deltasReceivedRef.current[targetSid] = false
          store.startAssistantMessage(targetSid, frame.ts)
        }
        if (frame.text) {
          deltasReceivedRef.current[targetSid] = true
          store.appendDelta(frame.text, targetSid)
        }
        return
      }

      // --- output: full non-stream reply (before done) ---
      case 'output': {
        const targetSid = sid
        if (!streamingStartedRef.current[targetSid]) {
          streamingStartedRef.current[targetSid] = true
          store.startAssistantMessage(targetSid, frame.ts)
        }
        if (frame.text && !deltasReceivedRef.current[targetSid]) {
          store.appendDelta(frame.text, targetSid)
        }
        // If deltas were already received, skip the output — accumulated
        // content with \x00TOOL:N\x00 markers must be preserved.
        return
      }

      // --- done: terminal frame (stream complete, error, or cancelled) ---
      case 'done': {
        const targetSid = sid
        const hadDeltas = deltasReceivedRef.current[targetSid]
        delete streamingStartedRef.current[targetSid]
        delete deltasReceivedRef.current[targetSid]

        // Handle cancelled
        if (frame.cancelled) {
          store.handleCancelResponse()
          if (targetSid) store.finalizeMessage(targetSid)
          return
        }

        // Handle error
        if (frame.error) {
          store.setError(frame.error)
          if (targetSid) store.finalizeMessage(targetSid)
          return
        }

        // Handle output on done (final accumulated text for non-stream)
        if (frame.text && targetSid && !hadDeltas) {
          // No deltas were received — this is the non-stream path
          // (Note: streamingStartedRef was just deleted, so check
          //  by seeing if we need to create an assistant message)
          const state = useChatStore.getState()
          const msgs = targetSid === state.sessionId ? state.messages : (state.sessionMessages[targetSid] || [])
          const last = msgs[msgs.length - 1]
          if (!last || last.role !== 'assistant') {
            store.startAssistantMessage(targetSid)
          }
          store.appendDelta(frame.text, targetSid)
        }

        // Handle stats (end-of-turn metadata)
        if (frame.stats) {
          const stats = frame.stats
          if (stats.estimated_context_tokens !== undefined) {
            store.setEstimatedContextTokens(stats.estimated_context_tokens, targetSid)
          }
          if (stats.total_cost !== undefined) {
            store.setTotalCost(stats.total_cost, targetSid)
          }
          if (stats.model && targetSid) {
            store.setModel(targetSid, stats.model)
          }
        }

        // Always finalize on done
        if (targetSid) {
          store.finalizeMessage(targetSid)
        } else {
          store.setStreaming(false)
        }
        return
      }

      // --- tool: tool lifecycle (start/ok/err) ---
      case 'tool': {
        const event = {
          tool: frame.tool,
          status: frame.status,
          args: frame.args,
          exec_snippet: frame.snippet,
          tool_call_id: frame.id, // v2: unique tool call id for matching start→ok/err
          // For finish events, carry result/error
          data: frame.result || frame.error ? { result: frame.result, error: frame.error } : undefined,
          result: frame.result,
          error: frame.error,
          timestamp: frame.ts,
        }
        store.addToolEvent(event, sid)
        return
      }

      // --- usage: token usage after each LLM call ---
      case 'usage': {
        const data = frame
        if (data.estimated_context_tokens !== undefined) {
          store.setEstimatedContextTokens(data.estimated_context_tokens, sid)
        }
        if (data.total_cost !== undefined) {
          store.setTotalCost(data.total_cost, sid)
        }
        return
      }

      // --- result: command output (replaces event:"command_result") ---
      case 'result': {
        if (frame.cmd) {
          store.handleCommandResult(frame.cmd, { ...frame.data, _frameSessionId: frame.session_id })

          const cmdSid = getSid(frame)

          // Persist last session when switching via get_session
          if (frame.cmd === 'get_session') {
            const switchSid = frame.data?.session?.id
            if (switchSid) {
              persistLastSession(switchSid)
              clearPendingSession()
            }
          }

          // After switching sessions, fetch session info (model, etc.)
          if (frame.cmd === 'get_session') {
            const targetSid = frame.data?.session?.id || store.sessionId
            sendRaw({ type: 'cmd', session_id: targetSid, command: { cmd: 'session_info', params: {} } })
          }

          // Format readable summaries for slash command results
          if (frame.cmd === 'tool_list' && frame.data?.tools) {
            const tools = frame.data.tools
            const enabled = tools.filter((t) => t.enabled).length
            const disabled = tools.filter((t) => !t.enabled).length
            const lines = tools.map((t) => {
              const tags = (t.tags || []).join(', ')
              return '  ' + (t.enabled ? '✓' : '✗') + ' ' + t.name + '  (tags: ' + tags + ')'
            })
            const header = '**Available tools (' + tools.length + ')** — ' + enabled + ' enabled, ' + disabled + ' disabled'
            const msg = header + '\n\n```\n' + lines.join('\n') + '\n```'
            store.appendAssistantMessage(msg, cmdSid)
          }

          if (frame.cmd === 'help' && frame.data?.commands) {
            const commands = frame.data.commands
            const lines = commands.map((c) => {
              const name = c.name || c.cmd || ''
              const desc = c.description || c.desc || ''
              return '  `' + name + '` — ' + desc
            })
            const msg = '**Available commands**\n\n' + lines.join('\n')
            store.appendAssistantMessage(msg, cmdSid)
          }

          if (frame.cmd === 'model_list' && frame.data?.models) {
            // If this was triggered silently (by model dropdown), don't show in chat
            if (store._suppressModelListDisplay) {
              useChatStore.getState().setSuppressModelListDisplay(false)
            } else {
              const models = frame.data.models
              const lines = models.map((m) => {
                return '  ' + (m.current ? '✓' : ' ') + ' ' + (m.name || m.model || '')
              })
              const msg = '**Models**\n\n```\n' + lines.join('\n') + '\n```'
              store.appendAssistantMessage(msg, cmdSid)
            }
          }

          if (frame.cmd === 'model_switch' && frame.data?.model) {
            const msg = 'Switched to model: **' + frame.data.model + '**'
            store.appendAssistantMessage(msg, cmdSid)
          }

          if (frame.cmd === 'cwd_set' && frame.data?.cwd) {
            store.appendAssistantMessage('Working directory set to: **' + frame.data.cwd + '**', cmdSid)
          }

          if (frame.cmd === 'compact') {
            store.appendAssistantMessage('Compacted session.', cmdSid)
          }
        }
        return
      }

      // --- session: lifecycle event (created/renamed/deleted) ---
      case 'session': {
        const sSid = frame.session_id
        // If frame has session and/or messages at top level, treat as session switch
        if (frame.session || frame.messages) {
          store.handleCommandResult('get_session', {
            session: frame.session || { id: sSid },
            messages: frame.messages || [],
            events: frame.events,
          })
          if (sSid) {
            persistLastSession(sSid)
            clearPendingSession()
          }
          return
        }
        // Otherwise, handle lifecycle events (created/renamed/deleted)
        switch (frame.event) {
          case 'created':
            store.handleCommandResult('session_create', {
              session: {
                id: sSid,
                name: frame.name || '',
                model: frame.model,
                message_count: frame.message_count,
              },
            })
            break
          case 'renamed':
            store.handleSessionRenamed(sSid, frame.name)
            break
          case 'deleted':
            store.handleCommandResult('session_delete', { deleted: sSid, active_cleared: sSid === store.sessionId })
            break
        }
        return
      }

      // --- req: server requests client action ---
      case 'req': {
        const req = frame
        if (req.request_id) {
          sendRaw({
            type: 'resp',
            request_id: req.request_id,
            error: 'unsupported',
          })
        }
        return
      }

      // --- error: error before any turn started ---
      case 'error': {
        store.setError(frame.error)
        return
      }

      default:
        // Unknown frame type — ignore
        return
    }
  }

  const send = useCallback(
    (sessionId, text, stream) => {
      const store = useChatStore.getState()
      const actualId = sessionId || store.sessionId
      store.sendMessage(text, actualId)
      store.setStreaming(true)
      if (actualId) {
        const status = { ...store.sessionStatus, [actualId]: 'streaming' }
        useChatStore.setState({ sessionStatus: status })
      }
      // v2: use type:"chat", no cwd
      sendRaw({
        type: 'chat',
        session_id: actualId,
        input: text,
        stream: stream !== false,
      })
    },
    []
  )

  const execute = useCallback(
    (cmd, params = {}) => {
      const store = useChatStore.getState()
      // v2: use type:"cmd"
      const payload = { type: 'cmd', command: { cmd, params } }
      if (store.sessionId) {
        payload.session_id = store.sessionId
      }
      sendRaw(payload)
    },
    []
  )

  const cancel = useCallback(
    (sessionId) => {
      const store = useChatStore.getState()
      store.requestCancel()
      sendRaw({ type: 'cancel', session_id: sessionId || store.sessionId })
    },
    []
  )

  useEffect(() => {
    stoppedRef.current = false
    connect()
    return () => {
      stoppedRef.current = true
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current)
        retryTimerRef.current = null
      }
      if (wsRef.current) {
        const old = wsRef.current
        old.onopen = null
        old.onmessage = null
        old.onclose = null
        old.onerror = null
        old.close()
        wsRef.current = null
      }
    }
  }, [connect])

  return { send, execute, cancel }
}
