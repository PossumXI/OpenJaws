import Image from 'next/image'
import { BenchmarkSnapshotSection } from '../components/BenchmarkSnapshot'
import { QLandingConsole } from '../components/QLandingConsole'
import { QHeroModel } from '../components/QHeroModel'
import { Q_PLAN_DEFINITIONS } from '../lib/pricing'

const auraGenesisUrl =
  process.env.NEXT_PUBLIC_AURA_GENESIS_URL ?? 'https://aura-genesis.org'

export default function Page(): React.ReactNode {
  return (
    <main className="page-shell">
      <div className="page-backdrop" />
      <div className="page-noise" />

      <header className="topbar">
        <a className="brand-lockup" href="/">
          <Image
            src="/assets/images/q-emblem.png"
            alt="Q emblem"
            width={1200}
            height={1200}
          />
          <div>
            <span>Q</span>
            <strong>Hosted access</strong>
          </div>
        </a>

        <div className="topbar-actions">
          <a className="topbar-link" href="#console">
            Open Console
          </a>
          <a
            className="hero-button hero-button-alt"
            href={auraGenesisUrl}
            target="_blank"
            rel="noreferrer"
          >
            Meet Arobi
          </a>
        </div>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">OCI Q // IMMACULATE // HOSTED ACCESS</span>
          <h1>Q.</h1>
          <p className="hero-kicker">Less noise. More signal.</p>
          <p className="hero-copy-minimal">
            Keys. Credits. Limits. One visible surface.
          </p>

          <div className="hero-actions">
            <a className="hero-button" href="#plans">
              View Plans
            </a>
            <a className="hero-button hero-button-alt" href="#console">
              Open Console
            </a>
          </div>

          <div className="hero-rail">
            <span>Real OCI path</span>
            <span>Metered hosted lane</span>
            <span>Discord stays separate</span>
          </div>
        </div>

        <QHeroModel />
      </section>

      <section className="signal-row">
        <article className="signal-card">
          <span>Access</span>
          <strong>Bring your own key or buy the hosted lane.</strong>
        </article>
        <article className="signal-card">
          <span>Control</span>
          <strong>Immaculate stays visible.</strong>
        </article>
        <article className="signal-card">
          <span>Boundary</span>
          <strong>No blurred entitlement story.</strong>
        </article>
      </section>

      <section className="asset-band">
        <div className="asset-poster-card">
          <Image
            src="/assets/images/q-poster.png"
            alt="Q poster"
            width={1600}
            height={2000}
            priority
          />
        </div>

        <div className="asset-copy">
          <span className="eyebrow">Hosted Q</span>
          <h2>Free to try. Paid to push.</h2>
          <p>
            Public installs should not inherit internal operator access. Q can
            be generous on day one and still meter the heavy lane honestly.
          </p>

          <div className="asset-mini-grid">
            <article>
              <strong>Free credit</strong>
              <span>Small monthly grant.</span>
            </article>
            <article>
              <strong>API keys</strong>
              <span>Server-owned and revocable.</span>
            </article>
            <article>
              <strong>Rate limits</strong>
              <span>Per key. Per lane. Visible.</span>
            </article>
          </div>
        </div>
      </section>

      <section className="plans" id="plans">
        <div className="section-heading">
          <span className="eyebrow">Plans</span>
          <h2>Choose the lane.</h2>
        </div>

        <div className="plan-grid">
          {Q_PLAN_DEFINITIONS.map(plan => (
            <article key={plan.id} className="plan-card">
              <span className="plan-name">{plan.name}</span>
              <strong>{plan.price}</strong>
              <em>{plan.note}</em>
              <ul>
                {plan.points.map(point => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="console-anchor" id="console">
        <div className="section-heading">
          <span className="eyebrow">Console</span>
          <h2>Sign up. Checkout. Keys. Usage.</h2>
          <p>
            Frontend first. Backend next. No fake billing story in the middle.
          </p>
        </div>

        <QLandingConsole />
      </section>

      <section className="service-note">
        <div className="service-note-copy">
          <span className="eyebrow">Still Backend-Owned</span>
          <h2>The expensive truth belongs server-side.</h2>
        </div>

        <div className="service-grid">
          <article>
            <strong>Billing</strong>
            <p>Plans, subscriptions, overage, wallets.</p>
          </article>
          <article>
            <strong>Entitlements</strong>
            <p>Credits, resets, suspension, abuse controls.</p>
          </article>
          <article>
            <strong>Usage</strong>
            <p>RPM, TPM, audit receipts, and monthly reporting.</p>
          </article>
        </div>
      </section>

      <BenchmarkSnapshotSection />

      <footer className="site-footer">
        <div className="site-footer-copy">
          <span>Q // OpenJaws // Immaculate</span>
          <strong>
            Arobi Technology Alliance A Opal Mar Group Corporation Company all
            rights reserved
          </strong>
        </div>

        <div className="site-footer-actions">
          <a className="topbar-link" href="#plans">
            Plans
          </a>
          <a className="topbar-link" href="/terms">
            Terms
          </a>
          <a className="topbar-link" href="/privacy">
            Privacy
          </a>
          <a
            className="hero-button hero-button-alt"
            href={auraGenesisUrl}
            target="_blank"
            rel="noreferrer"
          >
            Meet Arobi
          </a>
        </div>
      </footer>
    </main>
  )
}
