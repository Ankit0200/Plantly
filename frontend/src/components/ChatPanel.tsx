import { useState, useRef, useEffect } from 'react'
import type { Grower, ChatMessage, ToolUsage } from '../types'
import { postChat } from '../api'
import ChatText from './ChatText'

interface Props {
  grower: Grower
}

export default function ChatPanel({ grower }: Props) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [toolsUsed, setToolsUsed] = useState<ToolUsage[]>([])
  const [unsupported, setUnsupported] = useState<number[]>([])
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = async () => {
    const text = input.trim()
    if (!text || loading) return

    const userMsg: ChatMessage = { role: 'user', content: text }
    const next = [...messages, userMsg]
    setMessages(next)
    setInput('')
    setLoading(true)
    setToolsUsed([])
    setUnsupported([])

    try {
      const res = await postChat(grower, next)
      setMessages([...next, { role: 'assistant', content: res.reply }])
      setToolsUsed(res.tools_used)
      setUnsupported(res.unsupported_numbers)
    } catch {
      setMessages([...next, { role: 'assistant', content: 'Sorry, something went wrong.' }])
    } finally {
      setLoading(false)
    }
  }

  if (!open) {
    return (
      <button className="chat-toggle" onClick={() => setOpen(true)}>
        💬 Ask about this plan
      </button>
    )
  }

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <strong>Chat</strong>
        <button onClick={() => setOpen(false)} aria-label="Close chat">✕</button>
      </div>

      <div className="chat-messages">
        {messages.length === 0 && (
          <p className="chat-hint">Ask questions about your plan, soil, or crop choices.</p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`chat-msg chat-${m.role}`}>
            {m.role === 'assistant' ? <ChatText text={m.content} /> : m.content}
          </div>
        ))}
        {loading && <div className="chat-msg chat-assistant chat-loading">Thinking…</div>}
        <div ref={endRef} />
      </div>

      {toolsUsed.length > 0 && (
        <div className="chat-tools">
          Tools used: {toolsUsed.map(t => t.tool).join(', ')}
          {toolsUsed.some(t => t.is_error) && <span className="tool-error"> (errors)</span>}
        </div>
      )}

      {unsupported.length > 0 && (
        <div className="chat-unsupported">
          ⚠ Some numbers in the response aren't backed by the engine.
        </div>
      )}

      <div className="chat-input-row">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
          placeholder="Ask a question…"
          aria-label="Chat message"
          disabled={loading}
        />
        <button onClick={send} disabled={loading || !input.trim()}>Send</button>
      </div>
    </div>
  )
}
