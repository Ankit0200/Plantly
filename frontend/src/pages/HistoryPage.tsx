import { useState, useEffect } from 'react'
import type { PlanSummaryItem, SavedPlanDetail, ReferenceData } from '../types'
import { getPlans, getPlan, getHistory, postPlanChat } from '../api'
import { cropEmoji } from '../cropIcons'
import PlanSummary from '../components/PlanSummary'
import PlotCard from '../components/PlotCard'
import type { HistoryItem } from '../types'

interface Props {
  referenceData: ReferenceData | null
  onRegenerate: (growerJson: Record<string, unknown>) => void
}

export default function HistoryPage({ referenceData, onRegenerate }: Props) {
  const [plans, setPlans] = useState<PlanSummaryItem[]>([])
  const [selectedPlan, setSelectedPlan] = useState<SavedPlanDetail | null>(null)
  const [timeline, setTimeline] = useState<HistoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [activeConvoId, setActiveConvoId] = useState<number | undefined>(undefined)

  useEffect(() => {
    Promise.all([getPlans(), getHistory()])
      .then(([p, h]) => { setPlans(p); setTimeline(h.items) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const openPlan = async (planId: number) => {
    try {
      const detail = await getPlan(planId)
      setSelectedPlan(detail)
      setActiveConvoId(detail.conversations[0]?.id)
    } catch (e) {
      console.error(e)
    }
  }

  const sendChat = async () => {
    if (!chatInput.trim() || !selectedPlan || chatLoading) return
    setChatLoading(true)
    try {
      const res = await postPlanChat(selectedPlan.id, chatInput, activeConvoId)
      setActiveConvoId(res.conversation_id)
      setChatInput('')
      // Reload plan to get updated conversation
      const updated = await getPlan(selectedPlan.id)
      setSelectedPlan(updated)
    } catch (e) {
      console.error(e)
    } finally {
      setChatLoading(false)
    }
  }

  const cropName = (id: string) => referenceData?.crops.find(c => c.id === id)?.name ?? id

  if (loading) return <p style={{ textAlign: 'center', padding: '2rem' }}>Loading history...</p>

  // Plan detail view
  if (selectedPlan) {
    const plan = selectedPlan.plan_json
    const activeConvo = selectedPlan.conversations.find(c => c.id === activeConvoId)
    return (
      <div className="history-detail">
        <button onClick={() => setSelectedPlan(null)} className="back-btn">&larr; All Plans</button>
        <h2>{selectedPlan.title}</h2>
        <p className="history-date">
          {selectedPlan.plan_json.season && (
            <span className="season-badge">{selectedPlan.plan_json.season.charAt(0).toUpperCase() + selectedPlan.plan_json.season.slice(1)}</span>
          )}
          {' '}{new Date(selectedPlan.created_at).toLocaleDateString()}
          {selectedPlan.stale && (
            <span className="stale-badge">Older data — numbers may differ</span>
          )}
        </p>

        {selectedPlan.stale && (
          <button
            className="build-btn"
            style={{ marginBottom: '1rem' }}
            onClick={() => onRegenerate(selectedPlan.grower_json)}
          >
            Regenerate with current data
          </button>
        )}

        <PlanSummary totals={plan.totals} />

        {plan.plots.map(pp => (
          <PlotCard key={pp.plot_id} plotPlan={pp} cropName={cropName} />
        ))}

        {/* Conversations */}
        <div className="history-convos">
          <h3>Conversations</h3>
          {selectedPlan.conversations.length === 0 && (
            <p className="chat-hint">No conversations yet. Ask a question below.</p>
          )}
          {selectedPlan.conversations.length > 1 && (
            <div className="convo-tabs">
              {selectedPlan.conversations.map(c => (
                <button
                  key={c.id}
                  className={c.id === activeConvoId ? 'active' : ''}
                  onClick={() => setActiveConvoId(c.id)}
                >
                  {c.title.slice(0, 30)}
                </button>
              ))}
              <button
                className={!activeConvoId ? 'active' : ''}
                onClick={() => setActiveConvoId(undefined)}
              >
                + New
              </button>
            </div>
          )}
          {activeConvo && (
            <div className="convo-messages">
              {activeConvo.messages.map((m, i) => (
                <div key={i} className={`chat-msg chat-${m.role}`}>
                  {m.content}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="chat-input-row" style={{ marginTop: '0.5rem' }}>
          <input
            type="text"
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendChat()}
            placeholder="Ask about this plan..."
            aria-label="Chat message"
            disabled={chatLoading}
          />
          <button onClick={sendChat} disabled={chatLoading || !chatInput.trim()}>Send</button>
        </div>
      </div>
    )
  }

  // Plan list view
  return (
    <div className="history-page">
      <h2>Your Plans</h2>
      {plans.length === 0 && (
        <p className="chat-hint">No plans yet. Generate your first plan from the Planner tab.</p>
      )}
      <div className="plan-list">
        {plans.map(p => (
          <button key={p.id} className="plan-list-item" onClick={() => openPlan(p.id)}>
            <div className="plan-list-crops">
              {p.crops.slice(0, 4).map(c => (
                <span key={c} className="plan-list-emoji">{cropEmoji(c)}</span>
              ))}
            </div>
            <div className="plan-list-info">
              <strong>{p.title}</strong>
              <span className="plan-list-date">
                {p.season && `${p.season.charAt(0).toUpperCase() + p.season.slice(1)} · `}
                {new Date(p.created_at).toLocaleDateString()}
              </span>
            </div>
            <div className="plan-list-cost">${p.totals?.plan_usd?.toFixed(2)}</div>
          </button>
        ))}
      </div>

      {timeline.length > 0 && (
        <>
          <h3 style={{ marginTop: '1.5rem' }}>Recent Activity</h3>
          <div className="activity-timeline">
            {timeline.map(item => (
              <div key={`${item.kind}-${item.id}`} className="timeline-item">
                <span className="timeline-dot" />
                <div className="timeline-content">
                  {item.kind === 'plan' ? (
                    <span>Generated plan: <strong>{item.title}</strong></span>
                  ) : (
                    <span>{formatEventType(item.type || '')}</span>
                  )}
                  <span className="timeline-time">
                    {new Date(item.timestamp).toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function formatEventType(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}
