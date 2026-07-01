import { useChatStore } from '../store/useChatStore'

/**
 * Displays estimated session model, tokens, and total cost in the top-right corner of the header.
 * Only renders when the current session has a token count.
 */
export function TokensBar() {
  const sessionId = useChatStore((s) => s.sessionId)
  const tokensMap = useChatStore((s) => s.sessionEstimatedTokens)
  const costMap = useChatStore((s) => s.sessionTotalCost)
  const sessions = useChatStore((s) => s.sessions)
  const tokens = sessionId ? tokensMap[sessionId] : undefined
  const cost = sessionId ? costMap[sessionId] : undefined

  const currentSession = sessionId
    ? sessions.find((s) => s.id === sessionId)
    : undefined
  const model = currentSession?.model

  // Only render if there's something to show: tokens, cost, or model
  const hasTokens = tokens !== null && tokens !== undefined
  const hasModel = !!model
  const hasCost = cost !== undefined && cost !== null
  if (!hasTokens && !hasModel && !hasCost) return null

  return (
    <div className="tokens-bar" title="Estimated session context tokens">
      {hasModel && (
        <>
          <span className="tokens-bar__label">Model</span>
          <span className="tokens-bar__model">{model}</span>
          {hasTokens && <span className="tokens-bar__sep">·</span>}
        </>
      )}
      {hasTokens && (
        <>
          <span className="tokens-bar__label">Tokens</span>
          <span className="tokens-bar__count">{tokens}</span>
        </>
      )}
      {hasCost && (
        <>
          {(hasTokens || hasModel) && <span className="tokens-bar__sep">·</span>}
          <span className="tokens-bar__label">Cost</span>
          <span className="tokens-bar__cost">${cost.toFixed(2)}</span>
        </>
      )}
    </div>
  )
}
