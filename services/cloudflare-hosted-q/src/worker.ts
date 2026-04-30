export type QPlanId = 'starter' | 'builder' | 'operator'

type QPlanDefinition = {
  id: QPlanId
  name: string
  monthlyCredits: number
  requestsPerMinute: number
  tokensPerMinute: number
  maxKeys: number
}

type D1PreparedStatement = {
  bind(...values: unknown[]): D1PreparedStatement
  first<T = Record<string, unknown>>(): Promise<T | null>
  all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>
  run(): Promise<{ success?: boolean }>
}

type D1Database = {
  prepare(query: string): D1PreparedStatement
}

export type WorkerEnv = {
  Q_HOSTED_DB?: D1Database
  SERVICE_TOKEN?: string
  RESEND_API_KEY?: string
  RESEND_FROM_EMAIL?: string
  RESEND_API_BASE_URL?: string
  PUBLIC_SITE_URL?: string
  PUBLIC_AURA_GENESIS_URL?: string
}

type UserRow = {
  email: string
  plan: QPlanId
  subscription_status: 'starter' | 'active' | 'pending_checkout' | 'past_due' | 'canceled'
  monthly_credits: number
  credits_remaining: number
  requests_this_month: number
  tokens_this_month: number
  resets_at: string
  created_at: string
  updated_at: string
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
}

type ApiKeyRow = {
  id: string
  email: string
  label: string | null
  key_prefix: string
  created_at: string
  last_used_at: string | null
  revoked_at: string | null
}

const PLANS: readonly QPlanDefinition[] = [
  {
    id: 'starter',
    name: 'Starter',
    monthlyCredits: 25,
    requestsPerMinute: 6,
    tokensPerMinute: 120_000,
    maxKeys: 1,
  },
  {
    id: 'builder',
    name: 'Builder',
    monthlyCredits: 300,
    requestsPerMinute: 60,
    tokensPerMinute: 1_200_000,
    maxKeys: 3,
  },
  {
    id: 'operator',
    name: 'Operator',
    monthlyCredits: 3000,
    requestsPerMinute: 180,
    tokensPerMinute: 3_600_000,
    maxKeys: 10,
  },
] as const

function json(payload: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers)
  headers.set('content-type', 'application/json; charset=utf-8')
  headers.set('cache-control', 'no-store')
  return new Response(JSON.stringify(payload), { ...init, headers })
}

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const normalized = value.trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : null
}

function normalizeString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function findPlan(value: unknown): QPlanDefinition | null {
  const planId = normalizeString(value) ?? 'starter'
  return PLANS.find(plan => plan.id === planId) ?? null
}

function nextMonthlyReset(from = new Date()): string {
  return new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1, 0, 0, 0, 0),
  ).toISOString()
}

function hasDb(env: WorkerEnv): env is WorkerEnv & { Q_HOSTED_DB: D1Database } {
  return Boolean(env.Q_HOSTED_DB)
}

function requireDb(env: WorkerEnv): D1Database | Response {
  if (!hasDb(env)) {
    return json(
      {
        ok: false,
        code: 'database_not_bound',
        message: 'Cloudflare D1 binding Q_HOSTED_DB is required.',
      },
      { status: 503 },
    )
  }
  return env.Q_HOSTED_DB
}

function requireServiceAuth(request: Request, env: WorkerEnv): Response | null {
  const token = normalizeString(env.SERVICE_TOKEN)
  if (!token) {
    return json(
      {
        ok: false,
        code: 'service_auth_not_configured',
        message: 'SERVICE_TOKEN must be set before privileged routes are enabled.',
      },
      { status: 503 },
    )
  }
  if (request.headers.get('authorization') !== `Bearer ${token}`) {
    return json(
      {
        ok: false,
        code: 'unauthorized',
        message: 'A valid service bearer token is required.',
      },
      { status: 401 },
    )
  }
  return null
}

async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  const body = await request.json().catch(() => ({}))
  return body && typeof body === 'object' && !Array.isArray(body)
    ? body as Record<string, unknown>
    : {}
}

async function hashHex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  )
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
}

function randomId(prefix: string): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return `${prefix}_${Array.from(bytes)
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')}`
}

