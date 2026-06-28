import { describe, it, expect } from 'vitest'
import { useChatStore } from '../store/useChatStore'

/**
 * Message IDs must always be unique (valid UUID v4) to prevent
 * React key collision warnings and duplicate DOM nodes.
 *
 * The old implementation used a module-level counter which could
 * produce duplicates when:
 * - StrictMode double-mounts the component tree
 * - Messages are loaded from server and created locally concurrently
 * - Reconnection causes overlapping message processing
 */
describe('genId uniqueness', () => {
  it('generates UUID v4 format IDs', () => {
    const store = useChatStore.getState()
    store.sendMessage('test')
    const msg = useChatStore.getState().messages[0]
    // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    expect(msg.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    )
  })

  it('generates unique IDs across multiple batches simulating StrictMode', () => {
    const store = useChatStore.getState()

    // Simulate first mount batch
    store.sendMessage('Hello')
    store.startAssistantMessage()
    store.appendDelta('one')

    // Reset messages to simulate session_switch reload
    useChatStore.setState({ messages: [] })

    // Simulate second mount batch (StrictMode remount)
    const store2 = useChatStore.getState()
    store2.sendMessage('World')
    store2.startAssistantMessage()
    store2.appendDelta('two')

    const msgs = useChatStore.getState().messages
    const ids = msgs.map((m) => m.id)
    const uniqueIds = new Set(ids)

    expect(ids.length).toBe(uniqueIds.size)
    // Each ID should be a UUID
    ids.forEach((id) => {
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      )
    })
  })

  it('does not collide with server-loaded message IDs', () => {
    useChatStore.setState({ messages: [] })
    const store = useChatStore.getState()

    // Simulate loading messages from server (session_switch)
    // Server messages without IDs get UUIDs
    store.setMessages([
      { role: 'user', content: 'Hello!' },
      { role: 'assistant', content: 'Hi!' },
    ])

    // Now add new local messages — must not collide
    store.sendMessage('How are you?')
    store.startAssistantMessage()
    store.appendDelta('Good!')

    const msgs = useChatStore.getState().messages
    const ids = msgs.map((m) => m.id)
    const uniqueIds = new Set(ids)

    expect(ids.length).toBe(uniqueIds.size)
  })

  it('handles concurrent session_switch and local message creation', () => {
    useChatStore.setState({ messages: [] })
    const store = useChatStore.getState()

    // First, load messages from server
    store.handleCommandResult('session_switch', {
      session: { id: 'sess-1' },
      messages: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there' },
      ],
    })

    // Then add a new user message locally
    store.sendMessage('How are you?')
    store.startAssistantMessage()
    store.appendDelta('Doing great!')

    const msgs = useChatStore.getState().messages
    const ids = msgs.map((m) => m.id)
    const uniqueIds = new Set(ids)

    expect(ids.length).toBe(uniqueIds.size)
  })
})
