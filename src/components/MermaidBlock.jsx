import { useEffect, useRef, useState } from 'react'
import mermaid from 'mermaid'

/**
 * Renders a Mermaid diagram from a text definition.
 *
 * Supports all Mermaid diagram types:
 * - flowchart, sequenceDiagram, classDiagram, stateDiagram, erDiagram
 * - gantt, pie, gitGraph, journey, timeline, mindmap, etc.
 *
 * During streaming, shows a placeholder instead of trying to render
 * (which could fail on incomplete syntax).
 *
 * Errors are displayed gracefully with the raw source code shown.
 */

// Mermaid initialization — called once at module level
let initialized = false

function ensureMermaidInit() {
  if (initialized) return
  initialized = true

  // Detect theme: the app uses `data-theme` on documentElement
  const isDark = document.documentElement.getAttribute('data-theme') !== 'light'

  mermaid.initialize({
    startOnLoad: false,
    theme: isDark ? 'dark' : 'base',
    themeVariables: isDark
      ? {
          primaryColor: '#2c2e33',
          primaryTextColor: '#c1c2c5',
          primaryBorderColor: '#373a40',
          lineColor: '#5c5f66',
          secondaryColor: '#25262b',
          tertiaryColor: '#1a1b1e',
        }
      : undefined,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
  })
}

let counter = 0

export function MermaidBlock({ chart, isStreaming }) {
  const [state, setState] = useState({ status: 'loading' })
  const cancelRef = useRef(false)

  useEffect(() => {
    // Don't try to render incomplete diagrams during streaming
    if (isStreaming) {
      setState({ status: 'placeholder' })
      return
    }

    let cancelled = false
    cancelRef.current = false
    const id = `hakka-mermaid-${Date.now()}-${counter++}`

    ensureMermaidInit()

    setState({ status: 'loading' })

    mermaid
      .render(id, chart)
      .then(({ svg }) => {
        if (!cancelled) {
          setState({ status: 'ok', svg })
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setState({ status: 'error', error: err.message || String(err), chart })
        }
      })

    return () => {
      cancelled = true
      cancelRef.current = true
    }
  }, [chart, isStreaming])

  if (state.status === 'placeholder') {
    return (
      <div className="mermaid-block mermaid-block--placeholder">
        <span className="mermaid-block__hint">🔄 Diagram rendering…</span>
      </div>
    )
  }

  if (state.status === 'loading') {
    return (
      <div className="mermaid-block mermaid-block--loading">
        <span className="mermaid-block__hint">⏳ Loading diagram…</span>
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className="mermaid-block mermaid-block--error">
        <div className="mermaid-block__error-title">⚠️ Diagram Syntax Error</div>
        <div className="mermaid-block__error-msg">{state.error}</div>
        <pre className="mermaid-block__error-source"><code>{state.chart}</code></pre>
      </div>
    )
  }

  // state.status === 'ok'
  return (
    <div
      className="mermaid-block mermaid-block--rendered"
      dangerouslySetInnerHTML={{ __html: state.svg }}
    />
  )
}
