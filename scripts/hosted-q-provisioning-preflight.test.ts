import { describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { buildHostedQProvisioningPreflight } from './hosted-q-provisioning-preflight.ts'

function createHostedQRoot(wranglerToml: string): string {
  const root = mkdtempSync(join(tmpdir(), 'openjaws-hosted-q-preflight-'))
  const serviceRoot = join(root, 'services', 'cloudflare-hosted-q')
  mkdirSync(join(serviceRoot, 'src'), { recursive: true })
  mkdirSync(join(serviceRoot, 'migrations'), { recursive: true })
  writeFileSync(join(serviceRoot, 'src', 'worker.ts'), 'export default {}\n', 'utf8')
  writeFileSync(
    join(serviceRoot, 'migrations', '0001_hosted_q.sql'),
    'create table users (id text primary key);\n',
    'utf8',
  )
  writeFileSync(join(serviceRoot, 'wrangler.toml'), wranglerToml, 'utf8')
  return root
}

const PLACEHOLDER_WRANGLER = `
name = "openjaws-hosted-q"
main = "src/worker.ts"
workers_dev = false

# routes = [
#   { pattern = "api.qline.site/*", custom_domain = true }
# ]

[[d1_databases]]
binding = "Q_HOSTED_DB"
database_name = "openjaws-hosted-q"
database_id = "REPLACE_WITH_CLOUDFLARE_D1_DATABASE_ID"
migrations_dir = "migrations"
`

const CONFIGURED_WRANGLER = `
name = "openjaws-hosted-q"
main = "src/worker.ts"
workers_dev = false
routes = [
  { pattern = "api.qline.site/*", custom_domain = true },
  { pattern = "api.iorch.net/*", custom_domain = true }
]

[[d1_databases]]
binding = "Q_HOSTED_DB"
database_name = "openjaws-hosted-q"
database_id = "9f0835f8-0000-4000-9000-111111111111"
migrations_dir = "migrations"
`

const READY_ENV = {
  CLOUDFLARE_ACCOUNT_ID: 'account-id',
  CLOUDFLARE_API_TOKEN: 'cloudflare-token',
  SERVICE_TOKEN: 'service-token-secret',
  RESEND_API_KEY: 'resend-secret',
  RESEND_FROM_EMAIL: 'JAWS <updates@qline.site>',
  STRIPE_SECRET_KEY: 'stripe-secret',
  STRIPE_PRICE_BUILDER: 'price-builder',
  STRIPE_PRICE_OPERATOR: 'price-operator',
  Q_HOSTED_SERVICE_BASE_URL: 'https://api.qline.site',
  Q_HOSTED_SERVICE_TOKEN: 'service-token-secret',
} as NodeJS.ProcessEnv

describe('hosted-q provisioning preflight', () => {
  test('blocks placeholder D1 and commented routes without leaking secret values', () => {
    const root = createHostedQRoot(PLACEHOLDER_WRANGLER)
    const report = buildHostedQProvisioningPreflight({
      root,
      env: {
        CLOUDFLARE_ACCOUNT_ID: 'account-id',
        CLOUDFLARE_API_TOKEN: 'cloudflare-token',
        SERVICE_TOKEN: 'service-token-secret',
      },
      now: new Date('2026-05-01T00:00:00.000Z'),
    })

    expect(report.status).toBe('blocked')
    expect(report.counts.blocked).toBeGreaterThan(0)
    expect(report.checks.find(check => check.id === 'worker-package')).toMatchObject({
      status: 'passed',
    })
    expect(report.checks.find(check => check.id === 'd1-binding')).toMatchObject({
      status: 'blocked',
      missing: ['services/cloudflare-hosted-q/wrangler.toml database_id'],
    })
    expect(report.checks.find(check => check.id === 'worker-routes')).toMatchObject({
      status: 'blocked',
      missing: ['wrangler routes'],
    })
    expect(JSON.stringify(report)).not.toContain('service-token-secret')
  })

  test('passes when concrete Cloudflare, D1, secrets, routes, and public site env are present', () => {
    const root = createHostedQRoot(CONFIGURED_WRANGLER)
    const report = buildHostedQProvisioningPreflight({
      root,
      env: READY_ENV,
      now: new Date('2026-05-01T00:00:00.000Z'),
    })

    expect(report.status).toBe('ready')
    expect(report.counts.blocked).toBe(0)
    expect(report.checks.every(check => check.status === 'passed')).toBe(true)
    expect(report.commands).toContain(
      'bunx wrangler d1 migrations apply openjaws-hosted-q --remote --config services/cloudflare-hosted-q/wrangler.toml',
    )
    expect(JSON.stringify(report)).not.toContain('cloudflare-token')
    expect(JSON.stringify(report)).not.toContain('stripe-secret')
  })

  test('reports exactly which worker and public-site env keys are missing', () => {
    const root = createHostedQRoot(CONFIGURED_WRANGLER)
    const report = buildHostedQProvisioningPreflight({
      root,
      env: {
        CLOUDFLARE_ACCOUNT_ID: 'account-id',
        CLOUDFLARE_API_TOKEN: 'cloudflare-token',
        RESEND_API_KEY: 'resend-secret',
        STRIPE_SECRET_KEY: 'stripe-secret',
        STRIPE_PRICE_BUILDER: 'price-builder',
        Q_HOSTED_SERVICE_BASE_URL: 'https://api.qline.site',
      },
      now: new Date('2026-05-01T00:00:00.000Z'),
    })

    expect(report.checks.find(check => check.id === 'worker-secrets')).toMatchObject({
      status: 'blocked',
      missing: [
        'SERVICE_TOKEN',
        'RESEND_FROM_EMAIL',
        'STRIPE_PRICE_OPERATOR',
      ],
    })
    expect(report.checks.find(check => check.id === 'public-site-env')).toMatchObject({
      status: 'blocked',
      missing: ['Q_HOSTED_SERVICE_TOKEN'],
    })
  })
})
