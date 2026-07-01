import { describe, it, expect, beforeEach, vi } from 'vitest'
import { parseSlashCommand } from '../utils/parseSlashCommand'
import { useChatStore } from '../store/useChatStore'

describe('parseSlashCommand', () => {
  beforeEach(() => {
    useChatStore.setState({
      messages: [],
      sessionMessages: {},
      sessionId: 'test-sess',
      sessionStatus: {},
      isStreaming: false,
      isCancelling: false,
    })
  })

  it('should return false for text not starting with /', () => {
    const execute = vi.fn()
    expect(parseSlashCommand('hello', execute)).toBe(false)
    expect(execute).not.toHaveBeenCalled()
  })

  it('should return false for empty string', () => {
    const execute = vi.fn()
    expect(parseSlashCommand('', execute)).toBe(false)
    expect(parseSlashCommand(null, execute)).toBe(false)
    expect(execute).not.toHaveBeenCalled()
  })

  it('should handle /help', () => {
    const execute = vi.fn()
    const result = parseSlashCommand('/help', execute)
    expect(result).toBe(true)
    expect(execute).toHaveBeenCalledWith('help', {})
  })

  it('should handle /tool list', () => {
    const execute = vi.fn()
    const result = parseSlashCommand('/tool list', execute)
    expect(result).toBe(true)
    expect(execute).toHaveBeenCalledWith('tool_list', {})
  })

  it('should handle /tool (list implied)', () => {
    const execute = vi.fn()
    const result = parseSlashCommand('/tool', execute)
    expect(result).toBe(true)
    expect(execute).toHaveBeenCalledWith('tool_list', {})
  })

  it('should handle /tool allow read_file', () => {
    const execute = vi.fn()
    const result = parseSlashCommand('/tool allow read_file', execute)
    expect(result).toBe(true)
    expect(execute).toHaveBeenCalledWith('tool_allow', { name: 'read_file' })
  })

  it('should handle /tool deny shell', () => {
    const execute = vi.fn()
    const result = parseSlashCommand('/tool deny shell', execute)
    expect(result).toBe(true)
    expect(execute).toHaveBeenCalledWith('tool_deny', { name: 'shell' })
  })

  it('should handle /model list', () => {
    const execute = vi.fn()
    const result = parseSlashCommand('/model list', execute)
    expect(result).toBe(true)
    expect(execute).toHaveBeenCalledWith('model_list', {})
  })

  it('should handle /models (alias for model list)', () => {
    const execute = vi.fn()
    const result = parseSlashCommand('/models', execute)
    expect(result).toBe(true)
    expect(execute).toHaveBeenCalledWith('model_list', {})
  })

  it('should handle /model switch gpt-4', () => {
    const execute = vi.fn()
    const result = parseSlashCommand('/model switch gpt-4', execute)
    expect(result).toBe(true)
    expect(execute).toHaveBeenCalledWith('model_switch', { name: 'gpt-4' })
  })

  it('should handle /session list', () => {
    const execute = vi.fn()
    const result = parseSlashCommand('/session list', execute)
    expect(result).toBe(true)
    expect(execute).toHaveBeenCalledWith('session_list', {})
  })

  it('should handle /session info', () => {
    const execute = vi.fn()
    const result = parseSlashCommand('/session info', execute)
    expect(result).toBe(true)
    expect(execute).toHaveBeenCalledWith('session_info', {})
  })

  it('should handle /session rename My Chat', () => {
    const execute = vi.fn()
    const result = parseSlashCommand('/session rename My Chat', execute)
    expect(result).toBe(true)
    expect(execute).toHaveBeenCalledWith('session_rename', { name: 'My Chat' })
  })

  it('should handle /compact 10', () => {
    const execute = vi.fn()
    const result = parseSlashCommand('/compact 10', execute)
    expect(result).toBe(true)
    expect(execute).toHaveBeenCalledWith('compact', { n: 10 })
  })

  it('should handle /cwd /home/user/project', () => {
    const execute = vi.fn()
    const result = parseSlashCommand('/cwd /home/user/project', execute)
    expect(result).toBe(true)
    expect(execute).toHaveBeenCalledWith('cwd_set', { cwd: '/home/user/project' })
  })

  it('should handle /continue', () => {
    const execute = vi.fn()
    const result = parseSlashCommand('/continue', execute)
    expect(result).toBe(true)
    expect(execute).toHaveBeenCalledWith('continue', {})
  })

  it('should handle /start', () => {
    const execute = vi.fn()
    const result = parseSlashCommand('/start', execute)
    expect(result).toBe(true)
    expect(execute).toHaveBeenCalledWith('start', {})
  })

  it('should block unknown slash command and show error message in chat', () => {
    const execute = vi.fn()
    const result = parseSlashCommand('/typo', execute)
    expect(result).toBe(true)
    expect(execute).not.toHaveBeenCalled()

    const state = useChatStore.getState()
    // User message was added
    expect(state.messages[0].role).toBe('user')
    expect(state.messages[0].content).toBe('/typo')
    // Assistant error message was added
    expect(state.messages[1].role).toBe('assistant')
    expect(state.messages[1].content).toContain('Unknown command')
    expect(state.messages[1].content).toContain('/typo')
  })

  it('should add user message to chat for recognized commands', () => {
    const execute = vi.fn()
    parseSlashCommand('/help', execute)

    const state = useChatStore.getState()
    expect(state.messages[0].role).toBe('user')
    expect(state.messages[0].content).toBe('/help')
  })

  it('should show usage hint for /compact without args', () => {
    const execute = vi.fn()
    const result = parseSlashCommand('/compact', execute)
    expect(result).toBe(true)
    expect(execute).not.toHaveBeenCalled()

    const state = useChatStore.getState()
    expect(state.messages[1].content).toContain('Usage')
    expect(state.messages[1].content).toContain('/compact')
  })

  it('should show usage hint for /cwd without args', () => {
    const execute = vi.fn()
    const result = parseSlashCommand('/cwd', execute)
    expect(result).toBe(true)
    expect(execute).not.toHaveBeenCalled()

    const state = useChatStore.getState()
    expect(state.messages[1].content).toContain('Usage')
    expect(state.messages[1].content).toContain('/cwd')
  })

  it('should show suggestion for /tool with unknown subcommand', () => {
    const execute = vi.fn()
    parseSlashCommand('/tool foo', execute)
    expect(execute).not.toHaveBeenCalled()

    const state = useChatStore.getState()
    expect(state.messages[1].content).toContain('Unknown')
    expect(state.messages[1].content).toContain('/tool')
  })
})
