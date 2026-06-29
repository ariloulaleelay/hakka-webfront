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
 * Parse a slash command from user input and handle it locally.
 * All text starting with / is intercepted — never sent to the LLM.
 * Recognized commands are dispatched via execute(). Unknown commands
 * get an inline assistant error message.
 *
 * @param {string} text - The user's input text
 * @param {Function} execute - The execute function from useWebSocket
 * @returns {boolean} - true if handled as a slash command (caller should NOT send to LLM)
 */
export function parseSlashCommand(text, execute) {
  if (!text || !text.startsWith('/')) return false

  const trimmed = text.slice(1).trim()
  const parts = trimmed.split(/\s+/)
  const cmd = parts[0]?.toLowerCase()
  const args = parts.slice(1)

  const store = useChatStore.getState()
  const sid = store.sessionId

  // Show user message in chat so the command is visible in history
  store.sendMessage(text, sid)

  switch (cmd) {
    case 'help':
      execute('help', {})
      return true

    case 'tool': {
      const sub = args[0]
      if (!sub || sub === 'list') {
        execute('tool_list', {})
      } else if (sub === 'allow' && args[1]) {
        execute('tool_allow', { name: args.slice(1).join(' ') })
      } else if (sub === 'deny' && args[1]) {
        execute('tool_deny', { name: args.slice(1).join(' ') })
      } else {
        store.appendAssistantMessage(
          `Unknown command: \`${text}\`\n\nTry: \`/tool list\`, \`/tool allow <name>\`, \`/tool deny <name>\``,
          sid
        )
      }
      return true
    }

    case 'model':
    case 'models': {
      if (cmd === 'models' || args[0] === 'list') {
        execute('model_list', {})
      } else if (args[0] === 'switch' && args[1]) {
        execute('model_switch', { name: args.slice(1).join(' ') })
      } else {
        store.appendAssistantMessage(
          `Unknown command: \`${text}\`\n\nTry: \`/models\`, \`/model list\`, \`/model switch <name>\``,
          sid
        )
      }
      return true
    }

    case 'session': {
      const sub = args[0]
      if (sub === 'list') {
        execute('session_list', {})
      } else if (sub === 'info') {
        execute('session_info', {})
      } else if (sub === 'rename' && args.slice(1).join(' ')) {
        execute('session_rename', { name: args.slice(1).join(' ') })
      } else {
        store.appendAssistantMessage(
          `Unknown command: \`${text}\`\n\nTry: \`/session list\`, \`/session info\`, \`/session rename <name>\``,
          sid
        )
      }
      return true
    }

    case 'compact': {
      const n = parseInt(args[0], 10)
      if (!isNaN(n) && n > 0) {
        execute('compact', { n })
      } else {
        store.appendAssistantMessage(
          `Usage: \`/compact <n>\` — compact to last \`n\` messages`,
          sid
        )
      }
      return true
    }

    case 'cwd': {
      const path = args.join(' ')
      if (path) {
        execute('cwd_set', { cwd: path })
      } else {
        store.appendAssistantMessage(
          `Usage: \`/cwd <path>\` — set working directory`,
          sid
        )
      }
      return true
    }

    case 'continue':
      execute('continue', {})
      return true

    case 'start':
      execute('start', {})
      return true

    default:
      store.appendAssistantMessage(
        `Unknown command: \`${text}\`\n\nType \`/help\` for available commands.`,
        sid
      )
      return true
  }
}

