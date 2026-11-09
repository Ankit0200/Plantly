import type { ReactNode } from 'react'

// The small slice of Markdown the chat model is told to write: headings, bullet and numbered lists,
// paragraphs, **bold**, *italic*, and links. Builds React elements (no innerHTML), so replies can't inject HTML.
type Block =
  | { kind: 'h'; text: string } | { kind: 'p'; text: string }
  | { kind: 'ul'; items: string[] } | { kind: 'ol'; items: string[] }

export function parseBlocks(text: string): Block[] {
  const blocks: Block[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    const last = blocks[blocks.length - 1]
    const bullet = line.match(/^[-*•]\s+(.*)/)
    const numbered = line.match(/^\d+[.)]\s+(.*)/)
    const heading = line.match(/^#{1,6}\s+(.*)/) ?? line.match(/^\*\*([^*]+)\*\*:?$/)
    if (!line) blocks.push({ kind: 'p', text: '' })
    else if (heading) blocks.push({ kind: 'h', text: heading[1] })
    else if (bullet || numbered) {
      const kind = bullet ? 'ul' : 'ol'
      const item = (bullet ?? numbered)![1]
      if (last?.kind === kind) last.items.push(item)
      else blocks.push({ kind, items: [item] })
    } else if (last?.kind === 'p' && last.text) last.text += ' ' + line
    else blocks.push({ kind: 'p', text: line })
  }
  return blocks.filter(b => b.kind !== 'p' || b.text)
}

const INLINE = /(\*\*[^*]+\*\*|\[[^\]]+\]\(https?:\/\/[^)\s]+\)|https?:\/\/[^\s)]+|\*[^*\s][^*]*\*)/g

function inline(text: string): ReactNode[] {
  return text.split(INLINE).map((part, i) => {
    if (i % 2 === 0) return part
    if (part.startsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>
    const link = part.match(/^\[([^\]]+)\]\((.+)\)$/)
    if (link || part.startsWith('http')) {
      const href = link ? link[2] : part
      return <a key={i} href={href} target="_blank" rel="noopener noreferrer">{link ? link[1] : part}</a>
    }
    return <em key={i}>{part.slice(1, -1)}</em>
  })
}

export default function ChatText({ text }: { text: string }) {
  return (
    <div className="chat-md">
      {parseBlocks(text).map((b, i) => {
        if (b.kind === 'h' || b.kind === 'p') {
          return <p key={i} className={b.kind === 'h' ? 'chat-md-h' : undefined}>{inline(b.text)}</p>
        }
        const List = b.kind
        return <List key={i}>{b.items.map((t, j) => <li key={j}>{inline(t)}</li>)}</List>
      })}
    </div>
  )
}
