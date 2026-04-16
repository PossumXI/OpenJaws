import { createHash, randomBytes, randomUUID } from 'crypto'
import { existsSync } from 'fs'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import type Stripe from 'stripe'
import { findQPlan, type QPlanDefinition, type QPlanId } from './pricing'

type HostedQSubscriptionStatus =
  | 'active'
  | 'starter'
  | 'pending_checkout'
  | 'canceled'
  | 'past_due'

type HostedQApiKeyRecord = {
  id: string
  label: string | null
  prefix: string
  keyHash: string
  createdAt: string
  lastUsedAt: string | null
  revokedAt: string | null
}

type HostedQUserRecord = {
  email: string
  plan: QPlanId
  subscriptionStatus: HostedQSubscriptionStatus
  monthlyCredits: number
  creditsRemaining: number
  requestsThisMonth: number
  tokensThisMonth: number
  resetsAt: string
  createdAt: string
  updatedAt: string
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
  keys: HostedQApiKeyRecord[]
}

type HostedQStore = {
  version: 1
  updatedAt: string
  users: Record<string, HostedQUserRecord>
}

type HostedQHeaders = Record<string, string>

export type HostedQRouteResult = {
  status: number
  body: Record<string, unknown>
  headers?: HostedQHeaders
}

const DEFAULT_STORE_FILENAME = 'q-hosted-access.json'
const libDir = dirname(fileURLToPath(import.meta.url))
const websiteRootDir = resolve(libDir, '..')

function normalizeOptional(value: string | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}

function nextMonthlyReset(from = new Date()): string {
  return new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1, 0, 0, 0, 0),
  ).toISOString()
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function resolveStorePath(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = normalizeOptional(env.Q_ACCESS_STORE_PATH)
  if (explicit) {
    return resolve(explicit)
  }

  if (env.NETLIFY) {
    return resolve(tmpdir(), DEFAULT_STORE_FILENAME)
  }

  return resolve(websiteRootDir, '.data', DEFAULT_STORE_FILENAME)
}

function createEmptyStore(): HostedQStore {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    users: {},
  }
}

async function loadStore(
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ path: string; store: HostedQStore }> {
  const path = resolveStorePath(env)
  if (!existsSync(path)) {
    return {
      path,
      store: createEmptyStore(),
    }
  }

  const parsed = JSON.parse(await readFile(path, 'utf8')) as HostedQStore
  return {
    path,
    store: parsed?.version === 1 ? parsed : createEmptyStore(),
  }
}

async function saveStore(
  path: string,
  store: HostedQStore,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  store.updatedAt = new Date().toISOString()
  await writeFile(path, `${JSON.stringify(store, null, 2)}\n`, 'utf8')
}

function ensurePeriod(
  user: HostedQUserRecord,
  plan: QPlanDefinition,
): HostedQUserRecord {
  const now = new Date()
  if (new Date(user.resetsAt).getTime() > now.getTime()) {
    return user
  }

  return {
    ...user,
    monthlyCredits: plan.monthlyCredits,
    creditsRemaining: plan.monthlyCredits,
    requestsThisMonth: 0,
    tokensThisMonth: 0,
    resetsAt: nextMonthlyReset(now),
    updatedAt: now.toISOString(),
  }
}

function createUserRecord(args: {
  email: string
  plan: QPlanId
  subscriptionStatus: HostedQSubscriptionStatus
}): HostedQUserRecord {
  const now = new Date().toISOString()
  const plan = findQPlan(args.plan)
  if (!plan) {
    throw new Error(`Unknown plan "${args.plan}".`)
  }

  const activeCredits =
    args.subscriptionStatus === 'active' || args.subscriptionStatus === 'starter'
      ? plan.monthlyCredits
      : 0

  return {
    email: args.email,
    plan: args.plan,
    subscriptionStatus: args.subscriptionStatus,
    monthlyCredits: plan.monthlyCredits,
    creditsRemaining: activeCredits,
    requestsThisMonth: 0,
    tokensThisMonth: 0,
    resetsAt: nextMonthlyReset(),
    createdAt: now,
    updatedAt: now,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    keys: [],
  }
}

