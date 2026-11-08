import type { Plan, Grower, ReferenceData } from '../types'
import PlanSummary from '../components/PlanSummary'
import PlotCard from '../components/PlotCard'
import ChatPanel from '../components/ChatPanel'

interface Props {
  plan: Plan
  grower: Grower
  referenceData: ReferenceData | null
  onRestart: () => void
}

export default function PlanPage({ plan, grower, referenceData, onRestart }: Props) {
  const cropName = (id: string) => referenceData?.crops.find(c => c.id === id)?.name ?? id

  return (
    <div className="plan-page">
      <div className="plan-page-header">
        <button onClick={onRestart}>&larr; New Plan</button>
        <h2>Season Plan for {plan.grower_name || 'Your Farm'}</h2>
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
        />
      ))}

      <p className="disclaimer">
        Planning support, not professional agronomic advice. Check soil tests and
        recommendations with your local extension service.
      </p>

      <ChatPanel grower={grower} />
    </div>
  )
}
