import { useState, useCallback, useEffect, useRef } from 'react'

/**
 * Modal dialog for creating or editing a prompt template.
 *
 * Props:
 *   prompt: { id, name, content } | null  — null = create mode
 *   onSave: (prompt) => void               — called with { name, content }
 *   onDelete: (id) => void                 — called when user clicks Delete
 *   onClose: () => void                    — called when user cancels
 */
export function PromptDialog({ prompt, onSave, onDelete, onClose }) {
  const isNew = !prompt
  const [name, setName] = useState(prompt?.name || '')
  const [content, setContent] = useState(prompt?.content || '')
  const nameRef = useRef(null)

  // Auto-focus name input
  useEffect(() => {
    nameRef.current?.focus()
  }, [])

  const handleSave = useCallback(() => {
    const trimmedName = name.trim()
    const trimmedContent = content.trim()
    if (!trimmedName || !trimmedContent) return
    onSave?.({ name: trimmedName, content: trimmedContent })
  }, [name, content, onSave])

  const handleDelete = useCallback(() => {
    if (prompt?.id) onDelete?.(prompt.id)
  }, [prompt?.id, onDelete])

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSave()
    }
  }, [handleSave])

  return (
    <div className="prompt-overlay" onClick={onClose}>
      <div className="prompt-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="prompt-dialog__title">
          {isNew ? 'New Prompt' : 'Edit Prompt'}
        </div>

        <label className="prompt-dialog__label">
          Name
          <input
            ref={nameRef}
            className="prompt-dialog__input"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="My prompt"
          />
        </label>

        <label className="prompt-dialog__label">
          Content
          <textarea
            className="prompt-dialog__textarea"
            rows={6}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Write your prompt template here…"
          />
        </label>

        <div className="prompt-dialog__actions">
          <button className="prompt-dialog__cancel" onClick={onClose}>
            Cancel
          </button>
          {!isNew && (
            <button
              className="prompt-dialog__delete"
              onClick={handleDelete}
            >
              Delete
            </button>
          )}
          <button
            className="prompt-dialog__save"
            onClick={handleSave}
            disabled={!name.trim() || !content.trim()}
          >
            {isNew ? 'Create' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
