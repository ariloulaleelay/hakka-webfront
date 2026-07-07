import { memo, useState, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import rehypeHighlight from 'rehype-highlight'
import { IconCopy, IconCheck } from '@tabler/icons-react'

/**
 * Renders markdown content with syntax-highlighted code blocks,
 * GFM tables, LaTeX math, and other standard markdown features.
 *
 * Supports:
 * - Inline math: $E = mc^2$
 * - Display math: $$\sum_{i=1}^{n} i$$
 *
 * Handles streaming gracefully: during streaming, syntax highlighting
 * is skipped to avoid issues with incomplete code blocks.
 */

function extractCodeText(children) {
  if (typeof children === 'string') return children
  if (Array.isArray(children)) return children.map(extractCodeText).join('')
  // React element with children
  if (children?.props?.children) return extractCodeText(children.props.children)
  return ''
}

function CodeBlockWithCopy({ className, children, lang }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    const text = extractCodeText(children)
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {
      // Fallback for non-secure contexts
      const textarea = document.createElement('textarea')
      textarea.value = text
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [children])

  return (
    <div className="code-block">
      <div className="code-block__header">
        {lang && <span className="code-block__lang">{lang}</span>}
        <button
          className={`code-block__copy-btn ${copied ? 'code-block__copy-btn--copied' : ''}`}
          onClick={handleCopy}
          title="Copy code"
        >
          {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
        </button>
      </div>
      <code className={className}>
        {children}
      </code>
    </div>
  )
}

export const MarkdownContent = memo(function MarkdownContent({ content, isStreaming }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={isStreaming ? [rehypeKatex] : [rehypeKatex, rehypeHighlight]}
      components={{
        code({ className, children, node }) {
          const match = /language-(\w+)/.exec(className || '')
          // In react-markdown v10, the `code` component handles both inlineCode
          // and code (fenced) mdast nodes. The `node` is a hast element.
          // Inline code children retain source position info; fenced code's don't.
          const isInline = node?.children?.[0]?.position !== undefined

          if (isInline) {
            return (
              <code className="inline-code">
                {children}
              </code>
            )
          }

          return (
            <CodeBlockWithCopy className={className} lang={match ? match[1] : null}>
              {children}
            </CodeBlockWithCopy>
          )
        },
        a({ href, children }) {
          return (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          )
        },
      }}
    >
      {content}
    </ReactMarkdown>
  )
})
