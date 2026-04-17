import Image from 'next/image'
import { BenchmarkSnapshotSection } from '../components/BenchmarkSnapshot'
import { QLandingConsole } from '../components/QLandingConsole'
import { QHeroModel } from '../components/QHeroModel'
import { Q_PLAN_DEFINITIONS } from '../lib/pricing'

const auraGenesisUrl =
  process.env.NEXT_PUBLIC_AURA_GENESIS_URL ?? 'https://aura-genesis.org'
const githubUrl = 'https://github.com/PossumXI/OpenJaws'

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
            <strong>OpenJaws // Q_agents</strong>
          </div>
        </a>

        <div className="topbar-actions">
          <a className="topbar-link" href={githubUrl} target="_blank" rel="noreferrer">
            GitHub
          </a>
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
          <span className="eyebrow">OPENJAWS // OCI Q // Q_AGENTS // AGENT CO-WORK</span>
          <h1>Q.</h1>
          <p className="hero-kicker">OpenJaws for serious terminals.</p>
          <p className="hero-copy-minimal">
            Q_agents, co-work memory, routed tools, hosted access. One visible
            control layer.
          </p>

          <div className="hero-actions">
            <a className="hero-button" href="#plans">
              View Plans
            </a>
            <a
              className="hero-button hero-button-alt"
              href={githubUrl}
              target="_blank"
              rel="noreferrer"
            >
              GitHub
            </a>
            <a className="hero-button hero-button-alt" href="#benchmarks">
              Benchmarks
            </a>
          </div>

          <div className="hero-rail">
            <span>OCI Q default</span>
            <span>Agent Co-Work live</span>
            <span>Release-checked qline.site</span>
            <span>Public + soak TerminalBench receipts</span>
          </div>
        </div>

        <QHeroModel />
      </section>

      <section className="signal-row">
        <article className="signal-card">
          <span>OpenJaws</span>
          <strong>Terminal-first control deck.</strong>
        </article>
        <article className="signal-card">
          <span>Q_agents</span>
          <strong>Helpers that keep phase memory.</strong>
        </article>
        <article className="signal-card">
          <span>Receipts</span>
          <strong>Benchmark, soak, and route truth stays visible.</strong>
        </article>
      </section>

      <section className="asset-band">
        <div className="asset-poster-card">
          <Image
            src="/assets/images/q-share-card.png"
            alt="Qline site preview"
            width={1600}
            height={900}
            priority
          />
        </div>

        <div className="asset-copy">
          <span className="eyebrow">Public Surface</span>
          <h2>Qline is the front door. OpenJaws is the machine room.</h2>
          <p>
            Hosted keys and credits on the front end. OpenJaws, Q_agents,
            Immaculate, and Agent Co-Work behind it.
          </p>

          <div className="asset-mini-grid">
            <article>
              <strong>OpenJaws</strong>
              <span>Tools, crews, routing, receipts.</span>
            </article>
            <article>
              <strong>Q_agents</strong>
              <span>Helpers with co-work memory.</span>
            </article>
            <article>
              <strong>Public repo</strong>
              <span>GitHub-linked and benchmarked.</span>
            </article>
          </div>
        </div>
      </section>

      <section className="feature-band" id="openjaws">
        <div className="section-heading">
          <span className="eyebrow">OpenJaws</span>
          <h2>The cockpit behind Q.</h2>
          <p>
            OpenJaws is the terminal workspace. Q is the default mind. Q_agents
            make it collaborative instead of lonely.
          </p>
        </div>

        <div className="feature-grid">
          <article className="feature-card">
            <span>Q_agents</span>
            <strong>Spawn helpers that actually stay coordinated.</strong>
            <p>One crew, one visible deck, one source of truth for progress.</p>
          </article>
          <article className="feature-card">
            <span>Agent Co-Work</span>
            <strong>Reuse terminal, phase, and project context.</strong>
            <p>
              Hot registry plus phase memory so sibling agents stop
              re-discovering the same work every handoff.
            </p>
          </article>
          <article className="feature-card">
            <span>Immaculate</span>
            <strong>Keep orchestration visible.</strong>
            <p>Routing, pacing, and worker state stay inspectable instead of implied.</p>
          </article>
          <article className="feature-card">
            <span>Benchmarks</span>
            <strong>BridgeBench, soak, and Harbor receipts.</strong>
            <p>
              Local tuning plus official public and repeated TerminalBench
              receipts.
            </p>
          </article>
        </div>

        <div className="feature-actions">
          <a className="hero-button" href={githubUrl} target="_blank" rel="noreferrer">
            OpenJaws on GitHub
          </a>
          <a className="hero-button hero-button-alt" href="#benchmarks">
            See benchmark snapshot
          </a>
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
          <span className="eyebrow">Hosted lane</span>
          <h2>Sign up. Checkout. Keys. Usage.</h2>
          <p>
            Clean public access on the front end. Real entitlements stay
            server-side.
          </p>
        </div>

        <QLandingConsole />
      </section>

      <section className="cowork-band">
        <div className="cowork-copy">
          <span className="eyebrow">Agent Co-Work</span>
          <h2>One crew. Multiple terminals. Same thread.</h2>
          <p>
            Active terminals keep their own IDs, but the phase memory stays
            shared. That means cross-project help can keep the context that
            matters instead of resetting every handoff.
          </p>
        </div>

        <div className="cowork-stack">
          <article>
            <strong>Shared terminal registry</strong>
            <p>Project roots, runtime facts, and context IDs stay reusable.</p>
          </article>
          <article>
            <strong>Phase memory</strong>
            <p>Requests, handoffs, and delivered outputs stay attached to one thread.</p>
          </article>
          <article>
            <strong>Exact phase reuse</strong>
            <p>New work can bind to the right saved phase on purpose.</p>
          </article>
        </div>
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
          <a
            className="topbar-link"
            href={githubUrl}
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
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
