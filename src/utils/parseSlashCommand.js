import { useChatStore } from '../store/useChatStore'

/**
 * Parse a slash command from user input and handle it locally.
 * All text starting with / is intercepted — never sent to the LLM.
 * Recognized commands are dispatched via execute(). Unknown commands
 * get an inline assistant error message.
 *
 * @param {string} text - The user's input text
 * @param {Function} execute - The execute function from useWebSocket
 * @returns {boolean} - true if handled as a slash command (caller should NOT send to LLM)
 */
export function parseSlashCommand(text, execute) {
  if (!text || !text.startsWith('/')) return false

  const trimmed = text.slice(1).trim()
  const parts = trimmed.split(/\s+/)
  const cmd = parts[0]?.toLowerCase()
  const args = parts.slice(1)

  const store = useChatStore.getState()
  const sid = store.sessionId

  // Show user message in chat so the command is visible in history
  store.sendMessage(text, sid)

  switch (cmd) {
    case 'help':
      execute('help', {})
      return true

    case 'tool': {
      const sub = args[0]
      if (!sub || sub === 'list') {
        execute('tool_list', {})
      } else if (sub === 'allow' && args[1]) {
        execute('tool_allow', { name: args.slice(1).join(' ') })
      } else if (sub === 'deny' && args[1]) {
        execute('tool_deny', { name: args.slice(1).join(' ') })
      } else {
        store.appendAssistantMessage(
          `Unknown command: \`${text}\`\n\nTry: \`/tool list\`, \`/tool allow <name>\`, \`/tool deny <name>\``,
          sid
        )
      }
      return true
    }

    case 'model':
    case 'models': {
      if (cmd === 'models' || args[0] === 'list') {
        execute('model_list', {})
      } else if (args[0] === 'switch' && args[1]) {
        execute('model_switch', { name: args.slice(1).join(' ') })
      } else {
        store.appendAssistantMessage(
          `Unknown command: \`${text}\`\n\nTry: \`/models\`, \`/model list\`, \`/model switch <name>\``,
          sid
        )
      }
      return true
    }

    case 'session': {
      const sub = args[0]
      if (sub === 'list') {
        execute('session_list', {})
      } else if (sub === 'info') {
        execute('session_info', {})
      } else if (sub === 'rename' && args.slice(1).join(' ')) {
        execute('session_rename', { name: args.slice(1).join(' ') })
      } else {
        store.appendAssistantMessage(
          `Unknown command: \`${text}\`\n\nTry: \`/session list\`, \`/session info\`, \`/session rename <name>\``,
          sid
        )
      }
      return true
    }

    case 'compact': {
      const n = parseInt(args[0], 10)
      if (!isNaN(n) && n > 0) {
        execute('compact', { n })
      } else {
        store.appendAssistantMessage(
          `Usage: \`/compact <n>\` — compact to last \`n\` messages`,
          sid
        )
      }
      return true
    }

    case 'cwd': {
      const path = args.join(' ')
      if (path) {
        execute('cwd_set', { cwd: path })
      } else {
        store.appendAssistantMessage(
          `Usage: \`/cwd <path>\` — set working directory`,
          sid
        )
      }
      return true
    }

    case 'continue':
      execute('continue', {})
      return true

    case 'start':
      execute('start', {})
      return true

    default:
      store.appendAssistantMessage(
        `Unknown command: \`${text}\`\n\nType \`/help\` for available commands.`,
        sid
      )
      return true
  }
}
