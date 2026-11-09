import { useState } from 'react'
import type { AuthUser } from '../types'
import { authLogin, authRegister } from '../api'

interface Props {
  onLogin: (user: AuthUser) => void
  onBack?: () => void
}

export default function LoginPage({ onLogin, onBack }: Props) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [zipCode, setZipCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const user = mode === 'login'
        ? await authLogin(email, password)
        : await authRegister(email, password, name, zipCode || undefined)
      onLogin(user)
    } catch (err: unknown) {
      const e = err as { body?: { error?: string } }
      setError(e.body?.error || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          {onBack && <button className="login-back" onClick={onBack} aria-label="Back">&larr;</button>}
          <span className="login-brand-icon">🌱</span>
          <h1>Plantly</h1>
        </div>

        <div className="login-tabs">
          <button
            className={mode === 'login' ? 'active' : ''}
            onClick={() => { setMode('login'); setError('') }}
          >
            Log in
          </button>
          <button
            className={mode === 'register' ? 'active' : ''}
            onClick={() => { setMode('register'); setError('') }}
          >
            Sign up
          </button>
        </div>

        <form onSubmit={submit}>
          {mode === 'register' && (
            <label>
              Name
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Your name"
                required
              />
            </label>
          )}
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder={mode === 'register' ? 'At least 8 characters' : 'Your password'}
              required
              minLength={mode === 'register' ? 8 : undefined}
            />
          </label>

          {mode === 'register' && (
            <label>
              ZIP Code <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(for pest alerts)</span>
              <input
                type="text"
                value={zipCode}
                onChange={e => setZipCode(e.target.value.replace(/\D/g, '').slice(0, 5))}
                placeholder="e.g. 30602"
                maxLength={5}
                pattern="\d{5}"
              />
            </label>
          )}

          {error && <div className="login-error">{error}</div>}

          <button type="submit" className="build-btn" disabled={loading}>
            {loading ? 'Please wait...' : mode === 'login' ? 'Log in' : 'Create account'}
          </button>
        </form>

        <p className="login-demo-hint">
          Demo: <code>demo@plantly.test</code> / <code>demo-pass-123</code>
        </p>
      </div>
    </div>
  )
}
