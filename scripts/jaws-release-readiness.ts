import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildHostedQProvisioningPreflight,
  type HostedQProvisioningPreflightReport,
} from './hosted-q-provisioning-preflight.ts'
import {
  readJawsReleaseIndex,
  type JawsReleaseIndex,
} from './jaws-release-index.ts'
import {
  runServiceRouteHealth,
  type ServiceRouteHealthReport,
} from './service-route-health.ts'

export type JawsReleaseReadinessStatus = 'ready' | 'blocked'
export type JawsReleaseReadinessCheckStatus = 'passed' | 'blocked'

export type JawsReleaseReadinessCheck = {
  id: string
  status: JawsReleaseReadinessCheckStatus
  summary: string
  missing?: string[]
  details?: Record<string, unknown>
  nextActions?: string[]
}

export type JawsReleaseReadinessReport = {
  status: JawsReleaseReadinessStatus
  checkedAt: string
  release: {
    version: string
    tag: string
    repo: string
    releaseUrl: string
  }
  counts: Record<JawsReleaseReadinessCheckStatus, number>
  checks: JawsReleaseReadinessCheck[]
  missingByCheck: Record<string, string[]>
  blockedActions: string[]
}

export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>

export type JawsReleaseReadinessOptions = {
  root?: string
  env?: NodeJS.ProcessEnv
  now?: Date
  timeoutMs?: number
  fetchImpl?: FetchLike
  releaseIndex?: JawsReleaseIndex
  packageVersion?: string
  hostedQPreflightRunner?: (options: {
    root: string
    env: NodeJS.ProcessEnv
    now: Date
  }) => HostedQProvisioningPreflightReport
  serviceRouteHealthRunner?: (options: {
    env: NodeJS.ProcessEnv
    timeoutMs: number
  }) => Promise<ServiceRouteHealthReport>
}

type CliOptions = {
  json: boolean
  timeoutMs: number
}

const DEFAULT_TIMEOUT_MS = 15_000

function releaseCheck(
  input: Omit<JawsReleaseReadinessCheck, 'status'> & { passed: boolean },
): JawsReleaseReadinessCheck {
  const { passed, ...rest } = input
  return {
    ...rest,
    status: passed ? 'passed' : 'blocked',
  }
}

function uniqueValues(values: string[]): string[] {
  return [...new Set(values.filter(value => value.trim().length > 0))]
}

function truthyEnv(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes'
}

function readPackageVersion(root: string): string {
  const packagePath = resolve(root, 'apps', 'jaws-desktop', 'package.json')
  const pkg = JSON.parse(readFileSync(packagePath, 'utf8')) as {
    version?: unknown
  }
  return String(pkg.version ?? '').trim()
}

function validateReleaseIndex(
  releaseIndex: JawsReleaseIndex,
  packageVersion: string,
): JawsReleaseReadinessCheck {
  const expectedTag = `jaws-v${packageVersion}`
  const missing = [
    ...(releaseIndex.product === 'JAWS' ? [] : ['product=JAWS']),
    ...(releaseIndex.version === packageVersion
      ? []
      : [`version=${packageVersion}`]),
    ...(releaseIndex.tag === expectedTag ? [] : [`tag=${expectedTag}`]),
    ...(releaseIndex.github.releaseUrl.includes(expectedTag)
      ? []
      : ['github.releaseUrl release tag']),
    ...(releaseIndex.github.apiUrl.includes(expectedTag)
      ? []
      : ['github.apiUrl release tag']),
    ...(releaseIndex.github.baseAssetUrl.includes(expectedTag)
      ? []
      : ['github.baseAssetUrl release tag']),
    ...(releaseIndex.assets.length > 0 ? [] : ['release assets']),
  ]

  return releaseCheck({
    id: 'release-index',
    passed: missing.length === 0,
    summary:
      missing.length === 0
        ? `JAWS release index is aligned to ${expectedTag}.`
        : 'JAWS release index is stale or does not match the desktop package version.',
    missing,
    details: {
      packageVersion,
      indexVersion: releaseIndex.version,
      tag: releaseIndex.tag,
    },
    nextActions:
      missing.length === 0
        ? []
        : [
            'Run bun run --cwd apps/jaws-desktop release:index, then review generated release routes before publishing.',
          ],
  })
}

function expectedAssetNames(releaseIndex: JawsReleaseIndex): string[] {
  return releaseIndex.assets.map(asset => asset.file)
}

