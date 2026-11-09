import { useState, useEffect, useCallback } from 'react'
import type { Plan, Grower, ReferenceData, ImplementedItemData } from '../types'
import { getPlanImplemented, addImplemented, postPlan } from '../api'
import PlanSummary from '../components/PlanSummary'
import PlotCard from '../components/PlotCard'
import Recommendations from '../components/Recommendations'
import ChatPanel from '../components/ChatPanel'

interface Props {
  plan: Plan
  grower: Grower
  referenceData: ReferenceData | null
  onRestart: () => void
  onPlanUpdate?: (plan: Plan, grower: Grower) => void
}

function isActionable(line: { category: string; text: string; quantity: number | null }) {
  if (line.category === 'warning' || line.category === 'nutrient_warning') return false
  if (line.category === 'pest_prevention') return true
  if (line.category === 'soil' && line.quantity != null) return true
  if (line.category === 'feeding' && line.quantity != null) return true
  if (line.category === 'rotation' && line.text.includes('Suggested instead:')) return true
  return false
}

export default function PlanPage({ plan, grower, referenceData, onRestart, onPlanUpdate }: Props) {
  const cropName = (id: string) => referenceData?.crops.find(c => c.id === id)?.name ?? id

  // Implemented items state: keyed by "plotId:lineIndex" -> ImplementedItemData
  const [implItems, setImplItems] = useState<Record<string, ImplementedItemData>>({})

  useEffect(() => {
    if (!plan.plan_record_id) return
    getPlanImplemented(plan.plan_record_id).then(res => {
      const map: Record<string, ImplementedItemData> = {}
      for (const item of res.items) {
        map[`${item.plot_id}:${item.line_index}`] = item
      }
      setImplItems(map)
    }).catch(() => {})
  }, [plan.plan_record_id])

  const handleImplementAll = useCallback(async (plotId: string, lines: typeof plan.plots[0]['lines']) => {
    if (!plan.plan_record_id) return
    for (let i = 0; i < lines.length; i++) {
      const key = `${plotId}:${i}`
      if (!implItems[key] && isActionable(lines[i])) {
        try {
          const item = await addImplemented(plan.plan_record_id, plotId, i)
          setImplItems(prev => ({ ...prev, [key]: item }))
        } catch { /* ignore */ }
      }
    }
  }, [plan.plan_record_id, implItems])

  const isPlotAllImplemented = (plotId: string, lines: typeof plan.plots[0]['lines']): boolean => {
    return lines.every((line, i) => {
      if (!isActionable(line)) return true
      return !!implItems[`${plotId}:${i}`]
    })
  }

  const handleChooseCrop = useCallback(async (plotId: string, cropId: string) => {
    const cropsNeeded = new Set(grower.crops_needed)
    cropsNeeded.add(cropId)
    const modified: Grower = {
      ...grower,
      crops_needed: [...cropsNeeded],
      plots: grower.plots.map(p =>
        p.id === plotId ? { ...p, crop_planned: cropId } : p
      ),
    }
    try {
      const newPlan = await postPlan(modified)
      if (onPlanUpdate) onPlanUpdate(newPlan, modified)
    } catch (e) {
      console.error('Failed to regenerate plan:', e)
    }
  }, [grower, onPlanUpdate])

  const getPlotImplMap = (plotId: string): Record<number, ImplementedItemData> => {
    const map: Record<number, ImplementedItemData> = {}
    for (const [key, item] of Object.entries(implItems)) {
      if (key.startsWith(`${plotId}:`)) {
        map[item.line_index] = item
      }
    }
    return map
  }

  return (
    <div className="plan-page">
      <div className="plan-page-header">
        <button onClick={onRestart}>&larr; New Plan</button>
        <h2>{plan.season ? `${plan.season.charAt(0).toUpperCase() + plan.season.slice(1)} Plan` : 'Season Plan'} for {plan.grower_name || 'Your Farm'}</h2>
      </div>

      <PlanSummary totals={plan.totals} />

      {plan.warnings.length > 0 && (
        <div className="warnings">
          {plan.warnings.map((w, i) => <p key={i} className="warning">{w}</p>)}
        </div>
      )}

      {plan.plots.map((pp) => (
        <PlotCard
          key={pp.plot_id}
          plotPlan={pp}
          cropName={cropName}
          showImplementBtn={!!plan.plan_record_id}
          implementedMap={getPlotImplMap(pp.plot_id)}
          allImplemented={isPlotAllImplemented(pp.plot_id, pp.lines)}
          onImplementAll={() => handleImplementAll(pp.plot_id, pp.lines)}
        />
      ))}

      <Recommendations grower={grower} plan={plan} referenceData={referenceData} onChooseCrop={handleChooseCrop} />

      <p className="disclaimer">
        Planning support, not professional agronomic advice. Check soil tests and
        recommendations with your local extension service.
      </p>

      <ChatPanel grower={grower} />
    </div>
  )
}
