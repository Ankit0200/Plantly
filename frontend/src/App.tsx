import { useState, useEffect, useCallback } from 'react'
import type { Grower, Plan, ReferenceData } from './types'
import { getReference, getDemoGrover, postPlan, postCheck } from './api'
import IntakePage from './pages/IntakePage'
import ConfirmPage from './pages/ConfirmPage'
import PlanPage from './pages/PlanPage'
import DataStatusPage from './pages/DataStatusPage'

type Tab = 'planner' | 'data-status'
type Step = 'intake' | 'confirm' | 'plan'

export default function App() {
  const [tab, setTab] = useState<Tab>('planner')
  const [step, setStep] = useState<Step>('intake')
  const [ref, setRef] = useState<ReferenceData | null>(null)
  const [grower, setGrower] = useState<Grower | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [plan, setPlan] = useState<Plan | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    getReference().then(setRef).catch(console.error)
  }, [])

  const onIntakeComplete = useCallback((draft: Grower, errs: string[]) => {
    setGrower(draft)
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
    setGrower(null)
    setPlan(null)
    setErrors([])
  }, [])

  return (
    <div className="app">
      <nav className="tab-bar">
        <button
          className={tab === 'planner' ? 'active' : ''}
          onClick={() => setTab('planner')}
        >
          Planner
        </button>
        <button
          className={tab === 'data-status' ? 'active' : ''}
          onClick={() => setTab('data-status')}
        >
          Data Status
        </button>
      </nav>
      <main>
        {tab === 'data-status' ? (
          <DataStatusPage />
        ) : (
          <>
            <div className="step-indicator">
              <span className={step === 'intake' ? 'step active' : 'step'}>1. Intake</span>
              <span className="step-arrow">&rarr;</span>
              <span className={step === 'confirm' ? 'step active' : 'step'}>2. Confirm</span>
              <span className="step-arrow">&rarr;</span>
              <span className={step === 'plan' ? 'step active' : 'step'}>3. Plan</span>
            </div>

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
              />
            )}
          </>
        )}
      </main>
    </div>
  )
}
