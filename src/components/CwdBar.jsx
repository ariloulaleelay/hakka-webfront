import { useState, useRef, useEffect } from 'react'
import { useChatStore } from '../store/useChatStore'

/**
 * Editable working directory indicator shown in the header bar.
 * Click to edit, Enter to save, Esc to cancel.
 * Calls onCwdChange when the user saves a new CWD (to sync with server).
 */
export function CwdBar({ onCwdChange }) {
  const cwd = useChatStore((s) => s.cwd)
  const setCwd = useChatStore((s) => s.setCwd)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  const handleStart = () => {
    setDraft(cwd || '/')
    setEditing(true)
  }

  const handleSave = () => {
    const trimmed = draft.trim()
    if (trimmed) {
      setCwd(trimmed)
      onCwdChange?.(trimmed)
    }
    setEditing(false)
  }

  const handleKey = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); handleSave() }
    if (e.key === 'Escape') setEditing(false)
  }

  if (editing) {
    return (
      <div className="cwd-bar">
        <span className="cwd-bar__label">CWD</span>
        <input
          ref={inputRef}
          className="cwd-bar__input"
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKey}
          onBlur={handleSave}
        />
      </div>
    )
  }

  return (
    <div className="cwd-bar" onClick={handleStart} title="Click to change working directory">
      <span className="cwd-bar__label">CWD</span>
      <span className="cwd-bar__path">{cwd || '/'}</span>
    </div>
  )
}