async function checkPublishedRelease(options: {
  releaseIndex: JawsReleaseIndex
  env: NodeJS.ProcessEnv
  fetchImpl: FetchLike
  timeoutMs: number
}): Promise<JawsReleaseReadinessCheck> {
  const { releaseIndex, env, fetchImpl, timeoutMs } = options
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  const headers: Record<string, string> = {
    accept: 'application/vnd.github+json',
    'user-agent': 'openjaws-jaws-release-readiness/1.0',
  }
  const hasAuthHeader = Boolean(env.GITHUB_TOKEN?.trim())
  if (env.GITHUB_TOKEN?.trim()) {
    headers.authorization = `Bearer ${env.GITHUB_TOKEN.trim()}`
  }

  try {
    let response = await fetchImpl(releaseIndex.github.apiUrl, {
      headers,
      signal: controller.signal,
    })
    let retriedWithoutAuth = false
    if ((response.status === 401 || response.status === 403) && hasAuthHeader) {
      const { authorization: _authorization, ...publicHeaders } = headers
      response = await fetchImpl(releaseIndex.github.apiUrl, {
        headers: publicHeaders,
        signal: controller.signal,
      })
      retriedWithoutAuth = true
    }
    if (response.status === 404) {
      return releaseCheck({
        id: 'github-release',
        passed: false,
        summary: `GitHub release ${releaseIndex.tag} is not published yet.`,
        missing: [releaseIndex.tag],
        details: {
          apiUrl: releaseIndex.github.apiUrl,
          status: response.status,
          retriedWithoutAuth,
        },
        nextActions: [
          'Merge the release branch after all gates pass, tag the exact green main commit, and let the JAWS Desktop workflow publish signed assets before promoting mirrors.',
        ],
      })
    }
    if (!response.ok) {
      return releaseCheck({
        id: 'github-release',
        passed: false,
        summary: `GitHub release check failed with HTTP ${response.status}.`,
        missing: ['reachable GitHub release API response'],
        details: {
          apiUrl: releaseIndex.github.apiUrl,
          status: response.status,
          retriedWithoutAuth,
        },
        nextActions: [
          'Rerun with GITHUB_TOKEN available if rate-limited, then verify the release tag and assets in GitHub.',
        ],
      })
    }

    const body = await response.json() as {
      tag_name?: unknown
      draft?: unknown
      prerelease?: unknown
      assets?: Array<{ name?: unknown }>
    }
    const publishedAssetNames = new Set(
      (body.assets ?? []).map(asset => String(asset.name ?? '')),
    )
    const missingAssets = expectedAssetNames(releaseIndex).filter(
      name => !publishedAssetNames.has(name),
    )
    const missing = [
      ...(body.tag_name === releaseIndex.tag ? [] : [releaseIndex.tag]),
      ...(body.draft === false ? [] : ['draft=false']),
      ...missingAssets,
    ]

    return releaseCheck({
      id: 'github-release',
      passed: missing.length === 0,
      summary:
        missing.length === 0
          ? `GitHub release ${releaseIndex.tag} is published with indexed assets.`
          : `GitHub release ${releaseIndex.tag} is published but not ready for updater promotion.`,
      missing,
      details: {
        apiUrl: releaseIndex.github.apiUrl,
        tagName: body.tag_name,
        draft: body.draft,
        prerelease: body.prerelease,
        retriedWithoutAuth,
        expectedAssetCount: releaseIndex.assets.length,
        publishedAssetCount: publishedAssetNames.size,
      },
      nextActions:
        missing.length === 0
          ? []
          : [
              'Wait for the JAWS Desktop release workflow to attach every indexed asset, then rerun the readiness gate.',
            ],
    })
  } catch (error) {
    return releaseCheck({
      id: 'github-release',
      passed: false,
      summary: `GitHub release check could not complete: ${error instanceof Error ? error.message : String(error)}`,
      missing: ['reachable GitHub release API response'],
      details: {
        apiUrl: releaseIndex.github.apiUrl,
      },
      nextActions: [
        'Fix network/API access or provide GITHUB_TOKEN, then rerun the readiness gate.',
      ],
    })
  } finally {
    clearTimeout(timeout)
  }
}

function checkHostedQProvisioning(
  report: HostedQProvisioningPreflightReport,
): JawsReleaseReadinessCheck {
  const missing = uniqueValues(Object.values(report.missingByCheck).flat())
  return releaseCheck({
    id: 'hosted-q-provisioning',
    passed: report.status === 'ready',
    summary:
      report.status === 'ready'
        ? 'Hosted-Q Cloudflare, D1, worker secret, mail, public-site env, and Q trace gates are ready.'
        : 'Hosted-Q production provisioning is still blocked.',
    missing,
    details: {
      status: report.status,
      counts: report.counts,
      missingByCheck: report.missingByCheck,
    },
    nextActions: report.blockedActions,
  })
}

function checkApexTrust(env: NodeJS.ProcessEnv): JawsReleaseReadinessCheck {
  const trusted = truthyEnv(env.OPENJAWS_APEX_TRUST_LOCALHOST)
  return releaseCheck({
    id: 'apex-localhost-trust',
    passed: trusted,
    summary: trusted
      ? 'Apex localhost bridge trust is explicit for this release session.'
      : 'Apex localhost bridge trust is not explicit for this release session.',
    missing: trusted ? [] : ['OPENJAWS_APEX_TRUST_LOCALHOST=1'],
    nextActions: trusted
      ? []
      : [
          'Set OPENJAWS_APEX_TRUST_LOCALHOST=1 only when the already-running local Apex listeners are intentionally trusted for this operator session.',
        ],
  })
}

