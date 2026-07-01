import { useCallback, useEffect } from 'react'
import { ChatArea } from './components/ChatArea'
import { InputBar } from './components/InputBar'
import { Sidebar } from './components/Sidebar'
import { CwdBar } from './components/CwdBar'
import { TokensBar } from './components/TokensBar'
import { useWebSocket } from './hooks/useWebSocket'
import { parseSlashCommand } from './utils/parseSlashCommand'
import { useChatStore } from './store/useChatStore'
import './App.css'

const INITIAL_CWD = import.meta.env.VITE_CWD || '/'

function App() {
  const config = useChatStore((s) => s.config)
  const { send, execute, cancel } = useWebSocket(config.wsUrl)
  const sessionId = useChatStore((s) => s.sessionId)
  const error = useChatStore((s) => s.error)
  const clearError = useChatStore((s) => s.clearError)
  const setStoreCwd = useChatStore((s) => s.setCwd)

  // Apply theme on mount and when it changes
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', config.theme)
  }, [config.theme])

  useEffect(() => {
    setStoreCwd(INITIAL_CWD)
  }, [])

  const handleSend = useCallback(
    (text) => {
      // Intercept slash commands — parse locally, never send to LLM
      if (parseSlashCommand(text, execute)) return
      send(sessionId, text, true)
    },
    [send, sessionId, execute]
  )

  const handleCancel = useCallback(() => {
    cancel(sessionId)
  }, [cancel, sessionId])

  const handleNewSession = useCallback(() => {
    execute('session_create', {})
  }, [execute])

  const handleSwitchSession = useCallback(
    (id) => {
      execute('get_session', { id })
    },
    [execute]
  )

  const handleDeleteSession = useCallback(
    (id) => {
      execute('session_delete', { id })
    },
    [execute]
  )

  const handleCwdChange = useCallback(
    (cwd) => {
      execute('cwd_set', { cwd })
    },
    [execute]
  )

  return (
    <div className="app">
      <Sidebar
        onNewSession={handleNewSession}
        onSwitchSession={handleSwitchSession}
        onDeleteSession={handleDeleteSession}
        onExecute={execute}
      />

      <div className="app__main-area">
        <header className="app__header">
          <CwdBar onCwdChange={handleCwdChange} />
          <TokensBar />
        </header>

        {error && (
          <div className="app__error" onClick={clearError}>
            {error}
          </div>
        )}

        <main className="app__chat">
          <ChatArea />
        </main>

        <footer className="app__footer">
          <InputBar onSend={handleSend} onCancel={handleCancel} />
        </footer>
      </div>
    </div>
  )
}

export default App
