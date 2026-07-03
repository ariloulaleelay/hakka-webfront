import { useCallback, useEffect, useRef, useState } from 'react'
import { useChatStore } from '../store/useChatStore'

/**
 * Displays estimated session model, tokens, and total cost in the top-right corner of the header.
 * Model name is clickable — opens a dropdown to pick a different model.
 */
export function TokensBar({ onSwitchModel, onFetchModels }) {
  const sessionId = useChatStore((s) => s.sessionId)
  const tokensMap = useChatStore((s) => s.sessionEstimatedTokens)
  const costMap = useChatStore((s) => s.sessionTotalCost)
  const sessions = useChatStore((s) => s.sessions)
  const models = useChatStore((s) => s.models)
  const setSuppress = useChatStore((s) => s.setSuppressModelListDisplay)
  const tokens = sessionId ? tokensMap[sessionId] : undefined
  const cost = sessionId ? costMap[sessionId] : undefined

  const currentSession = sessionId
    ? sessions.find((s) => s.id === sessionId)
    : undefined
  const model = currentSession?.model

  const [dropdownOpen, setDropdownOpen] = useState(false)
  const containerRef = useRef(null)

  const handleModelClick = useCallback(() => {
    setDropdownOpen((prev) => {
      if (!prev && models.length === 0 && onFetchModels) {
        // Fetch models silently — suppress chat display
        setSuppress(true)
        onFetchModels()
      }
      return !prev
    })
  }, [models, onFetchModels, setSuppress])

  const handleSelectModel = useCallback(
    (modelName) => {
      setDropdownOpen(false)
      if (onSwitchModel && modelName !== model) {
        onSwitchModel(modelName)
      }
    },
    [onSwitchModel, model]
  )

  // Close dropdown on click outside
  useEffect(() => {
    if (!dropdownOpen) return
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [dropdownOpen])

  // Only render if there's something to show: tokens, cost, or model
  const hasTokens = tokens !== null && tokens !== undefined
  const hasModel = !!model
  const hasCost = cost !== undefined && cost !== null
  if (!hasTokens && !hasModel && !hasCost) return null

  return (
    <div className="tokens-bar">
      {hasModel && (
        <div className="tokens-bar__model-group" ref={containerRef}>
          <span className="tokens-bar__label">Model</span>
          <span
            className={'tokens-bar__model' + (onSwitchModel ? ' tokens-bar__model--clickable' : '')}
            onClick={onSwitchModel ? handleModelClick : undefined}
            title="Click to change model"
          >
            {model}
          </span>

          {dropdownOpen && (
            <div className="tokens-bar__dropdown">
              {models.length === 0 && (
                <div className="tokens-bar__dropdown-empty">No models loaded</div>
              )}
              {(models || []).map((m) => {
                const name = m.name || m.model || ''
                const isCurrent = m.current || name === model
                return (
                  <div
                    key={name}
                    className={'tokens-bar__dropdown-item' + (isCurrent ? ' tokens-bar__dropdown-item--current' : '')}
                    onClick={() => handleSelectModel(name)}
                  >
                    {isCurrent ? '✓ ' : '  '}
                    {name}
                  </div>
                )
              })}
            </div>
          )}

          {hasTokens && <span className="tokens-bar__sep">·</span>}
        </div>
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
