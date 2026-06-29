import { useState } from 'react'

const MAX_SNIPPET_LENGTH = 80

function cleanSnippet(raw) {
  if (!raw) return ''
  let s = raw.trim()
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1)
  }
  if (s.length > MAX_SNIPPET_LENGTH) {
    s = s.slice(0, MAX_SNIPPET_LENGTH - 3) + '…'
  }
  return s
}

const STATUS_CLASSES = {
  start: 'start',
  ok: 'ok',
  done: 'ok',
  complete: 'ok',
  success: 'ok',
  err: 'err',
  error: 'err',
  failed: 'err',
}

function formatArgs(raw) {
  if (!raw) return null
  // Try to pretty-print JSON
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    return JSON.stringify(parsed, null, 2)
  } catch {
    return String(raw)
  }
}

function formatResult(event) {
  // Result can be in event.data, event.result, or event.output
  const raw = event.data || event.result || event.output
  if (!raw) return null
  // If it's already a string, use it; otherwise try to stringify
  if (typeof raw === 'string') {
    return raw
  }
  try {
    return JSON.stringify(raw, null, 2)
  } catch {
    return String(raw)
  }
}

export function ToolCall({ event }) {
  const [expanded, setExpanded] = useState(false)

  const rawStatus = event.status || 'start'
  const statusClass = STATUS_CLASSES[rawStatus] || 'start'
  const toolName = event.tool || event.name || 'tool'
  const snippet = cleanSnippet(event.exec_snippet || event.snippet)

  const argsFormatted = formatArgs(event.args)
  const resultFormatted = formatResult(event)
  const hasDetails = argsFormatted || resultFormatted

  return (
    <div className={`tool-call tool-call--${statusClass}`}>
      <span
        className="tool-call__summary"
        onClick={hasDetails ? () => setExpanded(!expanded) : undefined}
        title={hasDetails ? (expanded ? 'Collapse details' : 'Expand details') : undefined}
      >
        {hasDetails && (
          <span className="tool-call__chevron">{expanded ? '▼' : '▶'}</span>
        )}
        <span className="tool-call__name">
          {toolName}
          {snippet ? <span className="tool-call__args"> {snippet}</span> : null}
        </span>
      </span>

      {expanded && hasDetails && (
        <div className="tool-call__details">
          {argsFormatted && (
            <div className="tool-call__section">
              <div className="tool-call__section-title">Arguments</div>
              <pre className="tool-call__code">{argsFormatted}</pre>
            </div>
          )}
          {resultFormatted && (
            <div className="tool-call__section">
              <div className="tool-call__section-title">Result</div>
              <pre className="tool-call__code">{resultFormatted}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
