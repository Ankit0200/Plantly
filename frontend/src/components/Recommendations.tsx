import { useState, useEffect, useCallback, useRef } from 'react'
import type { Grower, Plan, PlotPlan, ReferenceData } from '../types'
import { postRecommend, postPlanPreview, type PlotRecommendation } from '../api'
import { cropEmoji } from '../cropIcons'
import PlotCard from './PlotCard'

function ComparisonBanner({ original, alt, cropName }: { original: PlotPlan; alt: PlotPlan; cropName: (id: string) => string }) {
  const costDiff = original.plan_cost_usd - alt.plan_cost_usd
  const synthNDiff = original.synthetic_n_lb_plan - alt.synthetic_n_lb_plan

  const origPestLines = original.lines.filter(l => l.category === 'pest_prevention').length
  const altPestLines = alt.lines.filter(l => l.category === 'pest_prevention').length
  const pestDiff = origPestLines - altPestLines

  const origWarnings = original.lines.filter(l => l.category === 'warning' || l.category === 'nutrient_warning').length
  const altWarnings = alt.lines.filter(l => l.category === 'warning' || l.category === 'nutrient_warning').length
  const warningDiff = origWarnings - altWarnings

  return (
    <div className="comparison-banner">
      <div className="comparison-vs">
        <span className="comparison-from">{cropEmoji(original.crop_suggested)} {cropName(original.crop_suggested)}</span>
        <span className="comparison-arrow">vs</span>
        <span className="comparison-to">{cropEmoji(alt.crop_suggested)} {cropName(alt.crop_suggested)}</span>
      </div>
      <div className="comparison-stats">
        <div className={`comparison-stat ${costDiff > 0 ? 'stat-good' : costDiff < 0 ? 'stat-bad' : ''}`}>
          <span className="stat-icon">💰</span>
          <span className="stat-label">Cost</span>
          <span className="stat-value">
            {costDiff > 0 ? `Save $${costDiff.toFixed(2)}` : costDiff < 0 ? `+$${Math.abs(costDiff).toFixed(2)} more` : 'Same'}
          </span>
        </div>
        <div className={`comparison-stat ${synthNDiff > 0 ? 'stat-good' : synthNDiff < 0 ? 'stat-bad' : ''}`}>
          <span className="stat-icon">🧪</span>
          <span className="stat-label">Synthetic N</span>
          <span className="stat-value">
            {synthNDiff > 0 ? `${synthNDiff.toFixed(1)} lb less` : synthNDiff < 0 ? `${Math.abs(synthNDiff).toFixed(1)} lb more` : 'Same'}
          </span>
        </div>
        <div className={`comparison-stat ${pestDiff > 0 ? 'stat-good' : pestDiff < 0 ? 'stat-bad' : ''}`}>
          <span className="stat-icon">🐛</span>
          <span className="stat-label">Pest Risk</span>
          <span className="stat-value">
            {pestDiff > 0 ? `${pestDiff} fewer issue${pestDiff > 1 ? 's' : ''}` : pestDiff < 0 ? `${Math.abs(pestDiff)} more issue${Math.abs(pestDiff) > 1 ? 's' : ''}` : 'Same'}
          </span>
        </div>
        <div className={`comparison-stat ${warningDiff > 0 ? 'stat-good' : warningDiff < 0 ? 'stat-bad' : ''}`}>
          <span className="stat-icon">⚠️</span>
          <span className="stat-label">Warnings</span>
          <span className="stat-value">
            {warningDiff > 0 ? `${warningDiff} fewer` : warningDiff < 0 ? `${Math.abs(warningDiff)} more` : 'Same'}
          </span>
        </div>
      </div>
    </div>
  )
}

interface Props {
  grower: Grower
  plan: Plan
  referenceData: ReferenceData | null
  onChooseCrop?: (plotId: string, cropId: string) => void
}

interface ModalState {
  plotId: string
  recIndex: number
}

