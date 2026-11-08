import type { CostSummary } from '../types'

interface Props {
  totals: CostSummary
}

export default function PlanSummary({ totals }: Props) {
  const diff = totals.difference_usd
  return (
    <div className="plan-summary">
      <h2>Plan Summary</h2>
      <div className="summary-row">
        <span>Last season cost: <strong>${totals.baseline_usd.toFixed(2)}</strong></span>
        <span>Plan cost: <strong>${totals.plan_usd.toFixed(2)}</strong></span>
        <span className={diff > 0 ? 'cost-more' : 'cost-less'}>
          Difference: <strong>${diff.toFixed(2)}</strong>
        </span>
      </div>
      <div className="summary-row">
        <span>Synthetic N last season: <strong>{totals.synthetic_n_lb_baseline.toFixed(1)} lb</strong></span>
        <span>Synthetic N plan: <strong>{totals.synthetic_n_lb_plan.toFixed(1)} lb</strong></span>
        <span>Pesticide apps (last season): <strong>{totals.pesticide_applications_baseline}</strong></span>
      </div>
    </div>
  )
}
