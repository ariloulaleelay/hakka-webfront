import { useState, useCallback, useRef, useEffect } from 'react'
import { useChatStore } from '../store/useChatStore'

const MAX_HEIGHT_RATIO = 0.67

export function InputBar({ onSend, onCancel }) {
  const [text, setText] = useState('')
  const isStreaming = useChatStore((s) => s.isStreaming)
  const isCancelling = useChatStore((s) => s.isCancelling)
  const connectionStatus = useChatStore((s) => s.connectionStatus)
  const draftText = useChatStore((s) => s.draftText)
  const clearDraftText = useChatStore((s) => s.clearDraftText)
  const textareaRef = useRef(null)

  const isSubmitDisabled = isStreaming || connectionStatus !== 'connected'
  const showCancel = isStreaming || isCancelling

  // Watch for draft text (paste from prompt library)
  useEffect(() => {
    if (draftText !== null && draftText !== undefined) {
      setText(draftText)
      clearDraftText()
      // Focus the textarea after pasting
      textareaRef.current?.focus()
    }
  }, [draftText, clearDraftText])

  // Auto-resize the textarea
  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    const maxHeight = window.innerHeight * MAX_HEIGHT_RATIO
    const newHeight = Math.min(el.scrollHeight, maxHeight)
    el.style.height = `${newHeight}px`
    el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden'
  }, [])

  useEffect(() => {
    resizeTextarea()
  }, [text, resizeTextarea])

  useEffect(() => {
    window.addEventListener('resize', resizeTextarea)
    return () => window.removeEventListener('resize', resizeTextarea)
  }, [resizeTextarea])

  useEffect(() => {
    if (!isSubmitDisabled && textareaRef.current && !showCancel) {
      textareaRef.current.focus()
    }
  }, [isSubmitDisabled, showCancel])

  const handleSend = useCallback(() => {
    const trimmed = text.trim()
    if (!trimmed || isSubmitDisabled) return
    onSend(trimmed)
    setText('')
  }, [text, isSubmitDisabled, onSend])

  const handleCancel = useCallback(() => {
    if (onCancel) onCancel()
  }, [onCancel])

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend]
  )

  return (
    <div className="input-bar">
      <div className="input-bar__wrapper">
        <textarea
          ref={textareaRef}
          className="input-bar__field"
          placeholder="Type a message…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isSubmitDisabled}
        />
        {showCancel && (
          <button
            className="input-bar__cancel"
            onClick={handleCancel}
            disabled={isCancelling}
            aria-label="Cancel request"
            title="Cancel current request"
          >
            {isCancelling ? '⏳' : '⏹'}
          </button>
        )}
      </div>
    </div>
  )
}