export default function Recommendations({ grower, plan, referenceData, onChooseCrop }: Props) {
  const [recs, setRecs] = useState<PlotRecommendation[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [costCache, setCostCache] = useState<Record<string, PlotPlan>>({})
  const [costLoading, setCostLoading] = useState<string | null>(null)
  const [costError, setCostError] = useState<Record<string, string>>({})
  const [choosing, setChoosing] = useState<string | null>(null)
  const [modal, setModal] = useState<ModalState | null>(null)

  // Swipe tracking
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const modalContentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setLoading(true)
    setError(false)
    postRecommend(grower, plan)
      .then(res => setRecs(res.plots))
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [grower, plan])

  const loadCost = useCallback(async (plotId: string, cropId: string) => {
    const key = `${plotId}:${cropId}`
    if (costCache[key]) return
    const cropsNeeded = new Set(grower.crops_needed)
    cropsNeeded.add(cropId)
    const modified = {
      ...grower,
      crops_needed: [...cropsNeeded],
      plots: grower.plots.map(p =>
        p.id === plotId ? { ...p, crop_planned: cropId } : p
      ),
    }
    setCostLoading(key)
    setCostError(prev => { const copy = { ...prev }; delete copy[key]; return copy })
    try {
      const result = await postPlanPreview(modified, [plotId])
      const plotPlan = result.plots.find((p: PlotPlan) => p.plot_id === plotId)
      if (plotPlan) {
        setCostCache(c => ({ ...c, [key]: plotPlan }))
      } else {
        setCostError(prev => ({ ...prev, [key]: `No data found for plot ${plotId}` }))
      }
    } catch (e: unknown) {
      const err = e as { body?: { errors?: string[]; error?: string } }
      const msg = err.body?.errors?.join(', ') || err.body?.error || 'Could not load cost report'
      setCostError(prev => ({ ...prev, [key]: msg }))
    } finally {
      setCostLoading(null)
    }
  }, [grower, costCache])

  const openModal = useCallback((plotId: string, recIndex: number, cropId: string) => {
    setModal({ plotId, recIndex })
    loadCost(plotId, cropId)
  }, [loadCost])

  const closeModal = useCallback(() => setModal(null), [])

  const currentPlotRecs = modal && recs
    ? recs.find(p => p.plot_id === modal.plotId)?.recommendations ?? []
    : []

  const navigateModal = useCallback((dir: -1 | 1) => {
    if (!modal || currentPlotRecs.length === 0) return
    const next = modal.recIndex + dir
    if (next < 0 || next >= currentPlotRecs.length) return
    const rec = currentPlotRecs[next]
    setModal({ plotId: modal.plotId, recIndex: next })
    loadCost(modal.plotId, rec.crop_id)
  }, [modal, currentPlotRecs, loadCost])

  // Keyboard navigation
  useEffect(() => {
    if (!modal) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal()
      else if (e.key === 'ArrowLeft') navigateModal(-1)
      else if (e.key === 'ArrowRight') navigateModal(1)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [modal, closeModal, navigateModal])

  // Touch swipe handlers
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }, [])

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchStart.current) return
    const dx = e.changedTouches[0].clientX - touchStart.current.x
    const dy = e.changedTouches[0].clientY - touchStart.current.y
    touchStart.current = null
    // Only trigger if horizontal swipe is dominant and > 50px
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      navigateModal(dx < 0 ? 1 : -1)
    }
  }, [navigateModal])

  const cropName = (id: string) => referenceData?.crops.find(c => c.id === id)?.name ?? id

  if (error) return null

  const currentRec = modal ? currentPlotRecs[modal.recIndex] : null
  const currentKey = modal && currentRec ? `${modal.plotId}:${currentRec.crop_id}` : null
  // Original plot from current plan for comparison
  const originalPlot = modal ? plan.plots.find(p => p.plot_id === modal.plotId) : null
  const altPlot = currentKey ? costCache[currentKey] : null

  return (
    <div className="recommendations">
      <h2>🏆 Recommended Alternatives</h2>
      <p className="rec-subtitle">Based on your soil, crop history, and pest pressure — here are top picks for each plot.</p>

      {loading && <p className="rec-loading">Analyzing your plots...</p>}

      {recs && recs.map(plot => (
        <div key={plot.plot_id} className="rec-plot">
          <h3>{plot.plot_name}</h3>
          <div className="rec-cards">
            {plot.recommendations.map((rec, i) => {
              const key = `${plot.plot_id}:${rec.crop_id}`
              return (
                <div key={rec.crop_id}>
                  <div className="rec-card">
                    <div className="rec-rank">#{i + 1}</div>
                    <div className="rec-card-emoji">{cropEmoji(rec.crop_id)}</div>
                    <div className="rec-crop">{rec.crop_name}</div>
                    <ul className="rec-reasons">
                      {rec.reasons.map((r, j) => (
                        <li key={j}>{r}</li>
                      ))}
                    </ul>
                    <button
                      className="rec-cost-btn"
                      onClick={() => openModal(plot.plot_id, i, rec.crop_id)}
                    >
                      See cost report
                    </button>
                    {onChooseCrop && (
                      <button
                        className="rec-choose-btn"
                        onClick={() => {
                          setChoosing(key)
                          onChooseCrop(plot.plot_id, rec.crop_id)
                        }}
                        disabled={choosing === key}
                      >
                        {choosing === key ? 'Regenerating...' : 'Choose this plan'}
                      </button>
                    )}
                    {costError[key] && (
                      <p className="rec-error">{costError[key]}</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}

      {/* Cost Report Modal */}
      {modal && currentRec && (
        <div className="rec-modal-overlay" onClick={closeModal}>
          <div
            className="rec-modal"
            ref={modalContentRef}
            onClick={e => e.stopPropagation()}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <div className="rec-modal-header">
              <button
                className="rec-modal-arrow"
                onClick={() => navigateModal(-1)}
                disabled={modal.recIndex === 0}
                aria-label="Previous recommendation"
              >
                ‹
              </button>
              <div className="rec-modal-title">
                <span className="rec-modal-emoji">{cropEmoji(currentRec.crop_id)}</span>
                <span>{currentRec.crop_name}</span>
                <span className="rec-modal-counter">
                  {modal.recIndex + 1} / {currentPlotRecs.length}
                </span>
              </div>
              <button
                className="rec-modal-arrow"
                onClick={() => navigateModal(1)}
                disabled={modal.recIndex === currentPlotRecs.length - 1}
                aria-label="Next recommendation"
              >
                ›
              </button>
              <button className="rec-modal-close" onClick={closeModal} aria-label="Close">×</button>
            </div>

            <div className="rec-modal-body">
              {costLoading === currentKey && (
                <p className="rec-modal-loading">Calculating cost report...</p>
              )}
              {currentKey && costError[currentKey] && (
                <p className="rec-error">{costError[currentKey]}</p>
              )}
              {altPlot && originalPlot && (
                <ComparisonBanner original={originalPlot} alt={altPlot} cropName={cropName} />
              )}
              {altPlot && (
                <PlotCard plotPlan={altPlot} cropName={cropName} />
              )}
            </div>

            {onChooseCrop && currentKey && (
              <div className="rec-modal-footer">
                <button
                  className="rec-choose-btn"
                  onClick={() => {
                    onChooseCrop(modal.plotId, currentRec.crop_id)
                    setChoosing(currentKey)
                    closeModal()
                  }}
                  disabled={choosing === currentKey}
                >
                  {choosing === currentKey ? 'Regenerating...' : 'Choose this plan'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