function checkServiceRoutes(
  report: ServiceRouteHealthReport,
): JawsReleaseReadinessCheck {
  const blockingRoutes = [...report.failures, ...report.warnings]
  const missing = uniqueValues(
    blockingRoutes.flatMap(route => route.missing ?? []),
  )
  return releaseCheck({
    id: 'service-routes',
    passed: report.status === 'passed',
    summary:
      report.status === 'passed'
        ? 'Service route health is fully passed with no warning-grade production gaps.'
        : 'Service route health still has release-blocking warnings, not-configured routes, or failures.',
    missing,
    details: {
      status: report.status,
      counts: report.counts,
      blockingRouteIds: blockingRoutes.map(route => route.id),
    },
    nextActions:
      blockingRoutes.length === 0
        ? []
        : [
            'Resolve every warning/not-configured/failed service route before publishing the JAWS release update lane.',
          ],
  })
}

export async function buildJawsReleaseReadiness(
  options: JawsReleaseReadinessOptions = {},
): Promise<JawsReleaseReadinessReport> {
  const root = resolve(options.root ?? process.cwd())
  const env = options.env ?? process.env
  const now = options.now ?? new Date()
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const releaseIndex = options.releaseIndex ?? readJawsReleaseIndex()
  const packageVersion = options.packageVersion ?? readPackageVersion(root)
  const fetchImpl = options.fetchImpl ?? fetch
  const hostedQPreflightRunner =
    options.hostedQPreflightRunner ??
    ((runnerOptions: { root: string; env: NodeJS.ProcessEnv; now: Date }) =>
      buildHostedQProvisioningPreflight(runnerOptions))
  const serviceRouteHealthRunner =
    options.serviceRouteHealthRunner ??
    ((runnerOptions: { env: NodeJS.ProcessEnv; timeoutMs: number }) =>
      runServiceRouteHealth({
        env: runnerOptions.env,
        timeoutMs: runnerOptions.timeoutMs,
        strictPrivate: true,
      }))

  const hostedQPreflight = hostedQPreflightRunner({ root, env, now })
  const serviceRouteHealth = await serviceRouteHealthRunner({ env, timeoutMs })
  const checks: JawsReleaseReadinessCheck[] = [
    validateReleaseIndex(releaseIndex, packageVersion),
    await checkPublishedRelease({ releaseIndex, env, fetchImpl, timeoutMs }),
    checkHostedQProvisioning(hostedQPreflight),
    checkApexTrust(env),
    checkServiceRoutes(serviceRouteHealth),
  ]
  const counts = checks.reduce(
    (acc, item) => {
      acc[item.status] += 1
      return acc
    },
    { passed: 0, blocked: 0 } as Record<JawsReleaseReadinessCheckStatus, number>,
  )
  const blockedChecks = checks.filter(item => item.status === 'blocked')
  const missingByCheck = Object.fromEntries(
    blockedChecks
      .filter(item => item.missing?.length)
      .map(item => [item.id, uniqueValues(item.missing ?? [])]),
  )
  return {
    status: counts.blocked > 0 ? 'blocked' : 'ready',
    checkedAt: now.toISOString(),
    release: {
      version: releaseIndex.version,
      tag: releaseIndex.tag,
      repo: releaseIndex.repo,
      releaseUrl: releaseIndex.github.releaseUrl,
    },
    counts,
    checks,
    missingByCheck,
    blockedActions: uniqueValues(
      blockedChecks.flatMap(item => item.nextActions ?? []),
    ),
  }
}

export function parseArgs(argv: string[]): CliOptions {
  let timeoutMs = DEFAULT_TIMEOUT_MS
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--timeout-ms' && argv[index + 1]) {
      const parsed = Number.parseInt(argv[index + 1]!, 10)
      if (Number.isFinite(parsed) && parsed > 0) {
        timeoutMs = parsed
      }
      index += 1
    }
  }
  return {
    json: argv.includes('--json'),
    timeoutMs,
  }
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const options = parseArgs(argv)
  const report = await buildJawsReleaseReadiness({
    timeoutMs: options.timeoutMs,
  })

  if (options.json) {
    console.log(JSON.stringify(report, null, 2))
  } else if (report.status === 'ready') {
    console.log(
      `JAWS release readiness passed for ${report.release.tag}: ${report.counts.passed} checks.`,
    )
  } else {
    console.error(
      `JAWS release readiness blocked for ${report.release.tag}: ${report.counts.blocked} blockers.`,
    )
    for (const check of report.checks.filter(item => item.status === 'blocked')) {
      console.error(`- ${check.id}: ${check.summary}`)
      if (check.missing?.length) {
        console.error(`  Missing: ${check.missing.join(', ')}`)
      }
    }
  }

  return report.status === 'ready' ? 0 : 1
}

if (import.meta.main) {
  process.exit(await main())
}
