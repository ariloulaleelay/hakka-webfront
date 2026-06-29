import { useState, useCallback, useEffect } from 'react'
import { useChatStore } from '../store/useChatStore'

/**
 * Configuration modal — allows changing WebSocket URL, theme, testing
 * connection, and viewing/managing tools.
 */
export function ConfigMenu({ onClose, onExecute }) {
  const config = useChatStore((s) => s.config)
  const setConfig = useChatStore((s) => s.setConfig)
  const connectionStatus = useChatStore((s) => s.connectionStatus)
  const tools = useChatStore((s) => s.tools)

  const [wsUrl, setWsUrl] = useState(config.wsUrl)
  const [theme, setTheme] = useState(config.theme)
  const [testStatus, setTestStatus] = useState(null)
  const [dirty, setDirty] = useState(false)

  // Fetch tool list on mount
  useEffect(() => {
    if (onExecute) onExecute('tool_list', {})
  }, [onExecute])

  const handleUrlChange = useCallback((e) => {
    setWsUrl(e.target.value)
    setDirty(true)
    setTestStatus(null)
  }, [])

  const handleTest = useCallback(async () => {
    setTestStatus('testing')
    try {
      const ws = new WebSocket(wsUrl)
      await new Promise((resolve, reject) => {
        ws.onopen = () => {
          ws.close()
          resolve()
        }
        ws.onerror = () => reject(new Error('connection failed'))
        setTimeout(() => reject(new Error('timeout')), 3000)
      })
      setTestStatus('ok')
    } catch {
      setTestStatus('failed')
    }
  }, [wsUrl])

  const handleThemeChange = useCallback((newTheme) => {
    setTheme(newTheme)
    setDirty(true)
    document.documentElement.setAttribute('data-theme', newTheme)
    setConfig({ theme: newTheme })
  }, [setConfig])

  const handleApply = useCallback(() => {
    const urlChanged = wsUrl !== config.wsUrl
    if (urlChanged) {
      setConfig({ wsUrl })
    }
    setDirty(false)
    onClose?.()
  }, [wsUrl, config.wsUrl, setConfig, onClose])

  const handleToggleTool = useCallback((toolName, currentEnabled) => {
    if (onExecute) {
      if (currentEnabled) {
        onExecute('tool_deny', { name: toolName })
      } else {
        onExecute('tool_allow', { name: toolName })
      }
    }
  }, [onExecute])

  const STATUS_LABELS = {
    connected: 'Connected',
    disconnected: 'Disconnected',
    reconnecting: 'Reconnecting…',
  }

  return (
    <div className="config-overlay" onClick={onClose}>
      <div className="config-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="config-dialog__title">Settings</div>

        <label className="config-dialog__label">
          WebSocket URL
          <div className="config-dialog__url-row">
            <input
              className="config-dialog__input"
              type="text"
              value={wsUrl}
              onChange={handleUrlChange}
              placeholder="ws://127.0.0.1:8765/ws"
            />
            <button
              className="config-dialog__test-btn"
              onClick={handleTest}
              disabled={testStatus === 'testing'}
            >
              {testStatus === 'testing' ? '…' : 'Test'}
            </button>
          </div>
          {testStatus === 'ok' && (
            <span className="config-dialog__hint config-dialog__hint--ok">
              ✓ Connection successful
            </span>
          )}
          {testStatus === 'failed' && (
            <span className="config-dialog__hint config-dialog__hint--err">
              ✗ Connection failed
            </span>
          )}
        </label>

        <label className="config-dialog__label">
          Theme
          <select
            className="config-dialog__select"
            value={theme}
            onChange={(e) => handleThemeChange(e.target.value)}
          >
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </label>

        <div className="config-dialog__status">
          Current connection: <strong>{STATUS_LABELS[connectionStatus] || 'Unknown'}</strong>
        </div>

        {/* Tools table */}
        <div className="config-dialog__section-title">Tools ({tools.length})</div>
        <div className="config-dialog__tools-scroll">
          <table className="config-dialog__tools-table">
            <thead>
              <tr>
                <th className="config-dialog__th-toggle">On</th>
                <th className="config-dialog__th-name">Name</th>
                <th className="config-dialog__th-tags">Tags</th>
                <th className="config-dialog__th-desc">Description</th>
              </tr>
            </thead>
            <tbody>
              {tools.length === 0 && (
                <tr>
                  <td colSpan={4} className="config-dialog__td-empty">
                    No tools available
                  </td>
                </tr>
              )}
              {tools.map((t) => (
                <tr key={t.name}>
                  <td className="config-dialog__td-toggle">
                    <button
                      className={`config-dialog__toggle-btn ${t.enabled ? 'config-dialog__toggle-btn--on' : ''}`}
                      onClick={() => handleToggleTool(t.name, t.enabled)}
                      title={t.enabled ? 'Disable' : 'Enable'}
                    >
                      {t.enabled ? '✓' : '✗'}
                    </button>
                  </td>
                  <td className="config-dialog__td-name">{t.name}</td>
                  <td className="config-dialog__td-tags">
                    <span className="config-dialog__td-tags-inner">
                    {t.tags && t.tags.length > 0
                      ? t.tags.map((tag) => (
                          <span key={tag} className="config-dialog__tag">#{tag}</span>
                        ))
                      : '—'}
                    </span>
                  </td>
                  <td className="config-dialog__td-desc">{t.description || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="config-dialog__actions">
          <button className="config-dialog__cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            className="config-dialog__apply"
            onClick={handleApply}
            disabled={!dirty}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  )
}
