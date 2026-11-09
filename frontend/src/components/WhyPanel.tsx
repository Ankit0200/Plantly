import { useState, useEffect } from 'react'
import type { PlanLine } from '../types'
import { postExplainLine } from '../api'

interface Props {
  line: PlanLine
  plotContext?: Record<string, unknown>
  cached?: string
  onLoaded?: (text: string) => void
}

export default function WhyPanel({ line, plotContext, cached, onLoaded }: Props) {
  const [explanation, setExplanation] = useState<string | null>(cached ?? null)
  const [loading, setLoading] = useState(!cached)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (cached) return
    setLoading(true)
    setError(false)
    postExplainLine(
      line as unknown as Record<string, unknown>,
      plotContext ?? {}
    )
      .then(res => {
        setExplanation(res.explanation)
        onLoaded?.(res.explanation)
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [line, plotContext, cached])

  return (
    <div className="why-panel">
      {loading && <p className="why-loading">Analyzing…</p>}
      {error && (
        <div className="why-fallback">
          <div className="why-row"><strong>Rule:</strong> <code>{line.rule_id}</code></div>
          <div className="why-row"><strong>Source:</strong> <code>{line.source_id}</code></div>
        </div>
      )}
      {explanation && (
        <div className="why-explanation">
          {explanation.split('\n').map((l, i) => (
            <p key={i}>{l}</p>
          ))}
        </div>
      )}
    </div>
  )
}
