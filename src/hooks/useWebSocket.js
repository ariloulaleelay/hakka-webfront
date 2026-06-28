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

      const pendingId = readPendingSession()
      const lastId = pendingId || readLastSession()
      if (lastId && state.sessionId !== lastId) {
        sendRaw({ command: { cmd: 'session_switch', params: { id: lastId } } })
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

    ws.onerror = () => {
      // onclose will fire next
    }

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

    if (frame.event === 'tool') {
      // Properties can be in frame.data (real server) or at top level (test frames)
      const event = frame.data || frame
      store.addToolEvent(event, sid)
      return
    }

    if (frame.event === 'command_result' && frame.cmd) {
      store.handleCommandResult(frame.cmd, frame.data || {})
      return
    }

    if (frame.event === 'session_switch') {
      const data = frame.data || {}
      const switchSid = data.session?.id
      if (switchSid) {
        persistLastSession(switchSid)
        clearPendingSession()
      }
      store.handleCommandResult('session_switch', data)
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

    if (frame.init_mode) {
      store.handleCommandResult('session_list', { sessions: frame.sessions || [] })
      if (frame.session_id) {
        store.setSessionId(frame.session_id)
        persistLastSession(frame.session_id)
        clearPendingSession()
        streamingStartedRef.current = {}
        deltasReceivedRef.current = {}
      }
      return
    }

    if (frame.event === 'session_info') {
      store.handleCommandResult('session_info', { session: frame.data?.session || {} })
      return
    }

    // Determine session context — use store's sessionId as fallback
    const targetSid = sid !== undefined ? sid : useChatStore.getState().sessionId

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

    if (frame.done) {
      delete streamingStartedRef.current[targetSid]
      delete deltasReceivedRef.current[targetSid]
      store.finalizeMessage(targetSid)
      return
    }

    if (frame.output !== undefined) {
      if (!streamingStartedRef.current[targetSid]) {
        streamingStartedRef.current[targetSid] = true
        store.startAssistantMessage(targetSid)
      }
      store.appendDelta(frame.output, targetSid)
      delete streamingStartedRef.current[targetSid]
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
