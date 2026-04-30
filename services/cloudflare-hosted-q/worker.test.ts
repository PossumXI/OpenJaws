import { afterEach, describe, expect, test } from 'bun:test'
import { handleRequest, type WorkerEnv } from './src/worker.ts'

type UserRow = Record<string, unknown> & { email: string }
type KeyRow = Record<string, unknown> & { email: string; revoked_at: string | null }
type LedgerRow = Record<string, unknown> & { visibility: string; created_at: string }
type MailRow = Record<string, unknown>
type WalletRow = Record<string, unknown> & { email: string; balance: number; lifetime_earned: number; lifetime_spent: number }
type CodeTokenLedgerRow = Record<string, unknown> & { email: string; created_at: string }
type CampaignRow = Record<string, unknown> & { id: string; slug: string; status: string }
type ContactRow = Record<string, unknown> & { campaign_id: string; email: string }

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
    if (this.query.startsWith('SELECT * FROM code_token_wallets')) {
      return (this.db.wallets.get(String(this.values[0])) ?? null) as T | null
    }
    if (this.query.startsWith('SELECT * FROM promotion_campaigns')) {
      return (this.db.campaigns.get(String(this.values[0])) ?? null) as T | null
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
    if (this.query.includes('FROM code_token_ledger_events')) {
      const email = String(this.values[0])
      const limit = Number(this.values[1])
      return {
        results: this.db.codeTokenLedger
          .filter(event => event.email === email)
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
        display_name: this.values[12] ?? null,
        company_name: this.values[13] ?? null,
        use_case: this.values[14] ?? null,
        marketing_opt_in: this.values[15] ?? 0,
        profile_json: this.values[16] ?? '{}',
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
    } else if (this.query.includes('INSERT INTO code_token_wallets')) {
      const wallet: WalletRow = {
        email: String(this.values[0]),
        balance: Number(this.values[1]),
        lifetime_earned: Number(this.values[2]),
        lifetime_spent: Number(this.values[3]),
        updated_at: String(this.values[4]),
      }
      this.db.wallets.set(wallet.email, wallet)
    } else if (this.query.includes('INSERT INTO code_token_ledger_events')) {
      this.db.codeTokenLedger.push({
        id: String(this.values[0]),
        email: String(this.values[1]),
        delta: Number(this.values[2]),
        balance_after: Number(this.values[3]),
        kind: String(this.values[4]),
        source: String(this.values[5]),
        reference_id: this.values[6] as string | null,
        metadata_json: String(this.values[7]),
        created_at: String(this.values[8]),
      })
    } else if (this.query.includes('INSERT INTO promotion_campaigns')) {
      const campaign: CampaignRow = {
        id: String(this.values[0]),
        slug: String(this.values[1]),
        name: String(this.values[2]),
        status: String(this.values[3]),
        starts_at: this.values[4] as string | null,
        ends_at: this.values[5] as string | null,
        reward_tokens: Number(this.values[6]),
        metadata_json: String(this.values[7]),
        created_at: String(this.values[8]),
        updated_at: String(this.values[9]),
      }
      this.db.campaigns.set(campaign.slug, campaign)
    } else if (this.query.includes('INSERT INTO promotion_contacts')) {
      const contact: ContactRow = {
        id: String(this.values[0]),
        campaign_id: String(this.values[1]),
        email: String(this.values[2]),
        status: String(this.values[3]),
        source: String(this.values[4]),
        metadata_json: String(this.values[5]),
        created_at: String(this.values[6]),
        updated_at: String(this.values[7]),
      }
      const index = this.db.contacts.findIndex(
        candidate => candidate.campaign_id === contact.campaign_id && candidate.email === contact.email,
      )
      if (index >= 0) {
        this.db.contacts[index] = contact
      } else {
        this.db.contacts.push(contact)
      }
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
  readonly wallets = new Map<string, WalletRow>()
  readonly codeTokenLedger: CodeTokenLedgerRow[] = []
  readonly campaigns = new Map<string, CampaignRow>()
  readonly contacts: ContactRow[] = []

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
        body: JSON.stringify({
          email: 'User@Example.com',
          plan: 'starter',
          displayName: 'Builder One',
          companyName: 'AROBI',
          useCase: 'JAWS beta',
          marketingOptIn: true,
        }),
      }),
      env,
    )
    expect(signup.status).toBe(200)
    expect(await jsonBody(signup)).toMatchObject({
      user: {
        profile: {
          displayName: 'Builder One',
          companyName: 'AROBI',
          useCase: 'JAWS beta',
          marketingOptIn: true,
        },
      },
    })

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

  test('updates profiles and records service-gated code token wallet events', async () => {
    const env: WorkerEnv = {
      Q_HOSTED_DB: new MemoryD1(),
      SERVICE_TOKEN: 'service-token',
    }
    await handleRequest(
      request('/signup', {
        method: 'POST',
        body: JSON.stringify({ email: 'wallet@example.com', plan: 'starter' }),
      }),
      env,
    )

    const profile = await handleRequest(
      request('/profile', {
        method: 'POST',
        body: JSON.stringify({
          email: 'wallet@example.com',
          displayName: 'Wallet Tester',
          marketingOptIn: true,
          profile: { source: 'jaws-desktop' },
        }),
      }),
      env,
    )
    expect(profile.status).toBe(200)
    expect(await jsonBody(profile)).toMatchObject({
      user: {
        profile: {
          displayName: 'Wallet Tester',
          marketingOptIn: true,
        },
      },
    })

    const denied = await handleRequest(
      request('/code-tokens/ledger', {
        method: 'POST',
        body: JSON.stringify({ email: 'wallet@example.com', delta: 12 }),
      }),
      env,
    )
    expect(denied.status).toBe(401)

    const credited = await handleRequest(
      request('/code-tokens/ledger', {
        method: 'POST',
        headers: { authorization: 'Bearer service-token' },
        body: JSON.stringify({
          email: 'wallet@example.com',
          delta: 24,
          kind: 'earn',
          source: 'slow-guy',
          referenceId: 'run-1',
        }),
      }),
      env,
    )
    expect(credited.status).toBe(200)
    expect(await jsonBody(credited)).toMatchObject({
      wallet: {
        email: 'wallet@example.com',
        balance: 24,
        lifetime_earned: 24,
      },
    })

    const overspend = await handleRequest(
      request('/code-tokens/ledger', {
        method: 'POST',
        headers: { authorization: 'Bearer service-token' },
        body: JSON.stringify({
          email: 'wallet@example.com',
          delta: -40,
          kind: 'spend',
          source: 'pet-skin',
        }),
      }),
      env,
    )
    expect(overspend.status).toBe(409)

    const wallet = await handleRequest(request('/code-tokens/wallet?email=wallet@example.com'), env)
    expect(wallet.status).toBe(200)
    expect(await jsonBody(wallet)).toMatchObject({
      wallet: {
        balance: 24,
      },
    })
  })

  test('stores promotion campaigns and dedupes campaign contacts', async () => {
    const env: WorkerEnv = {
      Q_HOSTED_DB: new MemoryD1(),
      SERVICE_TOKEN: 'service-token',
    }
    const denied = await handleRequest(
      request('/promotions/campaigns', {
        method: 'POST',
        body: JSON.stringify({ slug: 'launch', name: 'Launch' }),
      }),
      env,
    )
    expect(denied.status).toBe(401)

    const campaign = await handleRequest(
      request('/promotions/campaigns', {
        method: 'POST',
        headers: { authorization: 'Bearer service-token' },
        body: JSON.stringify({
          slug: 'Launch Night',
          name: 'Launch Night',
          status: 'active',
          rewardTokens: 50,
        }),
      }),
      env,
    )
    expect(campaign.status).toBe(200)
    const campaignPayload = await jsonBody(campaign)
    expect(campaignPayload).toMatchObject({
      campaign: {
        slug: 'launch-night',
        reward_tokens: 50,
      },
    })

    const contact = await handleRequest(
      request('/promotions/contacts', {
        method: 'POST',
        body: JSON.stringify({
          slug: 'launch-night',
          email: 'Promo@Example.com',
          source: 'qline',
        }),
      }),
      env,
    )
    expect(contact.status).toBe(200)
    expect(await jsonBody(contact)).toMatchObject({
      contact: {
        email: 'promo@example.com',
      },
    })

    await handleRequest(
      request('/promotions/contacts', {
        method: 'POST',
        body: JSON.stringify({
          slug: 'launch-night',
          email: 'promo@example.com',
          source: 'iorch',
        }),
      }),
      env,
    )
    expect((env.Q_HOSTED_DB as MemoryD1).contacts).toHaveLength(1)
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
