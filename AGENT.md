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
| LaTeX Math | remark-math + rehype-katex | ^6.0.1 / ^6.0.3 |
| **Diagrams** | **Mermaid** | **^11.16.0** |
| Build Tool | Vite | ^8.1.0 |
| Testing | Vitest + Testing Library | ^4.1.9 |
| Linting | oxlint | ^1.69.0 |

---

## Project Structure

```
src/
├── main.jsx                          # Entry point, renders <App />
├── App.jsx                           # Root layout: Sidebar + header (InputBar) + ChatArea + footer (CwdBar, TokensBar)
├── App.css                           # All application styles
├── index.css                         # Global reset / base styles
│
├── components/
│   ├── ChatArea.jsx                  # Message list, bubble rendering, tool call interleaving
│   ├── CwdBar.jsx                    # Editable working directory indicator (click to edit)
│   ├── InputBar.jsx                  # Text input + Send/Cancel button
│   ├── MarkdownContent.jsx           # ReactMarkdown wrapper with custom code & link rendering
│   ├── MermaidBlock.jsx              # Mermaid diagram renderer (flowcharts, sequence diagrams, etc.)
│   ├── Sidebar.jsx                   # Session list with status dots, new/delete session
│   ├── TokensBar.jsx                 # Estimated session tokens display (bottom-right footer)
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
    ├── MermaidBlock.test.jsx         # Mermaid diagram renderer tests
    ├── Sidebar.test.jsx              # Sidebar tests
    ├── TokensBar.test.jsx           # TokensBar tests
    ├── genId.test.jsx                # ID generation tests
    ├── useChatStore.test.jsx         # Store unit tests (98 tests covering all actions)
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
sessionTotalCost: { [id]: number }  // Per-session total cost in $ from server meta events
sessionId: string|null            // Currently active session ID
sessions: Session[]               // List of all known sessions (each may have `model` field)
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
  timestamp: number        // Unix timestamp in milliseconds. For user messages:
                           //   Date.now() (client-generated). For assistant messages
                           //   and tool calls: extracted from server frame's `ts`
                           //   field when available, falls back to Date.now().
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

**Legacy path** — used when the server sends `messages` without `events`.
When receiving messages from the server (e.g. on `get_session` without events), raw messages are normalized:

1. **`role: "tool"` messages** — Merged into the preceding assistant message, matched by `tool_call_id`
2. **`tool_calls` (snake_case)** — Converted from server format to internal `toolCalls[]` with embedded markers
3. **Consecutive same-role messages** — Merged into a single message (content concatenated)
4. **`get_session`** also restores cached messages if available (client-side cache takes priority)

### History Replay via Events (`replayEvents`)

**New path** — used when the server sends `events` alongside `messages` on `get_session`.
The `replayEvents(events)` function processes a replay-friendly sequence of typed events that mirror the live wire protocol.

Event types and their processing:

| Event type | What it does |
|---|---|
| `"chat"` | Creates or merges a user message from `event.text`. Uses `event.ts` for `timestamp` if available. |
| `"delta"` | Creates or appends to the current assistant message. Uses `event.ts` for `timestamp` on creation. |
| `"tool"` (status `"start"`) | Adds a tool call with `\x00TOOL:N\x00` marker. Uses `event.ts` for `timestamp` if available. |
| `"tool"` (status `"ok"`/`"err"`) | Updates matching tool call by `event.id` (tool_call_id). Preserves the start timestamp. |
| `"usage"` | Skipped (tokens tracked per-session in store maps) |
| `"done"` | Resets the current assistant tracker (bare terminal marker) |

**In-flight detection**: If the events array does not end with `{"type":"done"}`, the session is considered in-flight (still streaming). The `get_session` handler sets `isStreaming: true` and `sessionStatus: 'streaming'` for that session.

**Key advantage**: No complex message normalization needed — events already have the correct shape. The same events are used for both live streaming and history replay, ensuring consistent rendering.

---

## WebSocket Hook

File: `src/hooks/useWebSocket.js`

### Connection Lifecycle (v2 protocol)

1. On mount, connects to the WebSocket URL
2. Auto-reconnect with exponential backoff: 1s, 2s, 4s, 8s, 16s
3. **On open, no frames are sent** — the server pushes a `type:"welcome"` frame with session list
4. On close/disconnect, sets status to `'disconnected'` and schedules reconnect
5. On unmount, cleanly closes the connection

### Frame Handling (`handleV2Frame`)

Every incoming frame has a mandatory `type` field. Processing is done via a `switch` on `frame.type`:

| `type` | What it does |
|---|---|
| `"welcome"` | Processes session list, checks for `in_flight` session (auto-loads it), falls back to localStorage |
| `"delta"` | Streaming text chunk — appends `frame.text` to current assistant message |
| `"output"` | Full non-stream reply (before `"done"`) — creates/appends assistant message |
| `"done"` | **Terminal** frame — finalizes streaming, handles cancellation/error/stats |
| `"tool"` | Tool lifecycle — matched by `frame.id` (unique tool call ID) |
| `"usage"` | Token usage after each LLM call — updates `estimated_context_tokens` and `total_cost` |
| `"result"` | Command output — dispatches to `handleCommandResult(cmd, data)` |
| `"session"` | Session lifecycle event — dispatches on `frame.event` (created/renamed/deleted) or `frame.data` for session switch |
| `"req"` | Server requests client action — responds with `{"type":"resp","error":"unsupported"}` |
| `"error"` | Error before any turn started |

### Composable Returns

- `send(sessionId, text, stream?)` — Send a chat message (`type:"chat"`)
- `execute(cmd, params)` — Send a structured JSON command (`type:"cmd"`)
- `cancel(sessionId)` — Cancel an in-flight request (`type:"cancel"`)

---

## Component Architecture

### App.jsx

Root component. Layout:
```
┌─────────────────────────────────┐
│ Sidebar  |  Header (InputBar)   │
│          ├──────────────────────┤
│          │  ChatArea            │
│          │  (message list)      │
│          │                      │
│          ├──────────────────────┤
│          │  Footer (CwdBar,     │
│          │     TokensBar)       │
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
- Each MessageBubble has a **copy button** (Tabler `IconCopy` icon) in the top-right corner, visible on hover, that copies the raw markdown (`message.content`) to clipboard
- Uses `navigator.clipboard.writeText()` in secure contexts (HTTPS/localhost); falls back to `document.execCommand('copy')` with a temporary textarea for non-secure contexts (remote HTTP servers)
- On click, the button shows "Copied!" (green `IconCheck`) for 2 seconds as visual feedback
- Each message bubble shows a **formatted time** (`message__time`) at the bottom-right corner — formatted using `toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })` from the `message.timestamp` field. Hidden when timestamp is undefined/null.
- Assistant messages use `renderContentWithToolCalls()` to interleave text and tool calls
- Empty state: shows placeholder "No messages yet"
- Auto-scrolls to bottom on new messages using `scrollIntoView()` (instant, no smooth animation)
- Last message gets `isStreaming` flag for live delta rendering

