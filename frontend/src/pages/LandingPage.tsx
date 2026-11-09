import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { PlanLine, PlotPlan } from '../types'
import PlotCard from '../components/PlotCard'
import CostTable from '../components/CostTable'
import PlanSummary from '../components/PlanSummary'
import CropPicker from '../components/CropPicker'
import { SAMPLE_CROPS, SAMPLE_PLAN } from './samplePlan'
import './landing.css'

interface Props {
  onGetStarted: () => void
}

const NAV_LINKS = [
  { href: '#mission', label: 'Our Mission' },
  { href: '#how-it-works', label: 'How it works' },
  { href: '#features', label: 'Features' },
]

function Hero({ onGetStarted }: Props) {
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

  return (
    <header className="hero" id="top">
      <div className="hero-stage">
        <img
          className="hero-art"
          src="/images/hero-tractor-field-1448.webp"
          srcSet="/images/hero-tractor-field-768.webp 768w, /images/hero-tractor-field-1448.webp 1448w"
          sizes="100vw"
          width={1448}
          height={1086}
          alt="A tractor ploughing beside a golden wheat field under a pale green sky"
          fetchPriority="high"
        />

        <nav className="hero-nav" aria-label="Main">
          <ul className="hero-links">
            {NAV_LINKS.map(l => <li key={l.href}><a href={l.href}>{l.label}</a></li>)}
          </ul>
          <a className="hero-mark" href="#top" aria-label="Plantly, back to top">
            <img src="/images/plantly-mark.svg" alt="" width={44} height={44} />
          </a>
          <div className="hero-actions">
            <button type="button" className="hero-login" onClick={onGetStarted}>Log in</button>
            <button
              type="button"
              className="hero-menu-btn"
              aria-expanded={menuOpen}
              aria-controls="hero-menu"
              onClick={() => setMenuOpen(o => !o)}
            >
              {menuOpen ? 'Close' : 'Menu'}
            </button>
          </div>
          {menuOpen && (
            <ul className="hero-menu" id="hero-menu">
              {NAV_LINKS.map(l => (
                <li key={l.href}><a href={l.href} onClick={() => setMenuOpen(false)}>{l.label}</a></li>
              ))}
            </ul>
          )}
        </nav>

        <div className="hero-copy">
          <p className="hero-name">Plantly</p>
          <h1 className="hero-title">Grow smarter,<br />spend less.</h1>
          {/* Spec §10.1 fallback: the 66%/80% figures are not documented by the engine yet. */}
          <p className="hero-sub">
            Grow on evidence, not estimates. Research-backed soil plans from 40+ datasets and research that help you cut unnecessary fertilizer costs.
          </p>
          <button type="button" className="hero-cta cta-shine" onClick={onGetStarted}>
            Try Now — It's Free <span className="hero-cta-arrow" aria-hidden="true">→</span>
          </button>
          <p className="hero-hint">No credit card needed</p>
        </div>
      </div>

      <div className="hero-metrics">
        <div className="hero-metrics-left">
          <p className="metric"><strong>$36B</strong><span>Total Market</span></p>
          <p className="metric"><strong>$9.6B</strong><span>Servicable Market</span></p>
        </div>
        {/* Names must stay in backend/data/sources.yaml */}
        <p className="metric metric-sources">
          <span>Sources</span>Cornell, UMass Amherst, NC State, University of Georgia, USDA…
        </p>
        <a className="metric metric-link" href="#research">
          <strong>40+</strong><span>Datasets &amp; research sources</span>
        </a>
        <p className="hero-footnote">*Estimates</p>
      </div>
    </header>
  )
}

