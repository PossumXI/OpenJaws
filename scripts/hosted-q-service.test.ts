import { afterEach, describe, expect, test } from 'bun:test'
import {
  buildHostedQServiceTarget,
  buildHostedQServiceUnavailableResponse,
  proxyHostedQServiceJsonPayload,
  resolveHostedQServiceMode,
  type HostedQServiceConfig,
} from '../website/lib/hostedQService'

const ORIGINAL_ENV = { ...process.env }
const originalFetch = globalThis.fetch

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
  globalThis.fetch = originalFetch
})

describe('hosted Q service boundary', () => {
  test('fails closed in production without a hosted backend', () => {
    process.env.NODE_ENV = 'production'
    delete process.env.Q_HOSTED_SERVICE_BASE_URL
    delete process.env.Q_HOSTED_SERVICE_LOCAL_MODE

    expect(resolveHostedQServiceMode()).toBe('unconfigured')
  })

  test('keeps explicit filesystem mode available for local smoke work', () => {
    process.env.NODE_ENV = 'production'
    process.env.Q_HOSTED_SERVICE_LOCAL_MODE = 'filesystem'
    delete process.env.Q_HOSTED_SERVICE_BASE_URL

    expect(resolveHostedQServiceMode()).toBe('filesystem')
  })

  test('builds a stable hosted backend target per action', () => {
    const config: HostedQServiceConfig = {
      siteUrl: 'https://qline.site',
      auraGenesisUrl: 'https://aura-genesis.org',
      baseUrl: 'https://api.example.com/q/',
      serviceToken: 'token',
    }

    expect(buildHostedQServiceTarget(config, 'signup')).toBe(
      'https://api.example.com/q/signup',
    )
    expect(buildHostedQServiceTarget(config, 'checkout')).toBe(
      'https://api.example.com/q/checkout',
    )
    expect(buildHostedQServiceTarget(config, 'stripe-webhook')).toBe(
      'https://api.example.com/q/stripe-webhook',
    )
  })

  test('unavailable responses do not mint demo access', async () => {
    const response = buildHostedQServiceUnavailableResponse({
      action: 'keys',
      mode: 'unconfigured',
    })
    const body = await response.json()

    expect(response.status).toBe(503)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(body).toMatchObject({
      ok: false,
      code: 'hosted_q_backend_required',
      action: 'keys',
      mode: 'unconfigured',
    })
    expect(JSON.stringify(body)).not.toContain('qk_')
    expect(JSON.stringify(body)).not.toContain('filesystem-demo')
  })

  test('proxy forwards verified payloads to the configured hosted backend', async () => {
    process.env.NODE_ENV = 'production'
    process.env.NEXT_PUBLIC_SITE_URL = 'https://qline.site'
    process.env.NEXT_PUBLIC_AURA_GENESIS_URL = 'https://aura-genesis.org'
    process.env.Q_HOSTED_SERVICE_BASE_URL = 'https://api.example.com/q'
    process.env.Q_HOSTED_SERVICE_TOKEN = 'service-token'

    let captured: { input: RequestInfo | URL; init?: RequestInit } | null = null
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      captured = { input, init }
      return Response.json(
        { ok: true, received: true },
        {
          status: 202,
          headers: {
            'x-q-plan': 'builder',
          },
        },
      )
    }) as typeof fetch

    const response = await proxyHostedQServiceJsonPayload({
      action: 'stripe-webhook',
      payload: { verified: true, type: 'checkout.session.completed' },
      headers: {
        'x-q-stripe-event-type': 'checkout.session.completed',
      },
    })
    const body = await response.json()

    expect(response.status).toBe(202)
    expect(response.headers.get('x-q-plan')).toBe('builder')
    expect(body).toEqual({ ok: true, received: true })
    expect(String(captured?.input)).toBe('https://api.example.com/q/stripe-webhook')
    expect(captured?.init?.method).toBe('POST')
    expect(captured?.init?.headers).toMatchObject({
      authorization: 'Bearer service-token',
      'x-q-site-url': 'https://qline.site',
      'x-q-aura-genesis-url': 'https://aura-genesis.org',
      'x-q-website-action': 'stripe-webhook',
      'x-q-stripe-event-type': 'checkout.session.completed',
    })
  })
})
