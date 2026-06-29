import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ConfigMenu } from '../components/ConfigMenu'
import { useChatStore } from '../store/useChatStore'

describe('ConfigMenu', () => {
  beforeEach(() => {
    useChatStore.setState({
      config: { wsUrl: 'ws://test:8765/ws', theme: 'dark' },
      tools: [],
    })
  })

  it('should render title and fields', () => {
    render(<ConfigMenu onClose={() => {}} />)
    expect(screen.getByText('Settings')).toBeInTheDocument()
    expect(screen.getByText('WebSocket URL')).toBeInTheDocument()
    expect(screen.getByText('Theme')).toBeInTheDocument()
    expect(screen.getByText('Current connection:')).toBeInTheDocument()
  })

  it('should display current wsUrl in input', () => {
    render(<ConfigMenu onClose={() => {}} />)
    const input = screen.getByDisplayValue('ws://test:8765/ws')
    expect(input).toBeInTheDocument()
  })

  it('should display current theme in select', () => {
    render(<ConfigMenu onClose={() => {}} />)
    const select = screen.getByDisplayValue('Dark')
    expect(select).toBeInTheDocument()
  })

  it('should apply theme instantly on select change', () => {
    render(<ConfigMenu onClose={() => {}} />)

    const select = screen.getByDisplayValue('Dark')
    fireEvent.change(select, { target: { value: 'light' } })

    const state = useChatStore.getState()
    expect(state.config.theme).toBe('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('should save wsUrl and close on Apply', () => {
    const onClose = vi.fn()
    render(<ConfigMenu onClose={onClose} />)

    const urlInput = screen.getByDisplayValue('ws://test:8765/ws')
    fireEvent.change(urlInput, { target: { value: 'ws://new:9999/ws' } })

    fireEvent.click(screen.getByText('Apply'))

    const state = useChatStore.getState()
    expect(state.config.wsUrl).toBe('ws://new:9999/ws')
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('should close on Cancel', () => {
    const onClose = vi.fn()
    render(<ConfigMenu onClose={onClose} />)
    fireEvent.click(screen.getByText('Cancel'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('should show Test button', () => {
    render(<ConfigMenu onClose={() => {}} />)
    expect(screen.getByText('Test')).toBeInTheDocument()
  })

  it('should show tools section with table', () => {
    useChatStore.setState({
      config: { wsUrl: 'ws://test:8765/ws', theme: 'dark' },
      tools: [
        { name: 'read_file', description: 'Read a file', enabled: true, tags: ['fs', 'all'] },
        { name: 'shell', description: 'Run a command', enabled: false, tags: ['system'] },
      ],
    })
    render(<ConfigMenu onClose={() => {}} />)
    expect(screen.getByText('Tools (2)')).toBeInTheDocument()
    expect(screen.getByText('read_file')).toBeInTheDocument()
    expect(screen.getByText('shell')).toBeInTheDocument()
    expect(screen.getByText('#fs')).toBeInTheDocument()
    expect(screen.getByText('#system')).toBeInTheDocument()
    expect(screen.getByText('Read a file')).toBeInTheDocument()
    expect(screen.getByText('Run a command')).toBeInTheDocument()
  })

  it('should call onExecute for tool_list on mount', () => {
    const onExecute = vi.fn()
    render(<ConfigMenu onClose={() => {}} onExecute={onExecute} />)
    expect(onExecute).toHaveBeenCalledWith('tool_list', {})
  })

  it('should call onExecute for tool_allow/tool_deny on toggle', () => {
    useChatStore.setState({
      config: { wsUrl: 'ws://test:8765/ws', theme: 'dark' },
      tools: [
        { name: 'read_file', description: 'Read a file', enabled: true, tags: ['fs'] },
      ],
    })
    const onExecute = vi.fn()
    render(<ConfigMenu onClose={() => {}} onExecute={onExecute} />)

    const toggleBtn = screen.getByTitle('Disable')
    fireEvent.click(toggleBtn)
    expect(onExecute).toHaveBeenCalledWith('tool_deny', { name: 'read_file' })
  })
})
