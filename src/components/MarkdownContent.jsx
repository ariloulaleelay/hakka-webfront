import { memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import rehypeHighlight from 'rehype-highlight'

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
export const MarkdownContent = memo(function MarkdownContent({ content, isStreaming }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={isStreaming ? [rehypeKatex] : [rehypeKatex, rehypeHighlight]}
      components={{
        code({ className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || '')
          const isInline = !match

          if (isInline) {
            return (
              <code className="inline-code" {...props}>
                {children}
              </code>
            )
          }

          return (
            <div className="code-block">
              <span className="code-block__lang">{match[1]}</span>
              <pre>
                <code className={className} {...props}>
                  {children}
                </code>
              </pre>
            </div>
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
