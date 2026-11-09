import { useState, useEffect, useRef } from 'react'
import type { AuthUser, ImplementedItemData, ImplementedSummary, PendingItemChange } from '../types'
import { getAllImplemented, removeImplemented, updateProfile, getPlans, postPlanChat, updateImplementedActual, postEvent } from '../api'

interface Props {
  user: AuthUser
  onUserUpdate: (user: AuthUser) => void
}

const CATEGORY_META: Record<string, { label: string; icon: string; color: string }> = {
  rotation:        { label: 'Rotation',        icon: '\u{1F504}', color: 'var(--gold)' },
  soil:            { label: 'Soil Prep',       icon: '\u{1F9EA}', color: 'var(--purple)' },
  feeding:         { label: 'Feeding',         icon: '\u{1F331}', color: 'var(--green)' },
  pest_prevention: { label: 'Pest Prevention', icon: '\u{1F41B}', color: 'var(--red)' },
}

interface PlanInfo {
  id: number
  title: string
  created_at: string
  plot_crops?: Record<string, string>  // plotId -> cropId
}

interface ChatMsg {
  role: string
  content: string
}

export default function ProfilePage({ user, onUserUpdate }: Props) {
  const [summary, setSummary] = useState<ImplementedSummary | null>(null)
  const [plans, setPlans] = useState<Record<number, PlanInfo>>({})
  const [zipCode, setZipCode] = useState(user.zip_code || '')
  const [zipSaving, setZipSaving] = useState(false)
  const [zipMsg, setZipMsg] = useState('')
  // Track which items the user has marked as "done"
  const [doneItems, setDoneItems] = useState<Set<number>>(new Set())

  // Chat state
  const [chatPlanId, setChatPlanId] = useState<number | null>(null)
  const [chatConvoId, setChatConvoId] = useState<number | undefined>(undefined)
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [pendingChanges, setPendingChanges] = useState<PendingItemChange[]>([])
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    getAllImplemented().then(data => {
      setSummary(data)
      // Items with actual_quantity are already "done"
      const done = new Set<number>()
      for (const item of data.items) {
        if (item.actual_quantity != null) done.add(item.id)
      }
      setDoneItems(done)
    }).catch(console.error)
    getPlans().then(planList => {
      const map: Record<number, PlanInfo> = {}
      for (const p of planList) {
        map[p.id] = { id: p.id, title: p.title, created_at: p.created_at, plot_crops: p.plot_crops }
      }
      setPlans(map)
    }).catch(console.error)
  }, [])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  const toggleDone = async (item: ImplementedItemData) => {
    const nowDone = !doneItems.has(item.id)
    // Optimistic update
    setDoneItems(prev => {
      const next = new Set(prev)
      if (nowDone) next.add(item.id)
      else next.delete(item.id)
      return next
    })
    if (nowDone) {
      try {
        await updateImplementedActual(item.id, {
          actual_quantity: item.quantity,
          actual_unit: item.unit,
          source: 'manual',
        })
        setSummary(prev => {
          if (!prev) return prev
          return {
            ...prev,
            items: prev.items.map(i => i.id === item.id ? { ...i, actual_quantity: item.quantity, actual_unit: item.unit } : i),
          }
        })
      } catch {
        // Revert
        setDoneItems(prev => { const next = new Set(prev); next.delete(item.id); return next })
      }
    }
  }

  const handleRemove = async (itemId: number) => {
    try {
      await removeImplemented(itemId)
      setSummary(prev => {
        if (!prev) return prev
        const items = prev.items.filter(i => i.id !== itemId)
        return {
          items,
          count: items.length,
          total_cost_usd: Math.round(items.reduce((s, i) => s + (i.cost_usd || 0), 0) * 100) / 100,
        }
      })
      setDoneItems(prev => { const next = new Set(prev); next.delete(itemId); return next })
    } catch { /* ignore */ }
  }

  const saveZip = async () => {
    setZipSaving(true)
    setZipMsg('')
    try {
      const updated = await updateProfile(zipCode)
      onUserUpdate(updated)
      setZipMsg('Saved!')
      setTimeout(() => setZipMsg(''), 2000)
    } catch {
      setZipMsg('Error saving')
    } finally {
      setZipSaving(false)
    }
  }

  const openChat = (planId: number) => {
    setChatPlanId(planId)
    setChatConvoId(undefined)
    setChatMessages([])
    setPendingChanges([])
    setChatInput('')
    postEvent('impl_chat_opened', { plan_id: planId }, planId).catch(() => {})
  }

  const closeChat = () => {
    setChatPlanId(null)
    setChatConvoId(undefined)
    setChatMessages([])
    setPendingChanges([])
  }

  const sendChat = async () => {
    if (!chatInput.trim() || !chatPlanId || chatLoading) return
    const msg = chatInput.trim()
    setChatInput('')
    setChatMessages(prev => [...prev, { role: 'user', content: msg }])
    setChatLoading(true)
    try {
      const res = await postPlanChat(chatPlanId, msg, chatConvoId, 'implemented')
      setChatConvoId(res.conversation_id)
      setChatMessages(prev => [...prev, { role: 'assistant', content: res.reply }])
      for (const tu of res.tools_used || []) {
        if (tu.tool === 'propose_item_update' && !tu.is_error) {
          try {
            const output = typeof tu.input === 'string' ? JSON.parse(tu.input) : tu.input
            if (output.item_id) {
              const item = summary?.items.find(i => i.id === output.item_id)
              if (item) {
                setPendingChanges(prev => [...prev, {
                  item_id: output.item_id,
                  plot_id: item.plot_id,
                  plot_name: item.plot_name,
                  text: item.text,
                  planned_quantity: item.quantity,
                  planned_unit: item.unit,
                  actual_quantity: output.actual_quantity,
                  actual_unit: output.actual_unit,
                  actual_date: output.actual_date,
                  actual_note: output.actual_note,
                }])
                postEvent('update_proposed', { item_id: output.item_id, plan_id: chatPlanId }, chatPlanId).catch(() => {})
              }
            }
          } catch { /* ignore parse errors */ }
        }
      }
    } catch {
      setChatMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, something went wrong.' }])
    } finally {
      setChatLoading(false)
    }
  }

  const savePendingChange = async (change: PendingItemChange) => {
    try {
      const updated = await updateImplementedActual(change.item_id, {
        actual_quantity: change.actual_quantity ?? null,
        actual_unit: change.actual_unit ?? null,
        actual_date: change.actual_date ?? null,
        actual_note: change.actual_note ?? null,
        source: 'chat',
      })
      setSummary(prev => {
        if (!prev) return prev
        return { ...prev, items: prev.items.map(i => i.id === updated.id ? updated : i) }
      })
      setPendingChanges(prev => prev.filter(c => c.item_id !== change.item_id))
      setDoneItems(prev => new Set(prev).add(change.item_id))
      postEvent('update_saved', { item_id: change.item_id }, chatPlanId ?? undefined).catch(() => {})
    } catch { /* ignore */ }
  }

  const cancelPendingChange = (itemId: number) => {
    setPendingChanges(prev => prev.filter(c => c.item_id !== itemId))
    postEvent('update_cancelled', { item_id: itemId }, chatPlanId ?? undefined).catch(() => {})
  }

  // Group: plan -> plot -> category -> items
  const grouped: Record<number, Record<string, Record<string, ImplementedItemData[]>>> = {}
  for (const item of summary?.items || []) {
    if (item.category === 'rotation' && item.text.includes('Suggested instead:')) continue
    if (!grouped[item.plan_id]) grouped[item.plan_id] = {}
    const plotKey = item.plot_id
    if (!grouped[item.plan_id][plotKey]) grouped[item.plan_id][plotKey] = {}
    const cat = item.category
    if (!grouped[item.plan_id][plotKey][cat]) grouped[item.plan_id][plotKey][cat] = []
    grouped[item.plan_id][plotKey][cat].push(item)
  }

  const CATEGORY_ORDER = ['soil', 'feeding', 'pest_prevention', 'rotation']

  // Helper to get crop display name for a plot
  const getCropForPlot = (planId: number, plotId: string): string => {
    const cropId = plans[planId]?.plot_crops?.[plotId]
    if (!cropId) return ''
    // Capitalize crop id as display name (e.g. "tomato" -> "Tomato")
    return cropId.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  }

  // Count done/total for progress
  const totalItems = summary?.items.filter(i => !(i.category === 'rotation' && i.text.includes('Suggested instead:'))).length ?? 0
  const doneCount = [...doneItems].filter(id => summary?.items.some(i => i.id === id && !(i.category === 'rotation' && i.text.includes('Suggested instead:')))).length

  return (
    <div className="profile-page">
      <h2>Profile</h2>

      {/* Account Section */}
      <div className="section-card">
        <div className="section-card-header" style={{ borderLeftColor: 'var(--blue)' }}>
          <span className="section-card-icon">👤</span>
          <span className="section-card-label">Account</span>
        </div>
        <div className="section-card-items">
          <div className="profile-fields">
            <div className="profile-field">
              <span className="profile-label">Name</span>
              <span className="profile-value">{user.name}</span>
            </div>
            <div className="profile-field">
              <span className="profile-label">Email</span>
              <span className="profile-value">{user.email}</span>
            </div>
            <div className="profile-field">
              <span className="profile-label">ZIP Code</span>
              <div className="profile-zip-row">
                <input
                  type="text"
                  value={zipCode}
                  onChange={e => setZipCode(e.target.value.replace(/\D/g, '').slice(0, 5))}
                  placeholder="e.g. 30602"
                  maxLength={5}
                />
                <button onClick={saveZip} disabled={zipSaving || zipCode === (user.zip_code || '')}>
                  {zipSaving ? '...' : 'Save'}
                </button>
                {zipMsg && <span className="profile-zip-msg">{zipMsg}</span>}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Implemented Steps */}
      <div className="impl-section">
        <h3>Your To-Do List</h3>

        {totalItems > 0 && (
          <div className="impl-progress-bar">
            <div className="impl-progress-track">
              <div
                className="impl-progress-fill"
                style={{ width: `${totalItems > 0 ? (doneCount / totalItems) * 100 : 0}%` }}
              />
            </div>
            <span className="impl-progress-text">{doneCount} / {totalItems} done</span>
          </div>
        )}

        {summary && totalItems > 0 ? (
          <>
            {Object.entries(grouped).map(([planIdStr, plotGroups]) => {
              const planId = Number(planIdStr)
              const planInfo = plans[planId]
              return (
                <div key={planId} className="impl-plan-group">
                  <div className="impl-plan-header">
                    <div>
                      {planInfo && (
                        <span className="impl-plan-date">
                          {new Date(planInfo.created_at).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    <button
                      className="impl-chat-btn"
                      onClick={() => chatPlanId === planId ? closeChat() : openChat(planId)}
                    >
                      {chatPlanId === planId ? 'Close chat' : '💬 Chat'}
                    </button>
                  </div>

                  {/* Chat panel */}
                  {chatPlanId === planId && (
                    <div className="impl-chat-panel">
                      <div className="impl-chat-messages">
                        {chatMessages.length === 0 && (
                          <p className="chat-hint">
                            Log what you actually did, ask about emergencies (heavy rain, frost, pests), or get help with your plan.
                          </p>
                        )}
                        {chatMessages.map((m, i) => (
                          <div key={i} className={`chat-msg chat-${m.role}`}>
                            {m.content}
                          </div>
                        ))}
                        {chatLoading && (
                          <div className="chat-msg chat-assistant chat-loading">Thinking...</div>
                        )}
                        <div ref={chatEndRef} />
                      </div>

                      {pendingChanges.map(change => (
                        <div key={change.item_id} className="pending-change-card">
                          <div className="pending-change-text">
                            Update {change.plot_name} &middot; {change.text}:
                            {change.planned_quantity != null && change.actual_quantity != null && (
                              <> planned {change.planned_quantity} {change.planned_unit || ''} &rarr; actual {change.actual_quantity} {change.actual_unit || change.planned_unit || ''}</>
                            )}
                            {change.actual_date && <> on {change.actual_date}</>}
                            {change.actual_note && <> &mdash; {change.actual_note}</>}
                            ?
                          </div>
                          <div className="pending-change-actions">
                            <button className="build-btn" onClick={() => savePendingChange(change)}>Save</button>
                            <button onClick={() => cancelPendingChange(change.item_id)}>Cancel</button>
                          </div>
                        </div>
                      ))}

                      <div className="impl-chat-input">
                        <input
                          type="text"
                          value={chatInput}
                          onChange={e => setChatInput(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && sendChat()}
                          placeholder="e.g. 'I used 40 lb of urea' or 'We had heavy rain'"
                          disabled={chatLoading}
                          aria-label="Chat message"
                        />
                        <button onClick={sendChat} disabled={chatLoading || !chatInput.trim()}>
                          Send
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Plot sections */}
                  {Object.entries(plotGroups).map(([plotId, catGroups]) => {
                    const plotName = catGroups[Object.keys(catGroups)[0]]?.[0]?.plot_name || plotId
                    const cropName = getCropForPlot(planId, plotId)
                    const allPlotItems = Object.values(catGroups).flat()
                    const plotDoneCount = allPlotItems.filter(i => doneItems.has(i.id)).length

                    return (
                      <div key={plotId} className="impl-plot-section">
                        <div className="impl-plot-header">
                          <h4 className="impl-plot-title">
                            {cropName ? `${cropName} — ${plotName}` : plotName}
                          </h4>
                          <span className="impl-plot-progress">{plotDoneCount}/{allPlotItems.length}</span>
                        </div>

                        <div className="impl-category-cards">
                          {CATEGORY_ORDER.map(cat => {
                            const items = catGroups[cat]
                            if (!items || items.length === 0) return null
                            const meta = CATEGORY_META[cat] || { label: cat, icon: '📋', color: 'var(--text-muted)' }
                            const catDone = items.filter(i => doneItems.has(i.id)).length

                            return (
                              <div key={cat} className="impl-cat-card">
                                <div className="impl-cat-header" style={{ borderLeftColor: meta.color }}>
                                  <span className="impl-cat-icon">{meta.icon}</span>
                                  <span className="impl-cat-label">{meta.label}</span>
                                  <span className="impl-cat-progress">{catDone}/{items.length}</span>
                                </div>
                                <div className="impl-cat-items">
                                  {items.map(item => {
                                    const isDone = doneItems.has(item.id)
                                    return (
                                      <div key={item.id} className={`impl-todo-item ${isDone ? 'impl-todo-done' : ''}`}>
                                        <label className="impl-todo-check">
                                          <input
                                            type="checkbox"
                                            checked={isDone}
                                            onChange={() => toggleDone(item)}
                                          />
                                          <span className="impl-todo-checkmark" />
                                        </label>
                                        <div className="impl-todo-body">
                                          <span className={`impl-todo-text ${isDone ? 'impl-todo-text-done' : ''}`}>
                                            {item.text}
                                          </span>
                                          <div className="impl-todo-meta">
                                            {item.quantity != null && (
                                              <span className="impl-todo-qty">{item.quantity.toFixed(1)} {item.unit}</span>
                                            )}
                                            {item.cost_usd != null && item.cost_usd > 0 && (
                                              <span className="impl-todo-cost">${item.cost_usd.toFixed(2)}</span>
                                            )}
                                            {item.actual_quantity != null && item.actual_quantity !== item.quantity && (
                                              <span className="impl-actual-badge">
                                                Actual: {item.actual_quantity.toFixed(1)} {item.actual_unit || item.unit}
                                              </span>
                                            )}
                                          </div>
                                          {item.actual_note && (
                                            <div className="impl-actual-note">{item.actual_note}</div>
                                          )}
                                        </div>
                                        <button
                                          className="impl-remove-x"
                                          onClick={() => handleRemove(item.id)}
                                          aria-label="Remove item"
                                          title="Remove"
                                        >
                                          ×
                                        </button>
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </>
        ) : (
          <p className="chat-hint" style={{ margin: '1.5rem 0' }}>
            Nothing yet. Open a plan and tap "I'll do this" to start your to-do list.
          </p>
        )}
      </div>
    </div>
  )
}
