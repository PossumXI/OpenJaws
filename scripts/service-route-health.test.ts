import { describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  JAWS_RELEASE_API_URL,
  JAWS_RELEASE_PREVIOUS_PATCH_VERSION,
  JAWS_RELEASE_TAG,
  JAWS_RELEASE_VERSION,
} from './jaws-release-index.ts'
import { runServiceRouteHealth } from './service-route-health.js'

function response(status: number, body = ''): Response {
  return new Response(status === 204 ? null : body, { status })
}

function makeFetch(overrides: Record<string, Response> = {}) {
  return async (input: string | URL): Promise<Response> => {
    const url = String(input)
    const mapped = overrides[url]
    if (mapped) {
      return mapped.clone()
    }
    if (url === 'https://qline.site') {
      return response(200, '<html>OpenJaws</html>')
    }
    if (url === JAWS_RELEASE_API_URL) {
      return response(200, JSON.stringify({ tag_name: JAWS_RELEASE_TAG, draft: false }))
    }
    if (url === 'https://qline.site/terms') {
      return response(200, '<html>terms</html>')
    }
    if (url === 'https://qline.site/downloads/jaws') {
      return response(200, '<html>JAWS</html>')
    }
    if (url === `https://qline.site/api/jaws/windows/x86_64/${JAWS_RELEASE_PREVIOUS_PATCH_VERSION}`) {
      return response(200, `{"version":"${JAWS_RELEASE_VERSION}"}`)
    }
    if (url === `https://qline.site/api/jaws/windows/x86_64/${JAWS_RELEASE_VERSION}`) {
      return response(204)
    }
    if (url === 'https://qline.site/api/signup') {
      return response(400, '{"ok":false}')
    }
    if (url === 'https://api.qline.site/health') {
      return response(200, '{"ok":true,"service":"openjaws-hosted-q"}')
    }
    if (url === 'https://api.qline.site/laas/health') {
      return response(200, '{"ok":true,"service":"arobi-laas"}')
    }
    if (url === 'https://arobi.aura-genesis.org/health') {
      return response(200, '{"ok":true,"service":"arobi-edge"}')
    }
    if (url === 'https://iorch.net/downloads/jaws') {
      return response(200, '<html>JAWS</html>')
    }
    if (url === `https://iorch.net/api/jaws/windows/x86_64/${JAWS_RELEASE_PREVIOUS_PATCH_VERSION}`) {
      return response(200, `{"version":"${JAWS_RELEASE_VERSION}"}`)
    }
    if (url === `https://iorch.net/api/jaws/windows/x86_64/${JAWS_RELEASE_VERSION}`) {
      return response(204)
    }
    throw new Error(`offline: ${url}`)
  }
}

function netlifyEnvPayload(keys: string[]): string {
  return JSON.stringify(
    keys.map(key => ({
      key,
      values: [{ context: 'all', value: `${key.toLowerCase()}-configured` }],
    })),
  )
}

const EMPTY_ENV = {
  OCI_CONFIG_FILE: 'C:\\missing\\oci\\config',
} as NodeJS.ProcessEnv

