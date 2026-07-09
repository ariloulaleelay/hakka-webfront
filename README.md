# Hakka WebFront

Web frontend for [Hakka](https://github.com/ariloulaleelay/hakka) — an LLM Agent Core Framework.

This is a standalone React + Vite application that connects to a running Hakka instance via its WebSocket gateway (`/ws`).

## Features

- **Chat UI** — send and receive messages with streaming responses
- **Tool Observability** — see tool calls inline with real-time status (start/ok/err)
- **Multi-Session** — create, switch, and delete sessions; parallel streaming across sessions
- **Session History** — load and view past conversations with normalized display
- **Slash Commands** — `/help`, `/tool list`, `/model switch`, and more are parsed client-side, never sent to the LLM
- **Auto-Reconnect** — exponential backoff (1s–16s) with status indicator
- **Editable CWD** — per-session working directory persistence
- **Markdown Rendering** — GFM tables, syntax-highlighted code blocks, LaTeX math ($...$ and $$...$$), **Mermaid diagrams** (``` ```mermaid ```), inline tool calls

## Quick Start

```sh
npm install
npm run dev
```

Opens at `http://localhost:5173`.

## Configuration

Set the `VITE_WS_URL` environment variable to point to your Hakka instance:

```sh
VITE_WS_URL=ws://127.0.0.1:9876/ws npm run dev
```

Default: `ws://127.0.0.1:8765/ws`

## Testing

```sh
npm test            # run once
npm run test:watch  # watch mode
```

## Build

```sh
npm run build     # outputs to dist/
```

## Architecture

```
src/
├── main.jsx                    — Entry point
├── App.jsx                     — Root component: Sidebar + header (InputBar) + ChatArea + footer (CwdBar, TokensBar)
├── App.css                     — All application styles
├── index.css                   — Global reset, theme variables
├── store/
│   └── useChatStore.js         — Zustand store (messages, sessions, streaming, CWD per session)
├── hooks/
│   └── useWebSocket.js         — WebSocket connection manager, frame routing
├── utils/
│   └── parseSlashCommand.js    — Slash command parser (client-side, never sent to LLM)
├── components/
│   ├── ChatArea.jsx            — Message list with tool call interleaving
│   ├── InputBar.jsx            — Text input with Send/Cancel buttons
│   ├── Sidebar.jsx             — Session list with delete confirmation dialog
│   ├── MarkdownContent.jsx     — Markdown renderer (react-markdown + GFM + highlighting + LaTeX math + Mermaid diagrams)
│   ├── MermaidBlock.jsx        — Mermaid diagram renderer (flowcharts, sequence diagrams, etc.)
│   ├── ToolCall.jsx            — Inline tool call display (name + snippet, color-coded)
│   └── CwdBar.jsx              — Editable working directory indicator
└── test/
    ├── setup.js                — Test environment setup (jsdom, jest-dom)
    ├── useChatStore.test.jsx   — Store unit tests (33+ tests)
    ├── App.test.jsx            — Integration tests
    ├── ChatArea.test.jsx       — ChatArea rendering tests
    ├── InputBar.test.jsx       — Input tests
    ├── Sidebar.test.jsx        — Sidebar tests
    ├── CwdBar.test.jsx         — CWD bar tests
    ├── MarkdownContent.test.jsx— Markdown rendering tests
    ├── MermaidBlock.test.jsx   — Mermaid diagram renderer tests
    ├── genId.test.jsx          — ID generation tests
    ├── useWebSocket.test.js    — WebSocket handler tests
    └── parseSlashCommand.test.js — Slash command parsing tests
```

## Wire Protocol

The frontend communicates with Hakka via a JSON-based WebSocket protocol. See `AGENT.md` for full documentation of commands, response types, and session management.
