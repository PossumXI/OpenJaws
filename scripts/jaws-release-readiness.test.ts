import { describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { HostedQProvisioningPreflightReport } from './hosted-q-provisioning-preflight.ts'
import type { JawsReleaseIndex } from './jaws-release-index.ts'
import { buildJawsReleaseReadiness } from './jaws-release-readiness.ts'
import type { ServiceRouteHealthReport } from './service-route-health.ts'

function createRoot(packageVersion = '0.1.9'): string {
  const root = mkdtempSync(join(tmpdir(), 'openjaws-jaws-readiness-'))
  const appRoot = join(root, 'apps', 'jaws-desktop')
  mkdirSync(appRoot, { recursive: true })
  writeFileSync(
    join(appRoot, 'package.json'),
    `${JSON.stringify({ version: packageVersion }, null, 2)}\n`,
    'utf8',
  )
  return root
}

function releaseIndex(version = '0.1.9'): JawsReleaseIndex {
  const tag = `jaws-v${version}`
  return {
    schemaVersion: 1,
    product: 'JAWS',
    version,
    tag,
    repo: 'PossumXI/OpenJaws',
    github: {
      releaseUrl: `https://github.com/PossumXI/OpenJaws/releases/tag/${tag}`,
      apiUrl: `https://api.github.com/repos/PossumXI/OpenJaws/releases/tags/${tag}`,
      baseAssetUrl: `https://github.com/PossumXI/OpenJaws/releases/download/${tag}`,
    },
    mirrors: [],
    assets: [
      {
        id: 'windows',
        route: 'windows',
        file: `JAWS_${version}_x64-setup.exe`,
        requiresSignature: true,
      },
      {
        id: 'manifest',
        route: 'latest.json',
        file: 'latest.json',
        requiresSignature: false,
      },
    ],
    updaterPlatforms: [],
  }
}

function hostedReport(
  overrides: Partial<HostedQProvisioningPreflightReport> = {},
): HostedQProvisioningPreflightReport {
  return {
    status: 'ready',
    checkedAt: '2026-05-02T00:00:00.000Z',
    root: 'root',
    wranglerConfigPath: 'wrangler.toml',
    counts: { passed: 8, blocked: 0 },
    checks: [],
    missingByCheck: {},
    blockedActions: [],
    commands: [],
    ...overrides,
  }
}

function routeReport(
  overrides: Partial<ServiceRouteHealthReport> = {},
): ServiceRouteHealthReport {
  return {
    status: 'passed',
    checkedAt: '2026-05-02T00:00:00.000Z',
    counts: { passed: 3, warning: 0, failed: 0, not_configured: 0 },
    checks: [],
    failures: [],
    warnings: [],
    ...overrides,
  }
}

function publishedFetch(index = releaseIndex()): typeof fetch {
  return (async () =>
    new Response(
      JSON.stringify({
        tag_name: index.tag,
        draft: false,
        prerelease: false,
        assets: index.assets.map(asset => ({ name: asset.file })),
      }),
      { status: 200 },
    )) as typeof fetch
}

describe('jaws-release-readiness', () => {
  test('passes when release, hosted-Q, Apex trust, and service routes are ready', async () => {
    const index = releaseIndex()
    const report = await buildJawsReleaseReadiness({
      root: createRoot(),
      env: { OPENJAWS_APEX_TRUST_LOCALHOST: '1' },
      releaseIndex: index,
      fetchImpl: publishedFetch(index),
      hostedQPreflightRunner: () => hostedReport(),
      serviceRouteHealthRunner: async () => routeReport(),
    })

    expect(report.status).toBe('ready')
    expect(report.counts.blocked).toBe(0)
  })

  test('blocks unpublished release tags before mirror promotion', async () => {
    const report = await buildJawsReleaseReadiness({
      root: createRoot(),
      env: { OPENJAWS_APEX_TRUST_LOCALHOST: '1' },
      releaseIndex: releaseIndex(),
      fetchImpl: (async () => new Response('not found', { status: 404 })) as typeof fetch,
      hostedQPreflightRunner: () => hostedReport(),
      serviceRouteHealthRunner: async () => routeReport(),
    })

    expect(report.status).toBe('blocked')
    expect(report.missingByCheck['github-release']).toEqual(['jaws-v0.1.9'])
  })

  test('retries unauthenticated when the local GitHub token is rejected', async () => {
    const responses = [
      new Response('forbidden', { status: 403 }),
      new Response('not found', { status: 404 }),
    ]
    const report = await buildJawsReleaseReadiness({
      root: createRoot(),
      env: {
        GITHUB_TOKEN: 'expired-token',
        OPENJAWS_APEX_TRUST_LOCALHOST: '1',
      },
      releaseIndex: releaseIndex(),
      fetchImpl: (async () => responses.shift()!) as typeof fetch,
      hostedQPreflightRunner: () => hostedReport(),
      serviceRouteHealthRunner: async () => routeReport(),
    })

    expect(report.status).toBe('blocked')
    expect(report.missingByCheck['github-release']).toEqual(['jaws-v0.1.9'])
  })

  test('blocks missing explicit Apex localhost trust', async () => {
    const report = await buildJawsReleaseReadiness({
      root: createRoot(),
      env: {},
      releaseIndex: releaseIndex(),
      fetchImpl: publishedFetch(),
      hostedQPreflightRunner: () => hostedReport(),
      serviceRouteHealthRunner: async () => routeReport(),
    })

    expect(report.status).toBe('blocked')
    expect(report.missingByCheck['apex-localhost-trust']).toEqual([
      'OPENJAWS_APEX_TRUST_LOCALHOST=1',
    ])
  })

  test('promotes hosted-Q and service-route warnings into release blockers', async () => {
    const report = await buildJawsReleaseReadiness({
      root: createRoot(),
      env: { OPENJAWS_APEX_TRUST_LOCALHOST: '1' },
      releaseIndex: releaseIndex(),
      fetchImpl: publishedFetch(),
      hostedQPreflightRunner: () =>
        hostedReport({
          status: 'blocked',
          counts: { passed: 2, blocked: 1 },
          missingByCheck: {
            'public-site-env': [
              'Q_HOSTED_SERVICE_BASE_URL',
              'Q_HOSTED_SERVICE_TOKEN',
            ],
          },
          blockedActions: ['Set hosted-Q public site env.'],
        }),
      serviceRouteHealthRunner: async () =>
        routeReport({
          status: 'warning',
          counts: { passed: 2, warning: 0, failed: 0, not_configured: 1 },
          warnings: [
            {
              id: 'production-database-config',
              status: 'not_configured',
              summary: 'Production database config is missing.',
              missing: ['CLOUDFLARE_D1_DATABASE_ID'],
            },
          ],
        }),
    })

    expect(report.status).toBe('blocked')
    expect(report.missingByCheck['hosted-q-provisioning']).toEqual([
      'Q_HOSTED_SERVICE_BASE_URL',
      'Q_HOSTED_SERVICE_TOKEN',
    ])
    expect(report.missingByCheck['service-routes']).toEqual([
      'CLOUDFLARE_D1_DATABASE_ID',
    ])
  })
})
