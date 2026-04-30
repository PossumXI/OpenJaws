import { existsSync } from 'fs'
import { resolve } from 'path'
import { resolveOciQRuntime } from '../src/utils/ociQRuntime.js'

export type ServiceRouteAudience =
  | 'public'
  | 'paid'
  | 'private'
  | 'admin'
  | 'local'

export type ServiceRouteCheckStatus =
  | 'passed'
  | 'warning'
  | 'failed'
  | 'not_configured'

export type ServiceRouteCheck = {
  id: string
  service: string
  audience: ServiceRouteAudience[]
  status: ServiceRouteCheckStatus
  summary: string
  url?: string
  httpStatus?: number | null
  details?: Record<string, unknown>
}

export type ServiceRouteHealthReport = {
  status: 'passed' | 'warning' | 'failed'
  checkedAt: string
  counts: Record<ServiceRouteCheckStatus, number>
  checks: ServiceRouteCheck[]
  failures: ServiceRouteCheck[]
  warnings: ServiceRouteCheck[]
}

type FetchLike = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>

type HttpRouteDefinition = {
  id: string
  service: string
  audience: ServiceRouteAudience[]
  url: string
  expectedStatuses: number[]
  marker?: string | null
  required?: boolean
}

type ServiceRouteHealthOptions = {
  fetchImpl?: FetchLike
  env?: NodeJS.ProcessEnv
  timeoutMs?: number
  strictPrivate?: boolean
}

type CliOptions = {
  json: boolean
  timeoutMs: number
  strictPrivate: boolean
}

const DEFAULT_TIMEOUT_MS = 12_000

const PUBLIC_HTTP_ROUTES: HttpRouteDefinition[] = [
  {
    id: 'qline-home',
    service: 'qline.site',
    audience: ['public', 'paid'],
    url: 'https://qline.site',
    expectedStatuses: [200],
    marker: 'OpenJaws',
    required: true,
  },
  {
    id: 'qline-terms',
    service: 'qline.site',
    audience: ['public'],
    url: 'https://qline.site/terms',
    expectedStatuses: [200],
    marker: '<html',
    required: true,
  },
  {
    id: 'qline-jaws-download',
    service: 'JAWS downloads',
    audience: ['public'],
    url: 'https://qline.site/downloads/jaws',
    expectedStatuses: [200],
    marker: 'JAWS',
    required: true,
  },
  {
    id: 'qline-jaws-updater-old',
    service: 'JAWS updater',
    audience: ['public'],
    url: 'https://qline.site/api/jaws/windows/x86_64/0.1.3',
    expectedStatuses: [200],
    marker: '"version"',
    required: true,
  },
  {
    id: 'qline-jaws-updater-current',
    service: 'JAWS updater',
    audience: ['public'],
    url: 'https://qline.site/api/jaws/windows/x86_64/0.1.4',
    expectedStatuses: [204],
    required: true,
  },
  {
    id: 'qline-signup-route',
    service: 'Hosted Q signup',
    audience: ['public', 'paid'],
    url: 'https://qline.site/api/signup',
    expectedStatuses: [400, 405],
    required: true,
  },
  {
    id: 'iorch-jaws-download',
    service: 'JAWS downloads',
    audience: ['public'],
    url: 'https://iorch.net/downloads/jaws',
    expectedStatuses: [200],
    marker: 'JAWS',
    required: true,
  },
  {
    id: 'iorch-jaws-updater-old',
    service: 'JAWS updater',
    audience: ['public'],
    url: 'https://iorch.net/api/jaws/windows/x86_64/0.1.3',
    expectedStatuses: [200],
    marker: '"version"',
    required: true,
  },
  {
    id: 'iorch-jaws-updater-current',
    service: 'JAWS updater',
    audience: ['public'],
    url: 'https://iorch.net/api/jaws/windows/x86_64/0.1.4',
    expectedStatuses: [204],
    required: true,
  },
]

const LOCAL_HTTP_ROUTES: HttpRouteDefinition[] = [
  {
    id: 'immaculate-harness-local',
    service: 'Immaculate harness',
    audience: ['private', 'admin', 'local'],
    url: 'http://127.0.0.1:8787/api/health',
    expectedStatuses: [200],
  },
  {
    id: 'q-agent-local',
    service: 'Q agent',
    audience: ['private', 'admin', 'local'],
    url: 'http://127.0.0.1:8788/health',
    expectedStatuses: [200],
  },
  {
    id: 'viola-agent-local',
    service: 'Viola agent',
    audience: ['private', 'admin', 'local'],
    url: 'http://127.0.0.1:8789/health',
    expectedStatuses: [200],
  },
  {
    id: 'blackbeak-agent-local',
    service: 'Blackbeak agent',
    audience: ['private', 'admin', 'local'],
    url: 'http://127.0.0.1:8790/health',
    expectedStatuses: [200],
  },
  {
    id: 'apex-workspace-local',
    service: 'Apex workspace bridge',
    audience: ['admin', 'local'],
    url: 'http://127.0.0.1:8797/health',
    expectedStatuses: [200],
  },
  {
    id: 'apex-chrono-local',
    service: 'Apex Chrono bridge',
    audience: ['admin', 'local'],
    url: 'http://127.0.0.1:8798/health',
    expectedStatuses: [200],
  },
  {
    id: 'apex-browser-local',
    service: 'Apex browser bridge',
    audience: ['admin', 'local'],
    url: 'http://127.0.0.1:8799/health',
    expectedStatuses: [200],
  },
]

