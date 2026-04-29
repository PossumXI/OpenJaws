import { NextResponse } from 'next/server'
import { createCheckoutSession, stripeCheckoutReady, resolveStripeRuntimeConfig } from '../../../lib/stripe'
import {
  proxyHostedQServiceRequest,
  resolveHostedQServiceMode,
} from '../../../lib/hostedQService'

type CheckoutRequest = {
  email?: string
  plan?: string
}

export const runtime = 'nodejs'

export async function POST(request: Request): Promise<NextResponse> {
  if (resolveHostedQServiceMode() === 'proxy') {
    return proxyHostedQServiceRequest({ action: 'checkout', request })
  }

  const body = (await request.json().catch(() => ({}))) as CheckoutRequest
  const config = resolveStripeRuntimeConfig()
  const email =
    typeof body.email === 'string' ? body.email.trim() : ''
  const plan =
    typeof body.plan === 'string'
      ? (body.plan as 'starter' | 'builder' | 'operator')
      : 'builder'

  if (!stripeCheckoutReady(config)) {
    return NextResponse.json(
      {
        ok: false,
        code: 'stripe_not_configured',
        message:
          'Stripe checkout is not configured yet. Set STRIPE_SECRET_KEY, STRIPE_SUCCESS_URL, and STRIPE_CANCEL_URL.',
      },
      { status: 503 },
    )
  }

  try {
    if (!email) {
      return NextResponse.json(
        {
          ok: false,
          code: 'email_required',
          message:
            'Email is required before creating a Stripe checkout session.',
        },
        { status: 400 },
      )
    }

    const session = await createCheckoutSession({
      email,
      plan,
    })

    return NextResponse.json({
      ok: true,
      message: 'Stripe checkout session created.',
      ...session,
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Stripe checkout failed.'

    return NextResponse.json(
      {
        ok: false,
        message,
      },
      {
        status: message.includes('free lane') || message.includes('Unknown plan')
          ? 400
          : 503,
      },
    )
  }
}
