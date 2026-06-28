import { useState, useCallback, useRef, useEffect } from 'react'
import { useChatStore } from '../store/useChatStore'

const MAX_HEIGHT_RATIO = 0.67

export function InputBar({ onSend, onCancel }) {
  const [text, setText] = useState('')
  const isStreaming = useChatStore((s) => s.isStreaming)
  const isCancelling = useChatStore((s) => s.isCancelling)
  const connectionStatus = useChatStore((s) => s.connectionStatus)
  const textareaRef = useRef(null)

  const isSubmitDisabled = isStreaming || connectionStatus !== 'connected'
  const showCancel = isStreaming || isCancelling

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

  // Resize on text change
  useEffect(() => {
    resizeTextarea()
  }, [text, resizeTextarea])

  // Resize on window resize
  useEffect(() => {
    window.addEventListener('resize', resizeTextarea)
    return () => window.removeEventListener('resize', resizeTextarea)
  }, [resizeTextarea])

  // Re-focus the textarea when it becomes enabled again (stream ends or connects)
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