describe('service-route-health', () => {
  test('keeps public routes required while separating repo packages from provisioning', async () => {
    const report = await runServiceRouteHealth({
      fetchImpl: makeFetch(),
      env: EMPTY_ENV,
      timeoutMs: 1,
    })

    expect(report.status).toBe('warning')
    expect(report.failures).toHaveLength(0)
    expect(report.counts.passed).toBeGreaterThanOrEqual(9)
    expect(
      report.checks.find(check => check.id === 'hosted-q-worker-package'),
    ).toMatchObject({ status: 'passed' })
    expect(
      report.checks.find(check => check.id === 'production-database-config'),
    ).toMatchObject({ status: 'not_configured' })
    expect(
      report.checks.find(check => check.id === 'cloudflare-config'),
    ).toMatchObject({ status: 'not_configured' })
    expect(
      report.checks.find(check => check.id === 'hosted-q-backend-config'),
    ).toMatchObject({ status: 'not_configured' })
    expect(
      report.checks.find(check => check.id === 'stripe-billing-config'),
    ).toMatchObject({ status: 'not_configured' })
    expect(
      report.checks.find(check => check.id === 'mail-engine-config'),
    ).toMatchObject({ status: 'not_configured' })
    expect(
      report.checks.find(check => check.id === 'arobi-laas-config'),
    ).toMatchObject({ status: 'not_configured' })
    expect(report.checks.some(check => check.id === 'arobi-laas-live')).toBe(false)
  })

  test('uses qline Netlify env metadata for deployed Stripe configuration', async () => {
    const report = await runServiceRouteHealth({
      fetchImpl: makeFetch({
        'https://api.netlify.com/api/v1/sites/edde15e1-bf1f-4986-aef3-5803fdce7406':
          response(200, JSON.stringify({
            name: 'qline-site-20260415022202',
            account_slug: 'possumxi',
          })),
        'https://api.netlify.com/api/v1/accounts/possumxi/env?site_id=edde15e1-bf1f-4986-aef3-5803fdce7406':
          response(200, netlifyEnvPayload([
            'STRIPE_SECRET_KEY',
            'STRIPE_PRICE_BUILDER',
            'STRIPE_SUCCESS_URL',
            'STRIPE_CANCEL_URL',
          ])),
      }),
      env: {
        ...EMPTY_ENV,
        NETLIFY_AUTH_TOKEN: 'netlify-token',
      },
      timeoutMs: 1,
    })

    expect(
      report.checks.find(check => check.id === 'stripe-billing-config'),
    ).toMatchObject({
      status: 'passed',
      details: {
        secretConfigured: true,
        priceConfigured: true,
        returnUrlsConfigured: true,
        configSource: 'qline-netlify-env',
      },
    })
    expect(
      report.checks.find(check => check.id === 'netlify-auth-config'),
    ).toMatchObject({ status: 'passed' })
  })

  test('treats next JAWS updater payload as not configured before the tag is public', async () => {
    const report = await runServiceRouteHealth({
      fetchImpl: makeFetch({
        [JAWS_RELEASE_API_URL]: response(404, '{"message":"Not Found"}'),
        [`https://qline.site/api/jaws/windows/x86_64/${JAWS_RELEASE_PREVIOUS_PATCH_VERSION}`]: response(204),
        [`https://iorch.net/api/jaws/windows/x86_64/${JAWS_RELEASE_PREVIOUS_PATCH_VERSION}`]: response(204),
      }),
      env: EMPTY_ENV,
      timeoutMs: 1,
    })

    expect(report.failures).toHaveLength(0)
    expect(report.status).toBe('warning')
    expect(
      report.checks.find(check => check.id === 'qline-jaws-updater-old'),
    ).toMatchObject({
      status: 'not_configured',
      httpStatus: 204,
      details: {
        releaseTag: JAWS_RELEASE_TAG,
        currentVersion: JAWS_RELEASE_VERSION,
        previousTesterVersion: JAWS_RELEASE_PREVIOUS_PATCH_VERSION,
      },
    })
  })

  test('requires concrete remote config before production services pass', async () => {
    const report = await runServiceRouteHealth({
      fetchImpl: makeFetch(),
      env: {
        ...EMPTY_ENV,
        Q_HOSTED_SERVICE_BASE_URL: 'https://api.qline.site',
        Q_HOSTED_SERVICE_TOKEN: 'service-token',
        CLOUDFLARE_ACCOUNT_ID: 'account-id',
        CLOUDFLARE_API_TOKEN: 'cloudflare-token',
        CLOUDFLARE_D1_DATABASE_ID: 'd1-database-id',
        STRIPE_SECRET_KEY: 'stripe-secret',
        STRIPE_PRICE_BUILDER: 'price-builder',
        STRIPE_SUCCESS_URL: 'https://qline.site/success',
        STRIPE_CANCEL_URL: 'https://qline.site/cancel',
        RESEND_API_KEY: 'resend-key',
        RESEND_FROM_EMAIL: 'JAWS <updates@qline.site>',
        AROBI_LAAS_API_URL: 'https://api.qline.site/laas',
        AROBI_LAAS_API_TOKEN: 'laas-token',
      },
      timeoutMs: 1,
    })

    expect(report.status).toBe('warning')
    expect(
      report.checks.find(check => check.id === 'hosted-q-backend-live'),
    ).toMatchObject({ status: 'passed', url: 'https://api.qline.site/health' })
    expect(
      report.checks.find(check => check.id === 'production-database-config'),
    ).toMatchObject({ status: 'passed' })
    expect(
      report.checks.find(check => check.id === 'cloudflare-config'),
    ).toMatchObject({ status: 'passed' })
    expect(
      report.checks.find(check => check.id === 'hosted-q-backend-config'),
    ).toMatchObject({ status: 'passed' })
    expect(
      report.checks.find(check => check.id === 'stripe-billing-config'),
    ).toMatchObject({
      status: 'passed',
      details: {
        secretConfigured: true,
        priceConfigured: true,
        returnUrlsConfigured: true,
        checkoutRoute: 'POST /checkout',
        webhookRoute: 'POST /stripe-webhook',
      },
    })
    expect(
      report.checks.find(check => check.id === 'mail-engine-config'),
    ).toMatchObject({ status: 'passed' })
    expect(
      report.checks.find(check => check.id === 'arobi-laas-config'),
    ).toMatchObject({ status: 'passed' })
    expect(
      report.checks.find(check => check.id === 'arobi-laas-live'),
    ).toMatchObject({
      status: 'passed',
      url: 'https://api.qline.site/laas/health',
    })
  })

  test('recognizes a local AROBI edge secret without leaking the token value', async () => {
    const home = mkdtempSync(join(tmpdir(), 'openjaws-arobi-edge-'))
    mkdirSync(join(home, '.arobi'), { recursive: true })
    writeFileSync(
      join(home, '.arobi', 'edge-secrets.json'),
      JSON.stringify({ AROBI_API_TOKEN: 'local-arobi-secret-token' }),
    )

    try {
      const report = await runServiceRouteHealth({
        fetchImpl: makeFetch(),
        env: {
          ...EMPTY_ENV,
          USERPROFILE: home,
        },
        timeoutMs: 1,
      })

      const laasConfig = report.checks.find(check => check.id === 'arobi-laas-config')
      const laasLive = report.checks.find(check => check.id === 'arobi-laas-live')
      expect(laasConfig).toMatchObject({
        status: 'passed',
        details: {
          baseURL: 'https://arobi.aura-genesis.org',
          source: 'local_edge_secret',
          tokenConfigured: true,
        },
      })
      expect(laasLive).toMatchObject({
        status: 'passed',
        url: 'https://arobi.aura-genesis.org/health',
      })
      expect(JSON.stringify(laasConfig)).not.toContain('local-arobi-secret-token')
      expect(JSON.stringify(laasLive)).not.toContain('local-arobi-secret-token')
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })

  test('fails closed when a required public route is unhealthy', async () => {
    const report = await runServiceRouteHealth({
      fetchImpl: makeFetch({
        'https://qline.site': response(500, 'down'),
      }),
      env: EMPTY_ENV,
      timeoutMs: 1,
    })

    expect(report.status).toBe('failed')
    expect(report.failures.some(check => check.id === 'qline-home')).toBe(true)
  })
})
