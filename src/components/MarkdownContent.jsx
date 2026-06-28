import { memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'

/**
 * Renders markdown content with syntax-highlighted code blocks,
 * GFM tables, and other standard markdown features.
 *
 * Handles streaming gracefully: during streaming, syntax highlighting
 * is skipped to avoid issues with incomplete code blocks.
 */
export const MarkdownContent = memo(function MarkdownContent({ content, isStreaming }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={isStreaming ? [] : [rehypeHighlight]}
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
