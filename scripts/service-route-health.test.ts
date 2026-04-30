import { describe, expect, test } from 'bun:test'
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
    if (url === 'https://qline.site/terms') {
      return response(200, '<html>terms</html>')
    }
    if (url === 'https://qline.site/downloads/jaws') {
      return response(200, '<html>JAWS</html>')
    }
    if (url === 'https://qline.site/api/jaws/windows/x86_64/0.1.3') {
      return response(200, '{"version":"0.1.4"}')
    }
    if (url === 'https://qline.site/api/jaws/windows/x86_64/0.1.4') {
      return response(204)
    }
    if (url === 'https://qline.site/api/signup') {
      return response(400, '{"ok":false}')
    }
    if (url === 'https://iorch.net/downloads/jaws') {
      return response(200, '<html>JAWS</html>')
    }
    if (url === 'https://iorch.net/api/jaws/windows/x86_64/0.1.3') {
      return response(200, '{"version":"0.1.4"}')
    }
    if (url === 'https://iorch.net/api/jaws/windows/x86_64/0.1.4') {
      return response(204)
    }
    throw new Error(`offline: ${url}`)
  }
}

const EMPTY_ENV = {
  OCI_CONFIG_FILE: 'C:\\missing\\oci\\config',
} as NodeJS.ProcessEnv

describe('service-route-health', () => {
  test('keeps public routes required while recognizing repo-owned backend provisioning', async () => {
    const report = await runServiceRouteHealth({
      fetchImpl: makeFetch(),
      env: EMPTY_ENV,
      timeoutMs: 1,
    })

    expect(report.status).toBe('warning')
    expect(report.failures).toHaveLength(0)
    expect(report.counts.passed).toBeGreaterThanOrEqual(9)
    expect(
      report.checks.find(check => check.id === 'production-database-config'),
    ).toMatchObject({ status: 'passed' })
    expect(
      report.checks.find(check => check.id === 'cloudflare-config'),
    ).toMatchObject({ status: 'passed' })
    expect(
      report.checks.find(check => check.id === 'hosted-q-backend-config'),
    ).toMatchObject({ status: 'passed' })
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
