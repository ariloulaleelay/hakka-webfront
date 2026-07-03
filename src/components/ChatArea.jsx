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
      await navigator.clipboard.writeText(cleanContent)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API may fail in some contexts — ignore silently
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
