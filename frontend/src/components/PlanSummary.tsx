import type { CostSummary } from '../types'

interface Props {
  totals: CostSummary
}

export default function PlanSummary({ totals }: Props) {
  const diff = totals.difference_usd
  const sb = totals.savings_breakdown_usd
  const hasSavings = sb && (sb.skipped_p_k > 0 || sb.legume_credit > 0 || sb.compost_credit > 0 || sb.product_choice > 0)

  return (
    <div className="plan-summary">
      <div className="summary-hero">
        <div className="summary-stat">
          <span className="stat-label">Plan cost</span>
          <span className="stat-value">${totals.plan_usd.toFixed(2)}</span>
        </div>
        {totals.baseline_usd > 0 && (
          <>
            <div className="summary-stat">
              <span className="stat-label">Last season</span>
              <span className="stat-value faded">${totals.baseline_usd.toFixed(2)}</span>
            </div>
            <div className="summary-stat">
              <span className="stat-label">You save</span>
              <span className={`stat-value ${diff < 0 ? 'stat-green' : 'stat-red'}`}>
                ${Math.abs(diff).toFixed(2)}
              </span>
            </div>
          </>
        )}
      </div>

      <div className="summary-details">
        {totals.synthetic_n_lb_baseline > 0 && (
          <div className="detail-chip">
            🧪 Synthetic N: {totals.synthetic_n_lb_plan.toFixed(1)} lb
            <span className="detail-vs">was {totals.synthetic_n_lb_baseline.toFixed(1)}</span>
          </div>
        )}
        {!totals.synthetic_n_lb_baseline && (
          <div className="detail-chip">
            🧪 Synthetic N: {totals.synthetic_n_lb_plan.toFixed(1)} lb
          </div>
        )}
      </div>

      {hasSavings && (
        <div className="savings-breakdown">
          <h3>💡 Where you save</h3>
          <div className="savings-items">
            {sb.skipped_p_k > 0 && (
              <div className="savings-item">
                <span className="savings-label">Soil already has enough P/K</span>
                <span className="savings-amount">-${sb.skipped_p_k.toFixed(2)}</span>
              </div>
            )}
            {sb.legume_credit > 0 && (
              <div className="savings-item">
                <span className="savings-label">Nitrogen from last year's legumes</span>
                <span className="savings-amount">-${sb.legume_credit.toFixed(2)}</span>
              </div>
            )}
            {sb.compost_credit > 0 && (
              <div className="savings-item">
                <span className="savings-label">Nutrients from compost</span>
                <span className="savings-amount">-${sb.compost_credit.toFixed(2)}</span>
              </div>
            )}
            {sb.product_choice > 0 && (
              <div className="savings-item">
                <span className="savings-label">Better product choices</span>
                <span className="savings-amount">-${sb.product_choice.toFixed(2)}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
