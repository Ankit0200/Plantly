import { useState, useEffect } from 'react'
import type { PlanLine } from '../types'
import { postExplainLine } from '../api'

interface Props {
  line: PlanLine
  plotContext?: Record<string, unknown>
}

export default function WhyPanel({ line, plotContext }: Props) {
  const [explanation, setExplanation] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    setLoading(true)
    setError(false)
    postExplainLine(
      line as unknown as Record<string, unknown>,
      plotContext ?? {}
    )
      .then(res => setExplanation(res.explanation))
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [line, plotContext])

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
        <div className="why-explanation" dangerouslySetInnerHTML={{
          __html: explanation.replace(/•/g, '</p><p>•').replace(/^<\/p>/, '') + '</p>'
        }} />
      )}
    </div>
  )
}
