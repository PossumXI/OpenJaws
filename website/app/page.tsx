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
            <strong>OpenJaws // Q Agents</strong>
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
          <span className="eyebrow">Q AI OPERATORS // OPENJAWS // AGENT COMMAND CENTER</span>
          <h1>Q.</h1>
          <p className="hero-kicker">
            Give AI agents real tools, clear limits, and a record you can audit.
          </p>
          <p className="hero-copy-minimal">
            Q runs the work. OpenJaws shows the plan, actions, files, and
            receipts in one command center.
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
            <span>Current-date context</span>
            <span>Discord operator agents</span>
            <span>Auditable action receipts</span>
            <span>TerminalBench and BridgeBench receipts</span>
            <span>Apex app actions</span>
            <span>Human approval gates</span>
          </div>
        </div>

        <QHeroModel />
      </section>

      <section className="signal-row">
        <article className="signal-card">
          <span>OpenJaws</span>
          <strong>Command center for AI operator work.</strong>
        </article>
        <article className="signal-card">
          <span>Q Agents</span>
          <strong>Discord and terminal helpers that remember the mission.</strong>
        </article>
        <article className="signal-card">
          <span>Receipts</span>
          <strong>Every important action leaves a reviewable record.</strong>
        </article>
        <article className="signal-card">
          <span>Release gate</span>
          <strong>Checks run before public claims or deploys.</strong>
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
          <h2>Qline is where teams start with Q.</h2>
          <p>
            Create access, choose a plan, and connect to OpenJaws when work
            needs tools, files, Discord, or audit receipts.
          </p>

          <div className="asset-mini-grid">
            <article>
              <strong>AI operators</strong>
              <span>Give agents a place to work and report back.</span>
            </article>
            <article>
              <strong>Accountability</strong>
              <span>Review what happened before you trust the result.</span>
            </article>
            <article>
              <strong>Benchmarks</strong>
              <span>Publish results only from verified receipts.</span>
            </article>
          </div>
        </div>
      </section>

      <section className="feature-band" id="openjaws">
        <div className="section-heading">
          <span className="eyebrow">OpenJaws</span>
          <h2>AI operators need a control center.</h2>
          <p>
            OpenJaws connects Q, Discord agents, local tools, browser previews,
            and approval gates so people can supervise real work from one place.
          </p>
        </div>

        <div className="feature-grid">
          <article className="feature-card">
            <span>Q Agents</span>
            <strong>Put agents to work from Discord or the terminal.</strong>
            <p>
              Agents can take scoped tasks, use approved roots, and return
              files, summaries, and receipts.
            </p>
          </article>
          <article className="feature-card">
            <span>Agent Co-Work</span>
            <strong>Keep the team on the same job.</strong>
            <p>
              Shared project memory helps new agents pick up the right work
              without repeating setup.
            </p>
          </article>
          <article className="feature-card">
            <span>Immaculate</span>
            <strong>See orchestration as it happens.</strong>
            <p>
              Route state, worker health, and trace summaries stay visible in
              OpenJaws instead of being hidden in background processes.
            </p>
          </article>
          <article className="feature-card">
            <span>Benchmarks</span>
            <strong>Show the work behind performance claims.</strong>
            <p>
              BridgeBench, TerminalBench, soak runs, W&B targets, seeds, and
              preflight checks are tied to receipts people can inspect.
            </p>
          </article>
          <article className="feature-card">
            <span>Apex bridge</span>
            <strong>Connect AI work to useful apps.</strong>
            <p>
              OpenJaws can reach approved Apex surfaces for mail, chat, store,
              security, system status, browser, and Chrono backup actions.
            </p>
          </article>
          <article className="feature-card">
            <span>Apex guardrails</span>
            <strong>Keep sensitive actions supervised.</strong>
            <p>
              High-risk app actions stay behind narrow bridges, confirmation
              points, and audit records.
            </p>
          </article>
          <article className="feature-card">
            <span>Accountable preview</span>
            <strong>Browse with a reason trail.</strong>
            <p>
              Browser previews can keep intent, requester, handler, and result
              visible when an agent uses the web.
            </p>
          </article>
          <article className="feature-card">
            <span>Q media boundary</span>
            <strong>Use the right model for the right job.</strong>
            <p>
              Q handles reasoning and orchestration. Image, video, and voice
              generation stay on explicit lanes with their own receipts.
            </p>
          </article>
          <article className="feature-card">
            <span>Release hardening</span>
            <strong>Make public launches harder to get wrong.</strong>
            <p>
              Build checks, deploy checks, benchmark snapshots, and hygiene
              scans run before a release is treated as ready.
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
          <h2>Choose your Q access.</h2>
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
          <h2>Start with a key. Scale with receipts.</h2>
          <p>
            Plans, credits, keys, usage, and checkout stay simple for users and
            controlled on the server.
          </p>
        </div>

        <QLandingConsole />
      </section>

      <section className="cowork-band">
        <div className="cowork-copy">
          <span className="eyebrow">Agent Co-Work</span>
          <h2>One mission. Many agents. Clear handoffs.</h2>
          <p>
            Each agent keeps its own workspace identity while shared phase
            memory keeps the mission, project, and deliverables easy to follow.
          </p>
        </div>

        <div className="cowork-stack">
          <article>
            <strong>Shared terminal registry</strong>
            <p>Project roots, runtime facts, and context IDs stay reusable.</p>
          </article>
          <article>
            <strong>Phase memory</strong>
            <p>Requests, handoffs, and delivered outputs stay attached.</p>
          </article>
          <article>
            <strong>Cleaner handoffs</strong>
            <p>New work can bind to the right saved phase on purpose.</p>
          </article>
        </div>
      </section>

      <section className="service-note">
        <div className="service-note-copy">
          <span className="eyebrow">Server-Owned Controls</span>
          <h2>Billing, access, and usage stay protected.</h2>
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
