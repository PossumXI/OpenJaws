import { mkdtempSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import Stripe from 'stripe'
import { afterEach, describe, expect, test } from 'bun:test'
import {
  applyHostedQStripeEvent,
  issueHostedQApiKey,
  readHostedQUsage,
  signupHostedQUser,
} from './qHostedAccess'
import {
  resolveStripePlan,
  resolveStripeRuntimeConfig,
  stripeCheckoutReady,
} from './stripe'
import { POST as checkoutPost } from '../app/api/checkout/route'
import { POST as stripeWebhookPost } from '../app/api/webhooks/stripe/route'

const ORIGINAL_ENV = { ...process.env }
const originalFetch = globalThis.fetch

function tempStorePath(label: string): string {
  return join(mkdtempSync(join(tmpdir(), `${label}-`)), 'store.json')
}

function checkoutRequest(body: unknown): Request {
  return new Request('https://qline.site/api/checkout', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

function stripeEvent(
  type: Stripe.Event.Type,
  object: Record<string, unknown>,
): Stripe.Event {
  return {
    id: `evt_${type.replace(/\W/g, '_')}`,
    object: 'event',
    api_version: '2026-03-31.basil',
    created: 1_780_000_000,
    livemode: false,
    pending_webhooks: 1,
    request: null,
    type,
    data: {
      object,
    },
  } as Stripe.Event
}

async function signedWebhookRequest(args: {
  payload: string
  secret: string
}): Promise<Request> {
  const signature = await Stripe.webhooks.generateTestHeaderStringAsync({
    payload: args.payload,
    secret: args.secret,
  })
  return new Request('https://qline.site/api/webhooks/stripe', {
    method: 'POST',
    headers: {
      'stripe-signature': signature,
    },
    body: args.payload,
  })
}

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
  globalThis.fetch = originalFetch
})

describe('Stripe checkout and hosted-Q billing', () => {
  test('detects checkout readiness and resolves paid plan price ids from env', () => {
    const config = resolveStripeRuntimeConfig({
      STRIPE_SECRET_KEY: 'sk_test_ready',
      STRIPE_SUCCESS_URL: 'https://qline.site/success',
      STRIPE_CANCEL_URL: 'https://qline.site/cancel',
      STRIPE_PRICE_BUILDER: 'price_builder_123',
    } as NodeJS.ProcessEnv)

    expect(stripeCheckoutReady(config)).toBe(true)
    expect(resolveStripePlan('builder', {
      STRIPE_PRICE_BUILDER: 'price_builder_123',
    } as NodeJS.ProcessEnv)).toMatchObject({
      id: 'builder',
      stripePriceId: 'price_builder_123',
    })
    expect(resolveStripePlan('starter')).toMatchObject({
      id: 'starter',
      stripePriceId: null,
    })
    expect(resolveStripePlan('missing')).toBeNull()
  })

  test('checkout route fails closed for missing config, missing email, free plans, and unknown plans', async () => {
    process.env.NODE_ENV = 'production'
    delete process.env.Q_HOSTED_SERVICE_BASE_URL
    delete process.env.Q_HOSTED_SERVICE_LOCAL_MODE
    delete process.env.STRIPE_SECRET_KEY

    const unconfigured = await checkoutPost(checkoutRequest({
      email: 'user@example.com',
      plan: 'builder',
    }))
    expect(unconfigured.status).toBe(503)
    expect(await unconfigured.json()).toMatchObject({
      ok: false,
      code: 'stripe_not_configured',
    })

    process.env.STRIPE_SECRET_KEY = 'sk_test_ready'
    process.env.STRIPE_SUCCESS_URL = 'https://qline.site/success'
    process.env.STRIPE_CANCEL_URL = 'https://qline.site/cancel'

    const missingEmail = await checkoutPost(checkoutRequest({ plan: 'builder' }))
    expect(missingEmail.status).toBe(400)
    expect(await missingEmail.json()).toMatchObject({
      ok: false,
      code: 'email_required',
    })

    const starter = await checkoutPost(checkoutRequest({
      email: 'user@example.com',
      plan: 'starter',
    }))
    expect(starter.status).toBe(400)
    expect((await starter.json()).message).toContain('free lane')

    const unknown = await checkoutPost(checkoutRequest({
      email: 'user@example.com',
      plan: 'enterprise',
    }))
    expect(unknown.status).toBe(400)
    expect((await unknown.json()).message).toContain('Unknown plan')
  })

  test('checkout route proxies to the hosted billing backend when configured', async () => {
    process.env.NODE_ENV = 'production'
    process.env.NEXT_PUBLIC_SITE_URL = 'https://qline.site'
    process.env.NEXT_PUBLIC_AURA_GENESIS_URL = 'https://aura-genesis.org'
    process.env.Q_HOSTED_SERVICE_BASE_URL = 'https://billing.example.com/q'
    process.env.Q_HOSTED_SERVICE_TOKEN = 'service-token'

    let captured: { input: RequestInfo | URL; init?: RequestInit } | null = null
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      captured = { input, init }
      return Response.json(
        {
          ok: true,
          url: 'https://checkout.stripe.test/session',
        },
        {
          status: 201,
          headers: {
            'x-q-plan': 'builder',
            'x-q-credits-remaining': '300',
          },
        },
      )
    }) as typeof fetch

    const response = await checkoutPost(checkoutRequest({
      email: 'user@example.com',
      plan: 'builder',
    }))

    expect(response.status).toBe(201)
    expect(response.headers.get('x-q-plan')).toBe('builder')
    expect(await response.json()).toMatchObject({
      ok: true,
      url: 'https://checkout.stripe.test/session',
    })
    expect(String(captured?.input)).toBe('https://billing.example.com/q/checkout')
    expect(captured?.init?.headers).toMatchObject({
      authorization: 'Bearer service-token',
      'x-q-website-action': 'checkout',
    })
  })

  test('local billing flow blocks keys before checkout, activates on Stripe checkout, and cancels on subscription deletion', async () => {
    const storePath = tempStorePath('q-billing')
    const env = {
      Q_ACCESS_STORE_PATH: storePath,
    } as NodeJS.ProcessEnv

    const signup = await signupHostedQUser({
      email: 'Builder@Example.com',
      plan: 'builder',
      env,
    })
    expect(signup.status).toBe(200)
    expect(signup.body).toMatchObject({
      requiresCheckout: true,
    })

    const blockedKey = await issueHostedQApiKey({
      email: 'builder@example.com',
      env,
    })
    expect(blockedKey.status).toBe(403)
    expect(blockedKey.body).toMatchObject({
      code: 'checkout_required',
    })

    const completed = await applyHostedQStripeEvent({
      env,
      event: stripeEvent('checkout.session.completed', {
        object: 'checkout.session',
        customer: 'cus_builder',
        subscription: 'sub_builder',
        customer_details: {
          email: 'builder@example.com',
        },
        metadata: {
          q_plan: 'builder',
          q_email: 'builder@example.com',
        },
      }),
    })
    expect(completed.status).toBe(200)
    expect(completed.headers?.['x-q-plan']).toBe('builder')
    expect(completed.body.user).toMatchObject({
      email: 'builder@example.com',
      plan: 'builder',
      subscriptionStatus: 'active',
      creditsRemaining: 300,
    })

    const issuedKey = await issueHostedQApiKey({
      email: 'builder@example.com',
      label: 'desktop',
      env,
    })
    expect(issuedKey.status).toBe(200)
    expect(String(issuedKey.body.apiKey)).toMatch(/^qk_/)

    const usage = await readHostedQUsage({
      email: 'builder@example.com',
      env,
    })
    expect(usage.status).toBe(200)
    expect(usage.body.user).toMatchObject({
      subscriptionStatus: 'active',
      creditsRemaining: 300,
    })

    const canceled = await applyHostedQStripeEvent({
      env,
      event: stripeEvent('customer.subscription.deleted', {
        object: 'subscription',
        id: 'sub_builder',
        customer: 'cus_builder',
      }),
    })
    expect(canceled.status).toBe(200)
    expect(canceled.body.user).toMatchObject({
      subscriptionStatus: 'canceled',
    })

    const blockedAfterCancel = await issueHostedQApiKey({
      email: 'builder@example.com',
      label: 'after-cancel',
      env,
    })
    expect(blockedAfterCancel.status).toBe(403)
    expect(blockedAfterCancel.body).toMatchObject({
      code: 'checkout_required',
    })
  })

  test('Stripe webhook route verifies signatures before syncing local entitlements', async () => {
    const storePath = tempStorePath('q-webhook')
    const secret = 'whsec_test_secret'
    process.env.NODE_ENV = 'production'
    process.env.Q_HOSTED_SERVICE_LOCAL_MODE = 'filesystem'
    process.env.Q_ACCESS_STORE_PATH = storePath
    process.env.STRIPE_SECRET_KEY = 'sk_test_webhook'
    process.env.STRIPE_WEBHOOK_SECRET = secret

    const signup = await signupHostedQUser({
      email: 'webhook@example.com',
      plan: 'operator',
      env: process.env,
    })
    expect(signup.status).toBe(200)

    const payload = JSON.stringify(
      stripeEvent('checkout.session.completed', {
        object: 'checkout.session',
        customer: 'cus_webhook',
        subscription: 'sub_webhook',
        customer_details: {
          email: 'webhook@example.com',
        },
        metadata: {
          q_plan: 'operator',
          q_email: 'webhook@example.com',
        },
      }),
    )

    const missingSignature = await stripeWebhookPost(
      new Request('https://qline.site/api/webhooks/stripe', {
        method: 'POST',
        body: payload,
      }),
    )
    expect(missingSignature.status).toBe(400)

    const verified = await stripeWebhookPost(
      await signedWebhookRequest({
        payload,
        secret,
      }),
    )
    expect(verified.status).toBe(200)
    expect(verified.headers.get('x-q-plan')).toBe('operator')
    expect(await verified.json()).toMatchObject({
      ok: true,
      received: true,
      type: 'checkout.session.completed',
      user: {
        email: 'webhook@example.com',
        plan: 'operator',
        subscriptionStatus: 'active',
        creditsRemaining: 3000,
      },
    })
  })
})
