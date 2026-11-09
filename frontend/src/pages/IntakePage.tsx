import { useState, useRef, useEffect, useCallback } from 'react'
import type { Grower, ReferenceData } from '../types'
import { postIntakeChat, postIntake } from '../api'

interface Props {
  onComplete: (draft: Grower, errors: string[]) => void
  onLoadDemo: () => void
  referenceData: ReferenceData | null
}

interface Message {
  role: 'user' | 'assistant'
  content: string
}

const STARTERS = [
  "I have my soil test results ready",
  "I don't have a soil test, just use defaults",
  "I grew tomatoes last year and want to try something new",
]

function emptyGrower(): Grower {
  return {
    name: '',
    plots: [{
      id: 'A', name: 'Plot A', area_sqft: 1000, soil_texture: 'loam',
      soil_test: { ph: 6.5, p_ppm: 30, k_ppm: 100, organic_matter_pct: 3.0 },
      crop_two_years_ago: null, crop_last_year: '', crop_planned: '',
      problems: [], baseline: { inputs: [], pesticide_applications: 0 },
    }],
    crops_needed: [],
    compost_available_cu_yd: 0,
    compost_price_usd_per_cu_yd: 0,
    price_overrides: {},
  }
}

function isSoilTestQuestion(text: string): boolean {
  const lower = text.toLowerCase()
  return (lower.includes('soil test') || lower.includes('soil report'))
    && (lower.includes('?') || lower.includes('share') || lower.includes('have'))
}

export default function IntakePage({ onComplete, onLoadDemo }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const started = messages.length > 0

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = useCallback(async (text?: string) => {
    const msg = text || input.trim()
    if (!msg || loading) return

    const userMsg: Message = { role: 'user', content: msg }
    const next = [...messages, userMsg]
    setMessages(next)
    setInput('')
    setLoading(true)

    try {
      const res = await postIntakeChat(next)
      const updated = [...next, { role: 'assistant' as const, content: res.reply }]
      setMessages(updated)

      if (res.grower) {
        setTimeout(() => {
          onComplete(res.grower!, res.errors || [])
        }, 1500)
      }
    } catch {
      setMessages([...next, { role: 'assistant', content: 'Sorry, something went wrong. Try again?' }])
    } finally {
      setLoading(false)
    }
  }, [input, messages, loading, onComplete])

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return

    if (f.name.endsWith('.json')) {
      const reader = new FileReader()
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target?.result as string)
          onComplete(data, [])
        } catch {
          setMessages(prev => [...prev, { role: 'assistant', content: 'That JSON file seems invalid. Try again?' }])
        }
      }
      reader.readAsText(f)
      return
    }

    setFile(f)
    setLoading(true)
    const formData = new FormData()
    formData.append('file', f)

    setMessages(prev => [...prev, { role: 'user', content: `📎 Uploaded: ${f.name}` }])

    postIntake(formData)
      .then(result => {
        setMessages(prev => [...prev,
          { role: 'assistant', content: `Got it! I extracted your soil data from the report. Taking you to review it now.` },
        ])
        setTimeout(() => onComplete(result.draft, result.errors), 1200)
      })
      .catch(() => {
        setMessages(prev => [...prev,
          { role: 'assistant', content: 'I had trouble reading that file. Could you type in the numbers instead? I need pH, P (ppm), K (ppm), and organic matter %.' },
        ])
      })
      .finally(() => { setLoading(false); setFile(null) })
  }, [onComplete])

  // Check if the last assistant message is asking about soil test
  const lastAssistantMsg = [...messages].reverse().find(m => m.role === 'assistant')
  const showUpload = lastAssistantMsg && isSoilTestQuestion(lastAssistantMsg.content)

  return (
    <div className="intake-page">
      <div className="intake-header">
        <h2>Plan Your Season</h2>
        <div className="intake-quick-actions">
          <button onClick={onLoadDemo}>Load Demo Farm</button>
          <button onClick={() => onComplete(emptyGrower(), [])}>Manual Entry</button>
        </div>
      </div>

      {!started ? (
        <div className="intake-welcome">
          <div className="intake-bot-msg">
            <p>Hi! I just need 3 things to build your plan:</p>
            <p><strong>1.</strong> Soil test results &nbsp; <strong>2.</strong> What you grew recently &nbsp; <strong>3.</strong> What you want to plant</p>
          </div>
          <div className="intake-starters">
            {STARTERS.map((s, i) => (
              <button key={i} className="starter-btn" onClick={() => send(s)}>
                {s}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="intake-chat">
          <div className="intake-messages">
            {messages.map((m, i) => (
              <div key={i} className={`intake-msg intake-${m.role}`}>
                {m.content}
              </div>
            ))}
            {loading && <div className="intake-msg intake-assistant intake-typing">Thinking…</div>}

            {showUpload && !loading && (
              <div className="intake-upload-prompt">
                <label className="upload-inline-btn">
                  📄 Upload soil test (PDF or image)
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg"
                    onChange={handleFileUpload}
                    hidden
                  />
                </label>
                <span className="upload-or">or type the numbers below</span>
              </div>
            )}

            <div ref={endRef} />
          </div>
        </div>
      )}

      <div className="intake-input-row">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
          placeholder={started ? "Type your answer…" : "Tell me about your farm…"}
          aria-label="Message"
          disabled={loading}
        />
        <button onClick={() => send()} disabled={loading || !input.trim()}>Send</button>
      </div>

      {file && <p className="intake-file-note">Processing {file.name}…</p>}
    </div>
  )
}
