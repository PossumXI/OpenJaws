import { NextResponse } from 'next/server'
import { createStripeClient, resolveStripeRuntimeConfig } from '../../../../lib/stripe'
import {
  buildHostedQServiceUnavailableResponse,
  proxyHostedQServiceJsonPayload,
  resolveHostedQServiceMode,
} from '../../../../lib/hostedQService'
import { applyHostedQStripeEvent } from '../../../../lib/qHostedAccess'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request): Promise<NextResponse> {
  const config = resolveStripeRuntimeConfig()
  if (!config.secretKey || !config.webhookSecret) {
    return NextResponse.json(
      {
        ok: false,
        code: 'stripe_webhook_not_configured',
        message:
          'Stripe webhook is not configured yet. Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET.',
      },
      { status: 503 },
    )
  }

  const signature = request.headers.get('stripe-signature')
  if (!signature) {
    return NextResponse.json(
      {
        ok: false,
        message: 'Missing Stripe signature header.',
      },
      { status: 400 },
    )
  }

  const rawBody = await request.text()

  try {
    const event = await createStripeClient(config).webhooks.constructEventAsync(
      rawBody,
      signature,
      config.webhookSecret,
    )

    const mode = resolveHostedQServiceMode()
    if (mode === 'filesystem') {
      const result = await applyHostedQStripeEvent({ event })
      return NextResponse.json(result.body, {
        status: result.status,
        headers: result.headers,
      })
    }

    if (mode === 'proxy') {
      return proxyHostedQServiceJsonPayload({
        action: 'stripe-webhook',
        payload: {
          verified: true,
          type: event.type,
          event,
        },
        headers: {
          'x-q-stripe-event-type': event.type,
        },
      })
    }

    return buildHostedQServiceUnavailableResponse({
      action: 'stripe-webhook',
      mode,
    })
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : 'Stripe webhook verification failed.',
      },
      { status: 400 },
    )
  }
}
