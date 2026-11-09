interface Props {
  onGetStarted: () => void
}

export default function LandingPage({ onGetStarted }: Props) {
  return (
    <div className="landing">
      {/* Hero */}
      <header className="landing-header">
        <div className="landing-nav">
          <div className="landing-brand">
            <span className="landing-logo">🌱</span>
            <span className="landing-name">Plantly</span>
          </div>
          <button className="landing-login-btn" onClick={onGetStarted}>Log in</button>
        </div>

        <div className="landing-hero">
          <h1>Grow smarter,<br />spend less.</h1>
          <p className="landing-subtitle">
            Research-backed soil plans that cut fertilizer costs by 66% and synthetic nitrogen by 80%.
            No guesswork — every recommendation traces to a university source.
          </p>
          <button className="landing-cta" onClick={onGetStarted}>
            Try Now — It's Free
          </button>
          <p className="landing-hint">No credit card needed</p>
        </div>
      </header>

      {/* Stats bar */}
      <section className="landing-stats">
        <div className="landing-stat">
          <span className="landing-stat-number">66%</span>
          <span className="landing-stat-label">Cost savings</span>
        </div>
        <div className="landing-stat">
          <span className="landing-stat-number">80%</span>
          <span className="landing-stat-label">Less synthetic N</span>
        </div>
        <div className="landing-stat">
          <span className="landing-stat-number">15+</span>
          <span className="landing-stat-label">Research sources</span>
        </div>
        <div className="landing-stat">
          <span className="landing-stat-number">44</span>
          <span className="landing-stat-label">Engine tests pass</span>
        </div>
      </section>

      {/* How it works */}
      <section className="landing-section">
        <h2>How it works</h2>
        <div className="landing-steps">
          <div className="landing-step">
            <div className="landing-step-num">1</div>
            <div className="landing-step-icon">💬</div>
            <h3>Tell us about your farm</h3>
            <p>Describe your plots in plain English or upload a soil test PDF. Our AI extracts the data — no forms to fill.</p>
          </div>
          <div className="landing-step-arrow">→</div>
          <div className="landing-step">
            <div className="landing-step-num">2</div>
            <div className="landing-step-icon">✅</div>
            <h3>Review and confirm</h3>
            <p>Check the extracted data, pick your crops with emoji cards, adjust soil readings. Hit generate.</p>
          </div>
          <div className="landing-step-arrow">→</div>
          <div className="landing-step">
            <div className="landing-step-num">3</div>
            <div className="landing-step-icon">📋</div>
            <h3>Get your plan</h3>
            <p>Lime, fertilizer, timing, cost breakdown — every line sourced. Ask "Why?" on any recommendation.</p>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="landing-section landing-features">
        <h2>Not another AI guessing tool</h2>
        <p className="landing-section-sub">The engine is deterministic math from university extension services. AI handles the conversation, not the chemistry.</p>
        <div className="landing-feature-grid">
          <div className="landing-feature">
            <span className="landing-feature-icon">🧪</span>
            <h3>Real agronomic math</h3>
            <p>N-P-K rates from the SE Vegetable Handbook. Soil test levels from UGA crop sheets. Compost credits from WSU formulas.</p>
          </div>
          <div className="landing-feature">
            <span className="landing-feature-icon">📖</span>
            <h3>Every line is cited</h3>
            <p>Tap "Why?" on any recommendation and see the rule ID, source, and the university publication it came from.</p>
          </div>
          <div className="landing-feature">
            <span className="landing-feature-icon">💰</span>
            <h3>Cost optimization</h3>
            <p>The engine picks the cheapest product for each nutrient. Compost offsets reduce purchased fertilizer first.</p>
          </div>
          <div className="landing-feature">
            <span className="landing-feature-icon">🔄</span>
            <h3>Rotation-aware</h3>
            <p>Tracks crop families across years. Flags disease and pest risks. Suggests alternatives with side-by-side cost comparison.</p>
          </div>
          <div className="landing-feature">
            <span className="landing-feature-icon">🆘</span>
            <h3>Emergency Q&A</h3>
            <p>"We had 10 days of rain" — get sourced answers about nitrogen leaching, disease pressure, and recovery steps.</p>
          </div>
          <div className="landing-feature">
            <span className="landing-feature-icon">✔️</span>
            <h3>Track what you did</h3>
            <p>Mark items done, log actual amounts via chat, compare planned vs actual. Your records carry forward to next season.</p>
          </div>
        </div>
      </section>

      {/* Sources */}
      <section className="landing-section landing-sources">
        <h2>Backed by research, not vibes</h2>
        <div className="landing-source-list">
          <span>UGA Extension</span>
          <span>Clemson HGIC</span>
          <span>SE Veg Handbook</span>
          <span>SARE</span>
          <span>WSU Extension</span>
          <span>USDA NRCS</span>
          <span>Oregon State</span>
          <span>UW Madison</span>
          <span>NC State</span>
          <span>UMN Extension</span>
        </div>
      </section>

      {/* CTA */}
      <section className="landing-section landing-bottom-cta">
        <h2>Your extension agent in your pocket.</h2>
        <p>Free. Research-backed. Every number traceable.</p>
        <button className="landing-cta" onClick={onGetStarted}>
          Get Started
        </button>
      </section>

      <footer className="landing-footer">
        <span>Plantly</span>
        <span>Built at a hackathon with 🌱</span>
      </footer>
    </div>
  )
}
