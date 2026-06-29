import '@testing-library/jest-dom'
import { vi, beforeEach } from 'vitest'

// Mock WebSocket for all tests
class MockWebSocket {
  static instances = []
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  constructor(url) {
    this.url = url
    this.readyState = MockWebSocket.CONNECTING
    this.onopen = null
    this.onclose = null
    this.onmessage = null
    this.onerror = null
    this.send = vi.fn()

    MockWebSocket.instances.push(this)

    setTimeout(() => {
      if (this.readyState === MockWebSocket.CLOSED) return
      this.readyState = MockWebSocket.OPEN
      if (this.onopen) this.onopen({ target: this })
    }, 0)
  }

  close() {
    if (this.readyState === MockWebSocket.CLOSED) return
    this.readyState = MockWebSocket.CLOSED
    if (this.onclose) this.onclose({ target: this, wasClean: true })
  }
}

globalThis.WebSocket = MockWebSocket

// Mock scrollIntoView for jsdom
Element.prototype.scrollIntoView = vi.fn()

// Mock localStorage for tests that check session persistence
const localStorageMock = (() => {
  let store = {}
  return {
    getItem: (key) => store[key] ?? null,
    setItem: (key, value) => { store[key] = String(value) },
    removeItem: (key) => { delete store[key] },
    clear: () => { store = {} },
    get length() { return Object.keys(store).length },
    key: (index) => Object.keys(store)[index] ?? null,
  }
})()

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock })

// Reset WebSocket instances between tests
beforeEach(() => {
  MockWebSocket.instances = []
})
