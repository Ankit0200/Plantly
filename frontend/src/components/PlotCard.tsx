import { useState } from 'react'
import type { PlotPlan } from '../types'
import WhyPanel from './WhyPanel'

interface Props {
  plotPlan: PlotPlan
  cropName: (id: string) => string
}

const CATEGORY_LABELS: Record<string, string> = {
  rotation: 'Rotation',
  soil: 'Soil',
  feeding: 'Feeding',
  nutrient_warning: 'Warnings',
  warning: 'Warnings',
  pest_prevention: 'Pest Prevention',
}

const CATEGORY_ORDER = ['rotation', 'soil', 'feeding', 'nutrient_warning', 'warning', 'pest_prevention']

export default function PlotCard({ plotPlan, cropName }: Props) {
  const [expandedLine, setExpandedLine] = useState<number | null>(null)

  const groups: Record<string, typeof plotPlan.lines> = {}
  for (const line of plotPlan.lines) {
    const cat = line.category
    if (!groups[cat]) groups[cat] = []
    groups[cat].push(line)
  }

  const changed = plotPlan.crop_suggested !== plotPlan.crop_planned

  return (
    <div className="plot-card">
      <h3>
        {plotPlan.plot_name || plotPlan.plot_id}
        {' '}&middot;{' '}
        {plotPlan.area_sqft.toLocaleString()} sq ft
        {' '}&middot;{' '}
        {cropName(plotPlan.crop_planned)}
        {changed && ` \u2192 ${cropName(plotPlan.crop_suggested)}`}
      </h3>
      <div className="plot-meta">
        <span>P: {plotPlan.p_level.replace('_', ' ')}</span>
        <span>K: {plotPlan.k_level.replace('_', ' ')}</span>
        {plotPlan.compost_cu_yd > 0 && <span>Compost: {plotPlan.compost_cu_yd.toFixed(2)} cu yd</span>}
        <span className={plotPlan.plan_cost_usd < plotPlan.baseline_cost_usd ? 'cost-less' : 'cost-more'}>
          ${plotPlan.plan_cost_usd.toFixed(2)} (was ${plotPlan.baseline_cost_usd.toFixed(2)})
        </span>
      </div>

      {CATEGORY_ORDER.map(cat => {
        const lines = groups[cat]
        if (!lines || lines.length === 0) return null
        return (
          <div key={cat} className="line-group">
            <h4>{CATEGORY_LABELS[cat] || cat}</h4>
            <ul>
              {lines.map((line, i) => {
                const globalIdx = plotPlan.lines.indexOf(line)
                return (
                  <li key={i} className={`line-${line.category}`}>
                    <div className="line-content">
                      <span>{line.text}</span>
                      {line.quantity != null && <span className="line-qty"> &mdash; {line.quantity.toFixed(1)} {line.unit}</span>}
                      {line.cost_usd != null && line.cost_usd > 0 && <span className="line-cost"> (${line.cost_usd.toFixed(2)})</span>}
                      <button
                        className="why-toggle"
                        onClick={() => setExpandedLine(expandedLine === globalIdx ? null : globalIdx)}
                      >
                        {expandedLine === globalIdx ? 'Hide' : 'Why?'}
                      </button>
                    </div>
                    {expandedLine === globalIdx && <WhyPanel line={line} plotContext={{
                          plot_name: plotPlan.plot_name,
                          crop_planned: plotPlan.crop_planned,
                          crop_suggested: plotPlan.crop_suggested,
                          p_level: plotPlan.p_level,
                          k_level: plotPlan.k_level,
                          area_sqft: plotPlan.area_sqft,
                        }} />}
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}
    </div>
  )
}
