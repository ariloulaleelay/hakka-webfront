import { describe, it, expect, beforeEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { TokensBar } from '../components/TokensBar'
import { useChatStore } from '../store/useChatStore'

describe('TokensBar', () => {
  beforeEach(() => {
    useChatStore.setState({
      sessionId: null,
      sessionEstimatedTokens: {},
      sessionTotalCost: {},
      sessions: [],
      models: [],
    })
  })

  it('should not render when sessionId is null', () => {
    const { container } = render(<TokensBar />)
    expect(container.innerHTML).toBe('')
  })

  it('should not render when current session has no tokens', () => {
    useChatStore.setState({ sessionId: 'sess-1' })
    const { container } = render(<TokensBar />)
    expect(container.innerHTML).toBe('')
  })

  it('should display token count for current session', () => {
    useChatStore.setState({ sessionId: 'sess-1' })
    useChatStore.getState().setEstimatedContextTokens(12345, 'sess-1')
    render(<TokensBar />)
    expect(screen.getByText('12345')).toBeInTheDocument()
    expect(screen.getByText('Tokens')).toBeInTheDocument()
  })

  it('should display 0 when tokens are 0', () => {
    useChatStore.setState({ sessionId: 'sess-1' })
    useChatStore.getState().setEstimatedContextTokens(0, 'sess-1')
    render(<TokensBar />)
    expect(screen.getByText('0')).toBeInTheDocument()
  })

  it('should update when session switches', () => {
    useChatStore.setState({ sessionId: 'sess-a' })
    useChatStore.getState().setEstimatedContextTokens(100, 'sess-a')
    useChatStore.getState().setEstimatedContextTokens(200, 'sess-b')

    const { rerender } = render(<TokensBar />)
    expect(screen.getByText('100')).toBeInTheDocument()

    useChatStore.setState({ sessionId: 'sess-b' })
    rerender(<TokensBar />)
    expect(screen.getByText('200')).toBeInTheDocument()
  })

  it('should display model name when available on current session', () => {
    useChatStore.setState({
      sessionId: 'sess-1',
      sessions: [{ id: 'sess-1', model: 'gpt-4o' }],
    })
    useChatStore.getState().setEstimatedContextTokens(500, 'sess-1')
    render(<TokensBar />)
    expect(screen.getByText('gpt-4o')).toBeInTheDocument()
    expect(screen.getByText('Model')).toBeInTheDocument()
    expect(screen.getByText('500')).toBeInTheDocument()
    expect(screen.getByText('Tokens')).toBeInTheDocument()
  })

  it('should update model when session switches', () => {
    useChatStore.setState({
      sessionId: 'sess-a',
      sessions: [
        { id: 'sess-a', model: 'gpt-4o' },
        { id: 'sess-b', model: 'claude-3' },
      ],
    })
    useChatStore.getState().setEstimatedContextTokens(100, 'sess-a')
    useChatStore.getState().setEstimatedContextTokens(200, 'sess-b')

    const { rerender } = render(<TokensBar />)
    expect(screen.getByText('gpt-4o')).toBeInTheDocument()

    useChatStore.setState({ sessionId: 'sess-b' })
    rerender(<TokensBar />)
    expect(screen.getByText('claude-3')).toBeInTheDocument()
    expect(screen.getByText('200')).toBeInTheDocument()
  })

  it('should not display model section when session has no model', () => {
    useChatStore.setState({
      sessionId: 'sess-1',
      sessions: [{ id: 'sess-1' }],
    })
    useChatStore.getState().setEstimatedContextTokens(500, 'sess-1')
    render(<TokensBar />)
    expect(screen.getByText('500')).toBeInTheDocument()
    expect(screen.queryByText('Model')).not.toBeInTheDocument()
  })

  it('should not display model section when session not found in list', () => {
    useChatStore.setState({
      sessionId: 'sess-unknown',
      sessions: [{ id: 'sess-1' }],
    })
    useChatStore.getState().setEstimatedContextTokens(500, 'sess-unknown')
    render(<TokensBar />)
    expect(screen.getByText('500')).toBeInTheDocument()
    expect(screen.queryByText('Model')).not.toBeInTheDocument()
  })

  it('should display model name even without tokens', () => {
    useChatStore.setState({
      sessionId: 'sess-1',
      sessions: [{ id: 'sess-1', model: 'gpt-4o' }],
    })
    render(<TokensBar />)
    expect(screen.getByText('gpt-4o')).toBeInTheDocument()
    expect(screen.getByText('Model')).toBeInTheDocument()
    expect(screen.queryByText('Tokens')).not.toBeInTheDocument()
    expect(screen.queryByText('$')).not.toBeInTheDocument()
  })

  it('should display cost even without tokens', () => {
    useChatStore.setState({ sessionId: 'sess-1' })
    useChatStore.getState().setTotalCost(2.00, 'sess-1')
    render(<TokensBar />)
    expect(screen.getByText('$2.00')).toBeInTheDocument()
    expect(screen.getByText('Cost')).toBeInTheDocument()
    expect(screen.queryByText('Tokens')).not.toBeInTheDocument()
  })

  it('should display model and cost together without tokens', () => {
    useChatStore.setState({
      sessionId: 'sess-1',
      sessions: [{ id: 'sess-1', model: 'gpt-4o' }],
    })
    useChatStore.getState().setTotalCost(1.25, 'sess-1')
    render(<TokensBar />)
    expect(screen.getByText('gpt-4o')).toBeInTheDocument()
    expect(screen.getByText('$1.25')).toBeInTheDocument()
    expect(screen.getByText('Model')).toBeInTheDocument()
    expect(screen.getByText('Cost')).toBeInTheDocument()
  })

  it('should still not render when session exists but has no tokens, no model, no cost', () => {
    useChatStore.setState({ sessionId: 'sess-1', sessions: [{ id: 'sess-1' }] })
    const { container } = render(<TokensBar />)
    expect(container.innerHTML).toBe('')
  })

  it('should update to show model when session switches from no-model to model session', () => {
    useChatStore.setState({
      sessionId: 'sess-a',
      sessions: [{ id: 'sess-a' }],
    })
    useChatStore.getState().setEstimatedContextTokens(100, 'sess-a')

    const { rerender } = render(<TokensBar />)
    expect(screen.getByText('100')).toBeInTheDocument()
    expect(screen.queryByText('Model')).not.toBeInTheDocument()

    useChatStore.setState({
      sessionId: 'sess-b',
      sessions: [
        { id: 'sess-a' },
        { id: 'sess-b', model: 'claude-3' },
      ],
    })
    useChatStore.getState().setEstimatedContextTokens(200, 'sess-b')
    rerender(<TokensBar />)
    expect(screen.getByText('claude-3')).toBeInTheDocument()
    expect(screen.getByText('200')).toBeInTheDocument()
  })

  // --- Total Cost tests ---

  it('should display total cost when present', () => {
    useChatStore.setState({ sessionId: 'sess-1' })
    useChatStore.getState().setEstimatedContextTokens(100, 'sess-1')
    useChatStore.getState().setTotalCost(1.50, 'sess-1')
    render(<TokensBar />)
    expect(screen.getByText('$1.50')).toBeInTheDocument()
    expect(screen.getByText('Tokens')).toBeInTheDocument()
    expect(screen.getByText('100')).toBeInTheDocument()
  })

  it('should display cost with 2 decimal places', () => {
    useChatStore.setState({ sessionId: 'sess-1' })
    useChatStore.getState().setEstimatedContextTokens(100, 'sess-1')
    useChatStore.getState().setTotalCost(0.5, 'sess-1')
    render(<TokensBar />)
    expect(screen.getByText('$0.50')).toBeInTheDocument()
  })

  it('should display cost of 0', () => {
    useChatStore.setState({ sessionId: 'sess-1' })
    useChatStore.getState().setEstimatedContextTokens(100, 'sess-1')
    useChatStore.getState().setTotalCost(0, 'sess-1')
    render(<TokensBar />)
    expect(screen.getByText('$0.00')).toBeInTheDocument()
  })

  it('should not render cost section when cost is undefined', () => {
    useChatStore.setState({ sessionId: 'sess-1' })
    useChatStore.getState().setEstimatedContextTokens(100, 'sess-1')
    render(<TokensBar />)
    expect(screen.queryByText('$')).not.toBeInTheDocument()
  })

  it('should update cost when session switches', () => {
    useChatStore.setState({ sessionId: 'sess-a' })
    useChatStore.getState().setEstimatedContextTokens(100, 'sess-a')
    useChatStore.getState().setTotalCost(0.25, 'sess-a')
    useChatStore.getState().setEstimatedContextTokens(200, 'sess-b')
    useChatStore.getState().setTotalCost(0.75, 'sess-b')

    const { rerender } = render(<TokensBar />)
    expect(screen.getByText('$0.25')).toBeInTheDocument()

    useChatStore.setState({ sessionId: 'sess-b' })
    rerender(<TokensBar />)
    expect(screen.getByText('$0.75')).toBeInTheDocument()
  })

  // --- Model picker dropdown tests ---

  it('should not make model name clickable when onSwitchModel is not provided', () => {
    useChatStore.setState({
      sessionId: 'sess-1',
      sessions: [{ id: 'sess-1', model: 'gpt-4o' }],
    })
    render(<TokensBar />)
    const modelEl = screen.getByText('gpt-4o')
    expect(modelEl).toBeInTheDocument()
    // Should not have the clickable class when no callback provided
    expect(modelEl.className).not.toContain('--clickable')
  })

  it('should make model name clickable when onSwitchModel is provided', () => {
    useChatStore.setState({
      sessionId: 'sess-1',
      sessions: [{ id: 'sess-1', model: 'gpt-4o' }],
    })
    render(<TokensBar onSwitchModel={() => {}} />)
    const modelEl = screen.getByText('gpt-4o')
    expect(modelEl.className).toContain('--clickable')
  })

  it('should show dropdown when clicking on model name', () => {
    useChatStore.setState({
      sessionId: 'sess-1',
      sessions: [{ id: 'sess-1', model: 'gpt-4o' }],
      models: [
        { name: 'gpt-4o', current: true },
        { name: 'claude-3', current: false },
      ],
    })
    render(<TokensBar onSwitchModel={() => {}} />)
    const modelEl = screen.getByText('gpt-4o')
    act(() => { modelEl.click() })
    expect(screen.getByText('claude-3', { exact: false })).toBeInTheDocument()
  })

  it('should call onSwitchModel when a different model is selected', () => {
    const onSwitch = vi.fn()
    useChatStore.setState({
      sessionId: 'sess-1',
      sessions: [{ id: 'sess-1', model: 'gpt-4o' }],
      models: [
        { name: 'gpt-4o', current: true },
        { name: 'claude-3', current: false },
      ],
    })
    render(<TokensBar onSwitchModel={onSwitch} />)
    const modelEl = screen.getByText('gpt-4o')
    act(() => { modelEl.click() })
    act(() => { screen.getByText('claude-3', { exact: false }).click() })
    expect(onSwitch).toHaveBeenCalledWith('claude-3')
  })

  it('should NOT call onSwitchModel when the current model is selected', () => {
    const onSwitch = vi.fn()
    useChatStore.setState({
      sessionId: 'sess-1',
      sessions: [{ id: 'sess-1', model: 'gpt-4o' }],
      models: [
        { name: 'gpt-4o', current: true },
        { name: 'claude-3', current: false },
      ],
    })
    const { container } = render(<TokensBar onSwitchModel={onSwitch} />)
    const modelEl = screen.getByText('gpt-4o')
    act(() => { modelEl.click() })
    const currentItem = container.querySelector('.tokens-bar__dropdown-item--current')
    expect(currentItem).toBeInTheDocument()
    act(() => { currentItem.click() })
    expect(onSwitch).not.toHaveBeenCalled()
  })

  it('should close dropdown after selecting a model', () => {
    useChatStore.setState({
      sessionId: 'sess-1',
      sessions: [{ id: 'sess-1', model: 'gpt-4o' }],
      models: [
        { name: 'gpt-4o', current: true },
        { name: 'claude-3', current: false },
      ],
    })
    render(<TokensBar onSwitchModel={() => {}} />)
    const modelEl = screen.getByText('gpt-4o')
    act(() => { modelEl.click() })
    expect(screen.getByText('claude-3', { exact: false })).toBeInTheDocument()
    act(() => { screen.getByText('claude-3', { exact: false }).click() })
    expect(screen.queryByText('claude-3', { exact: false })).not.toBeInTheDocument()
  })

  it('should close dropdown on outside click', () => {
    useChatStore.setState({
      sessionId: 'sess-1',
      sessions: [{ id: 'sess-1', model: 'gpt-4o' }],
      models: [
        { name: 'gpt-4o', current: true },
        { name: 'claude-3', current: false },
      ],
    })
    render(<TokensBar onSwitchModel={() => {}} />)
    const modelEl = screen.getByText('gpt-4o')
    act(() => { modelEl.click() })
    expect(screen.getByText('claude-3', { exact: false })).toBeInTheDocument()
    // Click outside — the dropdown listens for mousedown
    act(() => { document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })) })
    expect(screen.queryByText('claude-3', { exact: false })).not.toBeInTheDocument()
  })

  it('should fetch models silently when dropdown opens and no models are loaded', () => {
    const onFetch = vi.fn()
    useChatStore.setState({
      sessionId: 'sess-1',
      sessions: [{ id: 'sess-1', model: 'gpt-4o' }],
      models: [],
    })
    render(<TokensBar onSwitchModel={() => {}} onFetchModels={onFetch} />)
    const modelEl = screen.getByText('gpt-4o')
    act(() => { modelEl.click() })
    expect(onFetch).toHaveBeenCalledOnce()
  })

  it('should not fetch models if already loaded', () => {
    const onFetch = vi.fn()
    useChatStore.setState({
      sessionId: 'sess-1',
      sessions: [{ id: 'sess-1', model: 'gpt-4o' }],
      models: [{ name: 'gpt-4o', current: true }],
    })
    render(<TokensBar onSwitchModel={() => {}} onFetchModels={onFetch} />)
    const modelEl = screen.getByText('gpt-4o')
    act(() => { modelEl.click() })
    expect(onFetch).not.toHaveBeenCalled()
  })
})
