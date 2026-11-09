import { useState } from 'react'
import type { PlotPlan, ImplementedItemData } from '../types'
import { cropEmoji, cropVisual } from '../cropIcons'
import WhyPanel from './WhyPanel'

interface Props {
  plotPlan: PlotPlan
  cropName: (id: string) => string
  implementedMap?: Record<number, ImplementedItemData>
  onImplementAll?: () => void
  allImplemented?: boolean
  showImplementBtn?: boolean
}

const CATEGORY_META: Record<string, { label: string; icon: string; color: string }> = {
  rotation:         { label: 'Rotation',        icon: '🔄', color: 'var(--gold, #ffc800)' },
  soil:             { label: 'Soil Prep',       icon: '🧪', color: 'var(--purple, #a560e8)' },
  feeding:          { label: 'Feeding Schedule', icon: '🌱', color: 'var(--green, #58cc02)' },
  nutrient_warning: { label: 'Heads Up',        icon: '⚠️', color: 'var(--gold, #ffc800)' },
  warning:          { label: 'Heads Up',        icon: '⚠️', color: 'var(--gold, #ffc800)' },
  pest_prevention:  { label: 'Pest Prevention', icon: '🐛', color: 'var(--red, #ff4b4b)' },
}

const CATEGORY_ORDER = ['rotation', 'soil', 'feeding', 'nutrient_warning', 'warning', 'pest_prevention']

function isActionable(line: { category: string; text: string; quantity: number | null; cost_usd: number | null }) {
  if (line.category === 'warning' || line.category === 'nutrient_warning') return false
  if (line.category === 'pest_prevention') return true
  if (line.category === 'soil' && line.quantity != null) return true
  if (line.category === 'feeding' && line.quantity != null) return true
  if (line.category === 'rotation' && line.text.includes('Suggested instead:')) return true
  return false
}

/** Parse feeding text like "At planting: Apply 11.5 lb Urea 46-0-0 for 5.3 lb N." */
function parseFeedingLine(text: string) {
  const timingMatch = text.match(/^(.+?):\s*(.*)$/)
  if (timingMatch) {
    return { timing: timingMatch[1], action: timingMatch[2] }
  }
  return { timing: null, action: text }
}

/** Make text more readable by splitting "Apply X lb Product for Y" */
function formatAction(text: string) {
  // "Apply 75 lb of Agricultural lime 2-3 months before planting to raise pH from 6 toward 6.5."
  // Keep it readable but highlight the product
  const applyMatch = text.match(/^Apply\s+([\d.]+)\s+lb\s+(?:of\s+)?(.+?)(?:\s+(?:for|to)\s+.+)?\.?$/)
  if (applyMatch) {
    return { product: applyMatch[2].replace(/\s+\d+-\d+-\d+/, ''), fullText: text }
  }
  return { product: null, fullText: text }
}