### CwdBar.jsx

- Shows current working directory (click to edit)
- Inline text input on click; Enter saves, Esc cancels, blur saves
- Label: `CWD`

### TokensBar.jsx

- Displays estimated session context tokens, session model, and total cost in the footer (bottom-right)
- Reads tokens for the current active session from `sessionEstimatedTokens` map
- Reads cost for the current active session from `sessionTotalCost` map
- Reads model name for the current active session from `sessions` array (from `session.model`)
- Renders when the active session has a token value, a model name, or a total cost (any of the three)
- Shows label "Model" and the model name (if available), then a separator, then "Tokens" and the numeric count, then if cost is present a separator, "Cost" and the formatted cost (e.g. `$1.50`)
- Model name is colored with the accent color; cost is colored with the success (green) color
- **Model name is clickable** when `onSwitchModel` callback is provided — opens a dropdown listing all available models from the store's `models` array
- Clicking a different model in the dropdown calls `onSwitchModel(modelName)`, which triggers `model_switch` server command, and the model name updates immediately
- The dropdown fetches models silently (suppressed from chat display) when first opened if `models` array is empty, via `onFetchModels` callback
- Clicking outside or selecting a model closes the dropdown
- Updated via `type:"usage"` frame (includes `estimated_context_tokens` and `total_cost`) and via `stats` in `type:"done"` frame
- Persisted per-session in the store (preserved across session switches and restored on switch-back)
- Cleaned up on session delete

