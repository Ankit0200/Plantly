import { useState, useEffect, useCallback } from 'react'
import type { Grower, Plan, ReferenceData, AuthUser } from './types'
import { defaultSeason } from './types'
import { getReference, getDemoGrover, postPlan, postCheck, authMe, authLogout, getFarm, saveFarm } from './api'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import IntakePage from './pages/IntakePage'
import ConfirmPage from './pages/ConfirmPage'
import PlanPage from './pages/PlanPage'
import DataStatusPage from './pages/DataStatusPage'
import HistoryPage from './pages/HistoryPage'
import ProfilePage from './pages/ProfilePage'
import NotificationBell from './components/NotificationBell'
import PestReportModal from './components/PestReportModal'

type Tab = 'planner' | 'history' | 'profile' | 'data-status'
type Step = 'intake' | 'confirm' | 'plan'

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [showLogin, setShowLogin] = useState(false)
  const [tab, setTab] = useState<Tab>('planner')
  const [step, setStep] = useState<Step>('intake')
  const [ref, setRef] = useState<ReferenceData | null>(null)
  const [grower, setGrower] = useState<Grower | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [plan, setPlan] = useState<Plan | null>(null)
  const [loading, setLoading] = useState(false)
  const [showPestReport, setShowPestReport] = useState(false)

  // Check session on mount
  useEffect(() => {
    authMe()
      .then(u => setUser(u))
      .catch(() => {})
      .finally(() => setAuthChecked(true))
  }, [])

  // Load reference data once
  useEffect(() => {
    getReference().then(setRef).catch(console.error)
  }, [])

  // Load farm data on login
  useEffect(() => {
    if (!user) return
    getFarm().then(res => {
      if (res.grower) setGrower({ ...res.grower, season: res.grower.season || defaultSeason() })
    }).catch(console.error)
  }, [user])

  const onIntakeComplete = useCallback((draft: Grower, errs: string[]) => {
    setGrower({ ...draft, season: draft.season || defaultSeason() })
    setErrors(errs)
    setStep('confirm')
  }, [])

  const onLoadDemo = useCallback(async () => {
    try {
      const demo = await getDemoGrover()
      setGrower(demo)
      const { errors: errs } = await postCheck(demo)
      setErrors(errs)
      setStep('confirm')
    } catch (e) {
      console.error(e)
    }
  }, [])

  const onConfirm = useCallback(async (g: Grower) => {
    setLoading(true)
    try {
      // Save farm data
      saveFarm(g).catch(console.error)
      const result = await postPlan(g)
      setGrower(g)
      setPlan(result)
      setStep('plan')
    } catch (err: unknown) {
      const e = err as { body?: { errors?: string[]; error?: string } }
      if (e.body?.errors) {
        setErrors(e.body.errors)
      } else {
        setErrors([e.body?.error || 'Error building plan'])
      }
    } finally {
      setLoading(false)
    }
  }, [])

  const onRestart = useCallback(() => {
    setStep('intake')
    setPlan(null)
    setErrors([])
  }, [])

  const onRegenerate = useCallback((g: Grower) => {
    setGrower(g)
    setTab('planner')
    setStep('confirm')
    setErrors([])
  }, [])

  const handleLogout = useCallback(async () => {
    await authLogout()
    setUser(null)
    setGrower(null)
    setPlan(null)
    setStep('intake')
    setTab('planner')
  }, [])

  if (!authChecked) {
    return <div className="app"><div className="app-main" style={{ textAlign: 'center', paddingTop: '4rem' }}>Loading...</div></div>
  }

  if (!user) {
    if (!showLogin) {
      return <LandingPage onGetStarted={() => setShowLogin(true)} />
    }
    return <LoginPage onLogin={setUser} onBack={() => setShowLogin(false)} />
  }

  return (
    <div className="app">
      <header className="app-header">
        <img className="app-logo-mark" src="/images/plantly-mark.svg" alt="" />
        <h1>Plantly</h1>
        <div className="header-user">
          <NotificationBell onOpenPestReport={() => setShowPestReport(true)} />
          <span className="header-name">{user.name}</span>
          <button className="header-logout" onClick={handleLogout}>Log out</button>
        </div>
      </header>

      {tab === 'planner' && (
        <div className="step-indicator">
          <div className={`step-dot ${step === 'intake' ? 'active' : step === 'confirm' || step === 'plan' ? 'done' : ''}`}>
            <span className="dot">1</span>
            <span className="dot-label">Intake</span>
          </div>
          <div className="step-line" />
          <div className={`step-dot ${step === 'confirm' ? 'active' : step === 'plan' ? 'done' : ''}`}>
            <span className="dot">2</span>
            <span className="dot-label">Review</span>
          </div>
          <div className="step-line" />
          <div className={`step-dot ${step === 'plan' ? 'active' : ''}`}>
            <span className="dot">3</span>
            <span className="dot-label">Plan</span>
          </div>
        </div>
      )}

      <main className="app-main">
        {tab === 'data-status' ? (
          <DataStatusPage />
        ) : tab === 'profile' ? (
          <ProfilePage user={user} onUserUpdate={setUser} />
        ) : tab === 'history' ? (
          <HistoryPage referenceData={ref} onRegenerate={onRegenerate} />
        ) : (
          <>
            {step === 'intake' && (
              <IntakePage
                onComplete={onIntakeComplete}
                onLoadDemo={onLoadDemo}
                referenceData={ref}
              />
            )}

            {step === 'confirm' && grower && (
              <ConfirmPage
                grower={grower}
                errors={errors}
                referenceData={ref}
                loading={loading}
                onConfirm={onConfirm}
                onBack={() => setStep('intake')}
                setGrower={setGrower}
                setErrors={setErrors}
              />
            )}

            {step === 'plan' && plan && grower && (
              <PlanPage
                plan={plan}
                grower={grower}
                referenceData={ref}
                onRestart={onRestart}
                onPlanUpdate={(newPlan, newGrower) => {
                  setPlan(newPlan)
                  setGrower(newGrower)
                }}
              />
            )}
          </>
        )}
      </main>

      {showPestReport && (
        <PestReportModal
          user={user}
          referenceData={ref}
          onClose={() => setShowPestReport(false)}
          onUserUpdate={setUser}
        />
      )}

      <nav className="bottom-nav">
        <button
          className={tab === 'planner' ? 'active' : ''}
          aria-current={tab === 'planner' ? 'page' : undefined}
          onClick={() => setTab('planner')}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>
          <span>Planner</span>
        </button>
        <button
          className={tab === 'history' ? 'active' : ''}
          aria-current={tab === 'history' ? 'page' : undefined}
          onClick={() => setTab('history')}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          <span>History</span>
        </button>
        <button
          className={tab === 'profile' ? 'active' : ''}
          aria-current={tab === 'profile' ? 'page' : undefined}
          onClick={() => setTab('profile')}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          <span>Profile</span>
        </button>
        <button
          className={tab === 'data-status' ? 'active' : ''}
          aria-current={tab === 'data-status' ? 'page' : undefined}
          onClick={() => setTab('data-status')}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20V10M18 20V4M6 20v-4"/></svg>
          <span>Data</span>
        </button>
      </nav>
    </div>
  )
}
