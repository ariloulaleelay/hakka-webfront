import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MarkdownContent } from '../components/MarkdownContent'

describe('MarkdownContent', () => {
  it('renders plain text', () => {
    render(<MarkdownContent content="Hello world" />)
    expect(screen.getByText('Hello world')).toBeInTheDocument()
  })

  it('renders bold text', () => {
    render(<MarkdownContent content="This is **bold** text" />)
    expect(screen.getByText('bold')).toBeInTheDocument()
  })

  it('renders code blocks with syntax highlighting', () => {
    const code = '```js\nconsole.log("hi")\n```'
    render(<MarkdownContent content={code} />)
    // highlight.js splits tokens into spans, so use a function matcher
    expect(screen.getByText((text) => text.includes('console'))).toBeInTheDocument()
    expect(screen.getByText((text) => text.includes('log'))).toBeInTheDocument()
  })

  it('renders inline code', () => {
    render(<MarkdownContent content="Use the `foo()` function" />)
    expect(screen.getByText('foo()')).toBeInTheDocument()
  })

  it('renders fenced code block without language — does NOT get inline-code class', () => {
    render(<MarkdownContent content={'```\nline 1\nline 2\n```'} />)
    // Should find the code inside a <pre>
    const pre = document.querySelector('pre')
    expect(pre).toBeInTheDocument()
    const code = pre.querySelector('code')
    expect(code).toBeInTheDocument()
    // Must NOT have inline-code class
    expect(code.className).not.toContain('inline-code')
    // Must NOT have node attribute on the DOM element
    expect(code.hasAttribute('node')).toBe(false)
  })

  it('renders inline code with inline-code class and no node attribute', () => {
    render(<MarkdownContent content="Use the `foo()` function" />)
    const code = document.querySelector('code.inline-code')
    expect(code).toBeInTheDocument()
    expect(code.textContent).toBe('foo()')
    // Must NOT have node attribute on the DOM element
    expect(code.hasAttribute('node')).toBe(false)
  })

  it('renders fenced code block with language — keeps language class and shows label', () => {
    render(<MarkdownContent content={'```js\nconsole.log("hi")\n```'} />)
    const code = document.querySelector('code.language-js')
    expect(code).toBeInTheDocument()
    // Must NOT have inline-code class
    expect(code.className).not.toContain('inline-code')
    // Must NOT have node attribute
    expect(code.hasAttribute('node')).toBe(false)
    // Language label should be present
    expect(screen.getByText('js')).toBeInTheDocument()
  })

  it('renders links with target="_blank"', () => {
    render(<MarkdownContent content="[click me](http://example.com)" />)
    const link = screen.getByText('click me')
    expect(link).toBeInTheDocument()
    expect(link.closest('a')).toHaveAttribute('href', 'http://example.com')
    expect(link.closest('a')).toHaveAttribute('target', '_blank')
  })

  it('renders lists', () => {
    const list = '- one\n- two\n- three'
    render(<MarkdownContent content={list} />)
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(3)
    expect(items[0].textContent.trim()).toBe('one')
    expect(items[1].textContent.trim()).toBe('two')
    expect(items[2].textContent.trim()).toBe('three')
  })

  it('renders GFM tables', () => {
    const table = '| A | B |\n|---|---|\n| 1 | 2 |'
    render(<MarkdownContent content={table} />)
    // With remark-gfm, tables render as <table> with <th> and <td>
    expect(screen.getByText('A')).toBeInTheDocument()
    expect(screen.getByText('B')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('handles streaming content gracefully (no crash on incomplete markdown)', () => {
    render(<MarkdownContent content={'```python\nprint("hello'} isStreaming={true} />)
    // Should render the partial content as-is without crashing
    expect(screen.getByText(/print/)).toBeInTheDocument()
  })

  it('renders empty content without crashing', () => {
    const { container } = render(<MarkdownContent content="" />)
    expect(container).toBeInTheDocument()
  })

  describe('mermaid diagram rendering', () => {
    it('renders a mermaid code block as a diagram', () => {
      const md = '```mermaid\ngraph TD;\nA-->B;\n```'
      render(<MarkdownContent content={md} />)
      // Should NOT render as a regular code block
      expect(document.querySelector('.code-block')).not.toBeInTheDocument()
      // Should render the MermaidBlock component (loading state initially)
      expect(screen.getByText(/loading diagram/i)).toBeInTheDocument()
    })

    it('shows placeholder during streaming for mermaid blocks', () => {
      const md = '```mermaid\ngraph TD;\nA-->B;\n```'
      render(<MarkdownContent content={md} isStreaming={true} />)
      // During streaming, shows "diagram rendering..." placeholder
      expect(screen.getByText(/diagram rendering/i)).toBeInTheDocument()
    })

    it('does not interfere with non-mermaid code blocks', () => {
      const md = '```js\nconsole.log("hello")\n```'
      render(<MarkdownContent content={md} />)
      // Should still render regular code blocks with copy button
      expect(document.querySelector('.code-block')).toBeInTheDocument()
      // The language label should be 'js'
      expect(screen.getByText('js')).toBeInTheDocument()
    })
  })

  describe('math rendering', () => {
    it('renders inline math with $ delimiters', () => {
      render(<MarkdownContent content="The formula $E = mc^2$ is famous." />)
      // KaTeX renders math inside elements with class "katex"
      const katexElements = document.querySelectorAll('.katex')
      expect(katexElements.length).toBeGreaterThanOrEqual(1)
      // The math should contain the rendered content
      expect(katexElements[0].textContent).toMatch(/E/i)
    })

    it('renders display math with $$ delimiters', () => {
      render(<MarkdownContent content="$$\sum_{i=1}^{n} i = \frac{n(n+1)}{2}$$" />)
      // Display math renders as KaTeX; look for generic .katex elements
      const katexElements = document.querySelectorAll('.katex')
      expect(katexElements.length).toBeGreaterThanOrEqual(1)
      // Should contain the rendered formula elements
      expect(katexElements[0].textContent).toMatch(/n/i)
    })

    it('renders multiple math expressions in the same content', () => {
      render(<MarkdownContent content="Inline: $a^2 + b^2 = c^2$ and display: $$\int_a^b f(x)\,dx$$" />)
      const katexElements = document.querySelectorAll('.katex')
      // Should have at least two KaTeX elements (one inline, one display)
      expect(katexElements.length).toBeGreaterThanOrEqual(2)
    })

    it('renders math alongside regular markdown', () => {
      render(<MarkdownContent content="## Title\n\nHere is $x = 5$ in a paragraph." />)
      // KaTeX may embed within headings; use a loose text matcher
      expect(screen.getByText(/Title/)).toBeInTheDocument()
      const katexElements = document.querySelectorAll('.katex')
      expect(katexElements.length).toBeGreaterThanOrEqual(1)
    })

    it('handles math during streaming (does not crash)', () => {
      render(<MarkdownContent content="Testing $E = mc^2$ streaming" isStreaming={true} />)
      const katexElements = document.querySelectorAll('.katex')
      expect(katexElements.length).toBeGreaterThanOrEqual(1)
    })
  })
})