function hasAnyEnv(env: NodeJS.ProcessEnv, names: string[]): boolean {
  return names.some(name => Boolean(env[name]?.trim()))
}

function hasNetlifyAuth(env: NodeJS.ProcessEnv): boolean {
  const candidatePaths = [
    resolve(process.cwd(), 'website', '.netlify-cli-config', 'config.json'),
    env.APPDATA
      ? resolve(env.APPDATA, 'netlify', 'Config', 'config.json')
      : null,
    env.APPDATA
      ? resolve(env.APPDATA, 'Netlify', 'Config', 'config.json')
      : null,
  ].filter((value): value is string => typeof value === 'string')

  return Boolean(env.NETLIFY_AUTH_TOKEN?.trim()) ||
    candidatePaths.some(path => existsSync(path))
}

function statusForOptionalRoute(
  route: HttpRouteDefinition,
  strictPrivate: boolean,
): ServiceRouteCheckStatus {
  if (route.required || strictPrivate) {
    return 'failed'
  }
  return 'warning'
}

async function fetchWithTimeout(
  fetchImpl: FetchLike,
  url: string,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetchImpl(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        accept: 'application/json,text/html,*/*',
        'user-agent': 'openjaws-service-route-health/1.0',
      },
    })
  } finally {
    clearTimeout(timer)
  }
}

async function checkHttpRoute(
  route: HttpRouteDefinition,
  options: Required<Pick<ServiceRouteHealthOptions, 'fetchImpl' | 'timeoutMs' | 'strictPrivate'>>,
): Promise<ServiceRouteCheck> {
  try {
    const response = await fetchWithTimeout(
      options.fetchImpl,
      route.url,
      options.timeoutMs,
    )
    const text = response.status === 204 ? '' : await response.text()
    if (!route.expectedStatuses.includes(response.status)) {
      return {
        id: route.id,
        service: route.service,
        audience: route.audience,
        status: statusForOptionalRoute(route, options.strictPrivate),
        url: route.url,
        httpStatus: response.status,
        summary: `${route.service} returned HTTP ${response.status}; expected ${route.expectedStatuses.join('/')}.`,
      }
    }
    if (route.marker && !text.includes(route.marker)) {
      return {
        id: route.id,
        service: route.service,
        audience: route.audience,
        status: statusForOptionalRoute(route, options.strictPrivate),
        url: route.url,
        httpStatus: response.status,
        summary: `${route.service} route is missing required marker ${route.marker}.`,
      }
    }
    return {
      id: route.id,
      service: route.service,
      audience: route.audience,
      status: 'passed',
      url: route.url,
      httpStatus: response.status,
      summary: `${route.service} route is reachable.`,
    }
  } catch (error) {
    return {
      id: route.id,
      service: route.service,
      audience: route.audience,
      status: statusForOptionalRoute(route, options.strictPrivate),
      url: route.url,
      httpStatus: null,
      summary: `${route.service} route is unreachable.`,
      details: {
        error: error instanceof Error ? error.message : String(error),
      },
    }
  }
}

function configurationCheck(args: {
  id: string
  service: string
  audience: ServiceRouteAudience[]
  configured: boolean
  configuredSummary: string
  missingSummary: string
  details?: Record<string, unknown>
}): ServiceRouteCheck {
  return {
    id: args.id,
    service: args.service,
    audience: args.audience,
    status: args.configured ? 'passed' : 'not_configured',
    summary: args.configured ? args.configuredSummary : args.missingSummary,
    details: args.details,
  }
}

