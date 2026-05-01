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
            Work with Q and helpers, keep project context in one place, and
            manage access from one screen.
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
            <span>Published benchmark results</span>
            <span>Signed activity records</span>
            <span>Repeatable release checks</span>
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
          <strong>Helpers that keep shared notes.</strong>
        </article>
        <article className="signal-card">
          <span>Records</span>
          <strong>Benchmark and release history stays visible.</strong>
        </article>
        <article className="signal-card">
          <span>Release gate</span>
          <strong>Coverage floor plus dead-file scan before ship.</strong>
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
            Sign up, manage credits, and connect to OpenJaws, Q_agents,
            Immaculate, and Agent Co-Work from one place.
          </p>

          <div className="asset-mini-grid">
            <article>
              <strong>OpenJaws</strong>
              <span>Tools, helpers, and release checks.</span>
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
          <h2>The workspace behind Q.</h2>
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
            <strong>Reuse terminal, notes, and project context.</strong>
            <p>
              Shared notes help agents avoid repeating the same setup work.
            </p>
          </article>
          <article className="feature-card">
            <span>Immaculate</span>
            <strong>Keep orchestration visible.</strong>
            <p>
              See what is running, what finished, and what needs attention in
              one status view.
            </p>
          </article>
          <article className="feature-card">
            <span>Benchmarks</span>
            <strong>BridgeBench, soak, and public TerminalBench results.</strong>
            <p>
              Benchmark runs are recorded with the model, task, result, and
              date so results can be compared later.
            </p>
          </article>
          <article className="feature-card">
            <span>Apex bridge</span>
            <strong>Bounded local command-center lane.</strong>
            <p>
              `/apex` can fuse a trusted local workspace bridge for mail,
              chat, store, security, and system actions, plus a dedicated
              Chrono backup bridge for job creation, run, restore, and cleanup
              without pretending every desktop action can run inside the
              website.
            </p>
          </article>
          <article className="feature-card">
            <span>Apex guardrails</span>
            <strong>Clear approvals for sensitive actions.</strong>
            <p>
              Notifications and Argus stay outside generic agent control until
              they have clear approvals, local connections, and activity logs.
            </p>
          </article>
          <article className="feature-card">
            <span>Accountable preview</span>
            <strong>Real browser preview with history.</strong>
            <p>
              `/preview` opens local apps, research, and supervised watch/music
              sessions through a real browser path while keeping the reason and
              requester visible.
            </p>
          </article>
          <article className="feature-card">
            <span>Q media boundary</span>
            <strong>Reasoning stays Q. Media stays explicit.</strong>
            <p>
              OCI Q owns chat, reasoning, and orchestration. When image or
              video generation is needed, it stays on a separate explicit media
              lane instead of silently swapping the mind behind the session.
            </p>
          </article>
          <article className="feature-card">
            <span>Release hardening</span>
            <strong>Ship checks fail closed.</strong>
            <p>
              Same-site qline deploy checks, scoped test lanes, and bounded
              hygiene gates now run before public ship calls are treated as
              clean.
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
          <h2>Sign up, choose a plan, and view usage.</h2>
          <p>
            Create access, manage credits, and get your Q key from one place.
          </p>
        </div>

        <QLandingConsole />
      </section>

      <section className="cowork-band">
        <div className="cowork-copy">
          <span className="eyebrow">Agent Co-Work</span>
          <h2>One crew. Multiple terminals. Same thread.</h2>
          <p>
            Agents can work in separate terminals while sharing the notes that
            matter, so they do not reset context at every handoff.
          </p>
        </div>

        <div className="cowork-stack">
          <article>
            <strong>Shared terminal registry</strong>
            <p>Project folders and chat context stay reusable.</p>
          </article>
          <article>
            <strong>Shared notes</strong>
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
          <h2>Billing and usage are handled securely.</h2>
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
            <p>Rate limits, usage history, and monthly reports.</p>
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
