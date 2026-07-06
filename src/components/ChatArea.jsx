import { useRef, useEffect, useState, useCallback } from 'react'
import { IconCopy, IconCheck } from '@tabler/icons-react'
import { useChatStore } from '../store/useChatStore'
import { ToolCall } from './ToolCall'
import { MarkdownContent } from './MarkdownContent'

/**
 * Splits message content by tool call markers (\x00TOOL:n\x00) and returns
 * an array of React nodes that interleave text segments with ToolCall components.
 */
function renderContentWithToolCalls(message, isStreaming) {
  const { content, toolCalls } = message
  if (!toolCalls || toolCalls.length === 0) {
    return <MarkdownContent content={content || '\u200B'} isStreaming={isStreaming} />
  }

  // Split by \x00TOOL:<digits>\x00
  const parts = content.split(/\x00TOOL:(\d+)\x00/)

  // If no markers found, legacy fallback — tool calls at the bottom
  if (parts.length === 1) {
    return (
      <>
        <MarkdownContent content={content || '\u200B'} isStreaming={isStreaming} />
        <div className="message__tools">
          {toolCalls.map((tc, i) => (
            <ToolCall key={i} event={tc} />
          ))}
        </div>
      </>
    )
  }

  // Interleave text segments and tool calls
  const elements = []
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) {
      // Text segment
      if (parts[i]) {
        elements.push(
          <MarkdownContent key={`t${i}`} content={parts[i]} isStreaming={isStreaming} />
        )
      }
    } else {
      // Tool call marker — index is parts[i]
      const tcIdx = parseInt(parts[i], 10)
      const tc = toolCalls[tcIdx]
      if (tc) {
        elements.push(<ToolCall key={`tc${tcIdx}`} event={tc} />)
      }
    }
  }
  return elements
}

function formatMessageTime(timestamp) {
  if (timestamp === undefined || timestamp === null) return null
  const date = new Date(timestamp)
  const now = new Date()
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()

  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  const ss = String(date.getSeconds()).padStart(2, '0')

  if (isToday) {
    return `${hh}:${mm}:${ss}`
  }

  return `${y}-${m}-${d} ${hh}:${mm}:${ss}`
}

function MessageBubble({ message, isStreaming }) {
  const isUser = message.role === 'user'
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    try {
      // Strip tool call markers (\x00TOOL:N\x00) — replace consecutive tool
      // markers (with surrounding whitespace/newlines) with a single \n\n separator
      const cleanContent = message.content
        .replace(/(\s*\x00TOOL:\d+\x00\s*)+/g, '\n\n')
        .trim()

      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        // Modern Clipboard API — works on localhost and HTTPS
        await navigator.clipboard.writeText(cleanContent)
      } else {
        // Fallback for non-secure contexts (remote HTTP servers)
        const textarea = document.createElement('textarea')
        textarea.value = cleanContent
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        textarea.style.pointerEvents = 'none'
        document.body.appendChild(textarea)
        textarea.focus()
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
      }

      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard may fail in some contexts — ignore silently
    }
  }, [message.content])

  return (
    <div className={`message ${isUser ? 'message--user' : 'message--assistant'}`}>
      <button
        className={`message__copy-btn ${copied ? 'message__copy-btn--copied' : ''}`}
        title="Copy markdown"
        onClick={handleCopy}
      >
        {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
      </button>
      <div className="message__role">{isUser ? 'You' : 'Hakka'}</div>
      <div className="message__content">
        {isUser ? (
          <MarkdownContent content={message.content || ''} isStreaming={false} />
        ) : (
          renderContentWithToolCalls(message, isStreaming)
        )}
      </div>
      {message.timestamp !== undefined && (
        <span className="message__time">{formatMessageTime(message.timestamp)}</span>
      )}
    </div>
  )
}

export function ChatArea() {
  const messages = useChatStore((s) => s.messages)
  const isStreaming = useChatStore((s) => s.isStreaming)
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView()
  }, [messages])

  if (messages.length === 0) {
    return (
      <div className="chat-area chat-area--empty">
        <div className="empty-state">
          <div className="empty-state__icon">💬</div>
          <p>No messages yet. Start a conversation!</p>
        </div>
      </div>
    )
  }

  return (
    <div className="chat-area">
      {messages.map((msg) => (
        <MessageBubble
          key={msg.id}
          message={msg}
          isStreaming={isStreaming && msg === messages[messages.length - 1]}
        />
      ))}
      <div ref={bottomRef} />
    </div>
  )
}
