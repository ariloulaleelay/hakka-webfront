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
})