function randomApiKey(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  const token = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
  return `qk_${token}`
}

function summarizeUser(user: UserRow, keys: ApiKeyRow[] = []): Record<string, unknown> {
  const plan = PLANS.find(candidate => candidate.id === user.plan)
  return {
    email: user.email,
    plan: user.plan,
    subscriptionStatus: user.subscription_status,
    monthlyCredits: user.monthly_credits,
    creditsRemaining: user.credits_remaining,
    requestsThisMonth: user.requests_this_month,
    tokensThisMonth: user.tokens_this_month,
    resetsAt: user.resets_at,
    planDetail: plan
      ? {
          name: plan.name,
          requestsPerMinute: plan.requestsPerMinute,
          tokensPerMinute: plan.tokensPerMinute,
          maxKeys: plan.maxKeys,
        }
      : null,
    keys: keys.map(key => ({
      id: key.id,
      label: key.label,
      prefix: key.key_prefix,
      createdAt: key.created_at,
      lastUsedAt: key.last_used_at,
      revokedAt: key.revoked_at,
    })),
  }
}

function rateHeaders(user: UserRow): Headers {
  const plan = PLANS.find(candidate => candidate.id === user.plan)
  const headers = new Headers()
  headers.set('x-q-plan', user.plan)
  headers.set('x-q-credits-remaining', String(user.credits_remaining))
  headers.set('x-q-credit-reset', user.resets_at)
  if (plan) {
    headers.set('x-ratelimit-limit', String(plan.requestsPerMinute))
    headers.set('x-ratelimit-remaining', String(plan.requestsPerMinute))
    headers.set('x-ratelimit-reset', new Date(Date.now() + 60_000).toISOString())
  }
  return headers
}

async function getUser(db: D1Database, email: string): Promise<UserRow | null> {
  return await db
    .prepare('SELECT * FROM hosted_q_users WHERE email = ?')
    .bind(email)
    .first<UserRow>()
}

async function listKeys(db: D1Database, email: string): Promise<ApiKeyRow[]> {
  const result = await db
    .prepare(
      'SELECT id, email, label, key_prefix, created_at, last_used_at, revoked_at FROM hosted_q_api_keys WHERE email = ? ORDER BY created_at ASC',
    )
    .bind(email)
    .all<ApiKeyRow>()
  return result.results ?? []
}

async function upsertUser(db: D1Database, user: UserRow): Promise<void> {
  await db
    .prepare(
      `INSERT INTO hosted_q_users (
        email, plan, subscription_status, monthly_credits, credits_remaining,
        requests_this_month, tokens_this_month, resets_at, created_at, updated_at,
        stripe_customer_id, stripe_subscription_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(email) DO UPDATE SET
        plan = excluded.plan,
        subscription_status = excluded.subscription_status,
        monthly_credits = excluded.monthly_credits,
        credits_remaining = excluded.credits_remaining,
        requests_this_month = excluded.requests_this_month,
        tokens_this_month = excluded.tokens_this_month,
        resets_at = excluded.resets_at,
        updated_at = excluded.updated_at,
        stripe_customer_id = excluded.stripe_customer_id,
        stripe_subscription_id = excluded.stripe_subscription_id`,
    )
    .bind(
      user.email,
      user.plan,
      user.subscription_status,
      user.monthly_credits,
      user.credits_remaining,
      user.requests_this_month,
      user.tokens_this_month,
      user.resets_at,
      user.created_at,
      user.updated_at,
      user.stripe_customer_id,
      user.stripe_subscription_id,
    )
    .run()
}