const BRIDGE_ROWS = [
  {
    title: 'Input costs',
    challenge: "Fertilizers and pesticides can be expensive, and it's difficult to judge what is necessary.",
    usual: "Repeat last season's purchases or rely on generic shelf labels and sales advice.",
    plantly: 'Compare possible inputs against soil needs, existing compost/cover crops, plot size, and budget, with estimated costs when pricing data is available.',
  },
  {
    title: 'Soil complexity',
    challenge: 'Soil pH, N-P-K, and crop history are hard to turn into clear actions.',
    usual: 'Leave lab reports unread or interpret them manually across notes and spreadsheets.',
    plantly: 'Turn entered soil and growing history into understandable, source-linked nutrient and rotation recommendations, with assumptions visible.',
  },
  {
    title: 'Weather and pests',
    challenge: 'Rainfall changes, planting windows, and recurring pests disrupt a season.',
    usual: 'React after weather shifts or pest damage, often without a coordinated plan.',
    plantly: 'Bring available local weather context and research-supported rotation/prevention considerations into one seasonal plan.',
  },
]
const BRIDGE_LABELS = ['The challenge', 'The usual approach', 'With Plantly']

function MissionSection() {
  return (
    <section className="section" id="mission" aria-labelledby="mission-title">
      <div className="wrap">
        <p className="eyebrow">Our Mission</p>
        <div className="mission-intro">
          <h2 className="section-title" id="mission-title">Good growing decisions shouldn't be reserved for big farms.</h2>
          <div className="mission-text">
            <p className="lead">
              Whether you're tending a backyard garden or managing several acres, understanding your soil, choosing
              the right inputs, and planning around unpredictable weather shouldn't require expensive software or an
              agronomy degree.
            </p>
            <p>
              We're building Plantly to turn complicated agricultural data into practical, research-backed growing
              plans—helping growers make informed decisions, avoid unnecessary spending, and care for their soil
              without losing sight of their harvest.
            </p>
          </div>
        </div>

        <h3 className="bridge-title">From guesswork to a growing plan.</h3>
        <div className="bridge-head" aria-hidden="true">
          {BRIDGE_LABELS.map(l => <span key={l}>{l}</span>)}
        </div>
        <ol className="bridge">
          {BRIDGE_ROWS.map((r, i) => (
            <li key={r.title} className="bridge-row">
              <span className="bridge-idx" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
              <div className="bridge-cell">
                <span className="bridge-label">{BRIDGE_LABELS[0]}</span>
                <strong className="bridge-pain">{r.title}</strong>
                <p>{r.challenge}</p>
              </div>
              <div className="bridge-cell">
                <span className="bridge-label">{BRIDGE_LABELS[1]}</span>
                <p>{r.usual}</p>
              </div>
              <div className="bridge-cell bridge-plantly">
                <span className="bridge-label">{BRIDGE_LABELS[2]}</span>
                <p>{r.plantly}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="audience-block">
          <h3 className="audience-title">Built for the people who grow our food—and their own.</h3>
          <div className="audience">
            <div>
              <h4 className="eyebrow">Home gardeners</h4>
              <p>From a raised bed to a backyard garden, understand what your soil needs and make the most of your growing budget.</p>
            </div>
            <div>
              <h4 className="eyebrow">Small &amp; mid-sized growers</h4>
              <p>For market gardens and family farms managing multiple plots, make rotation, input, and timing choices with a clearer plan and more visible trade-offs.</p>
            </div>
          </div>
          <p className="section-end">
            <a className="text-link" href="#how-it-works">See how it works <span aria-hidden="true">→</span></a>
          </p>
        </div>
      </div>
    </section>
  )
}

const STEPS = [
  { icon: '💬', title: 'Tell us about your farm', body: 'Describe your plots in plain English or upload a soil test PDF. Our AI extracts the data — no forms to fill.' },
  { icon: '✅', title: 'Review and confirm', body: 'Check the extracted data, pick your crops with emoji cards, adjust soil readings. Hit generate.' },
  { icon: '📋', title: 'Get your plan', body: 'Lime, fertilizer, timing, cost breakdown — every line sourced. Ask "Why?" on any recommendation.' },
]
const SOURCES = ['UGA Extension', 'Clemson HGIC', 'SE Veg Handbook', 'SARE', 'WSU Extension', 'USDA NRCS', 'Oregon State', 'UW Madison', 'NC State', 'UMN Extension']

function HowItWorks({ onGetStarted }: Props) {
  return (
    <section className="section" id="how-it-works" aria-labelledby="how-title">
      <div className="wrap">
        <h2 className="section-title" id="how-title">How it works</h2>
        <ol className="steps">
          {STEPS.map((s, i) => (
            <li key={s.title} className="step">
              <span className="step-num" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
              <span className="step-icon" aria-hidden="true">{s.icon}</span>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </li>
          ))}
        </ol>
        <p className="section-end">
          <button type="button" className="text-link" onClick={onGetStarted}>Try it now <span aria-hidden="true">→</span></button>
        </p>

        <div className="research" id="research">
          <p className="research-label">Every recommendation traces to:</p>
          <ul className="sources">
            {SOURCES.map(s => <li key={s}>{s}</li>)}
          </ul>
        </div>
      </div>
    </section>
  )
}

const cropName = (id: string) => SAMPLE_CROPS.find(c => c.id === id)?.name ?? id
const samplePlot = (id: string) => SAMPLE_PLAN.plots.find(p => p.plot_id === id)!
/** A real plot card showing only the plan lines a sample is about. */
const plotWith = (id: string, keep: (l: PlanLine) => boolean): PlotPlan => {
  const p = samplePlot(id)
  return { ...p, lines: p.lines.filter(keep) }
}

/** Real app component rendered with sample data. Inert: nothing in it can be focused or clicked
 *  (its "Why?" buttons would call the live API), and it is described to screen readers as one image. */
function Sample({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="sample">
      <span className="chip">Sample</span>
      <div className="sample-frame" role="img" aria-label={label}>
        <div inert>{children}</div>
      </div>
    </div>
  )
}

function FeaturesSection() {
  return (
    <section className="section" id="features" aria-labelledby="features-title">
      <div className="wrap">
        <div className="section-head-center">
          <p className="eyebrow">Key Features</p>
          <h2 className="section-title" id="features-title">Smart Tools for Modern<br />Farming Operations</h2>
          <p className="section-sub">The engine is deterministic math from university extension services. AI handles the conversation, not the chemistry.</p>
        </div>

        <div className="feature-grid">
          <article className="feature-card">
            <h3>Field Intelligence</h3>
            <p>Understand your soil, crop history, and plot-specific growing conditions.</p>
            <Sample label="Sample Plantly plot plan: a bed with early blight history is moved from tomato to cabbage, with lime, compost and feeding steps.">
              <PlotCard plotPlan={plotWith('E', l => l.category === 'rotation' || l.category === 'soil')} cropName={cropName} />
            </Sample>
          </article>

          <article className="feature-card">
            <h3>Monitoring &amp; Observations</h3>
            <p>Keep track of important changes and build a clearer record of each growing season.</p>
            <Sample label="Sample Plantly cost table comparing last season's input spend with this season's plan for five plots.">
              <CostTable plots={SAMPLE_PLAN.plots} />
            </Sample>
          </article>

          <article className="feature-card feature-card-later">
            <h3>Weather Tracking</h3>
            <p>Use local forecasts and relevant growing risks to plan work around changing conditions.</p>
            <p className="chip chip-later">Coming soon</p>
          </article>
        </div>
      </div>
    </section>
  )
}

interface BenefitCard { title: string; text: string; label: string; sample: ReactNode }
// Item 01 copy is from spec §6.3; item 02 and the card text are drafted from what the engine does.
// Irrigation and harvest-timing content was removed: the product has neither feature.
const BENEFITS: { id: string; title: string; desc: string; cards: BenefitCard[] }[] = [
  {
    id: 'harvest',
    title: 'Boost Harvest Output',
    desc: "Use your plot's soil results, previous crops, and seasonal goals to identify sensible nutrient and rotation decisions. Plantly helps you make these choices with clearer research context and budget trade-offs.",
    cards: [
      { title: 'Feeding Timed to Planting', text: 'Nitrogen is split around your planting date, with the amount and cost of each application.',
        label: 'Sample feeding schedule for sweet corn: at planting and two sidedress applications.',
        sample: <PlotCard plotPlan={plotWith('D', l => l.category === 'feeding' && !l.rule_id.startsWith('CRED-'))} cropName={cropName} /> },
      { title: 'Reduced Resource Waste', text: 'Picks the lowest-cost product for each nutrient and applies compost credits before purchased fertilizer.',
        label: 'Sample plan summary: plan cost against last season, and where the savings come from.',
        sample: <PlanSummary totals={SAMPLE_PLAN.totals} /> },
      { title: 'Crops That Fit Your Plots', text: "Choose what you want to grow; Plantly checks each bed's crop-family history before it plans.",
        label: 'Sample crop picker with cabbage, squash and sweet corn selected.',
        sample: <CropPicker crops={SAMPLE_CROPS.filter(c => ['cabbage', 'squash', 'sweet_corn', 'tomato', 'bush_bean', 'carrot'].includes(c.id))} selected={['cabbage', 'squash', 'sweet_corn']} onToggle={() => {}} /> },
    ],
  },
  {
    id: 'soil',
    title: 'Improve Soil Health',
    desc: "Build soil across seasons, not just for one crop. Plantly reads your soil test, credits the compost and legumes you already have, and flags rotation risks, with the source for each suggestion.",
    cards: [
      { title: 'Lime Toward Your Target pH', text: 'Lime amounts come from your soil test pH and soil texture, timed before planting.',
        label: 'Sample soil prep step: 125 lb of agricultural lime to raise pH from 5.8 toward 6.5.',
        sample: <PlotCard plotPlan={plotWith('B', l => l.category === 'soil')} cropName={cropName} /> },
      { title: 'Skip What Your Soil Has', text: 'When a test shows phosphorus or potassium is already high, the plan tells you to skip it.',
        label: 'Sample warnings: soil already rated very high for P and K, so skip them this season.',
        sample: <PlotCard plotPlan={plotWith('C', l => l.category === 'nutrient_warning')} cropName={cropName} /> },
      { title: 'Credit for Compost and Legumes', text: "Compost you spread and last year's beans count toward this season's nitrogen.",
        label: "Sample credits: nitrogen left by last year's bush beans and 0.8 cubic yards of compost.",
        sample: <PlotCard plotPlan={plotWith('E', l => l.rule_id.startsWith('CRED-'))} cropName={cropName} /> },
    ],
  },
]

function BenefitCarousel({ cards }: { cards: BenefitCard[] }) {
  const track = useRef<HTMLUListElement>(null)
  const [pos, setPos] = useState({ p: 0, w: 1 })

  const measure = useCallback(() => {
    const t = track.current
    if (!t) return
    const max = t.scrollWidth - t.clientWidth
    setPos({ p: max > 0 ? t.scrollLeft / max : 0, w: t.clientWidth / t.scrollWidth })
  }, [])
  useEffect(() => {
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [measure])

  const step = (dir: 1 | -1) => {
    const t = track.current
    const card = t?.firstElementChild as HTMLElement | null
    if (t && card) t.scrollBy({ left: dir * card.offsetWidth })
  }

  return (
    <div className="carousel">
      <ul className="carousel-track" ref={track} onScroll={measure} tabIndex={0} aria-label="Benefit examples, scroll sideways">
        {cards.map(c => (
          <li key={c.title} className="benefit-card">
            <Sample label={c.label}>{c.sample}</Sample>
            <div className="benefit-card-text">
              <h4>{c.title}</h4>
              <p>{c.text}</p>
            </div>
          </li>
        ))}
      </ul>
      <div className="carousel-controls">
        <button type="button" className="carousel-btn" onClick={() => step(-1)} disabled={pos.p <= 0.01} aria-label="Previous card">←</button>
        <div className="carousel-progress" aria-hidden="true">
          <span style={{ '--p': pos.p, '--w': pos.w } as CSSProperties} />
        </div>
        <button type="button" className="carousel-btn" onClick={() => step(1)} disabled={pos.p >= 0.99 || pos.w >= 1} aria-label="Next card">→</button>
      </div>
    </div>
  )
}

function BenefitsSection() {
  // Items open and close independently; opening one never collapses another.
  const [open, setOpen] = useState<Set<string>>(() => new Set(['harvest']))
  const toggle = (id: string) => setOpen(s => {
    const next = new Set(s)
    if (!next.delete(id)) next.add(id)
    return next
  })

  return (
    <section className="section" id="benefits" aria-labelledby="benefits-title">
      <div className="wrap">
        <h2 className="eyebrow" id="benefits-title">What You Get with Plantly</h2>
        <div className="accordion">
          {BENEFITS.map((b, i) => {
            const isOpen = open.has(b.id)
            return (
              <div key={b.id} className="acc-item">
                <h3>
                  <button
                    type="button"
                    className="acc-head"
                    id={`benefit-${b.id}-head`}
                    aria-expanded={isOpen}
                    aria-controls={`benefit-${b.id}-panel`}
                    onClick={() => toggle(b.id)}
                  >
                    <span className="acc-num">{String(i + 1).padStart(2, '0')}.</span>
                    <span className="acc-title">{b.title}</span>
                    <span className="acc-arrow" aria-hidden="true">{isOpen ? '↑' : '↓'}</span>
                  </button>
                </h3>
                {/* Always rendered so it can ease open and shut; inert while closed. */}
                <div className="acc-panel" id={`benefit-${b.id}-panel`} role="region" aria-labelledby={`benefit-${b.id}-head`} data-open={isOpen} inert={!isOpen}>
                  <div className="acc-panel-inner">
                    <p className="acc-desc">{b.desc}</p>
                    <BenefitCarousel cards={b.cards} />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

// Newsletter, social profiles, Contact, Help, Sample Plan, Terms and Privacy are omitted until they exist (spec §8).
function Footer({ onGetStarted }: Props) {
  return (
    <footer className="footer">
      <div className="wrap footer-grid">
        <div className="footer-brand">
          <p className="footer-logo"><span className="footer-mark" aria-hidden="true" />Plantly</p>
          <p className="footer-line">Professional Argonomist in your pocket.</p>
          <p className="footer-sub">Free. Research-backed. Every number traceable.</p>
        </div>
        <nav className="footer-links" aria-label="Footer">
          <div>
            <h2>Company</h2>
            <ul>
              <li><a href="#mission">Our Mission</a></li>
              <li><a href="#benefits">Benefits</a></li>
            </ul>
          </div>
          <div>
            <h2>Platform</h2>
            <ul>
              <li><a href="#how-it-works">How it works</a></li>
              <li><a href="#features">Key Features</a></li>
              <li><button type="button" onClick={onGetStarted}>Get Started</button></li>
            </ul>
          </div>
          <div>
            <h2>Resources</h2>
            <ul>
              <li><a href="#research">Research &amp; Sources</a></li>
            </ul>
          </div>
        </nav>
        <p className="footer-legal">© {new Date().getFullYear()} Plantly. All rights reserved.</p>
      </div>
    </footer>
  )
}

export default function LandingPage({ onGetStarted }: Props) {
  return (
    <div className="landing">
      <Hero onGetStarted={onGetStarted} />
      <main>
        <MissionSection />
        <HowItWorks onGetStarted={onGetStarted} />
        <FeaturesSection />
        <BenefitsSection />
      </main>
      <Footer onGetStarted={onGetStarted} />
    </div>
  )
}