/**
 * Manages a WebSocket connection to a Hakka instance using the JSON command API.
 * Tolerates reconnections: preserves session state across disconnects and
 * automatically restores the last active session when the connection resumes.
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
      sendRaw({ command: { cmd: 'session_list', params: {} } })
      const pendingId = readPendingSession()
      const lastId = pendingId || readLastSession()
      if (lastId && state.sessionId !== lastId) {
        sendRaw({ command: { cmd: 'get_session', params: { id: lastId } } })
      }
    }

    ws.onmessage = (event) => {
      let frame
      try {
        frame = JSON.parse(event.data)
      } catch {
        return
      }
      handleFrame(frame)
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

  function handleFrame(frame) {
    const store = useChatStore.getState()
    const sid = getSid(frame)

    if (frame.error) {
      store.setError(frame.error)
      if (sid && streamingStartedRef.current[sid]) {
        store.finalizeMessage(sid)
      }
      return
    }

    if (frame.event === 'session_renamed') {
      store.handleSessionRenamed(sid, frame.session_name || frame.data?.name)
      return
    }

    if (frame.event === 'session_autorename') {
      const data = frame.data || {}
      if (data.session && data.session.id && data.session.name) {
        store.handleSessionRenamed(data.session.id, data.session.name)
      }
      return
    }

    // Token usage metadata — extract estimated_context_tokens if present.
    if (frame.event === 'meta') {
      if (frame.data && frame.data.estimated_context_tokens !== undefined) {
        store.setEstimatedContextTokens(frame.data.estimated_context_tokens, sid)
      }
      return
    }

    if (frame.event === 'cancel') {
      // Cancel acknowledgment from server — clear cancelling state.
      store.handleCancelResponse()
      return
    }

    if (frame.event === 'tool') {
      // Merge top-level frame fields (tool, status, args, exec_snippet)
      // with frame.data (which carries result/output for finish events).
      const event = {
        ...(frame.data || {}),
        tool: frame.tool,
        status: frame.status,
        args: frame.args,
        exec_snippet: frame.exec_snippet,
      }
      store.addToolEvent(event, sid)
      return
    }

    if (frame.event === 'command_result' && frame.cmd) {
      store.handleCommandResult(frame.cmd, frame.data || {})

      const cmdSid = getSid(frame)

      // Persist last session when switching via get_session
      if (frame.cmd === 'get_session') {
        const switchSid = frame.data?.session?.id
        if (switchSid) {
          persistLastSession(switchSid)
          clearPendingSession()
        }
      }

      // For command results triggered by slash commands (parseSlashCommand),
      // build a readable summary and push it as an assistant message.

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
        const models = frame.data.models
        const lines = models.map((m) => {
          return '  ' + (m.current ? '✓' : ' ') + ' ' + (m.name || m.model || '')
        })
        const msg = '**Models**\n\n```\n' + lines.join('\n') + '\n```'
        store.appendAssistantMessage(msg, cmdSid)
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

      // NOTE: We can't just remove the early return and let done:true fall through
      // to the done handler below, because other command_result frames (e.g.,
      // session_list sent via execute()) can arrive while a different session is
      // mid-stream via LLM. The done handler would call finalizeMessage with
      // wrong session_id and prematurely stop that stream.
      // Only tool_list needs explicit finalization because it's triggered via
      // send() (chat message) which sets isStreaming=true.
      return
    }

    // Backward compatibility: handle old session_switch event format
    if (frame.event === 'session_switch') {
      const data = frame.data || {}
      store.handleCommandResult('get_session', data)
      const switchSid = data.session?.id
      if (switchSid) {
        persistLastSession(switchSid)
        clearPendingSession()
      }
      return
    }

    if (frame.event === 'session_create') {
      const data = frame.data || {}
      store.handleCommandResult('session_create', data)
      return
    }

    if (frame.event === 'session_list') {
      store.handleCommandResult('session_list', { sessions: frame.data?.sessions || [] })
      return
    }

    if (frame.event === 'session_info') {
      store.handleCommandResult('session_info', { session: frame.data?.session || {} })
      return
    }

    // Client request (e.g., vim tool asking the web UI to perform an action).
    // The web UI doesn't support any client-side requests, so respond with error.
    if (frame.event === 'vim_request' || frame.event === 'client_request') {
      const req = frame.vim_request || frame.client_request || {}
      if (req.request_id) {
        sendRaw({
          type: 'response',
          request_id: req.request_id,
          error: 'unsupported',
        })
      }
      return
    }

    const targetSid = sid != null ? sid : useChatStore.getState().sessionId

    if (frame.delta !== undefined) {
      if (!streamingStartedRef.current[targetSid]) {
        streamingStartedRef.current[targetSid] = true
        deltasReceivedRef.current[targetSid] = false
        store.startAssistantMessage(targetSid)
      }
      if (frame.delta) {
        deltasReceivedRef.current[targetSid] = true
        store.appendDelta(frame.delta, targetSid)
      }
      return
    }

    if (frame.output !== undefined) {
      if (!streamingStartedRef.current[targetSid]) {
        streamingStartedRef.current[targetSid] = true
        store.startAssistantMessage(targetSid)
      }
      if (!deltasReceivedRef.current[targetSid]) {
        // Non-stream path: no prior deltas, so this is the first (and only) content.
        // There may already be an empty assistant message from a tool event.
        store.appendDelta(frame.output, targetSid)
      }
      // If deltas were received, skip the output — the accumulated content already
      // has the correct text with \x00TOOL:N\x00 markers embedded inline by addToolEvent.
      // Appending the output (full text, no markers) would either double the content
      // (background session) or strip tool markers (active session).
      delete streamingStartedRef.current[targetSid]
      delete deltasReceivedRef.current[targetSid]
      store.finalizeMessage(targetSid)
      return
    }

    if (frame.done) {
      delete streamingStartedRef.current[targetSid]
      delete deltasReceivedRef.current[targetSid]
      store.finalizeMessage(targetSid)
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
      sendRaw({
        session_id: actualId,
        input: text,
        stream: stream !== false,
        cwd: store.cwd || '/',
      })
    },
    []
  )

  const execute = useCallback(
    (cmd, params = {}) => {
      const store = useChatStore.getState()
      const payload = { command: { cmd, params } }
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