async function handleSignup(request: Request, env: WorkerEnv): Promise<Response> {
  const dbOrResponse = requireDb(env)
  if (dbOrResponse instanceof Response) {
    return dbOrResponse
  }
  const db = dbOrResponse
  const body = await readJsonBody(request)
  const email = normalizeEmail(body.email)
  if (!email) {
    return json(
      { ok: false, code: 'email_required', message: 'A valid email is required.' },
      { status: 400 },
    )
  }
  const plan = findPlan(body.plan)
  if (!plan) {
    return json(
      { ok: false, code: 'unknown_plan', message: 'Unknown hosted Q plan.' },
      { status: 400 },
    )
  }

  const current = await getUser(db, email)
  const now = new Date().toISOString()
  const subscriptionStatus =
    plan.id === 'starter'
      ? 'starter'
      : current?.subscription_status === 'active'
        ? 'active'
        : 'pending_checkout'
  const nextUser: UserRow = {
    email,
    plan: plan.id,
    subscription_status: subscriptionStatus,
    monthly_credits: plan.monthlyCredits,
    credits_remaining:
      subscriptionStatus === 'active' || subscriptionStatus === 'starter'
        ? current?.credits_remaining ?? plan.monthlyCredits
        : 0,
    requests_this_month: current?.requests_this_month ?? 0,
    tokens_this_month: current?.tokens_this_month ?? 0,
    resets_at: current?.resets_at ?? nextMonthlyReset(),
    created_at: current?.created_at ?? now,
    updated_at: now,
    stripe_customer_id: current?.stripe_customer_id ?? null,
    stripe_subscription_id: current?.stripe_subscription_id ?? null,
  }

  await upsertUser(db, nextUser)
  return json(
    {
      ok: true,
      storage: 'cloudflare-d1',
      requiresCheckout: subscriptionStatus === 'pending_checkout',
      user: summarizeUser(nextUser, await listKeys(db, email)),
    },
    { status: 200, headers: rateHeaders(nextUser) },
  )
}

