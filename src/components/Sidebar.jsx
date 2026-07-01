import { useState, useCallback } from 'react'
import { useChatStore } from '../store/useChatStore'
import { ConfigMenu } from './ConfigMenu'
import { PromptDialog } from './PromptDialog'

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
 * Left sidebar showing sessions and prompt templates.
 */
export function Sidebar({ onNewSession, onSwitchSession, onDeleteSession, onExecute }) {
  const sessionId = useChatStore((s) => s.sessionId)
  const sessions = useChatStore((s) => s.sessions)
  const sessionStatus = useChatStore((s) => s.sessionStatus)
  const sessionUnread = useChatStore((s) => s.sessionUnread)
  const connectionStatus = useChatStore((s) => s.connectionStatus)
  const prompts = useChatStore((s) => s.prompts)
  const setDraftText = useChatStore((s) => s.setDraftText)
  const addPrompt = useChatStore((s) => s.addPrompt)
  const updatePrompt = useChatStore((s) => s.updatePrompt)
  const deletePrompt = useChatStore((s) => s.deletePrompt)

  const [pendingDelete, setPendingDelete] = useState(null)
  const [showConfig, setShowConfig] = useState(false)
  const [showPromptDialog, setShowPromptDialog] = useState(false)
  const [editingPrompt, setEditingPrompt] = useState(null)

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
    (s) => s.name || s.shortId || s.short_id || s.id.slice(0, 8),
    []
  )

  const handleConfirmDelete = useCallback(() => {
    if (pendingDelete) {
      onDeleteSession?.(pendingDelete)
      setPendingDelete(null)
    }
  }, [pendingDelete, onDeleteSession])

  const handlePromptClick = useCallback((p) => {
    setDraftText(p.content)
  }, [setDraftText])

  const handlePromptSave = useCallback((data) => {
    if (editingPrompt) {
      updatePrompt(editingPrompt.id, data)
    } else {
      addPrompt(data)
    }
    setEditingPrompt(null)
    setShowPromptDialog(false)
  }, [editingPrompt, updatePrompt, addPrompt])

  const handlePromptDelete = useCallback((id) => {
    deletePrompt(id)
    setEditingPrompt(null)
    setShowPromptDialog(false)
  }, [deletePrompt])

  const handleNewPrompt = useCallback(() => {
    setEditingPrompt(null)
    setShowPromptDialog(true)
  }, [])

  const handleEditPrompt = useCallback((p, e) => {
    e.stopPropagation()
    setEditingPrompt(p)
    setShowPromptDialog(true)
  }, [])

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

      {/* Sessions section */}
      <div className="sidebar__section">
        <div className="sidebar__section-title">
          Sessions
          <button
            className="sidebar__section-add"
            onClick={onNewSession}
            title="New session"
          >
            +
          </button>
        </div>
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
            </div>
          )
        })}
      </div>

      {/* Prompts section */}
      <div className="sidebar__section">
        <div className="sidebar__section-title">
          Prompts
          <button
            className="sidebar__section-add"
            onClick={handleNewPrompt}
            title="New prompt"
          >
            +
          </button>
        </div>
        {prompts.length === 0 && (
          <div className="sidebar__empty">No prompts</div>
        )}
        {prompts.map((p) => (
          <div
            key={p.id}
            className="sidebar__prompt"
            onClick={() => handlePromptClick(p)}
            title={p.content}
          >
            <span className="sidebar__prompt-name">{p.name}</span>
            <button
              className="sidebar__prompt-edit"
              title="Edit prompt"
              onClick={(e) => handleEditPrompt(p, e)}
            >
              ✎
            </button>
          </div>
        ))}
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

      {showPromptDialog && (
        <PromptDialog
          prompt={editingPrompt}
          onSave={handlePromptSave}
          onDelete={handlePromptDelete}
          onClose={() => { setShowPromptDialog(false); setEditingPrompt(null) }}
        />
      )}
    </aside>
  )
}