### InputBar.jsx

- Text area input with Enter to send (Shift+Enter for newline)
- Send button disabled when empty or streaming
- Cancel button shown during streaming
- Buttons immediately disabled on click to prevent double-sends

### MarkdownContent.jsx

- Wraps `react-markdown` with GFM support, code highlighting, **LaTeX math rendering**, and **Mermaid diagram rendering**
- Math support via `remark-math` (parsing `$...$` inline and `$$...$$` display math) and `rehype-katex` (rendering with KaTeX)
- Mermaid support: fenced code blocks with ```` ```mermaid ```` language tag are intercepted and rendered as SVG diagrams via the `MermaidBlock` component
- Custom `code` component: inline vs block detection, language label on code blocks, mermaid diagram blocks rendered as interactive diagrams
- Custom `a` component: opens links in new tab
- `isStreaming` prop disables rehype-highlight to avoid issues with incomplete code blocks (math highlighting via rehype-katex is always active; mermaid shows a placeholder during streaming)

### MermaidBlock.jsx

- Renders Mermaid diagrams from markdown fenced code blocks with `mermaid` language tag
- Uses the `mermaid` library to render diagrams as SVG
- Detects app theme (`data-theme` on `<html>`) and applies dark/light theme to diagrams
- **Streaming**: shows a placeholder (`🔄 Diagram rendering…`) when `isStreaming` is true, avoiding parse errors on incomplete syntax
- **Loading**: shows "⏳ Loading diagram…" while mermaid processes the chart
- **Error state**: displays "⚠️ Diagram Syntax Error" with the error message and the raw source code, so users can see and fix the diagram definition
- Lifecycle: calls `mermaid.initialize()` once at module load, uses `mermaid.render()` per diagram with auto-generated unique IDs
- Re-renders when the `chart` prop changes (e.g., during streaming completion)

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

## Wire Protocol (v2 — Type-Discriminated Frames)

Every frame has a mandatory `type` field. No field sniffing.

### Client → Server

| `type` | Purpose | Key fields |
|---|---|---|
| `"chat"` | Normal chat turn | `session_id`, `input`, `stream` |
| `"cmd"` | JSON command | `session_id`, `command: {cmd, params}` |
| `"resp"` | Reply to server `req` | `request_id`, `result`, `error` |
| `"cancel"` | Cancel running turn | `session_id` |

#### `type: "chat"` — Normal chat turn

```json
{"type":"chat", "session_id":"<uuid>", "input":"Hello!", "stream":true}
```

- `session_id` — omit to auto-create.
- `input` — user text sent directly to the LLM.
- `stream` — `true` for token-by-token deltas.

#### `type: "cmd"` — Structured JSON command

```json
{"type":"cmd", "session_id":"...", "command":{"cmd":"session_list"}}
{"type":"cmd", "session_id":"...", "command":{"cmd":"tool_allow","params":{"name":"#all"}}}
```

Commands table:

| `cmd` | `params` | Description |
|---|---|---|
| `help` | — | List available commands |
| `continue` | — | Continue LLM turn without new user input |
| `start` | — | Create fresh session with all tools enabled |
| `compact` | `{"n": <int>}` | Set context soft limit (0 = off) |
| `cwd_set` | `{"cwd": "/path"}` | Persist working directory on the session |
| `session_list` | — | List all sessions in the namespace |
| `session_create` | — | Create a new empty session |
| `get_session` | `{"id": "<uuid or prefix>"}` | Fetch session data and messages |
| `session_delete` | `{"id": "<uuid>"}` | Delete a session (`"this"` for current) |
| `session_info` | — | Show current session details |
| `session_rename` | `{"name": "..."}` | Rename the current session |
| `session_autorename` | — | Ask the LLM to generate a session name |
| `model_list` | — | List registered models |
| `model_switch` | `{"name": "..."}` | Switch the session to a different model |
| `tool_list` | — | List tools with status |
| `tool_allow` | `{"name": "tool_or_#tag"}` | Allow and enable a tool or tag |
| `tool_deny` | `{"name": "tool_or_#tag"}` | Deny (hide) a tool or tag |

#### `type: "resp"` — Client response to a server request

```json
{"type":"resp", "request_id":"req-1", "result":[1,2,3]}
{"type":"resp", "request_id":"req-1", "error":"unsupported"}
```

- Sent in reply to a `type:"req"` frame (e.g. Neovim Lua eval).
- `result` is a JSON value; `error` is a string. Mutually exclusive.

#### `type: "cancel"` — Cancel an in-flight turn

```json
{"type":"cancel", "session_id":"<uuid>"}
```

---

### Server → Client

| `type` | When emitted | Terminal? |
|---|---|---|
| `"welcome"` | Immediately on WebSocket connect | No |
| `"delta"` | Mid-stream text chunk | No |
| `"output"` | Full non-stream reply (before `done`) | No |
| `"done"` | Turn/command is complete | **Yes** |
| `"tool"` | Tool lifecycle (start/ok/err) | No |
| `"usage"` | Token usage after each LLM call | No |
| `"req"` | Server asks client to run something | No |
| `"result"` | Command output (session_list, etc.) | No |
| `"session"` | Session lifecycle (created/renamed/deleted via `frame.event`, session switch via `frame.data`) | No |
| `"error"` | Error before any turn | Yes |

**Terminal** means the engine is ready for new input.

#### `type: "welcome"` — Connection greeting

Sent immediately after WebSocket handshake. Replaces the old `list_sessions` dance.

```json
{
  "type": "welcome",
  "namespace": "default",
  "sessions": [
    {"id": "<uuid>", "short_id": "a1b2c3d4", "name": "Bug hunt", "model": "deepseek", "message_count": 42, "in_flight": true}
  ]
}
```

**Auto-subscribe**: Server subscribes client to the in_flight session (or most recent). No extra round trips.

#### `type: "delta"` — Streaming text chunk

```json
{"type":"delta", "session_id":"<uuid>", "text":"Hel", "ts": 1700000000001}
{"type":"delta", "session_id":"<uuid>", "text":"lo!", "ts": 1700000000001}
```

- `ts` (optional) — Unix timestamp in milliseconds for the message. Used to set `timestamp` on the assistant message when the first delta frame arrives.

#### `type: "output"` — Full non-stream reply

```json
{"type":"output", "session_id":"<uuid>", "text":"Hello!", "ts": 1700000000001}
```

- `ts` (optional) — Unix timestamp in milliseconds for the message.

Emitted exactly once, before `"done"`, when the client did not request streaming.

#### `type: "tool"` — Tool lifecycle

Every tool call has a unique `id` that correlates `start` with `ok`/`err`.

**Start:**
```json
{"type":"tool", "session_id":"<uuid>", "id":"call_abc123", "tool":"read_file", "status":"start", "args":{"path":"README.md"}, "snippet":"read_file 'README.md'", "ts": 1700000000050}
```

- `ts` (optional) — Unix timestamp in milliseconds for the tool call. Used to set `timestamp` on the tool call entry.

**Success:**
```json
{"type":"tool", "session_id":"<uuid>", "id":"call_abc123", "tool":"read_file", "status":"ok", "result":"file content..."}
```

**Error:**
```json
{"type":"tool", "session_id":"<uuid>", "id":"call_abc123", "tool":"read_file", "status":"err", "error":"file not found"}
```

#### `type: "usage"` — Token usage after each LLM call

```json
{
  "type": "usage",
  "session_id": "<uuid>",
  "prompt_tokens": 1234,
  "completion_tokens": 56,
  "total_tokens": 1290,
  "estimated_context_tokens": 52000,
  "cost": 0.000095,
  "total_cost": 0.000190
}
```

#### `type: "done"` — Terminal frame

**Success:**
```json
{"type":"done", "session_id":"<uuid>", "stats":{"total_tokens":1290, "total_cost":0.000190, "estimated_context_tokens":52000, "model":"deepseek"}}
```

**Error:**
```json
{"type":"done", "session_id":"<uuid>", "error":"something went wrong", "stats":{}}
```

**Cancelled:**
```json
{"type":"done", "session_id":"<uuid>", "cancelled":true, "stats":{}}
```

#### `type: "req"` — Server requests client action

```json
{"type":"req", "session_id":"<uuid>", "request_id":"req-1", "command":"return vim.api.nvim_buf_get_name(0)"}
```

Client must reply with `{"type":"resp","request_id":"...","error":"unsupported"}`.

#### `type: "result"` — Command output

```json
{"type":"result", "session_id":"<uuid>", "cmd":"session_list", "data":{"sessions":[...]}}
{"type":"result", "session_id":"<uuid>", "cmd":"model_list", "data":{"models":[...]}}
```

#### `type: "session"` — Session lifecycle event

```json
{"type":"session", "session_id":"<uuid>", "event":"created", "name":"", "model":"deepseek", "message_count":0}
{"type":"session", "session_id":"<uuid>", "event":"renamed", "old_name":"Bug hunt", "name":"Bug investigation"}
{"type":"session", "session_id":"<uuid>", "event":"deleted"}
```

When switching to a session, the server sends session data with messages at the top level:

```json
{"type":"session", "session_id":"<uuid>", "session":{"id":"<uuid>","name":"Chat","model":"deepseek"}, "messages":[{"role":"user","content":"Hello"}]}
```

- The `session` object contains session metadata, `messages` contains message history.
- The client caches the previous session's messages, switches to the new session, and renders its messages.

#### `type: "error"` — Error before any turn started

```json
{"type":"error", "session_id":"<uuid>", "error":"tool not found: unknown_tool"}
```

Terminal — no `done` frame follows.

---

## Changes from v1 Protocol

| v1 | v2 |
|---|---|
| Client sends `session_list` on connect | Server pushes `welcome` frame on connect |
| No `type` discriminant on frames | Every frame has mandatory `type` field |
| `event` field overloaded (tool, meta, command_result, etc.) | Consistent `type` system |
| `done:true` as boolean flag | `done` is its own terminal frame type |
| `cwd` in chat payload | `cwd` removed from wire protocol (stored server-side) |
| Tool frames matched by `(tool, exec_snippet, status='start')` | Matched by unique `id` field |
| `estimated_context_tokens` as separate meta event | Merged into `type:"usage"` and `done.stats` |
| `event:"cancel"` as push event | Replaced by `type:"done"` with `cancelled:true` |

File: `src/App.css` — single stylesheet (no CSS modules)

Key layout classes:
- `.app` — flexbox row (sidebar + main area)
- `.sidebar` — fixed-width left panel (280px)
- `.app__main-area` — flex-grow column
- `.chat-area` — message list, scrollable
- `.message` — flex row with role label + content bubble; `position: relative` for the copy button
- `.message__copy-btn` — absolute-positioned "Copy" button in top-right corner, hidden by default (opacity 0), shown on hover, switches to "Copied!" on click
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

- **Store tests** (`useChatStore.test.jsx`): Direct state manipulation via `getState()/setState()`, no React rendering. Covers message creation, streaming, tool events, session management, caching, CWD persistence, and leak prevention (98 tests).
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