async function handleIssueKey(request: Request, env: WorkerEnv): Promise<Response> {
  const dbOrResponse = requireDb(env)
  if (dbOrResponse instanceof Response) {
    return dbOrResponse
  }
  const db = dbOrResponse
  const body = await readJsonBody(request)
  const email = normalizeEmail(body.email)
  if (!email) {
    return json(
      { ok: false, code: 'email_required', message: 'A valid email is required.' },
      { status: 400 },
    )
  }

  const user = await getUser(db, email)
  if (!user) {
    return json(
      { ok: false, code: 'signup_required', message: 'Sign up before issuing a key.' },
      { status: 404 },
    )
  }
  if (user.subscription_status !== 'starter' && user.subscription_status !== 'active') {
    return json(
      {
        ok: false,
        code: 'checkout_required',
        message: 'Complete checkout before issuing a hosted Q key.',
        user: summarizeUser(user, await listKeys(db, email)),
      },
      { status: 403, headers: rateHeaders(user) },
    )
  }

  const plan = PLANS.find(candidate => candidate.id === user.plan)
  const activeKeys = (await listKeys(db, email)).filter(key => !key.revoked_at)
  if (plan && activeKeys.length >= plan.maxKeys) {
    return json(
      {
        ok: false,
        code: 'key_limit_reached',
        message: `${plan.name} allows ${plan.maxKeys} active key(s).`,
        user: summarizeUser(user, activeKeys),
      },
      { status: 429, headers: rateHeaders(user) },
    )
  }

  const plaintext = randomApiKey()
  const now = new Date().toISOString()
  const key: ApiKeyRow = {
    id: randomId('key'),
    email,
    label: normalizeString(body.label),
    key_prefix: plaintext.slice(0, 14),
    created_at: now,
    last_used_at: null,
    revoked_at: null,
  }

  await db
    .prepare(
      `INSERT INTO hosted_q_api_keys (
        id, email, label, key_prefix, key_hash, created_at, last_used_at, revoked_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      key.id,
      key.email,
      key.label,
      key.key_prefix,
      await hashHex(plaintext),
      key.created_at,
      key.last_used_at,
      key.revoked_at,
    )
    .run()

  return json(
    {
      ok: true,
      storage: 'cloudflare-d1',
      apiKey: plaintext,
      useHint: `/provider key oci ${plaintext}`,
      user: summarizeUser(user, [...activeKeys, key]),
    },
    { status: 200, headers: rateHeaders(user) },
  )
}

async function handleUsage(request: Request, env: WorkerEnv): Promise<Response> {
  const dbOrResponse = requireDb(env)
  if (dbOrResponse instanceof Response) {
    return dbOrResponse
  }
  const body = await readJsonBody(request)
  const email = normalizeEmail(body.email)
  if (!email) {
    return json(
      { ok: false, code: 'email_required', message: 'A valid email is required.' },
      { status: 400 },
    )
  }
  const user = await getUser(dbOrResponse, email)
  if (!user) {
    return json(
      { ok: false, code: 'signup_required', message: 'No hosted Q account exists.' },
      { status: 404 },
    )
  }
  return json(
    {
      ok: true,
      storage: 'cloudflare-d1',
      user: summarizeUser(user, await listKeys(dbOrResponse, email)),
      usage: {
        requestsThisMonth: user.requests_this_month,
        tokensThisMonth: user.tokens_this_month,
        creditsRemaining: user.credits_remaining,
      },
    },
    { status: 200, headers: rateHeaders(user) },
  )
}

async function handleRecordUsage(request: Request, env: WorkerEnv): Promise<Response> {
  const auth = requireServiceAuth(request, env)
  if (auth) {
    return auth
  }
  const dbOrResponse = requireDb(env)
  if (dbOrResponse instanceof Response) {
    return dbOrResponse
  }
  const body = await readJsonBody(request)
  const email = normalizeEmail(body.email)
  if (!email) {
    return json({ ok: false, code: 'email_required' }, { status: 400 })
  }
  const user = await getUser(dbOrResponse, email)
  if (!user) {
    return json({ ok: false, code: 'signup_required' }, { status: 404 })
  }
  const requestCount = Math.max(0, Number(body.requests ?? 1) || 1)
  const tokenCount = Math.max(0, Number(body.tokens ?? 0) || 0)
  const creditDelta = Math.max(0, Number(body.credits ?? 1) || 1)
  const now = new Date().toISOString()
  await dbOrResponse
    .prepare(
      `INSERT INTO hosted_q_usage_events (
        id, email, request_count, token_count, credit_delta, source, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      randomId('usage'),
      email,
      requestCount,
      tokenCount,
      creditDelta,
      normalizeString(body.source) ?? 'hosted-q',
      now,
    )
    .run()
  const updatedUser = {
    ...user,
    requests_this_month: user.requests_this_month + requestCount,
    tokens_this_month: user.tokens_this_month + tokenCount,
    credits_remaining: Math.max(0, user.credits_remaining - creditDelta),
    updated_at: now,
  }
  await upsertUser(dbOrResponse, updatedUser)
  return json({ ok: true, user: summarizeUser(updatedUser) }, { status: 200 })
}

async function handleMailNotify(request: Request, env: WorkerEnv): Promise<Response> {
  const auth = requireServiceAuth(request, env)
  if (auth) {
    return auth
  }
  const dbOrResponse = requireDb(env)
  if (dbOrResponse instanceof Response) {
    return dbOrResponse
  }
  const apiKey = normalizeString(env.RESEND_API_KEY)
  const from = normalizeString(env.RESEND_FROM_EMAIL)
  if (!apiKey || !from) {
    return json(
      {
        ok: false,
        code: 'mail_not_configured',
        message: 'RESEND_API_KEY and RESEND_FROM_EMAIL are required.',
      },
      { status: 503 },
    )
  }
  const body = await readJsonBody(request)
  const to = normalizeString(body.to)
  const subject = normalizeString(body.subject)
  const text = normalizeString(body.text)
  const html = normalizeString(body.html)
  if (!to || !subject || (!text && !html)) {
    return json(
      { ok: false, code: 'invalid_mail_payload' },
      { status: 400 },
    )
  }

  const response = await fetch(
    `${env.RESEND_API_BASE_URL ?? 'https://api.resend.com'}/emails`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ from, to, subject, text, html }),
    },
  )
  const providerPayload = await response.json().catch(() => ({})) as {
    id?: string
    message?: string
  }
  await dbOrResponse
    .prepare(
      `INSERT INTO mail_receipts (
        id, provider, recipient_hash, subject_hash, status, provider_id, error, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      randomId('mail'),
      'resend',
      await hashHex(to),
      await hashHex(subject),
      response.ok ? 'sent' : 'failed',
      providerPayload.id ?? null,
      response.ok ? null : providerPayload.message ?? `HTTP ${response.status}`,
      new Date().toISOString(),
    )
    .run()

  return json(
    {
      ok: response.ok,
      provider: 'resend',
      providerId: providerPayload.id ?? null,
      status: response.ok ? 'sent' : 'failed',
    },
    { status: response.ok ? 200 : 502 },
  )
}

async function handleLedgerEvent(request: Request, env: WorkerEnv): Promise<Response> {
  const auth = requireServiceAuth(request, env)
  if (auth) {
    return auth
  }
  const dbOrResponse = requireDb(env)
  if (dbOrResponse instanceof Response) {
    return dbOrResponse
  }
  const body = await readJsonBody(request)
  const kind = normalizeString(body.kind)
  const actor = normalizeString(body.actor)
  const subject = normalizeString(body.subject)
  const visibility = normalizeString(body.visibility) ?? 'private'
  if (!kind || !actor || !subject || !['public', 'private', 'admin'].includes(visibility)) {
    return json({ ok: false, code: 'invalid_ledger_payload' }, { status: 400 })
  }
  const id = randomId('laas')
  await dbOrResponse
    .prepare(
      `INSERT INTO laas_ledger_events (
        id, kind, actor, subject, visibility, payload_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      kind,
      actor,
      subject,
      visibility,
      JSON.stringify(body.payload ?? {}),
      new Date().toISOString(),
    )
    .run()
  return json({ ok: true, id, storage: 'cloudflare-d1' }, { status: 200 })
}

