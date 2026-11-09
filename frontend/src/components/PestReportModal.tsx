import { useRef, useState } from 'react'
import type { ReferenceData, AuthUser } from '../types'
import { postPestReport, updateProfile } from '../api'
import { useDialog } from '../useDialog'

interface Props {
  user: AuthUser
  referenceData: ReferenceData | null
  onClose: () => void
  onUserUpdate: (user: AuthUser) => void
}

export default function PestReportModal({ user, referenceData, onClose, onUserUpdate }: Props) {
  const [pestId, setPestId] = useState('')
  const [cropId, setCropId] = useState('')
  const [note, setNote] = useState('')
  const [zipCode, setZipCode] = useState(user.zip_code || '')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')

  const needsZip = !user.zip_code
  const dialog = useRef<HTMLDivElement>(null)
  useDialog(dialog, true, onClose)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    // If user needs to set ZIP first, save it
    if (needsZip) {
      if (!zipCode || zipCode.length !== 5) {
        setError('Enter a 5-digit ZIP code')
        return
      }
      try {
        const updated = await updateProfile(zipCode)
        onUserUpdate(updated)
      } catch {
        setError('Could not save ZIP code')
        return
      }
    }

    if (!pestId) {
      setError('Select a pest')
      return
    }

    setLoading(true)
    try {
      const res = await postPestReport(pestId, cropId || undefined, note || undefined)
      if (res.notified_count !== undefined) {
        setSuccess(`Reported! ${res.notified_count} nearby farmer${res.notified_count === 1 ? '' : 's'} notified.`)
      } else {
        setSuccess('Report updated (already reported recently).')
      }
      setPestId('')
      setCropId('')
      setNote('')
    } catch (err: unknown) {
      const e = err as { body?: { error?: string } }
      setError(e.body?.error || 'Could not submit report')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-card" ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="pest-report-title">
        <div className="modal-header">
          <h2 id="pest-report-title">Report a Pest</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">&times;</button>
        </div>
        <form onSubmit={submit}>
          {needsZip && (
            <label>
              Your ZIP Code <span className="label-hint">(required for pest alerts)</span>
              <input
                type="text"
                value={zipCode}
                onChange={e => setZipCode(e.target.value.replace(/\D/g, '').slice(0, 5))}
                placeholder="e.g. 30602"
                maxLength={5}
                required
              />
            </label>
          )}
          <label>
            Pest *
            <select value={pestId} onChange={e => setPestId(e.target.value)} required>
              <option value="">Select a pest...</option>
              {referenceData?.problems.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>
          <label>
            Affected crop <span className="label-hint">(optional)</span>
            <select value={cropId} onChange={e => setCropId(e.target.value)}>
              <option value="">None</option>
              {referenceData?.crops.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
          <label>
            Note <span className="label-hint">(optional)</span>
            <input
              type="text"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="e.g. Found on my tomatoes"
              maxLength={200}
            />
          </label>

          {error && <div className="login-error">{error}</div>}
          {success && <div className="pest-success">{success}</div>}

          <button type="submit" className="build-btn" disabled={loading}>
            {loading ? 'Submitting...' : 'Report Pest'}
          </button>
        </form>
      </div>
    </div>
  )
}
