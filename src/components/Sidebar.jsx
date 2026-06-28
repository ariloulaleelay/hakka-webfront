import { useState, useCallback } from 'react'
import { useChatStore } from '../store/useChatStore'
import { ConfigMenu } from './ConfigMenu'

function ConfirmDialog({ sessionName, onConfirm, onCancel }) {
  return (
    <div className="confirm-overlay" onClick={onCancel}>
      <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="confirm-dialog__title">Delete session?</div>
        <div className="confirm-dialog__body">
          Are you sure you want to delete <strong>{sessionName}</strong>?
          <br />
          This action cannot be undone.
        </div>
        <div className="confirm-dialog__actions">
          <button className="confirm-dialog__cancel" onClick={onCancel}>
            Cancel
          </button>
          <button className="confirm-dialog__confirm" onClick={onConfirm}>
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Left sidebar showing all sessions in a single list.
 * The currently active session is highlighted.
 */
export function Sidebar({ onNewSession, onSwitchSession, onDeleteSession, onExecute }) {
  const sessionId = useChatStore((s) => s.sessionId)
  const sessions = useChatStore((s) => s.sessions)
  const sessionStatus = useChatStore((s) => s.sessionStatus)
  const sessionUnread = useChatStore((s) => s.sessionUnread)
  const connectionStatus = useChatStore((s) => s.connectionStatus)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [showConfig, setShowConfig] = useState(false)

  const STATUS_COLORS = {
    connected: '#22c55e',
    disconnected: '#ef4444',
    reconnecting: '#f59e0b',
  }

  const getSessionDotColor = useCallback(
    (s) => {
      const status = sessionStatus[s.id]
      if (status === 'streaming') return '#a855f7'
      if (sessionUnread[s.id]) return '#22c55e'
      return 'transparent'
    },
    [sessionStatus, sessionUnread]
  )

  const getSessionName = useCallback(
    (s) => s.name || s.shortId || s.id.slice(0, 8),
    []
  )

  const handleConfirmDelete = useCallback(() => {
    if (pendingDelete) {
      onDeleteSession?.(pendingDelete)
      setPendingDelete(null)
    }
  }, [pendingDelete, onDeleteSession])

  return (
    <aside className="sidebar">
      <div className="sidebar__header">
        <h1 className="sidebar__title">Hakka</h1>
        <span
          className="sidebar__dot"
          style={{ backgroundColor: STATUS_COLORS[connectionStatus] || '#ef4444' }}
        />
        <button
          className="sidebar__gear"
          onClick={() => setShowConfig(true)}
          title="Settings"
        >
          ⚙
        </button>
      </div>

      <div className="sidebar__section">
        <div className="sidebar__section-title">Sessions</div>
        {sessions.length === 0 && (
          <div className="sidebar__empty">No sessions</div>
        )}
        {sessions.map((s) => {
          const isActive = s.id === sessionId
          return (
            <div
              key={s.id}
              className={`sidebar__session${isActive ? ' sidebar__session--active' : ''}`}
              onClick={!isActive ? () => onSwitchSession?.(s.id) : undefined}
            >
              <span className="sidebar__session-dot"
                style={{ backgroundColor: getSessionDotColor(s) }}
              />
              <span className="sidebar__session-name">
                {getSessionName(s)}
              </span>
              {!isActive && (
                <button
                  className="sidebar__session-delete"
                  title="Delete session"
                  onClick={(e) => {
                    e.stopPropagation()
                    setPendingDelete(s.id)
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          )
        })}
      </div>

      <div className="sidebar__footer">
        <button className="sidebar__new-btn" onClick={() => onNewSession?.()}>
          + New Session
        </button>
      </div>

      {pendingDelete && (
        <ConfirmDialog
          sessionName={getSessionName(sessions.find((s) => s.id === pendingDelete))}
          onConfirm={handleConfirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}

      {showConfig && (
        <ConfigMenu onClose={() => setShowConfig(false)} onExecute={onExecute} />
      )}
    </aside>
  )
}
