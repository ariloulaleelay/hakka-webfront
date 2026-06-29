# Hakka WebFront — Web UI for Hakka LLM Agent

## Project Description

Hakka WebFront is a **standalone React + Vite web frontend** for [Hakka](https://github.com/ariloulaleelay/hakka) — an LLM Agent Core Framework.

It connects to a running Hakka instance via a WebSocket gateway (`/ws`) and provides a chat UI with streaming responses, tool call observability, multi-session management, and auto-reconnect.

---

## Tech Stack

| Layer | Library | Version |
|---|---|---|
| UI Framework | React | ^19.2.7 |
| State Management | Zustand | ^5.0.14 |
| Markdown Rendering | react-markdown | ^10.1.0 |
| GFM Tables | remark-gfm | ^4.0.1 |
| Code Highlighting | rehype-highlight | ^7.0.2 |
| Build Tool | Vite | ^8.1.0 |
| Testing | Vitest + Testing Library | ^4.1.9 |
| Linting | oxlint | ^1.69.0 |

---

## Project Structure

```
src/
├── main.jsx                          # Entry point, renders <App />
├── App.jsx                           # Root layout: Sidebar + header + ChatArea + InputBar
├── App.css                           # All application styles
├── index.css                         # Global reset / base styles
│
├── components/
│   ├── ChatArea.jsx                  # Message list, bubble rendering, tool call interleaving
│   ├── CwdBar.jsx                    # Editable working directory indicator (click to edit)
│   ├── InputBar.jsx                  # Text input + Send/Cancel button
│   ├── MarkdownContent.jsx           # ReactMarkdown wrapper with custom code & link rendering
│   ├── Sidebar.jsx                   # Session list with status dots, new/delete session
│   ├── TokensBar.jsx                 # Estimated session tokens display (top-right header)
│   └── ToolCall.jsx                  # Inline tool call display (name + snippet, color-coded)
│
├── hooks/
│   └── useWebSocket.js               # WebSocket connection lifecycle, frame routing, send/execute/cancel
│
├── store/
│   └── useChatStore.js               # Zustand store: messages, sessions, streaming, connection, CWD
│
└── test/
    ├── setup.js                      # Vitest setup (jsdom, jest-dom matchers)
    ├── App.test.jsx                  # Integration tests for App
    ├── ChatArea.test.jsx             # Message rendering tests
    ├── CwdBar.test.jsx               # CWD bar tests
    ├── InputBar.test.jsx             # Input tests
    ├── MarkdownContent.test.jsx      # Markdown rendering tests
    ├── Sidebar.test.jsx              # Sidebar tests
    ├── TokensBar.test.jsx           # TokensBar tests
    ├── genId.test.jsx                # ID generation tests
    ├── useChatStore.test.jsx         # Store unit tests (33+ tests covering all actions)
    ├── useWebSocket.test.js          # WebSocket handler tests
    └── parseSlashCommand.test.js     # Slash command parsing tests (22 tests)
```

---

## State Management (Zustand Store)

File: `src/store/useChatStore.js`

### State Shape

```
messages: Message[]              // Messages for the currently active session
sessionMessages: { [id]: [] }    // Cached messages for non-active sessions
sessionStatus: { [id]: 'idle'|'streaming' }   // Per-session streaming status
sessionCwds: { [id]: string }    // Per-session working directory
sessionEstimatedTokens: { [id]: number }  // Per-session estimated context tokens from server meta events
sessionId: string|null            // Currently active session ID
sessions: Session[]               // List of all known sessions
connectionStatus: 'connected'|'disconnected'|'reconnecting'
isStreaming: boolean              // Whether current active session is streaming
isCancelling: boolean
error: string|null
cwd: string|null                  // Current working directory (active session's CWD)
```

### Message Format

```typescript
interface Message {
  id: string               // crypto.randomUUID()
  role: 'user' | 'assistant'
  content: string          // Plain text or markdown. Contains \x00TOOL:N\x00 markers
                           // for inline tool call positions
  toolCalls?: ToolCall[]   // Tool calls belonging to this assistant message
  timestamp: number
}

interface ToolCall {
  tool: string             // e.g. "read_file", "shell"
  status: 'start' | 'ok' | 'err' | 'done'
  exec_snippet: string     // Short display snippet (e.g. "src/foo.txt")
  args?: any               // Original arguments object (from server)
  tool_call_id?: string    // Matches server's tool_call_id for history merging
  id?: string              // Internal unique ID
  timestamp?: number
}
```

### Tool Call Markers

Tool calls are embedded **inline** within assistant message content using null-byte markers:

- Marker format: `\x00TOOL:N\x00` where N is the zero-based index into `toolCalls[]`
- The `renderContentWithToolCalls()` function in ChatArea.jsx splits content on these markers
- This ensures tool calls appear at the correct position in the message stream, not at the bottom

### Key Actions

- `sendMessage(content, sessionId?)` — Add a user message; merges consecutive user messages
- `startAssistantMessage(sessionId?)` — Start/reuse an assistant message; sets streaming status
- `appendDelta(delta, sessionId?)` — Append text to the current assistant message
- `finalizeMessage(sessionId?)` — End streaming for a session
- `addToolEvent(event, sessionId?)` — Add or update a tool call on the current assistant message
- `handleCommandResult(cmd, data)` — Process server command results (session_list, get_session, etc.)
- `setSessionId(id)` — Register a new session; does NOT change active session if already known
- `setMessages(rawMessages)` — Normalize and set messages for the active session
- `setCwd(cwd)` — Update working directory and persist in per-session cache

### Routing: Active vs Cached Sessions

Two helper functions handle routing:

- `getSessionMsgs(state, sessionId)` — If `sessionId` matches active session, returns `state.messages`; otherwise returns `state.sessionMessages[sessionId]`
- `setSessionMsgs(state, sessionId, msgs)` — Returns a partial state update targeting either active or cached session

### History Normalization (`normalizeMessages`)

When receiving messages from the server (e.g. on `get_session`), raw messages are normalized:

1. **`role: "tool"` messages** — Merged into the preceding assistant message, matched by `tool_call_id`
2. **`tool_calls` (snake_case)** — Converted from server format to internal `toolCalls[]` with embedded markers
3. **Consecutive same-role messages** — Merged into a single message (content concatenated)
4. **`get_session`** also restores cached messages if available (client-side cache takes priority)

---

## WebSocket Hook

File: `src/hooks/useWebSocket.js`

### Connection Lifecycle

1. On mount, connects to the WebSocket URL
2. Auto-reconnect with exponential backoff: 1s, 2s, 4s, 8s, 16s
3. On open, sends `session_list` to fetch current sessions
4. On close/disconnect, sets status to `'disconnected'` and schedules reconnect
5. On unmount, cleanly closes the connection

### Frame Handling (`handleFrame`)

The handler processes incoming JSON frames in strict order:

1. **Error** — sets error, finalizes streaming if active
2. **Session renamed** (`event: 'session_renamed'`) — updates session name in list
3. **Meta event** (`event: 'meta'`) — token usage metadata; extracts `estimated_context_tokens` if present and stores it in the Zustand state
4. **Cancel event** (`event: 'cancel'`) — clears cancelling state via `handleCancelResponse()`
5. **Tool events** (`event: 'tool'`) — starts assistant message if needed, adds tool event
6. **Command result** (`event: 'command_result'`) — dispatches to `handleCommandResult` BEFORE any `setSessionId` call (critical for get_session caching)
7. **Session switch** (`event: 'command_result'` with `cmd: 'get_session'`) — switches session, loads messages
8. **Session create** (`event: 'session_create'`) — registers new session
9. **Session list** (`event: 'session_list'`) — updates session list
10. **Session info** (`event: 'session_info'`) — updates session details
11. **Client request** (`event: 'vim_request'` or `'client_request'`) — responds with `{"type":"response","request_id":"...","error":"unsupported"}`
12. **Stream delta** (`delta !== undefined`) — appends to current assistant message
13. **Non-stream output** (`output + done`) — handles complete responses without deltas
14. **Stream done** (`done: true`) — finalizes streaming

**IMPORTANT**: `setSessionId(sid)` is called only for non-command frames AFTER command result handling. This order is critical for get_session to properly cache old session messages.

### Composable Returns

- `send(sessionId, text, stream?)` — Send a chat message
- `execute(cmd, params)` — Send a structured JSON command (not shown in chat)
- `cancel(sessionId)` — Cancel an in-flight request

---

## Component Architecture

### App.jsx

Root component. Layout:
```
┌─────────────────────────────────┐
│ Sidebar  |  Header (CwdBar)     │
│          ├──────────────────────┤
│          │  ChatArea            │
│          │  (message list)      │
│          │                      │
│          ├──────────────────────┤
│          │  InputBar            │
└─────────┴──────────────────────┘
```

Props handlers: `onNewSession`, `onSwitchSession`, `onDeleteSession` are wired to WebSocket `execute()` commands.

### Sidebar.jsx

- Single list of sessions with active highlight
- Each session shows status dot: green (`idle`), purple (`streaming`)
- Header shows connection status dot: green (`connected`), red (`disconnected`), yellow (`reconnecting`)
- "New Session" button at top
- Click another session to switch; click delete icon to show confirmation dialog
- Confirmation dialog (`ConfirmDialog`) prevents accidental deletion

### ChatArea.jsx

- Renders messages via `MessageBubble` components
- Assistant messages use `renderContentWithToolCalls()` to interleave text and tool calls
- Empty state: shows placeholder "No messages yet"
- Auto-scrolls to bottom on new messages using `scrollIntoView()` (instant, no smooth animation)
- Last message gets `isStreaming` flag for live delta rendering

### CwdBar.jsx

- Shows current working directory (click to edit)
- Inline text input on click; Enter saves, Esc cancels, blur saves
- Label: `CWD`

### TokensBar.jsx

- Displays estimated session context tokens in the header (top-right)
- Reads tokens for the current active session from `sessionEstimatedTokens` map
- Only renders when the active session has a token value
- Shows label "Tokens" and the numeric count in monospace font
- Updated via `event: "meta"` with `data: { "estimated_context_tokens": N }` and `session_id` at the top level
- Persisted per-session in the store (preserved across session switches and restored on switch-back)
- Cleaned up on session delete

### InputBar.jsx

- Text area input with Enter to send (Shift+Enter for newline)
- Send button disabled when empty or streaming
- Cancel button shown during streaming
- Buttons immediately disabled on click to prevent double-sends

### MarkdownContent.jsx

- Wraps `react-markdown` with GFM support and code highlighting
- Custom `code` component: inline vs block detection, language label on code blocks
- Custom `a` component: opens links in new tab
- `isStreaming` prop disables rehype-highlight to avoid issues with incomplete code blocks

### ToolCall.jsx

- Displays a tool call inline: `tool_name snippet`
- Color-coded by status: green (`ok/done/complete/success`), red (`err/error/failed`), neutral (`start`)
- Snippet cleaned: trimmed, quotes stripped, truncated to 100 chars

---

## Slash Commands

All user input starting with `/` is **intercepted client-side and never sent to the LLM**. Parsing is handled by `parseSlashCommand(text, execute)` in `src/hooks/useWebSocket.js`, called from `App.jsx`'s `handleSend` before any WebSocket `send()`.

Recognized commands are dispatched as structured JSON commands via `execute()`. Unknown commands produce an inline assistant error message in the chat.

### Recognized Commands

| User Input | JSON Command | Params |
|---|---|---|
| `/help` | `help` | `{}` |
| `/tool list` or `/tool` | `tool_list` | `{}` |
| `/tool allow <name>` | `tool_allow` | `{name}` |
| `/tool deny <name>` | `tool_deny` | `{name}` |
| `/model list` | `model_list` | `{}` |
| `/models` | `model_list` | `{}` |
| `/model switch <name>` | `model_switch` | `{name}` |
| `/session list` | `session_list` | `{}` |
| `/session info` | `session_info` | `{}` |
| `/session rename <name>` | `session_rename` | `{name}` |
| `/compact <n>` | `compact` | `{n}` |
| `/cwd <path>` | `cwd_set` | `{cwd}` |
| `/continue` | `continue` | `{}` |
| `/start` | `start` | `{}` |

Anything starting with `/` not in the list produces: `Unknown command: /command`.

### Display Handling

For commands that return data (`tool_list`, `help`, `model_list`, `model_switch`, `cwd_set`, `compact`), the `command_result` handler in `useWebSocket.js` formats the response as a readable assistant message. Other commands (e.g., `session_list`, `session_delete`) update internal store state silently.

### Store State

The store now tracks additional fields for slash commands:

- `models` — array of `{name, current}` from `model_list` / `model_switch`

---

## Wire Protocol (v2 — JSON Commands)

### 1. Chat Requests

```json
{
  "session_id": "uuid-or-prefix",
  "input": "Hello Hakka!",
  "stream": true,
  "cwd": "/path/to/project"
}
```

### 2. JSON Commands (Structured API)

```json
{
  "session_id": "uuid",
  "command": { "cmd": "session_list", "params": {} },
  "cwd": "/path"
}
```

Available commands:

| cmd | params | response data |
|---|---|---|
| `session_list` | `{}` | `{"sessions": [{id, short_id, name, created, message_count, current}]}` |
| `session_create` | `{}` | `{"session": {id, short_id, name, client_cwd?}}` |
| `get_session` | `{id}` | `{"session": {id, client_cwd?}, "messages": [...]}` |
| `session_delete` | `{id}` | `{"deleted": id, "active_cleared": bool}` |
| `session_info` | `{}` | `{"session": {id, name, model, message_count, client_cwd?}}` |
| `session_rename` | `{name}` | `{"session": {id, name}}` |
| `session_autorename` | `{}` | `{"session": {id, name}}` |
| `model_list` | `{}` | `{"models": [{name, current}]}` |
| `model_switch` | `{name}` | `{"model": name}` |
| `tool_list` | `{}` | `{"tools": [{name, description, enabled, tags}]}` |
| `tool_allow` | `{"name": "tool_or_#tag"}` | `{"allowed": [name]}` |
| `tool_deny` | `{"name": "tool_or_#tag"}` | `{"denied": [name]}` |
| `cwd_set` | `{"cwd": "/path"}` | `{"cwd": "/path"}` |
| `help` | `{}` | `{"commands": [...]}` |
| `start` | `{}` | `{"session": {...}}` |
| `compact` | `{n}` | `{"compact_soft_limit": n}` |
| `continue` | `{}` | (triggers LLM) |

### 3. Response Types

#### Token Usage Meta
```json
{
  "session_id": "uuid",
  "event": "meta",
  "data": { "prompt_tokens": 100, "completion_tokens": 50, "total_tokens": 150 }
}
```

Additional meta events:

**Estimated Context Tokens**
```json
{
  "session_id": "uuid",
  "event": "meta",
  "data": { "estimated_context_tokens": 12345 }
}
```
This event is processed by the frontend to display the estimated token count for the session identified by `session_id`. Tokens are stored per-session and preserved across session switches, so switching back to a previous chat restores its token count.

#### Cancel Acknowledgement
```json
{
  "session_id": "uuid",
  "event": "cancel",
  "data": { "cancelled": true }
}
```

#### Client Request (Vim Tool)
```json
{
  "session_id": "uuid",
  "event": "vim_request",
  "vim_request": {
    "request_id": "...",
    "command": "..."
  }
}
```

#### Command Result
```json
{
  "session_id": "uuid",
  "event": "command_result",
  "cmd": "session_list",
  "data": { "sessions": [...] },
  "done": true
}
```

#### Tool Events
```json
{
  "session_id": "uuid",
  "event": "tool",
  "tool": "shell",
  "status": "start",
  "args": { "command": "curl wttr.in" },
  "exec_snippet": "curl wttr.in"
}
```

Status values: `start`, `ok`, `err`, `done`

#### Stream Delta
```json
{
  "session_id": "uuid",
  "delta": "partial response text"
}
```

#### Stream Done
```json
{
  "session_id": "uuid",
  "done": true
}
```

#### Non-stream Output
```json
{
  "session_id": "uuid",
  "output": "complete response",
  "done": true
}
```

#### Error
```json
{
  "session_id": "uuid",
  "error": "error message"
}
```

---

## Multi-Session Architecture

### Parallel Sessions

- Each session has its own message cache (`sessionMessages[id]`) and status (`sessionStatus[id]`)
- `setSessionId()` only activates new sessions; known sessions don't change the active ID
- Stream events are routed by `session_id` to the correct cache via `getSessionMsgs()`
- `get_session` caches current messages before loading target

### Session Switch Flow

1. User clicks another session in sidebar
2. `App.jsx` calls `execute('get_session', { id })`
3. Server responds with `command_result` containing session data + messages
4. `handleCommandResult('get_session')`:
   - Saves current session's messages + CWD to cache
   - Loads target session's messages (from cache if available, else from server)
   - Restores target session's CWD
5. UI updates: `messages` and `cwd` reactively change

### Delete Session Flow

1. User clicks delete icon → confirmation dialog shown
2. On confirm, calls `execute('session_delete', { id })`
3. Server responds, store removes session from list and cleans up caches

---

## CSS Architecture

File: `src/App.css` — single stylesheet (no CSS modules)

Key layout classes:
- `.app` — flexbox row (sidebar + main area)
- `.sidebar` — fixed-width left panel (280px)
- `.app__main-area` — flex-grow column
- `.chat-area` — message list, scrollable
- `.message` — flex row with role label + content bubble
- `.message__tools` — container for inline tool calls
- `.tool-call--ok` — green border (success)
- `.tool-call--err` — red border (error)
- `.tool-call--start` — neutral/gray border (in progress)

---

## Development

```sh
npm install
npm run dev         # http://localhost:5173
npm test            # run all tests
npm run test:watch  # watch mode
npm run build       # dist/
```

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `VITE_WS_URL` | `ws://127.0.0.1:8765/ws` | WebSocket endpoint |
| `VITE_CWD` | `/` | Initial working directory |

---

## Testing Patterns

- **Store tests** (`useChatStore.test.jsx`): Direct state manipulation via `getState()/setState()`, no React rendering. Covers message creation, streaming, tool events, session management, caching, CWD persistence, and leak prevention.
- **Component tests** (`ChatArea.test.jsx`, etc.): Rendered with `@testing-library/react`, use store mocking for state injection.
- **Integration tests** (`App.test.jsx`): Full app with mocked WebSocket.
- **WebSocket tests** (`useWebSocket.test.js`): Mock WebSocket class, test frame parsing and routing.

---

## Known Design Decisions

1. **No CSS modules / CSS-in-JS** — single `App.css` file for simplicity. The project is small enough.
2. **Tool calls embedded inline in content** — `\x00TOOL:N\x00` markers ensure correct positioning without complex state tracking.
3. **Per-session CWD stored client-side** — `sessionCwds` map persists CWD per session even if server doesn't return it.
4. **setSessionId does NOT activate known sessions** — prevents stream events for background sessions from hijacking the active session.
5. **Command results handled before setSessionId** — critical ordering for get_session to cache old session messages correctly.
6. **Single connection, multi-session routing** — one WebSocket; all sessions share it, routing by `session_id` field.
