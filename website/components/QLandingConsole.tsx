'use client'

import Image from 'next/image'
import { useMemo, useState } from 'react'

type ConsoleAction = 'signup' | 'checkout' | 'keys' | 'usage'

type ConsoleSnapshot = {
  storage: string | null
  plan: string | null
  subscriptionStatus: string | null
  creditsRemaining: number | null
  rateLimit: string | null
  apiKey: string | null
  useHint: string | null
}

type ConsoleState = {
  email: string
  plan: 'starter' | 'builder' | 'operator'
  credits: number
  message: string | null
  loading: boolean
  snapshot: ConsoleSnapshot | null
}

const defaultState: ConsoleState = {
  email: '',
  plan: 'builder',
  credits: 120,
  message: null,
  loading: false,
  snapshot: null,
}

export function QLandingConsole(): React.ReactNode {
  const [state, setState] = useState<ConsoleState>(defaultState)

  const usagePercent = useMemo(
    () => Math.min(100, Math.round((state.credits / 300) * 100)),
    [state.credits],
  )

  async function runAction(action: ConsoleAction): Promise<void> {
    setState(current => ({ ...current, loading: true, message: null }))
    try {
      const response = await fetch(`/api/${action}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          email: state.email,
          plan: state.plan,
          credits: state.credits,
        }),
      })
      const payload = (await response.json()) as {
        ok?: boolean
        message?: string
        url?: string
        apiKey?: string
        useHint?: string
        storage?: string
        user?: {
          plan?: string
          subscriptionStatus?: string
          creditsRemaining?: number
        }
      }

      if (action === 'checkout' && typeof payload.url === 'string') {
        window.location.assign(payload.url)
        return
      }

      const rateLimitLimit = response.headers.get('x-ratelimit-limit')
      const rateLimitRemaining = response.headers.get('x-ratelimit-remaining')
      const rateLimit =
        rateLimitLimit && rateLimitRemaining
          ? `${rateLimitRemaining} / ${rateLimitLimit} rpm left`
          : null

      setState(current => ({
        ...current,
        loading: false,
        message:
          payload.message ??
          'Website shell is live. Connect your billing and entitlement service next.',
        snapshot: {
          storage: typeof payload.storage === 'string' ? payload.storage : null,
          plan: typeof payload.user?.plan === 'string' ? payload.user.plan : null,
          subscriptionStatus:
            typeof payload.user?.subscriptionStatus === 'string'
              ? payload.user.subscriptionStatus
              : null,
          creditsRemaining:
            typeof payload.user?.creditsRemaining === 'number'
              ? payload.user.creditsRemaining
              : null,
          rateLimit,
          apiKey: typeof payload.apiKey === 'string' ? payload.apiKey : null,
          useHint: typeof payload.useHint === 'string' ? payload.useHint : null,
        },
      }))
    } catch (error) {
      setState(current => ({
        ...current,
        loading: false,
        message:
          error instanceof Error ? error.message : 'Website action failed.',
      }))
    }
  }

  return (
    <section className="console-shell" aria-label="Q access console">
      <div className="console-panel">
        <div className="console-header">
          <span className="console-dot" />
          <span>Q Access Console</span>
        </div>

        <div className="console-emblem">
          <Image
            src="/assets/images/q-emblem.png"
            alt="Q access emblem"
            width={1200}
            height={1200}
          />
        </div>

        <label className="console-label">
          Email
          <input
            className="console-input"
            type="email"
            placeholder="captain@arobi.ai"
            value={state.email}
            onChange={event =>
              setState(current => ({ ...current, email: event.target.value }))
            }
          />
        </label>

        <label className="console-label">
          Plan
          <select
            className="console-input"
            value={state.plan}
            onChange={event =>
              setState(current => ({
                ...current,
                plan: event.target.value as ConsoleState['plan'],
              }))
            }
          >
            <option value="starter">Starter</option>
            <option value="builder">Builder</option>
            <option value="operator">Operator</option>
          </select>
        </label>

        <label className="console-label">
          Monthly credit target
          <input
            className="console-range"
            type="range"
            min="25"
            max="300"
            step="5"
            value={state.credits}
            onChange={event =>
              setState(current => ({
                ...current,
                credits: Number(event.target.value),
              }))
            }
          />
          <span className="console-inline-note">{state.credits} credits</span>
        </label>

        <div className="console-actions">
          <button
            className="console-button"
            disabled={state.loading}
            onClick={() => void runAction('signup')}
          >
            Sign Up
          </button>
          <button
            className="console-button console-button-alt"
            disabled={state.loading}
            onClick={() => void runAction('checkout')}
          >
            Checkout
          </button>
          <button
            className="console-button console-button-alt"
            disabled={state.loading}
            onClick={() => void runAction('keys')}
          >
            Generate API Key
          </button>
          <button
            className="console-button console-button-alt"
            disabled={state.loading}
            onClick={() => void runAction('usage')}
          >
            View Usage
          </button>
        </div>

        <p className="console-message">
          {state.message ??
            'Frontend is ready. Attach the real service when you are ready to issue keys and charge for the heavy lane.'}
        </p>

        {state.snapshot ? (
          <div className="console-snapshot">
            <div className="console-snapshot-grid">
              <article>
                <span>Plan</span>
                <strong>{state.snapshot.plan ?? 'n/a'}</strong>
              </article>
              <article>
                <span>Status</span>
                <strong>{state.snapshot.subscriptionStatus ?? 'n/a'}</strong>
              </article>
              <article>
                <span>Credits</span>
                <strong>
                  {state.snapshot.creditsRemaining ?? 'n/a'}
                </strong>
              </article>
              <article>
                <span>Rate Limit</span>
                <strong>{state.snapshot.rateLimit ?? 'n/a'}</strong>
              </article>
            </div>

            {state.snapshot.apiKey ? (
              <div className="console-secret">
                <span>Generated Key</span>
                <code>{state.snapshot.apiKey}</code>
              </div>
            ) : null}

            {state.snapshot.useHint ? (
              <div className="console-secret">
                <span>OpenJaws Hint</span>
                <code>{state.snapshot.useHint}</code>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="console-panel console-panel-metrics">
        <div className="console-header">
          <span className="console-dot console-dot-gold" />
          <span>Service Snapshot</span>
        </div>
        <div className="metric-grid">
          <article className="metric-card">
            <span className="metric-label">Starter lane</span>
            <strong>25 free credits</strong>
            <p>Enough to feel the surface.</p>
          </article>
          <article className="metric-card">
            <span className="metric-label">Paid lane</span>
            <strong>Metered heavy use</strong>
            <p>Longer sessions and real traffic.</p>
          </article>
          <article className="metric-card">
            <span className="metric-label">Discord exception</span>
            <strong>No-charge surface</strong>
            <p>Free if you want it. Still moderated.</p>
          </article>
        </div>

        <div className="usage-block">
          <div className="usage-heading">
            <span>Monthly usage preview</span>
            <strong>{usagePercent}% of target</strong>
          </div>
          <div className="usage-bar">
            <span style={{ width: `${usagePercent}%` }} />
          </div>
          <div className="usage-meta">
            <span>API keys: service-owned</span>
            <span>Reset: monthly</span>
            <span>Rate limits: enforced server-side</span>
          </div>
        </div>
      </div>
    </section>
  )
}