function summarizeUser(user: HostedQUserRecord): Record<string, unknown> {
  const plan = findQPlan(user.plan)
  if (!plan) {
    throw new Error(`Unknown plan "${user.plan}".`)
  }

  return {
    email: user.email,
    plan: user.plan,
    subscriptionStatus: user.subscriptionStatus,
    monthlyCredits: user.monthlyCredits,
    creditsRemaining: user.creditsRemaining,
    requestsThisMonth: user.requestsThisMonth,
    tokensThisMonth: user.tokensThisMonth,
    resetsAt: user.resetsAt,
    planDetail: {
      name: plan.name,
      price: plan.price,
      requestsPerMinute: plan.requestsPerMinute,
      tokensPerMinute: plan.tokensPerMinute,
      maxKeys: plan.maxKeys,
      hostedAccess: plan.hostedAccess,
    },
    keys: user.keys.map(key => ({
      id: key.id,
      label: key.label,
      prefix: key.prefix,
      createdAt: key.createdAt,
      lastUsedAt: key.lastUsedAt,
      revokedAt: key.revokedAt,
    })),
  }
}

function buildHeaders(user: HostedQUserRecord): HostedQHeaders {
  const plan = findQPlan(user.plan)
  if (!plan) {
    throw new Error(`Unknown plan "${user.plan}".`)
  }

  return {
    'cache-control': 'no-store',
    'x-q-plan': user.plan,
    'x-q-credits-remaining': String(user.creditsRemaining),
    'x-ratelimit-limit': String(plan.requestsPerMinute),
    'x-ratelimit-remaining': String(plan.requestsPerMinute),
    'x-ratelimit-reset': new Date(Date.now() + 60_000).toISOString(),
    'x-q-credit-reset': user.resetsAt,
  }
}

function resolveCheckoutRequirement(plan: QPlanDefinition): boolean {
  return plan.id !== 'starter'
}

function canIssueKey(user: HostedQUserRecord): boolean {
  return (
    user.subscriptionStatus === 'active' || user.subscriptionStatus === 'starter'
  )
}

function issuePlaintextKey(): { plaintext: string; prefix: string; hash: string } {
  const token = `qk_${randomBytes(24).toString('base64url')}`
  return {
    plaintext: token,
    prefix: token.slice(0, 14),
    hash: sha256(token),
  }
}

export function resolveHostedQLocalMode(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return (
    env.Q_HOSTED_SERVICE_LOCAL_MODE === 'filesystem' || env.NODE_ENV !== 'production'
  )
}

export async function signupHostedQUser(args: {
  email: string | null
  plan: string | null
  env?: NodeJS.ProcessEnv
}): Promise<HostedQRouteResult> {
  const email = normalizeOptional(args.email ?? undefined)
  if (!email) {
    return {
      status: 400,
      body: {
        ok: false,
        code: 'email_required',
        message: 'Email is required to sign up for hosted Q access.',
      },
    }
  }

  const normalizedEmail = normalizeEmail(email)
  const planId = (normalizeOptional(args.plan ?? undefined) ?? 'starter') as QPlanId
  const plan = findQPlan(planId)
  if (!plan) {
    return {
      status: 400,
      body: {
        ok: false,
        code: 'unknown_plan',
        message: `Unknown plan "${planId}".`,
      },
    }
  }

  const { path, store } = await loadStore(args.env)
  const current =
    store.users[normalizedEmail] ??
    createUserRecord({
      email: normalizedEmail,
      plan: plan.id,
      subscriptionStatus: plan.id === 'starter' ? 'starter' : 'pending_checkout',
    })

  const nextStatus =
    plan.id === 'starter'
      ? ('starter' satisfies HostedQSubscriptionStatus)
      : current.subscriptionStatus === 'active'
        ? 'active'
        : 'pending_checkout'

  const nextUser = ensurePeriod(
    {
      ...current,
      plan: plan.id,
      subscriptionStatus: nextStatus,
      monthlyCredits: plan.monthlyCredits,
      creditsRemaining:
        nextStatus === 'active' || nextStatus === 'starter'
          ? current.creditsRemaining > 0
            ? current.creditsRemaining
            : plan.monthlyCredits
          : 0,
      updatedAt: new Date().toISOString(),
    },
    plan,
  )

  store.users[normalizedEmail] = nextUser
  await saveStore(path, store)

  return {
    status: 200,
    headers: buildHeaders(nextUser),
    body: {
      ok: true,
      message:
        resolveCheckoutRequirement(plan) && nextUser.subscriptionStatus !== 'active'
          ? `${plan.name} signup recorded. Complete checkout before issuing a hosted Q key.`
          : `${plan.name} signup recorded. You can generate a hosted Q key now.`,
      storage: 'filesystem-demo',
      requiresCheckout:
        resolveCheckoutRequirement(plan) &&
        nextUser.subscriptionStatus !== 'active',
      useHint:
        nextUser.subscriptionStatus === 'active' ||
        nextUser.subscriptionStatus === 'starter'
          ? '/provider key oci <generated-q-key>'
          : null,
      user: summarizeUser(nextUser),
    },
  }
}