export default function PlotCard({ plotPlan, cropName, implementedMap, onImplementAll, allImplemented, showImplementBtn }: Props) {
  const [expandedLine, setExpandedLine] = useState<number | null>(null)
  const [cache, setCache] = useState<Record<string, string>>({})

  const groups: Record<string, typeof plotPlan.lines> = {}
  for (const line of plotPlan.lines) {
    const cat = line.category
    if (!groups[cat]) groups[cat] = []
    groups[cat].push(line)
  }

  const changed = plotPlan.crop_suggested !== plotPlan.crop_planned
  const suggestedVisual = cropVisual(plotPlan.crop_suggested)

  return (
    <div className="plot-card">
      <div className="plot-card-header" style={{ background: suggestedVisual.bg }}>
        <span className="plot-card-emoji">{cropEmoji(plotPlan.crop_suggested)}</span>
        <div className="plot-card-title">
          <h3>{plotPlan.plot_name || plotPlan.plot_id}</h3>
          <span className="plot-card-subtitle">
            {plotPlan.area_sqft.toLocaleString()} sq ft
            {' · '}
            {changed
              ? <>{cropName(plotPlan.crop_planned)} → <strong>{cropName(plotPlan.crop_suggested)}</strong></>
              : cropName(plotPlan.crop_planned)
            }
          </span>
        </div>
      </div>

      <div className="plot-card-body">
        {showImplementBtn && onImplementAll && (
          <button
            className={`implement-plot-btn ${allImplemented ? 'implemented' : ''}`}
            onClick={onImplementAll}
            disabled={allImplemented}
          >
            {allImplemented ? 'Implemented \u2713' : "I'll do this"}
          </button>
        )}

        <div className="plot-meta">
          <span className="meta-badge">P: {plotPlan.p_level.replace('_', ' ')}</span>
          <span className="meta-badge">K: {plotPlan.k_level.replace('_', ' ')}</span>
          {plotPlan.compost_cu_yd > 0 && <span className="meta-badge">🧱 {plotPlan.compost_cu_yd.toFixed(2)} cu yd compost</span>}
          <span className={`meta-badge ${plotPlan.baseline_cost_usd != null && plotPlan.plan_cost_usd < plotPlan.baseline_cost_usd ? 'badge-green' : ''}`}>
            💰 ${plotPlan.plan_cost_usd.toFixed(2)}
            {plotPlan.baseline_cost_usd != null && ` (was $${plotPlan.baseline_cost_usd.toFixed(2)})`}
          </span>
        </div>

        <div className="section-cards">
          {CATEGORY_ORDER.map(cat => {
            const lines = groups[cat]
            if (!lines || lines.length === 0) return null
            const meta = CATEGORY_META[cat] || { label: cat, icon: '📋', color: 'var(--text-muted)' }
            const isWarning = cat === 'warning' || cat === 'nutrient_warning'

            return (
              <div key={cat} className={`section-card ${isWarning ? 'section-card-warning' : ''}`}>
                <div className="section-card-header" style={{ borderLeftColor: meta.color }}>
                  <span className="section-card-icon">{meta.icon}</span>
                  <span className="section-card-label">{meta.label}</span>
                  {!isWarning && lines.some(l => l.cost_usd != null && l.cost_usd > 0) && (
                    <span className="section-card-total">
                      ${lines.reduce((sum, l) => sum + (l.cost_usd || 0), 0).toFixed(2)}
                    </span>
                  )}
                </div>

                <div className="section-card-items">
                  {lines.map((line, i) => {
                    const globalIdx = plotPlan.lines.indexOf(line)
                    const parsed = cat === 'feeding' ? parseFeedingLine(line.text) : { timing: null, action: line.text }
                    const actionInfo = formatAction(parsed.action)

                    return (
                      <div key={i} className={`section-item ${isWarning ? 'section-item-warning' : ''}`}>
                        {parsed.timing && (
                          <div className="item-timing">{parsed.timing}</div>
                        )}
                        <div className="item-main">
                          <p className="item-text">{parsed.action}</p>
                          <div className="item-details">
                            {line.quantity != null && (
                              <span className="item-qty">{line.quantity.toFixed(1)} {line.unit}</span>
                            )}
                            {line.cost_usd != null && line.cost_usd > 0 && (
                              <span className="item-cost">${line.cost_usd.toFixed(2)}</span>
                            )}
                            {line.source_id === 'SRC-SE-VEG-HANDBOOK' && <span className="item-source">SE Veg Handbook</span>}
                            {line.source_id === 'SRC-UGA-COMMERCIAL' && <span className="item-source">UGA recommendation</span>}
                            <button
                              className="why-toggle"
                              onClick={() => setExpandedLine(expandedLine === globalIdx ? null : globalIdx)}
                            >
                              {expandedLine === globalIdx ? 'Hide' : 'Why?'}
                            </button>
                          </div>
                        </div>
                        {expandedLine === globalIdx && (
                          <WhyPanel
                            line={line}
                            plotContext={{
                              plot_name: plotPlan.plot_name,
                              crop_planned: plotPlan.crop_planned,
                              crop_suggested: plotPlan.crop_suggested,
                              p_level: plotPlan.p_level,
                              k_level: plotPlan.k_level,
                              area_sqft: plotPlan.area_sqft,
                            }}
                            cached={cache[line.rule_id]}
                            onLoaded={(text) => setCache(c => ({ ...c, [line.rule_id]: text }))}
                          />
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
