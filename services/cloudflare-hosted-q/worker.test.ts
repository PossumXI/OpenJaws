import { afterEach, describe, expect, test } from 'bun:test'
import { handleRequest, type WorkerEnv } from './src/worker.ts'

type UserRow = Record<string, unknown> & { email: string }
type KeyRow = Record<string, unknown> & { email: string; revoked_at: string | null }
type LedgerRow = Record<string, unknown> & { visibility: string; created_at: string }
type MailRow = Record<string, unknown>

class MemoryStatement {
  private values: unknown[] = []

  constructor(
    private readonly db: MemoryD1,
    private readonly query: string,
  ) {}

  bind(...values: unknown[]): MemoryStatement {
    this.values = values
    return this
  }

  async first<T>(): Promise<T | null> {
    if (this.query.startsWith('SELECT * FROM hosted_q_users')) {
      if (this.query.includes('stripe_customer_id')) {
        const customerId = String(this.values[0])
        return (
          Array.from(this.db.users.values()).find(
            user => user.stripe_customer_id === customerId,
          ) ?? null
        ) as T | null
      }
      return (this.db.users.get(String(this.values[0])) ?? null) as T | null
    }
    return null
  }

  async all<T>(): Promise<{ results: T[] }> {
    if (this.query.startsWith('SELECT id, email, label, key_prefix')) {
      const email = String(this.values[0])
      return {
        results: this.db.keys.filter(key => key.email === email) as T[],
      }
    }
    if (this.query.includes('FROM laas_ledger_events')) {
      const visibility = String(this.values[0])
      const limit = Number(this.values[1])
      return {
        results: this.db.ledger
          .filter(event => event.visibility === visibility)
          .sort((left, right) => right.created_at.localeCompare(left.created_at))
          .slice(0, limit) as T[],
      }
    }
    return { results: [] }
  }

  async run(): Promise<{ success: boolean }> {
    if (this.query.includes('INSERT INTO hosted_q_users')) {
      const user: UserRow = {
        email: String(this.values[0]),
        plan: this.values[1],
        subscription_status: this.values[2],
        monthly_credits: this.values[3],
        credits_remaining: this.values[4],
        requests_this_month: this.values[5],
        tokens_this_month: this.values[6],
        resets_at: this.values[7],
        created_at: this.values[8],
        updated_at: this.values[9],
        stripe_customer_id: this.values[10],
        stripe_subscription_id: this.values[11],
      }
      this.db.users.set(user.email, user)
    } else if (this.query.includes('INSERT INTO hosted_q_api_keys')) {
      this.db.keys.push({
        id: String(this.values[0]),
        email: String(this.values[1]),
        label: this.values[2] as string | null,
        key_prefix: String(this.values[3]),
        key_hash: String(this.values[4]),
        created_at: String(this.values[5]),
        last_used_at: this.values[6] as string | null,
        revoked_at: this.values[7] as string | null,
      })
    } else if (this.query.includes('INSERT INTO hosted_q_usage_events')) {
      this.db.usage.push({ id: String(this.values[0]), email: String(this.values[1]) })
    } else if (this.query.includes('INSERT INTO laas_ledger_events')) {
      this.db.ledger.push({
        id: String(this.values[0]),
        kind: String(this.values[1]),
        actor: String(this.values[2]),
        subject: String(this.values[3]),
        visibility: String(this.values[4]),
        payload_json: String(this.values[5]),
        created_at: String(this.values[6]),
      })
    } else if (this.query.includes('INSERT INTO mail_receipts')) {
      this.db.mail.push({
        id: String(this.values[0]),
        provider: String(this.values[1]),
        status: String(this.values[4]),
      })
    }
    return { success: true }
  }
}

class MemoryD1 {
  readonly users = new Map<string, UserRow>()
  readonly keys: KeyRow[] = []
  readonly usage: Record<string, unknown>[] = []
  readonly ledger: LedgerRow[] = []
  readonly mail: MailRow[] = []