export async function issueHostedQApiKey(args: {
  email: string | null
  label?: string | null
  env?: NodeJS.ProcessEnv
}): Promise<HostedQRouteResult> {
  const email = normalizeOptional(args.email ?? undefined)
  if (!email) {
    return {
      status: 400,
      body: {
        ok: false,
        code: 'email_required',
        message: 'Email is required before a hosted Q key can be issued.',
      },
    }
  }

  const normalizedEmail = normalizeEmail(email)
  const { path, store } = await loadStore(args.env)
  const current = store.users[normalizedEmail]
  if (!current) {
    return {
      status: 404,
      body: {
        ok: false,
        code: 'signup_required',
        message: 'No hosted Q account exists for that email yet. Sign up first.',
      },
    }
  }

  const plan = findQPlan(current.plan)
  if (!plan) {
    return {
      status: 500,
      body: {
        ok: false,
        code: 'plan_invalid',
        message: `Stored plan "${current.plan}" is invalid.`,
      },
    }
  }

  const user = ensurePeriod(current, plan)
  if (!canIssueKey(user)) {
    return {
      status: 403,
      headers: buildHeaders(user),
      body: {
        ok: false,
        code: 'checkout_required',
        message:
          'This plan is not active yet. Complete checkout before issuing a hosted Q key.',
        user: summarizeUser(user),
      },
    }
  }

  const activeKeyCount = user.keys.filter(key => !key.revokedAt).length
  if (activeKeyCount >= plan.maxKeys) {
    return {
      status: 429,
      headers: buildHeaders(user),
      body: {
        ok: false,
        code: 'key_limit_reached',
        message: `${plan.name} allows up to ${plan.maxKeys} active hosted Q key${plan.maxKeys === 1 ? '' : 's'}.`,
        user: summarizeUser(user),
      },
    }
  }

  const nextKey = issuePlaintextKey()
  const updatedUser: HostedQUserRecord = {
    ...user,
    updatedAt: new Date().toISOString(),
    keys: [
      ...user.keys,
      {
        id: randomUUID(),
        label: normalizeOptional(args.label ?? undefined),
        prefix: nextKey.prefix,
        keyHash: nextKey.hash,
        createdAt: new Date().toISOString(),
        lastUsedAt: null,
        revokedAt: null,
      },
    ],
  }

  store.users[normalizedEmail] = updatedUser
  await saveStore(path, store)

  return {
    status: 200,
    headers: buildHeaders(updatedUser),
    body: {
      ok: true,
      message: 'Hosted Q key issued. Store it now; the plaintext key is shown only once.',
      storage: 'filesystem-demo',
      apiKey: nextKey.plaintext,
      useHint: `/provider key oci ${nextKey.plaintext}`,
      user: summarizeUser(updatedUser),
    },
  }
}

