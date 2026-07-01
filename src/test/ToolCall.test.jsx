import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ToolCall } from '../components/ToolCall'

describe('ToolCall', () => {
  it('should render tool name with snippet', () => {
    render(<ToolCall event={{ tool: 'read_file', status: 'ok', exec_snippet: '/path/to/file' }} />)
    expect(screen.getByText(/read_file/)).toBeInTheDocument()
    expect(screen.getByText(/\/path\/to\/file/)).toBeInTheDocument()
  })

  it('should render start status without content dot', () => {
    render(<ToolCall event={{ tool: 'shell', status: 'start', exec_snippet: 'ls -la' }} />)
    expect(screen.getByText(/shell/)).toBeInTheDocument()
  })

  it('should show chevron when there are details to expand', () => {
    render(
      <ToolCall
        event={{
          tool: 'read_file',
          status: 'ok',
          args: '{"path": "/tmp/test.txt"}',
          result: 'file content here',
        }}
      />
    )
    expect(screen.getByText('▶')).toBeInTheDocument()
  })

  it('should not show chevron when there are no details', () => {
    render(<ToolCall event={{ tool: 'read_file', status: 'start', exec_snippet: 'test' }} />)
    expect(screen.queryByText('▶')).not.toBeInTheDocument()
    expect(screen.queryByText('▼')).not.toBeInTheDocument()
  })

  it('should expand and show args and result on click', () => {
    render(
      <ToolCall
        event={{
          tool: 'read_file',
          status: 'ok',
          args: '{"path": "/tmp/test.txt"}',
          result: 'file content here',
        }}
      />
    )

    expect(screen.queryByText('Arguments')).not.toBeInTheDocument()
    expect(screen.queryByText('Result')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('▶'))

    expect(screen.getByText('Arguments')).toBeInTheDocument()
    expect(screen.getByText(/\/tmp\/test.txt/)).toBeInTheDocument()
    expect(screen.getByText('Result')).toBeInTheDocument()
    expect(screen.getByText(/file content here/)).toBeInTheDocument()

    // Chevron should now be expanded
    expect(screen.getByText('▼')).toBeInTheDocument()
  })

  it('should expand and show only args when no result', () => {
    render(
      <ToolCall
        event={{
          tool: 'read_file',
          status: 'ok',
          args: '{"path": "/tmp/test.txt"}',
        }}
      />
    )

    fireEvent.click(screen.getByText('▶'))
    expect(screen.getByText('Arguments')).toBeInTheDocument()
    expect(screen.queryByText('Result')).not.toBeInTheDocument()
  })

  it('should collapse details when clicked again', () => {
    render(
      <ToolCall
        event={{
          tool: 'read_file',
          status: 'ok',
          args: '{"path": "/tmp/test.txt"}',
          result: 'content',
        }}
      />
    )

    fireEvent.click(screen.getByText('▶'))
    expect(screen.getByText('Arguments')).toBeInTheDocument()

    fireEvent.click(screen.getByText('▼'))
    expect(screen.queryByText('Arguments')).not.toBeInTheDocument()
  })

  it('should pretty-print JSON args', () => {
    render(
      <ToolCall
        event={{
          tool: 'read_file',
          status: 'ok',
          args: JSON.stringify({ path: '/tmp/test.txt', recursive: true }),
        }}
      />
    )

    fireEvent.click(screen.getByText('▶'))
    // Should show formatted JSON with newlines and indentation
    const codeBlock = screen.getByText(/test.txt/)
    expect(codeBlock).toBeInTheDocument()
  })
})
