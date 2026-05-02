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
  writeFileSync(
    join(serviceRoot, 'src', 'worker.ts'),
    'export default {}\n',
    'utf8',
  )
  writeFileSync(
    join(serviceRoot, 'migrations', '0001_hosted_q.sql'),
    'create table users (id text primary key);\n',
    'utf8',
  )
  writeFileSync(join(serviceRoot, 'wrangler.toml'), wranglerToml, 'utf8')
  return root
}

function writeFreshQTrace(
  root: string,
  timestamp: string,
  options: { ended?: boolean } = {},
): void {
  const outputDir = join(root, 'artifacts', 'q-release-audit')
  mkdirSync(outputDir, { recursive: true })
  const tracePath = join(outputDir, 'release.trace.jsonl')
  const sessionId = 'q-release-audit'
  const baseEvent = {
    schemaVersion: 'immaculate.event.v1',
    timestamp,
    sessionId,
  }
  const lines = [
    {
      ...baseEvent,
      type: 'session.started',
      tracePath,
      runId: sessionId,
      sessionScope: 'release-audit',
    },
    {
      ...baseEvent,
      type: 'route.dispatched',
      routeId: 'release-route',
      runId: sessionId,
      provider: 'oci',
      model: 'oci:Q',
      projectRoot: root,
    },
    {
      ...baseEvent,
      type: 'turn.complete',
      turnId: 'release-turn',
      routeId: 'release-route',
      status: 'completed',
      latencyMs: 42,
    },
    ...(options.ended === false
      ? []
      : [
          {
            ...baseEvent,
            type: 'session.ended',
            durationMs: 42,
          },
        ]),
  ]
  writeFileSync(
    tracePath,
    `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`,
    'utf8',
  )
}