function buildConfigurationChecks(env: NodeJS.ProcessEnv): ServiceRouteCheck[] {
  const ociRuntime = resolveOciQRuntime(env)
  const hostedQBaseUrl = env.Q_HOSTED_SERVICE_BASE_URL?.trim() || null
  const productionDbConfigured = hasAnyEnv(env, [
    'DATABASE_URL',
    'CLOUDFLARE_D1_DATABASE_ID',
    'OCI_DATABASE_ID',
    'OCI_DB_CONNECTION_STRING',
    'JAWS_PRODUCTION_DATABASE_URL',
  ])

  return [
    configurationCheck({
      id: 'oci-q-runtime-config',
      service: 'Q on OCI',
      audience: ['public', 'private', 'admin'],
      configured: ociRuntime.ready,
      configuredSummary: `OCI/Q runtime is configured with ${ociRuntime.authMode} auth.`,
      missingSummary:
        'OCI/Q runtime is not configured locally. Public users must bring a Q/OCI key or use a hosted key issuer; admin IAM needs OCI config, compartment, and project envs.',
      details: {
        authMode: ociRuntime.authMode,
        baseURL: ociRuntime.baseURL,
        missing: ociRuntime.missing,
      },
    }),
    configurationCheck({
      id: 'hosted-q-backend-config',
      service: 'Hosted Q backend',
      audience: ['public', 'paid'],
      configured: Boolean(hostedQBaseUrl),
      configuredSummary: 'Hosted Q backend base URL is configured.',
      missingSummary:
        'Hosted Q backend base URL is not configured in this process; production billing, key issuance, usage, and credits need a durable backend.',
      details: hostedQBaseUrl ? { baseURL: hostedQBaseUrl } : undefined,
    }),
    configurationCheck({
      id: 'production-database-config',
      service: 'Production SQL/database',
      audience: ['public', 'paid', 'admin'],
      configured: productionDbConfigured,
      configuredSummary: 'A production database route/env is configured.',
      missingSummary:
        'No production SQL/D1/OCI database route is configured in this repo process; local JSON stores are not production-safe durable storage.',
    }),
    configurationCheck({
      id: 'cloudflare-config',
      service: 'Cloudflare',
      audience: ['public', 'admin'],
      configured:
        hasAnyEnv(env, ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN']) ||
        existsSync(resolve(process.cwd(), 'wrangler.toml')),
      configuredSummary: 'Cloudflare deployment configuration is present.',
      missingSummary:
        'No Cloudflare Worker/D1 deployment config is present in this repo; Cloudflare routes cannot be claimed live from this checkout.',
    }),
    configurationCheck({
      id: 'netlify-auth-config',
      service: 'Netlify',
      audience: ['public', 'admin'],
      configured: hasNetlifyAuth(env),
      configuredSummary: 'Netlify auth/config is available for live metadata checks.',
      missingSummary:
        'Netlify auth/config is not available locally; public route checks can still run, but deploy metadata checks cannot.',
    }),
    configurationCheck({
      id: 'mail-engine-config',
      service: 'Mail/Resend',
      audience: ['public', 'paid', 'admin'],
      configured: hasAnyEnv(env, [
        'RESEND_API_KEY',
        'RESEND_API_BASE_URL',
        'SMTP_HOST',
      ]),
      configuredSummary: 'Mail engine configuration is present.',
      missingSummary:
        'No Resend/SMTP mail engine configuration or route is present in this repo process.',
    }),
    configurationCheck({
      id: 'arobi-laas-config',
      service: 'AROBI ledger / LAAS',
      audience: ['public', 'private', 'admin'],
      configured: hasAnyEnv(env, [
        'AROBI_LAAS_BASE_URL',
        'AROBI_LEDGER_BASE_URL',
      ]),
      configuredSummary: 'AROBI ledger/LAAS base URL is configured.',
      missingSummary:
        'No AROBI ledger/LAAS API route is configured in this repo process; only local/public showcase JSON ledgers are present.',
    }),
  ]
}

function countStatuses(
  checks: ServiceRouteCheck[],
): Record<ServiceRouteCheckStatus, number> {
  return checks.reduce(
    (counts, check) => {
      counts[check.status] += 1
      return counts
    },
    {
      passed: 0,
      warning: 0,
      failed: 0,
      not_configured: 0,
    },
  )
}

export async function runServiceRouteHealth(
  options: ServiceRouteHealthOptions = {},
): Promise<ServiceRouteHealthReport> {
  const fetchImpl = options.fetchImpl ?? fetch
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const strictPrivate = options.strictPrivate ?? false
  const env = options.env ?? process.env
  const checks: ServiceRouteCheck[] = []

  for (const route of PUBLIC_HTTP_ROUTES) {
    checks.push(await checkHttpRoute(route, { fetchImpl, timeoutMs, strictPrivate }))
  }
  for (const route of LOCAL_HTTP_ROUTES) {
    checks.push(await checkHttpRoute(route, { fetchImpl, timeoutMs, strictPrivate }))
  }
  checks.push(...buildConfigurationChecks(env))

  const counts = countStatuses(checks)
  const failures = checks.filter(check => check.status === 'failed')
  const warnings = checks.filter(check =>
    check.status === 'warning' || check.status === 'not_configured',
  )
  return {
    status:
      failures.length > 0
        ? 'failed'
        : warnings.length > 0
          ? 'warning'
          : 'passed',
    checkedAt: new Date().toISOString(),
    counts,
    checks,
    failures,
    warnings,
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
    strictPrivate: argv.includes('--strict-private'),
  }
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const options = parseArgs(argv)
  const report = await runServiceRouteHealth({
    timeoutMs: options.timeoutMs,
    strictPrivate: options.strictPrivate,
  })

  if (options.json) {
    console.log(JSON.stringify(report, null, 2))
  } else {
    console.log(
      `Service route health ${report.status}: ${report.counts.passed} passed, ${report.counts.warning} warning, ${report.counts.not_configured} not configured, ${report.counts.failed} failed.`,
    )
    for (const check of [...report.failures, ...report.warnings]) {
      console.log(`- [${check.status}] ${check.id}: ${check.summary}`)
    }
  }

  return report.status === 'failed' ? 1 : 0
}

if (import.meta.main) {
  process.exit(await main())
}
