import Stripe from 'stripe'
import { findQPlan, type QPlanDefinition, type QPlanId } from './pricing'

export type StripeRuntimeConfig = {
  secretKey: string | null
  publishableKey: string | null
  webhookSecret: string | null
  successUrl: string | null
  cancelUrl: string | null
  portalReturnUrl: string | null
}

function normalizeOptional(value: string | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function appendQueryParams(
  value: string,
  params: Record<string, string>,
): string {
  const url = new URL(value)
  for (const [key, entry] of Object.entries(params)) {
    url.searchParams.set(key, entry)
  }
  return url.toString()
}

export function resolveStripeRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): StripeRuntimeConfig {
  return {
    secretKey: normalizeOptional(env.STRIPE_SECRET_KEY),
    publishableKey: normalizeOptional(env.STRIPE_PUBLISHABLE_KEY),
    webhookSecret: normalizeOptional(env.STRIPE_WEBHOOK_SECRET),
    successUrl: normalizeOptional(env.STRIPE_SUCCESS_URL),
    cancelUrl: normalizeOptional(env.STRIPE_CANCEL_URL),
    portalReturnUrl: normalizeOptional(env.STRIPE_PORTAL_RETURN_URL),
  }
}

export function stripeCheckoutReady(
  config: StripeRuntimeConfig,
): boolean {
  return Boolean(config.secretKey && config.successUrl && config.cancelUrl)
}

export function resolveStripePlan(
  plan: string,
  env: NodeJS.ProcessEnv = process.env,
): (QPlanDefinition & { stripePriceId: string | null }) | null {
  const definition = findQPlan(plan)
  if (!definition) {
    return null
  }

  return {
    ...definition,
    stripePriceId: definition.stripePriceEnv
      ? normalizeOptional(env[definition.stripePriceEnv])
      : null,
  }
}

export function createStripeClient(
  config: StripeRuntimeConfig = resolveStripeRuntimeConfig(),
): Stripe {
  if (!config.secretKey) {
    throw new Error('Stripe secret key is not configured.')
  }

  return new Stripe(config.secretKey)
}

export async function createCheckoutSession(args: {
  email: string | null
  plan: QPlanId
  env?: NodeJS.ProcessEnv
}): Promise<{
  url: string
  sessionId: string
  publishableKey: string | null
  plan: QPlanId
}> {
  const config = resolveStripeRuntimeConfig(args.env)
  if (!stripeCheckoutReady(config)) {
    throw new Error(
      'Stripe checkout is not configured. Set STRIPE_SECRET_KEY, STRIPE_SUCCESS_URL, and STRIPE_CANCEL_URL.',
    )
  }

  const plan = resolveStripePlan(args.plan, args.env)
  if (!plan) {
    throw new Error(`Unknown plan "${args.plan}".`)
  }
  if (!plan.stripePriceId) {
    throw new Error(
      plan.id === 'starter'
        ? 'Starter is a free lane and does not create a Stripe checkout session.'
        : `Stripe price ID is not configured for ${plan.name}.`,
    )
  }

  const stripe = createStripeClient(config)
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    success_url: appendQueryParams(config.successUrl!, {
      plan: plan.id,
      session_id: '{CHECKOUT_SESSION_ID}',
    }),
    cancel_url: appendQueryParams(config.cancelUrl!, {
      plan: plan.id,
    }),
    customer_email: args.email || undefined,
    client_reference_id: args.email ?? undefined,
    line_items: [
      {
        price: plan.stripePriceId,
        quantity: 1,
      },
    ],
    allow_promotion_codes: true,
    billing_address_collection: 'auto',
    metadata: {
      q_plan: plan.id,
      ...(args.email
        ? {
            q_email: args.email,
          }
        : {}),
    },
  })

  if (!session.url) {
    throw new Error('Stripe checkout session did not return a URL.')
  }

  return {
    url: session.url,
    sessionId: session.id,
    publishableKey: config.publishableKey,
    plan: plan.id,
  }
}