  prepare(query: string): MemoryStatement {
    return new MemoryStatement(this, query)
  }
}

function request(path: string, init: RequestInit = {}): Request {
  return new Request(`https://api.qline.site${path}`, init)
}

const originalFetch = globalThis.fetch

async function jsonBody(response: Response): Promise<Record<string, unknown>> {
  return await response.json() as Record<string, unknown>
}

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('cloudflare-hosted-q worker', () => {
  test('reports health and missing D1 binding separately', async () => {
    const health = await handleRequest(request('/health'), {})
    expect(health.status).toBe(200)
    expect(await jsonBody(health)).toMatchObject({
      ok: true,
      storage: 'missing-d1-binding',
    })

    const signup = await handleRequest(
      request('/signup', {
        method: 'POST',
        body: JSON.stringify({ email: 'user@example.com' }),
      }),
      {},
    )
    expect(signup.status).toBe(503)
    expect(await jsonBody(signup)).toMatchObject({ code: 'database_not_bound' })
  })

  test('signs up a starter user, issues one key, and returns usage', async () => {
    const env: WorkerEnv = { Q_HOSTED_DB: new MemoryD1() }
    const signup = await handleRequest(
      request('/signup', {
        method: 'POST',
        body: JSON.stringify({ email: 'User@Example.com', plan: 'starter' }),
      }),
      env,
    )
    expect(signup.status).toBe(200)

    const key = await handleRequest(
      request('/keys', {
        method: 'POST',
        body: JSON.stringify({ email: 'user@example.com', label: 'desktop' }),
      }),
      env,
    )
    const keyPayload = await jsonBody(key)
    expect(key.status).toBe(200)
    expect(String(keyPayload.apiKey)).toStartWith('qk_')
    expect(JSON.stringify(env.Q_HOSTED_DB)).not.toContain(String(keyPayload.apiKey))

    const usage = await handleRequest(
      request('/usage', {
        method: 'POST',
        body: JSON.stringify({ email: 'user@example.com' }),
      }),
      env,
    )
    expect(usage.status).toBe(200)
    expect(await jsonBody(usage)).toMatchObject({
      ok: true,
      storage: 'cloudflare-d1',
    })
  })

  test('creates Stripe checkout sessions through the worker billing route', async () => {
    const env: WorkerEnv = {
      Q_HOSTED_DB: new MemoryD1(),
      SERVICE_TOKEN: 'service-token',
      STRIPE_SECRET_KEY: 'stripe-secret-unit-test',
      STRIPE_PUBLISHABLE_KEY: 'stripe-publishable-unit-test',
      STRIPE_PRICE_BUILDER: 'price_builder_unit',
      STRIPE_SUCCESS_URL: 'https://qline.site/success',
      STRIPE_CANCEL_URL: 'https://qline.site/cancel',
    }
    let captured: { input: RequestInfo | URL; init?: RequestInit } | null = null
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      captured = { input, init }
      return Response.json({
        id: 'cs_unit_checkout',
        url: 'https://checkout.stripe.test/session',
      })
    }) as typeof fetch

    const denied = await handleRequest(
      request('/checkout', {
        method: 'POST',
        body: JSON.stringify({ email: 'buyer@example.com', plan: 'builder' }),
      }),
      env,
    )
    expect(denied.status).toBe(401)

    const response = await handleRequest(
      request('/checkout', {
        method: 'POST',
        headers: { authorization: 'Bearer service-token' },
        body: JSON.stringify({ email: 'Buyer@Example.com', plan: 'builder' }),
      }),
      env,
    )
    const payload = await jsonBody(response)
    expect(response.status).toBe(201)
    expect(payload).toMatchObject({
      ok: true,
      storage: 'cloudflare-d1',
      url: 'https://checkout.stripe.test/session',
      sessionId: 'cs_unit_checkout',
      plan: 'builder',
    })
    expect(String(captured?.input)).toBe('https://api.stripe.com/v1/checkout/sessions')
    expect(captured?.init?.headers).toMatchObject({
      authorization: 'Bearer stripe-secret-unit-test',
      'content-type': 'application/x-www-form-urlencoded',
    })
    const form = String(captured?.init?.body)
    expect(form).toContain('mode=subscription')
    expect(form).toContain('line_items%5B0%5D%5Bprice%5D=price_builder_unit')
    expect(form).toContain('metadata%5Bq_email%5D=buyer%40example.com')
  })

  test('syncs verified Stripe webhooks into hosted Q entitlements', async () => {
    const env: WorkerEnv = {
      Q_HOSTED_DB: new MemoryD1(),
      SERVICE_TOKEN: 'service-token',
    }

    const unverified = await handleRequest(
      request('/stripe-webhook', {
        method: 'POST',
        headers: { authorization: 'Bearer service-token' },
        body: JSON.stringify({ type: 'checkout.session.completed' }),
      }),
      env,
    )
    expect(unverified.status).toBe(400)

    const synced = await handleRequest(
      request('/stripe-webhook', {
        method: 'POST',
        headers: { authorization: 'Bearer service-token' },
        body: JSON.stringify({
          verified: true,
          type: 'checkout.session.completed',
          event: {
            type: 'checkout.session.completed',
            data: {
              object: {
                customer: 'cus_unit',
                subscription: 'sub_unit',
                customer_details: { email: 'buyer@example.com' },
                metadata: {
                  q_plan: 'builder',
                  q_email: 'buyer@example.com',
                },
              },
            },
          },
        }),
      }),
      env,
    )
    expect(synced.status).toBe(200)
    expect(synced.headers.get('x-q-plan')).toBe('builder')
    expect(await jsonBody(synced)).toMatchObject({
      ok: true,
      received: true,
      type: 'checkout.session.completed',
      user: {
        email: 'buyer@example.com',
        plan: 'builder',
        subscriptionStatus: 'active',
        creditsRemaining: 300,
      },
    })

    const issuedKey = await handleRequest(
      request('/keys', {
        method: 'POST',
        body: JSON.stringify({ email: 'buyer@example.com', label: 'desktop' }),
      }),
      env,
    )
    expect(issuedKey.status).toBe(200)

    const canceled = await handleRequest(
      request('/stripe-webhook', {
        method: 'POST',
        headers: { authorization: 'Bearer service-token' },
        body: JSON.stringify({
          verified: true,
          type: 'customer.subscription.deleted',
          event: {
            type: 'customer.subscription.deleted',
            data: {
              object: {
                id: 'sub_unit',
                customer: 'cus_unit',
                status: 'canceled',
              },
            },
          },
        }),
      }),
      env,
    )
    expect(canceled.status).toBe(200)
    expect(await jsonBody(canceled)).toMatchObject({
      user: {
        subscriptionStatus: 'canceled',
      },
    })
  })

  test('protects privileged LAAS ledger writes with service auth', async () => {
    const env: WorkerEnv = {
      Q_HOSTED_DB: new MemoryD1(),
      SERVICE_TOKEN: 'test-token',
    }
    const denied = await handleRequest(
      request('/laas/events', {
        method: 'POST',
        body: JSON.stringify({ kind: 'release', actor: 'q', subject: 'jaws' }),
      }),
      env,
    )
    expect(denied.status).toBe(401)

    const accepted = await handleRequest(
      request('/laas/events', {
        method: 'POST',
        headers: { authorization: 'Bearer test-token' },
        body: JSON.stringify({
          kind: 'release',
          actor: 'q',
          subject: 'jaws',
          visibility: 'public',
          payload: { version: '0.1.5' },
        }),
      }),
      env,
    )
    expect(accepted.status).toBe(200)

    const listed = await handleRequest(
      request('/laas/events?visibility=public', {
        headers: { authorization: 'Bearer test-token' },
      }),
      env,
    )
    const listedPayload = await jsonBody(listed)
    expect(Array.isArray(listedPayload.events)).toBe(true)
    expect(JSON.stringify(listedPayload.events)).toContain('release')
  })
})