function writeFailedQTrace(root: string, timestamp: string): void {
  const outputDir = join(root, 'artifacts', 'q-release-audit-failed')
  mkdirSync(outputDir, { recursive: true })
  const tracePath = join(outputDir, 'release.trace.jsonl')
  const sessionId = 'q-release-audit-failed'
  const baseEvent = {
    schemaVersion: 'immaculate.event.v1',
    timestamp,
    sessionId,
  }
  const lines = [
    {
      ...baseEvent,
      type: 'session.started',
      tracePath,
      runId: sessionId,
      sessionScope: 'release-audit',
    },
    {
      ...baseEvent,
      type: 'route.dispatched',
      routeId: 'release-route',
      runId: sessionId,
      provider: 'oci',
      model: 'oci:Q',
      projectRoot: root,
    },
    {
      ...baseEvent,
      type: 'cognitive.sampled',
      sampleId: 'release-route',
      workerId: 'oci-q',
      latencyMs: 50,
      tokenCount: null,
      status: 'failed',
    },
    {
      ...baseEvent,
      type: 'session.ended',
      durationMs: 50,
    },
  ]
  writeFileSync(
    tracePath,
    `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`,
    'utf8',
  )
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
  STRIPE_SUCCESS_URL: 'https://qline.site/success',
  STRIPE_CANCEL_URL: 'https://qline.site/cancel',
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
    expect(
      report.checks.find((check) => check.id === 'worker-package'),
    ).toMatchObject({
      status: 'passed',
    })
    expect(
      report.checks.find((check) => check.id === 'd1-binding'),
    ).toMatchObject({
      status: 'blocked',
      missing: [
        'services/cloudflare-hosted-q/wrangler.toml database_id or a tested replacement database adapter',
      ],
    })
    expect(
      report.checks.find((check) => check.id === 'worker-routes'),
    ).toMatchObject({
      status: 'blocked',
      missing: ['wrangler routes'],
    })
    expect(report.missingByCheck).toMatchObject({
      'd1-binding': [
        'services/cloudflare-hosted-q/wrangler.toml database_id or a tested replacement database adapter',
      ],
      'worker-routes': ['wrangler routes'],
      'fresh-q-trace': ['artifacts/q-*/**/*.trace.jsonl'],
    })
    expect(report.blockedActions).toEqual(
      expect.arrayContaining([
        'Create the Cloudflare D1 database, then replace REPLACE_WITH_CLOUDFLARE_D1_DATABASE_ID in wrangler.toml.',
        'Uncomment or add Cloudflare routes for the public hosted-Q worker origin before deploy.',
        'Populate the missing keys locally, then run the generated wrangler secret put commands.',
        'Set Q_HOSTED_SERVICE_BASE_URL to the deployed worker origin and Q_HOSTED_SERVICE_TOKEN to the worker service token on qline.site and iorch.net; do not use filesystem local mode for production.',
        'Generate a completed successful Q trace with a bounded Q soak or Terminal-Bench dry run, then rerun runtime:coherence before release-audit signoff.',
      ]),
    )
    expect(JSON.stringify(report)).not.toContain('service-token-secret')
  })

  test('passes when concrete Cloudflare, D1, secrets, routes, and public site env are present', () => {
    const root = createHostedQRoot(CONFIGURED_WRANGLER)
    writeFreshQTrace(root, '2026-05-01T00:00:00.000Z')
    const report = buildHostedQProvisioningPreflight({
      root,
      env: READY_ENV,
      now: new Date('2026-05-01T00:00:00.000Z'),
    })

    expect(report.status).toBe('ready')
    expect(report.counts.blocked).toBe(0)
    expect(report.checks.every((check) => check.status === 'passed')).toBe(true)
    expect(report.missingByCheck).toEqual({})
    expect(report.blockedActions).toEqual([])
    expect(report.commands).toContain(
      'bunx wrangler d1 migrations apply openjaws-hosted-q --remote --config services/cloudflare-hosted-q/wrangler.toml',
    )
    expect(JSON.stringify(report)).not.toContain('cloudflare-token')
    expect(JSON.stringify(report)).not.toContain('stripe-secret')
  })

  test('blocks release audit when the latest fresh Q trace only contains failed probe evidence', () => {
    const root = createHostedQRoot(CONFIGURED_WRANGLER)
    writeFailedQTrace(root, '2026-05-01T00:00:00.000Z')
    const report = buildHostedQProvisioningPreflight({
      root,
      env: READY_ENV,
      now: new Date('2026-05-01T00:00:00.000Z'),
    })

    expect(report.status).toBe('blocked')
    expect(
      report.checks.find((check) => check.id === 'fresh-q-trace'),
    ).toMatchObject({
      status: 'blocked',
      summary:
        'Fresh Q trace is present but does not contain successful release-audit probe evidence.',
      missing: ['completed successful Q trace within 24h'],
      details: {
        releaseEvidence: {
          present: true,
          successEvents: 0,
          failureEvents: 1,
          sampledEvents: 1,
          completedTurns: 0,
          ready: false,
          readError: null,
        },
      },
    })
  })

  test('blocks active Q traces even when they already contain successful probe evidence', () => {
    const root = createHostedQRoot(CONFIGURED_WRANGLER)
    writeFreshQTrace(root, '2026-05-01T00:00:00.000Z', { ended: false })
    const report = buildHostedQProvisioningPreflight({
      root,
      env: READY_ENV,
      now: new Date('2026-05-01T00:00:00.000Z'),
    })

    expect(report.status).toBe('blocked')
    expect(
      report.checks.find((check) => check.id === 'fresh-q-trace'),
    ).toMatchObject({
      status: 'blocked',
      summary:
        'Fresh Q trace is still active; release-audit signoff requires a completed successful trace.',
      missing: ['completed successful Q trace within 24h'],
      details: {
        runState: 'active',
        releaseEvidence: {
          present: true,
          successEvents: 1,
          failureEvents: 0,
          completedTurns: 1,
          ready: true,
        },
      },
    })
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

    expect(
      report.checks.find((check) => check.id === 'worker-secrets'),
    ).toMatchObject({
      status: 'blocked',
      missing: [
        'SERVICE_TOKEN',
        'STRIPE_PRICE_OPERATOR',
        'STRIPE_SUCCESS_URL',
        'STRIPE_CANCEL_URL',
      ],
    })
    expect(
      report.checks.find((check) => check.id === 'mail-engine'),
    ).toMatchObject({
      status: 'blocked',
      missing: ['RESEND_FROM_EMAIL'],
    })
    expect(
      report.checks.find((check) => check.id === 'public-site-env'),
    ).toMatchObject({
      status: 'blocked',
      missing: ['Q_HOSTED_SERVICE_TOKEN'],
    })
  })

  test('blocks production release when the public proxy is pinned to filesystem mode', () => {
    const root = createHostedQRoot(CONFIGURED_WRANGLER)
    writeFreshQTrace(root, '2026-05-01T00:00:00.000Z')
    const report = buildHostedQProvisioningPreflight({
      root,
      env: {
        ...READY_ENV,
        Q_HOSTED_SERVICE_LOCAL_MODE: 'filesystem',
      },
      now: new Date('2026-05-01T00:00:00.000Z'),
    })

    expect(report.status).toBe('blocked')
    expect(
      report.checks.find((check) => check.id === 'public-site-env'),
    ).toMatchObject({
      status: 'blocked',
      missing: ['Q_HOSTED_SERVICE_LOCAL_MODE=filesystem'],
    })
  })
})
