# Hakka WebFront — TODO

## Completed Features

### Foundation
- [x] React + Vite + Zustand app
- [x] WebSocket connection with auto-reconnect (exponential backoff 1s–16s)
- [x] Connection status indicator (sidebar dot)
- [x] Message list with streaming responses
- [x] Tool call observability inline (start/ok/err, color-coded, name + snippet)
- [x] Wire Protocol v2 — JSON commands with `command_result` frames

### Session Management
- [x] Session list sidebar (sorted by `updated_at` descending)
- [x] Create / switch / delete sessions with confirmation dialog
- [x] Per-session message cache (`sessionMessages`)
- [x] Per-session CWD persistence (`sessionCwds`)
- [x] Per-session streaming status (`sessionStatus`)
- [x] Unread indicators (green dot for unseen activity)
- [x] Restore last active session on page load (localStorage)
- [x] Reconnection tolerance — preserve state across disconnects

### Markdown & Rendering
- [x] Full GFM support (tables, lists, code blocks, etc.)
- [x] Syntax highlighting with highlight.js
- [x] LaTeX math rendering ($...$ inline, $$...$$ display) via KaTeX
- [x] Inline tool call display at correct position in message stream
- [x] Links open in new tab

### Configuration
- [x] **Configuration menu** — modal with WebSocket URL input, theme toggle, test connection button, connection status display
- [x] **Light/Dark theme** — full CSS variable set for both themes, toggle via config menu, persisted to localStorage
- [x] **Dynamic WebSocket URL** — read from store config, reconnect on change (useWebSocket reconnects when URL prop changes)
- [x] **Tools table** — list all tools with name, tags, description, enable/disable toggle

### Prompt Templates
- [x] **Prompt library** — create, edit, delete prompt templates
- [x] **LocalStorage persistence** — prompts survive page reload
- [x] **Click to paste** — clicking a prompt in sidebar pastes it into the input area (not submitted, user can edit)
- [x] **UI** — prompts section in left sidebar with + button, edit (✎) on hover, click to paste

### Other
- [x] Send text via Enter (no Send button)
- [x] Cancel button during streaming (⏹, inside textarea bottom-right)
- [x] Auto-expanding input field (max 67% vh)
- [x] Instant scroll (no smooth animation)
- [x] Session name refresh via `session_autorename` / `session_rename` command_result events
- [x] `session_autorename` handling in store
- [x] `session_renamed` event handling in WebSocket handler
- [x] **No double-append bug** — streaming deltas no longer duplicate when `TurnFinished` arrives
- [x] **No duplicate subscriber bug** — switching sessions while streaming no longer duplicates every delta (server-side fix)
- [x] **Clean input bar** — no border, no outline, no double padding; textarea flush to edges
- [x] **Copy markdown button** — each message bubble has a Tabler `IconCopy` button (visible on hover) that copies raw LLM markdown to clipboard with `IconCheck` feedback
- [x] 262+ passing tests (16 test files)

---

## Planned Features

### Input & Editing
- [ ] **Vim mode for the user input field** — modal editing (normal/insert mode), `j`/`k` for message history navigation, `Esc` to normal mode, `Enter` to send in normal mode, `Shift+Enter` for newline

### UI Changes
- [ ] **Responsive design** — sidebar collapses on narrow screens
- [ ] **Mobile-friendly input and controls**

### UX
- [ ] Skeleton loading states for session list
- [ ] Session search / fuzzy-find
- [ ] Tool enable/disable UI from sidebar (right now it's in config menu)

### Connection
- [ ] **Multi-connection support** — connect to multiple Hakka instances simultaneously (per-session WebSocket URL, multiple concurrent WS connections, routing send/execute by session's associated server)

### Polish
- [ ] Split view — side-by-side sessions (future)

---

## Known Issues

- [x] Snippet stripping for `\n` — closed (vim-related)
- [ ] When run multiple tools, Neovim statuses not updated properly (server-side)
- [ ] User can switch to unexistent session (it creates new session — server-side)