export async function readHostedQUsage(args: {
  email: string | null
  env?: NodeJS.ProcessEnv
}): Promise<HostedQRouteResult> {
  const email = normalizeOptional(args.email ?? undefined)
  if (!email) {
    return {
      status: 400,
      body: {
        ok: false,
        code: 'email_required',
        message: 'Email is required to inspect hosted Q usage.',
      },
    }
  }

  const normalizedEmail = normalizeEmail(email)
  const { path, store } = await loadStore(args.env)
  const current = store.users[normalizedEmail]
  if (!current) {
    return {
      status: 404,
      body: {
        ok: false,
        code: 'signup_required',
        message: 'No hosted Q account exists for that email yet.',
      },
    }
  }

  const plan = findQPlan(current.plan)
  if (!plan) {
    return {
      status: 500,
      body: {
        ok: false,
        code: 'plan_invalid',
        message: `Stored plan "${current.plan}" is invalid.`,
      },
    }
  }

  const user = ensurePeriod(current, plan)
  store.users[normalizedEmail] = user
  await saveStore(path, store)

  return {
    status: 200,
    headers: buildHeaders(user),
    body: {
      ok: true,
      message: 'Hosted Q usage loaded.',
      storage: 'filesystem-demo',
      user: summarizeUser(user),
      usage: {
        requestsThisMonth: user.requestsThisMonth,
        tokensThisMonth: user.tokensThisMonth,
        creditsRemaining: user.creditsRemaining,
      },
      authBoundary:
        'This local filesystem mode is for development only. Production usage lookup should require real account auth.',
    },
  }
}

export async function applyHostedQStripeEvent(args: {
  event: Stripe.Event
  env?: NodeJS.ProcessEnv
}): Promise<HostedQRouteResult> {
  const { path, store } = await loadStore(args.env)
  let touchedUser: HostedQUserRecord | null = null

  if (args.event.type === 'checkout.session.completed') {
    const session = args.event.data.object as Stripe.Checkout.Session
    const email = normalizeOptional(
      session.customer_details?.email ??
        session.customer_email ??
        session.metadata?.q_email,
    )
    const planId = (normalizeOptional(session.metadata?.q_plan) ??
      'builder') as QPlanId
    const plan = findQPlan(planId)

    if (email && plan) {
      const normalizedEmail = normalizeEmail(email)
      const current =
        store.users[normalizedEmail] ??
        createUserRecord({
          email: normalizedEmail,
          plan: plan.id,
          subscriptionStatus: 'pending_checkout',
        })
      touchedUser = ensurePeriod(
        {
          ...current,
          plan: plan.id,
          subscriptionStatus: plan.id === 'starter' ? 'starter' : 'active',
          monthlyCredits: plan.monthlyCredits,
          creditsRemaining: plan.monthlyCredits,
          stripeCustomerId:
            typeof session.customer === 'string' ? session.customer : null,
          stripeSubscriptionId:
            typeof session.subscription === 'string'
              ? session.subscription
              : null,
          updatedAt: new Date().toISOString(),
        },
        plan,
      )
      store.users[normalizedEmail] = touchedUser
    }
  }

  if (args.event.type === 'customer.subscription.deleted') {
    const subscription = args.event.data.object as Stripe.Subscription
    const customerId =
      typeof subscription.customer === 'string' ? subscription.customer : null
    if (customerId) {
      const matched = Object.values(store.users).find(
        user => user.stripeCustomerId === customerId,
      )
      if (matched) {
        touchedUser = {
          ...matched,
          subscriptionStatus: 'canceled',
          updatedAt: new Date().toISOString(),
        }
        store.users[matched.email] = touchedUser
      }
    }
  }

  if (
    args.event.type === 'customer.subscription.updated' ||
    args.event.type === 'customer.subscription.created'
  ) {
    const subscription = args.event.data.object as Stripe.Subscription
    const customerId =
      typeof subscription.customer === 'string' ? subscription.customer : null
    if (customerId) {
      const matched = Object.values(store.users).find(
        user => user.stripeCustomerId === customerId,
      )
      if (matched) {
        const active =
          subscription.status === 'active' || subscription.status === 'trialing'
        touchedUser = {
          ...matched,
          subscriptionStatus: active ? 'active' : 'past_due',
          stripeSubscriptionId: subscription.id,
          updatedAt: new Date().toISOString(),
        }
        store.users[matched.email] = touchedUser
      }
    }
  }

  await saveStore(path, store)

  return {
    status: 200,
    headers: touchedUser ? buildHeaders(touchedUser) : { 'cache-control': 'no-store' },
    body: {
      ok: true,
      received: true,
      type: args.event.type,
      storage: 'filesystem-demo',
      message: touchedUser
        ? 'Stripe webhook verified and synced into the local hosted Q access store.'
        : 'Stripe webhook verified. No local hosted Q account matched this event.',
      user: touchedUser ? summarizeUser(touchedUser) : null,
    },
  }
}
