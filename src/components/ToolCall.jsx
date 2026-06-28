const MAX_SNIPPET_LENGTH = 100

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

export function ToolCall({ event }) {
  const rawStatus = event.status || 'start'
  const statusClass = STATUS_CLASSES[rawStatus] || 'start'
  const toolName = event.tool || event.name || 'tool'
  const snippet = cleanSnippet(event.exec_snippet || event.snippet)

  return (
    <div className={`tool-call tool-call--${statusClass}`}>
      <span className="tool-call__name">
        {toolName}
        {snippet ? <span className="tool-call__args"> {snippet}</span> : null}
      </span>
    </div>
  )
}
