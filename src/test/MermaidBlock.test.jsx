import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { MermaidBlock } from '../components/MermaidBlock'

// Mock mermaid — it requires SVG/DOM capabilities that jsdom doesn't fully support
vi.mock('mermaid', () => {
  return {
    default: {
      initialize: vi.fn(),
      render: vi.fn(),
    },
  }
})

// Need to re-import after mocking
import mermaid from 'mermaid'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('MermaidBlock', () => {
  it('renders a diagram successfully', async () => {
    const mockSvg = '<svg><text>flowchart</text></svg>'
    mermaid.render.mockResolvedValue({ svg: mockSvg })

    render(<MermaidBlock chart="graph TD; A-->B;" />)

    // Should show loading first
    expect(screen.getByText(/loading diagram/i)).toBeInTheDocument()

    // Wait for the render to complete
    const svgContainer = await screen.findByText('flowchart')
    expect(svgContainer).toBeInTheDocument()

    // Check that mermaid was initialized
    expect(mermaid.initialize).toHaveBeenCalledTimes(1)
    expect(mermaid.render).toHaveBeenCalledWith(expect.any(String), 'graph TD; A-->B;')
  })

  it('shows placeholder during streaming', () => {
    render(<MermaidBlock chart="graph TD; A-->B;" isStreaming={true} />)

    expect(screen.getByText(/diagram rendering/i)).toBeInTheDocument()
    // Should NOT attempt to render during streaming
    expect(mermaid.render).not.toHaveBeenCalled()
  })

  it('shows error state when mermaid.render fails', async () => {
    mermaid.render.mockRejectedValue(new Error('Syntax error: invalid diagram'))

    render(<MermaidBlock chart="BAD SYNTAX!!!" />)

    // Wait for error state
    const errorTitle = await screen.findByText(/diagram syntax error/i)
    expect(errorTitle).toBeInTheDocument()
    expect(screen.getByText('Syntax error: invalid diagram')).toBeInTheDocument()
    // Source chart should be visible
    expect(screen.getByText('BAD SYNTAX!!!')).toBeInTheDocument()
  })

  it('renders a sequenceDiagram correctly', async () => {
    const mockSvg = '<svg><text>sequenceDiagram</text></svg>'
    mermaid.render.mockResolvedValue({ svg: mockSvg })

    render(<MermaidBlock chart="sequenceDiagram Alice->>John: Hello John, how are you?" />)

    const svgText = await screen.findByText('sequenceDiagram')
    expect(svgText).toBeInTheDocument()
  })

  it('re-renders when chart prop changes', async () => {
    const mockSvg1 = '<svg><text>diagram1</text></svg>'
    const mockSvg2 = '<svg><text>diagram2</text></svg>'
    mermaid.render
      .mockResolvedValueOnce({ svg: mockSvg1 })
      .mockResolvedValueOnce({ svg: mockSvg2 })

    const { rerender } = render(<MermaidBlock chart="graph TD; A-->B;" />)

    await screen.findByText('diagram1')
    expect(mermaid.render).toHaveBeenCalledTimes(1)

    rerender(<MermaidBlock chart="graph TD; C-->D;" />)

    await screen.findByText('diagram2')
    expect(mermaid.render).toHaveBeenCalledTimes(2)
  })
})
