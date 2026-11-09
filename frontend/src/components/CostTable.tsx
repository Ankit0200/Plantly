import type { PlotPlan } from '../types'

interface Props {
  plots: PlotPlan[]
}

/** -$81.90 rather than $-81.90 */
const money = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(n).toFixed(2)}`

export default function CostTable({ plots }: Props) {
  const totalBaseline = plots.reduce((s, p) => s + (p.baseline_cost_usd ?? 0), 0)
  const totalPlan = plots.reduce((s, p) => s + p.plan_cost_usd, 0)

  return (
    <table className="cost-table">
      <thead>
        <tr>
          <th>Plot</th>
          <th>Last Season</th>
          <th>Plan</th>
          <th>Difference</th>
        </tr>
      </thead>
      <tbody>
        {plots.map(p => {
          const base = p.baseline_cost_usd
          const diff = base == null ? null : p.plan_cost_usd - base
          return (
            <tr key={p.plot_id}>
              <td>{p.plot_name || p.plot_id}</td>
              <td>{base == null ? '—' : `$${base.toFixed(2)}`}</td>
              <td>${p.plan_cost_usd.toFixed(2)}</td>
              <td className={diff != null && diff > 0 ? 'cost-more' : 'cost-less'}>{diff == null ? '—' : money(diff)}</td>
            </tr>
          )
        })}
      </tbody>
      <tfoot>
        <tr>
          <td><strong>Total</strong></td>
          <td><strong>${totalBaseline.toFixed(2)}</strong></td>
          <td><strong>${totalPlan.toFixed(2)}</strong></td>
          <td className={(totalPlan - totalBaseline) > 0 ? 'cost-more' : 'cost-less'}>
            <strong>{money(totalPlan - totalBaseline)}</strong>
          </td>
        </tr>
      </tfoot>
    </table>
  )
}