async function handleLedgerList(request: Request, env: WorkerEnv): Promise<Response> {
  const auth = requireServiceAuth(request, env)
  if (auth) {
    return auth
  }
  const dbOrResponse = requireDb(env)
  if (dbOrResponse instanceof Response) {
    return dbOrResponse
  }
  const url = new URL(request.url)
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? '25') || 25))
  const visibility = url.searchParams.get('visibility') ?? 'public'
  const rows = await dbOrResponse
    .prepare(
      `SELECT id, kind, actor, subject, visibility, payload_json, created_at
      FROM laas_ledger_events
      WHERE visibility = ?
      ORDER BY created_at DESC
      LIMIT ?`,
    )
    .bind(visibility, limit)
    .all<Record<string, unknown>>()
  return json({ ok: true, events: rows.results ?? [] }, { status: 200 })
}

function handleHealth(env: WorkerEnv): Response {
  return json({
    ok: true,
    service: 'openjaws-hosted-q',
    storage: hasDb(env) ? 'cloudflare-d1' : 'missing-d1-binding',
    routes: [
      '/health',
      '/signup',
      '/keys',
      '/usage',
      '/usage/record',
      '/mail/notify',
      '/laas/events',
    ],
    configured: {
      database: hasDb(env),
      serviceToken: Boolean(normalizeString(env.SERVICE_TOKEN)),
      resend: Boolean(normalizeString(env.RESEND_API_KEY) && normalizeString(env.RESEND_FROM_EMAIL)),
    },
  })
}

export async function handleRequest(request: Request, env: WorkerEnv): Promise<Response> {
  const url = new URL(request.url)
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'access-control-allow-origin': env.PUBLIC_SITE_URL ?? 'https://qline.site',
        'access-control-allow-methods': 'GET,POST,OPTIONS',
        'access-control-allow-headers': 'authorization,content-type',
        'access-control-max-age': '600',
      },
    })
  }
  if (url.pathname === '/health' && request.method === 'GET') {
    return handleHealth(env)
  }
  if (url.pathname === '/signup' && request.method === 'POST') {
    return handleSignup(request, env)
  }
  if (url.pathname === '/keys' && request.method === 'POST') {
    return handleIssueKey(request, env)
  }
  if (url.pathname === '/usage' && request.method === 'POST') {
    return handleUsage(request, env)
  }
  if (url.pathname === '/usage/record' && request.method === 'POST') {
    return handleRecordUsage(request, env)
  }
  if (url.pathname === '/mail/notify' && request.method === 'POST') {
    return handleMailNotify(request, env)
  }
  if (url.pathname === '/laas/events' && request.method === 'POST') {
    return handleLedgerEvent(request, env)
  }
  if (url.pathname === '/laas/events' && request.method === 'GET') {
    return handleLedgerList(request, env)
  }
  return json({ ok: false, code: 'not_found' }, { status: 404 })
}

export default {
  fetch(request: Request, env: WorkerEnv) {
    return handleRequest(request, env)
  },
}
