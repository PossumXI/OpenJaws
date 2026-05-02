import { existsSync, readFileSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import { resolveOciQRuntime } from '../src/utils/ociQRuntime.js'
import {
  runApexBridgeHealth,
  type ApexBridgeHealthReport,
} from './apex-bridge-health.ts'
import {
  JAWS_RELEASE_API_URL,
  JAWS_RELEASE_PREVIOUS_PATCH_VERSION,
  JAWS_RELEASE_TAG,
  JAWS_RELEASE_VERSION,
} from './jaws-release-index.ts'

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
  missing?: string[]
  nextActions?: string[]
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
  releaseGated?: boolean
}

type ServiceRouteHealthOptions = {
  fetchImpl?: FetchLike
  env?: NodeJS.ProcessEnv
  timeoutMs?: number
  strictPrivate?: boolean
  apexBridgeHealthRunner?: (options: {
    strict: boolean
  }) => Promise<ApexBridgeHealthReport>
}

type NetlifyEnvMetadata = {
  checked: boolean
  siteId: string
  expectedSiteName: string
  siteName: string | null
  accountSlug: string | null
  keysPresent: string[]
  valuesByKey: Map<string, string>
  error: string | null
}

type ExternalServiceConfig = {
  qlineNetlifyEnv: NetlifyEnvMetadata
}

type CliOptions = {
  json: boolean
  timeoutMs: number
  strictPrivate: boolean
}

const DEFAULT_TIMEOUT_MS = 12_000
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const QLINE_NETLIFY_SITE_ID = 'edde15e1-bf1f-4986-aef3-5803fdce7406'
const QLINE_NETLIFY_SITE_NAME = 'qline-site-20260415022202'
const CLOUDFLARE_HOSTED_Q_FILES = [
  'services/cloudflare-hosted-q/wrangler.toml',
  'services/cloudflare-hosted-q/src/worker.ts',
  'services/cloudflare-hosted-q/migrations/0001_hosted_q.sql',
] as const
const HOSTED_Q_WRANGLER_CONFIG =
  'services/cloudflare-hosted-q/wrangler.toml'
const PLACEHOLDER_VALUE_PATTERN =
  /^(replace[-_ ]?me|replace[-_ ]?with.*|changeme|todo|your[-_ ].*|<.*>)$/i
const INLINE_PLACEHOLDER_PATTERN =
  /(REPLACE_WITH_|replace_with_|example\.com|localhost\.invalid)/i

const PRODUCTION_DATABASE_ENV_NAMES = [
  'DATABASE_URL',
  'CLOUDFLARE_D1_DATABASE_ID',
  'OCI_DATABASE_ID',
  'OCI_DB_CONNECTION_STRING',
  'JAWS_PRODUCTION_DATABASE_URL',
] as const

const AROBI_LAAS_URL_ENV_NAMES = [
  'AROBI_API_URL',
  'LAAS_API_URL',
  'AROBI_LAAS_BASE_URL',
  'AROBI_LAAS_API_URL',
  'AROBI_LEDGER_BASE_URL',
  'AROBI_LEDGER_API_URL',
] as const

const AROBI_LAAS_TOKEN_ENV_NAMES = [
  'AROBI_API_TOKEN',
  'LAAS_API_TOKEN',
  'AROBI_LAAS_TOKEN',
  'AROBI_LAAS_API_TOKEN',
  'AROBI_LEDGER_TOKEN',
] as const

const LOCAL_AROBI_EDGE_BASE_URL = 'https://arobi.aura-genesis.org'

type ArobiLaasConfig = {
  baseURL: string | null
  tokenConfigured: boolean
  source: 'env' | 'local_edge_secret' | 'qline_netlify_env' | 'none'
}

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
    url: `https://qline.site/api/jaws/windows/x86_64/${JAWS_RELEASE_PREVIOUS_PATCH_VERSION}`,
    expectedStatuses: [200],
    marker: '"version"',
    required: true,
    releaseGated: true,
  },
  {
    id: 'qline-jaws-updater-current',
    service: 'JAWS updater',
    audience: ['public'],
    url: `https://qline.site/api/jaws/windows/x86_64/${JAWS_RELEASE_VERSION}`,
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
    url: `https://iorch.net/api/jaws/windows/x86_64/${JAWS_RELEASE_PREVIOUS_PATCH_VERSION}`,
    expectedStatuses: [200],
    marker: '"version"',
    required: true,
    releaseGated: true,
  },
  {
    id: 'iorch-jaws-updater-current',
    service: 'JAWS updater',
    audience: ['public'],
    url: `https://iorch.net/api/jaws/windows/x86_64/${JAWS_RELEASE_VERSION}`,
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
]

const APEX_BRIDGE_ROUTE_IDS = {
  workspace: 'apex-workspace-local',
  chrono: 'apex-chrono-local',
  browser: 'apex-browser-local',
} as const

function isConcreteConfigValue(value: string | undefined): value is string {
  const trimmed = value?.trim()
  if (!trimmed) {
    return false
  }
  return !(
    PLACEHOLDER_VALUE_PATTERN.test(trimmed) ||
    INLINE_PLACEHOLDER_PATTERN.test(trimmed)
  )
}

function getConfiguredEnvValue(
  env: NodeJS.ProcessEnv,
  names: readonly string[],
): string | null {
  for (const name of names) {
    const value = env[name]
    if (isConcreteConfigValue(value)) {
      return value.trim()
    }
  }
  return null
}

function hasConfiguredEnv(
  env: NodeJS.ProcessEnv,
  names: readonly string[],
): boolean {
  return Boolean(getConfiguredEnvValue(env, names))
}

function missingEnvNames(
  env: NodeJS.ProcessEnv,
  names: readonly string[],
): string[] {
  return names.filter(name => !isConcreteConfigValue(env[name]))
}

function oneOf(names: readonly string[]): string {
  return `one of ${names.join(', ')}`
}

function readTextIfPresent(path: string): string | null {
  if (!existsSync(path)) {
    return null
  }
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}

function homeDirFromEnv(env: NodeJS.ProcessEnv): string | null {
  return env.USERPROFILE?.trim() || env.HOME?.trim() || null
}

function hasLocalArobiEdgeSecret(env: NodeJS.ProcessEnv): boolean {
  const homeDir = homeDirFromEnv(env)
  if (!homeDir) {
    return false
  }

  const secretPath = join(homeDir, '.arobi', 'edge-secrets.json')
  if (!existsSync(secretPath)) {
    return false
  }

  try {
    const parsed = JSON.parse(readFileSync(secretPath, 'utf8')) as {
      AROBI_API_TOKEN?: unknown
    }
    return (
      typeof parsed.AROBI_API_TOKEN === 'string' &&
      isConcreteConfigValue(parsed.AROBI_API_TOKEN)
    )
  } catch {
    return false
  }
}

function resolveArobiLaasConfig(env: NodeJS.ProcessEnv): ArobiLaasConfig {
  const envBaseURL = getConfiguredEnvValue(env, AROBI_LAAS_URL_ENV_NAMES)
  const envToken = getConfiguredEnvValue(env, AROBI_LAAS_TOKEN_ENV_NAMES)
  if (envBaseURL) {
    return {
      baseURL: envBaseURL,
      tokenConfigured: Boolean(envToken) || hasLocalArobiEdgeSecret(env),
      source: 'env',
    }
  }

  if (hasLocalArobiEdgeSecret(env)) {
    return {
      baseURL: LOCAL_AROBI_EDGE_BASE_URL,
      tokenConfigured: true,
      source: 'local_edge_secret',
    }
  }

  return {
    baseURL: null,
    tokenConfigured: Boolean(envToken),
    source: 'none',
  }
}

function hasConfiguredD1Binding(root = REPO_ROOT): boolean {
  const config = readTextIfPresent(resolve(root, HOSTED_Q_WRANGLER_CONFIG))
  if (!config) {
    return false
  }
  const match = config.match(/database_id\s*=\s*"([^"]+)"/)
  return isConcreteConfigValue(match?.[1])
}

function hasConfiguredCloudflareRoutes(root = REPO_ROOT): boolean {
  const config = readTextIfPresent(resolve(root, HOSTED_Q_WRANGLER_CONFIG))
  if (!config) {
    return false
  }
  return /^\s*routes\s*=/m.test(config)
}

function joinHealthUrl(baseUrl: string): string {
  try {
    const parsed = new URL(baseUrl)
    if (parsed.pathname === '/health' || parsed.pathname.endsWith('/health')) {
      return parsed.toString()
    }
  } catch {
    // Fall back to plain string handling below for test doubles and invalid operator input.
  }
  return `${baseUrl.replace(/\/+$/, '')}/health`
}

function readNetlifyAuthToken(env: NodeJS.ProcessEnv): string | null {
  const directToken = env.NETLIFY_AUTH_TOKEN?.trim()
  if (isConcreteConfigValue(directToken)) {
    return directToken
  }

  const candidatePaths = [
    resolve(REPO_ROOT, 'website', '.netlify-cli-config', 'config.json'),
    env.APPDATA
      ? resolve(env.APPDATA, 'netlify', 'Config', 'config.json')
      : null,
    env.APPDATA
      ? resolve(env.APPDATA, 'Netlify', 'Config', 'config.json')
      : null,
  ].filter((value): value is string => typeof value === 'string')

  for (const path of candidatePaths) {
    const configText = readTextIfPresent(path)
    if (!configText) {
      continue
    }
    try {
      const config = JSON.parse(configText) as {
        users?: Record<string, { auth?: { token?: string } }>
      }
      const firstUser = config.users ? Object.values(config.users)[0] : null
      const token = firstUser?.auth?.token?.trim()
      if (isConcreteConfigValue(token)) {
        return token
      }
    } catch {
      continue
    }
  }

  return null
}

function hasNetlifyAuth(env: NodeJS.ProcessEnv): boolean {
  return Boolean(readNetlifyAuthToken(env))
}

function hasHostedQWorkerPackage(root = REPO_ROOT): boolean {
  return CLOUDFLARE_HOSTED_Q_FILES.every(path => existsSync(resolve(root, path)))
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
  options: Required<Pick<ServiceRouteHealthOptions, 'fetchImpl' | 'timeoutMs' | 'strictPrivate'>> & {
    jawsReleasePublished: boolean
  },
): Promise<ServiceRouteCheck> {
  try {
    const response = await fetchWithTimeout(
      options.fetchImpl,
      route.url,
      options.timeoutMs,
    )
    const text = response.status === 204 ? '' : await response.text()
    if (!route.expectedStatuses.includes(response.status)) {
      if (
        route.releaseGated &&
        response.status === 204 &&
        !options.jawsReleasePublished
      ) {
        return {
          id: route.id,
          service: route.service,
          audience: route.audience,
          status: 'not_configured',
          url: route.url,
          httpStatus: response.status,
          summary: `${route.service} is not offering ${JAWS_RELEASE_VERSION} yet because ${JAWS_RELEASE_TAG} is not published.`,
          missing: [JAWS_RELEASE_TAG],
          nextActions: [
            `Publish ${JAWS_RELEASE_TAG} with signed JAWS assets, then rerun bun run service:routes.`,
          ],
          details: {
            releaseTag: JAWS_RELEASE_TAG,
            currentVersion: JAWS_RELEASE_VERSION,
            previousTesterVersion: JAWS_RELEASE_PREVIOUS_PATCH_VERSION,
            releaseApiUrl: JAWS_RELEASE_API_URL,
          },
        }
      }
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

function buildApexBridgeRouteChecks(
  report: ApexBridgeHealthReport,
): ServiceRouteCheck[] {
  return report.checks.map(check => ({
    id: APEX_BRIDGE_ROUTE_IDS[check.id],
    service: check.service,
    audience: ['admin', 'local'],
    status: check.status,
    url: joinHealthUrl(check.url),
    httpStatus: check.health || check.listenerHealth ? 200 : null,
    summary: check.summary,
    details: {
      health: check.health,
      listenerHealth: check.listenerHealth ?? null,
      start: check.start ?? null,
      source: 'apex-bridge-health',
    },
  }))
}

async function checkJawsReleasePublished(
  fetchImpl: FetchLike,
  timeoutMs: number,
): Promise<boolean> {
  try {
    const response = await fetchWithTimeout(fetchImpl, JAWS_RELEASE_API_URL, timeoutMs)
    if (response.status !== 200) {
      return false
    }
    const body = await response.json() as { tag_name?: string; draft?: boolean }
    return body.tag_name === JAWS_RELEASE_TAG && body.draft !== true
  } catch {
    return false
  }
}

async function fetchJsonWithTimeout(
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetchImpl(url, {
      ...init,
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timer)
  }
}

function extractNetlifyEnvValues(payload: unknown): Map<string, string> {
  const valuesByKey = new Map<string, string>()
  if (!Array.isArray(payload)) {
    return valuesByKey
  }

  for (const entry of payload) {
    if (!entry || typeof entry !== 'object') {
      continue
    }
    const key = (entry as { key?: unknown }).key
    const values = (entry as { values?: unknown }).values
    if (typeof key !== 'string' || !Array.isArray(values)) {
      continue
    }

    const concreteValue = values
      .map(valueEntry => {
        if (!valueEntry || typeof valueEntry !== 'object') {
          return null
        }
        const value = (valueEntry as { value?: unknown }).value
        return typeof value === 'string' && isConcreteConfigValue(value)
          ? value
          : null
      })
      .find((value): value is string => Boolean(value))

    if (concreteValue) {
      valuesByKey.set(key, concreteValue)
    }
  }

  return valuesByKey
}

function sanitizeExternalConfigError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function fetchQlineNetlifyEnvMetadata(
  fetchImpl: FetchLike,
  env: NodeJS.ProcessEnv,
  timeoutMs: number,
): Promise<NetlifyEnvMetadata> {
  const baseMetadata: NetlifyEnvMetadata = {
    checked: false,
    siteId: QLINE_NETLIFY_SITE_ID,
    expectedSiteName: QLINE_NETLIFY_SITE_NAME,
    siteName: null,
    accountSlug: null,
    keysPresent: [],
    valuesByKey: new Map(),
    error: null,
  }
  const token = readNetlifyAuthToken(env)
  if (!token) {
    return {
      ...baseMetadata,
      error: 'missing_netlify_auth',
    }
  }

  const headers = {
    authorization: `Bearer ${token}`,
    accept: 'application/json',
    'user-agent': 'openjaws-service-route-health/1.0',
  }

  try {
    const siteResponse = await fetchJsonWithTimeout(
      fetchImpl,
      `https://api.netlify.com/api/v1/sites/${QLINE_NETLIFY_SITE_ID}`,
      { method: 'GET', headers },
      timeoutMs,
    )
    if (!siteResponse.ok) {
      return {
        ...baseMetadata,
        checked: true,
        error: `netlify_site_http_${siteResponse.status}`,
      }
    }
    const site = await siteResponse.json() as {
      name?: unknown
      account_slug?: unknown
    }
    const siteName = typeof site.name === 'string' ? site.name : null
    const accountSlug =
      typeof site.account_slug === 'string' ? site.account_slug : null
    if (siteName !== QLINE_NETLIFY_SITE_NAME || !accountSlug) {
      return {
        ...baseMetadata,
        checked: true,
        siteName,
        accountSlug,
        error: 'netlify_site_identity_mismatch',
      }
    }

    const envResponse = await fetchJsonWithTimeout(
      fetchImpl,
      `https://api.netlify.com/api/v1/accounts/${accountSlug}/env?site_id=${QLINE_NETLIFY_SITE_ID}`,
      { method: 'GET', headers },
      timeoutMs,
    )
    if (!envResponse.ok) {
      return {
        ...baseMetadata,
        checked: true,
        siteName,
        accountSlug,
        error: `netlify_env_http_${envResponse.status}`,
      }
    }

    const valuesByKey = extractNetlifyEnvValues(await envResponse.json())
    return {
      ...baseMetadata,
      checked: true,
      siteName,
      accountSlug,
      keysPresent: [...valuesByKey.keys()].sort(),
      valuesByKey,
    }
  } catch (error) {
    return {
      ...baseMetadata,
      checked: true,
      error: sanitizeExternalConfigError(error),
    }
  }
}

async function buildExternalServiceConfig(
  fetchImpl: FetchLike,
  env: NodeJS.ProcessEnv,
  timeoutMs: number,
): Promise<ExternalServiceConfig> {
  return {
    qlineNetlifyEnv: await fetchQlineNetlifyEnvMetadata(fetchImpl, env, timeoutMs),
  }
}

function getExternalQlineValue(
  external: ExternalServiceConfig,
  name: string,
): string | null {
  return external.qlineNetlifyEnv.valuesByKey.get(name) ?? null
}

function hasExternalQlineValue(
  external: ExternalServiceConfig,
  name: string,
): boolean {
  return Boolean(getExternalQlineValue(external, name))
}

function hasExternalQlineAnyValue(
  external: ExternalServiceConfig,
  names: readonly string[],
): boolean {
  return names.some(name => hasExternalQlineValue(external, name))
}

function getExternalQlineFirstValue(
  external: ExternalServiceConfig,
  names: readonly string[],
): string | null {
  for (const name of names) {
    const value = getExternalQlineValue(external, name)
    if (value) {
      return value
    }
  }
  return null
}

function resolveEffectiveArobiLaasConfig(
  env: NodeJS.ProcessEnv,
  external: ExternalServiceConfig,
): ArobiLaasConfig {
  const local = resolveArobiLaasConfig(env)
  if (local.baseURL) {
    return local
  }

  const externalBaseURL = getExternalQlineFirstValue(
    external,
    AROBI_LAAS_URL_ENV_NAMES,
  )
  if (!externalBaseURL) {
    return local
  }

  return {
    baseURL: externalBaseURL,
    tokenConfigured: hasExternalQlineAnyValue(external, AROBI_LAAS_TOKEN_ENV_NAMES),
    source: 'qline_netlify_env',
  }
}

function publicNetlifyEnvDetails(
  metadata: NetlifyEnvMetadata,
): Record<string, unknown> {
  return {
    checked: metadata.checked,
    siteId: metadata.siteId,
    siteName: metadata.siteName,
    keysPresent: metadata.keysPresent,
    error: metadata.error,
  }
}

function configurationCheck(args: {
  id: string
  service: string
  audience: ServiceRouteAudience[]
  configured: boolean
  configuredSummary: string
  missingSummary: string
  missing?: string[]
  nextActions?: string[]
  details?: Record<string, unknown>
}): ServiceRouteCheck {
  const result: ServiceRouteCheck = {
    id: args.id,
    service: args.service,
    audience: args.audience,
    status: args.configured ? 'passed' : 'not_configured',
    summary: args.configured ? args.configuredSummary : args.missingSummary,
    details: args.details,
  }
  if (!args.configured) {
    if (args.missing?.length) {
      result.missing = args.missing
    }
    if (args.nextActions?.length) {
      result.nextActions = args.nextActions
    }
  }
  return result
}

function buildConfiguredHttpRoutes(
  env: NodeJS.ProcessEnv,
  external: ExternalServiceConfig,
): HttpRouteDefinition[] {
  const hostedQBaseUrl =
    getConfiguredEnvValue(env, ['Q_HOSTED_SERVICE_BASE_URL']) ??
    getExternalQlineValue(external, 'Q_HOSTED_SERVICE_BASE_URL')
  const arobiLaas = resolveEffectiveArobiLaasConfig(env, external)
  const routes: HttpRouteDefinition[] = []

  if (hostedQBaseUrl) {
    routes.push({
      id: 'hosted-q-backend-live',
      service: 'Hosted Q backend',
      audience: ['public', 'paid'],
      url: joinHealthUrl(hostedQBaseUrl),
      expectedStatuses: [200],
      marker: 'openjaws-hosted-q',
      required: true,
    })
  }

  if (arobiLaas.baseURL && arobiLaas.tokenConfigured) {
    routes.push({
      id: 'arobi-laas-live',
      service: 'AROBI ledger / LAAS',
      audience: ['public', 'private', 'admin'],
      url: joinHealthUrl(arobiLaas.baseURL),
      expectedStatuses: [200],
      required: true,
    })
  }

  return routes
}

function buildConfigurationChecks(
  env: NodeJS.ProcessEnv,
  external: ExternalServiceConfig,
): ServiceRouteCheck[] {
  const ociRuntime = resolveOciQRuntime(env)
  const hostedQBaseUrl =
    getConfiguredEnvValue(env, ['Q_HOSTED_SERVICE_BASE_URL']) ??
    getExternalQlineValue(external, 'Q_HOSTED_SERVICE_BASE_URL')
  const hostedQServiceToken =
    getConfiguredEnvValue(env, ['Q_HOSTED_SERVICE_TOKEN']) ??
    getExternalQlineValue(external, 'Q_HOSTED_SERVICE_TOKEN')
  const hostedQBackendConfigured = Boolean(
    hostedQBaseUrl && hostedQServiceToken,
  )
  const hostedQBackendMissing = [
    ...(!hostedQBaseUrl ? ['Q_HOSTED_SERVICE_BASE_URL'] : []),
    ...(!hostedQServiceToken ? ['Q_HOSTED_SERVICE_TOKEN'] : []),
  ]
  const hostedQWorkerPackage = hasHostedQWorkerPackage()
  const d1BindingConfigured =
    hasConfiguredEnv(env, ['CLOUDFLARE_D1_DATABASE_ID']) ||
    hasConfiguredD1Binding()
  const productionDbConfigured =
    hasConfiguredEnv(env, PRODUCTION_DATABASE_ENV_NAMES) || d1BindingConfigured
  const cloudflareAuthConfigured =
    hasConfiguredEnv(env, ['CLOUDFLARE_ACCOUNT_ID']) &&
    hasConfiguredEnv(env, ['CLOUDFLARE_API_TOKEN'])
  const missingCloudflareAuth = missingEnvNames(env, [
    'CLOUDFLARE_ACCOUNT_ID',
    'CLOUDFLARE_API_TOKEN',
  ])
  const cloudflareRoutesConfigured = hasConfiguredCloudflareRoutes()
  const cloudflareConfigured = cloudflareAuthConfigured && d1BindingConfigured
  const resendConfigured =
    (hasConfiguredEnv(env, ['RESEND_API_KEY']) &&
      hasConfiguredEnv(env, ['RESEND_FROM_EMAIL'])) ||
    (hasExternalQlineValue(external, 'RESEND_API_KEY') &&
      hasExternalQlineValue(external, 'RESEND_FROM_EMAIL'))
  const smtpConfigured = hasConfiguredEnv(env, [
    'SMTP_HOST',
    'SMTP_URL',
  ])
  const stripeSecretConfigured =
    hasConfiguredEnv(env, ['STRIPE_SECRET_KEY']) ||
    hasExternalQlineValue(external, 'STRIPE_SECRET_KEY')
  const stripePriceConfigured =
    hasConfiguredEnv(env, ['STRIPE_PRICE_BUILDER', 'STRIPE_PRICE_OPERATOR']) ||
    hasExternalQlineAnyValue(external, [
      'STRIPE_PRICE_BUILDER',
      'STRIPE_PRICE_OPERATOR',
    ])
  const stripeReturnUrlsConfigured =
    (hasConfiguredEnv(env, ['STRIPE_SUCCESS_URL']) &&
      hasConfiguredEnv(env, ['STRIPE_CANCEL_URL'])) ||
    (hasExternalQlineValue(external, 'STRIPE_SUCCESS_URL') &&
      hasExternalQlineValue(external, 'STRIPE_CANCEL_URL'))
  const stripeConfigured =
    stripeSecretConfigured && stripePriceConfigured && stripeReturnUrlsConfigured
  const arobiLaas = resolveEffectiveArobiLaasConfig(env, external)
  const netlifyEnvDetails = publicNetlifyEnvDetails(external.qlineNetlifyEnv)

  return [
    configurationCheck({
      id: 'hosted-q-worker-package',
      service: 'Hosted Q backend package',
      audience: ['admin'],
      configured: hostedQWorkerPackage,
      configuredSummary:
        'Hosted Q Cloudflare Worker/D1 package is present in the repo.',
      missingSummary:
        'Hosted Q Worker/D1 package is missing from this checkout.',
      missing: hostedQWorkerPackage ? [] : [...CLOUDFLARE_HOSTED_Q_FILES],
      nextActions: hostedQWorkerPackage
        ? []
        : ['Restore services/cloudflare-hosted-q before attempting hosted-Q deploy.'],
      details: {
        path: hostedQWorkerPackage ? 'services/cloudflare-hosted-q' : null,
        d1BindingConfigured,
        cloudflareRoutesConfigured,
      },
    }),
    configurationCheck({
      id: 'oci-q-runtime-config',
      service: 'Q on OCI',
      audience: ['public', 'private', 'admin'],
      configured: ociRuntime.ready,
      configuredSummary: `OCI/Q runtime is configured with ${ociRuntime.authMode} auth.`,
      missingSummary:
        'OCI/Q runtime is not configured locally. Public users must bring a Q/OCI key or use a hosted key issuer; admin IAM needs OCI config, compartment, and project envs.',
      missing: ociRuntime.missing,
      nextActions: [
        'Configure OCI bearer auth with a Q/OCI API key, or configure IAM with OCI_CONFIG_FILE, OCI_COMPARTMENT_ID, and OCI_GENAI_PROJECT_ID.',
      ],
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
      configured: hostedQBackendConfigured,
      configuredSummary:
        'Hosted Q backend base URL and service token are configured.',
      missingSummary:
        'Hosted Q backend base URL or service token is not configured in this process; production billing, key issuance, usage, and credits need a durable backend.',
      missing: hostedQBackendMissing,
      nextActions: [
        'Deploy services/cloudflare-hosted-q, then set Q_HOSTED_SERVICE_BASE_URL and Q_HOSTED_SERVICE_TOKEN locally and on qline.site/iorch.net.',
      ],
      details: {
        baseURL: hostedQBaseUrl,
        serviceTokenConfigured: Boolean(hostedQServiceToken),
        workerPackagePresent: hostedQWorkerPackage,
        qlineNetlifyEnv: netlifyEnvDetails,
      },
    }),
    configurationCheck({
      id: 'production-database-config',
      service: 'Production SQL/database',
      audience: ['public', 'paid', 'admin'],
      configured: productionDbConfigured,
      configuredSummary: 'A production SQL/D1/OCI database route/env is configured.',
      missingSummary:
        'No production SQL/D1/OCI database route is configured in this repo process; local JSON stores are not production-safe durable storage.',
      missing: [
        `${oneOf(PRODUCTION_DATABASE_ENV_NAMES)} or concrete services/cloudflare-hosted-q/wrangler.toml database_id`,
      ],
      nextActions: [
        'Create/bind a production D1, OCI, or SQL database before enabling paid public users.',
      ],
      details: {
        d1SchemaPresent: hostedQWorkerPackage,
        d1BindingConfigured,
      },
    }),
    configurationCheck({
      id: 'cloudflare-config',
      service: 'Cloudflare',
      audience: ['public', 'admin'],
      configured: cloudflareConfigured,
      configuredSummary:
        'Cloudflare account auth and concrete D1 binding configuration are present.',
      missingSummary:
        'Cloudflare Worker/D1 is not configured for deployment from this process; set account auth and a real D1 database id before claiming routes live.',
      missing: [
        ...missingCloudflareAuth,
        ...(!d1BindingConfigured
          ? ['CLOUDFLARE_D1_DATABASE_ID or wrangler.toml database_id']
          : []),
      ],
      nextActions: [
        'Set Cloudflare auth, bind a real D1 database id, then run bun run services:backend:preflight before deploy.',
        ...(cloudflareRoutesConfigured
          ? []
          : ['Uncomment production Cloudflare route patterns in services/cloudflare-hosted-q/wrangler.toml before public deploy.']),
      ],
      details: {
        accountConfigured: hasConfiguredEnv(env, ['CLOUDFLARE_ACCOUNT_ID']),
        apiTokenConfigured: hasConfiguredEnv(env, ['CLOUDFLARE_API_TOKEN']),
        d1BindingConfigured,
        routePatternsConfigured: cloudflareRoutesConfigured,
        wranglerConfigPresent: existsSync(
          resolve(REPO_ROOT, HOSTED_Q_WRANGLER_CONFIG),
        ),
      },
    }),
    configurationCheck({
      id: 'netlify-auth-config',
      service: 'Netlify',
      audience: ['public', 'admin'],
      configured: hasNetlifyAuth(env),
      configuredSummary: 'Netlify auth/config is available for live metadata checks.',
      missingSummary:
        'Netlify auth/config is not available locally; public route checks can still run, but deploy metadata checks cannot.',
      missing: ['NETLIFY_AUTH_TOKEN or Netlify CLI auth config'],
      nextActions: [
        'Log in with the Netlify CLI or set NETLIFY_AUTH_TOKEN before checking deployed site env metadata.',
      ],
    }),
    configurationCheck({
      id: 'stripe-billing-config',
      service: 'Stripe billing',
      audience: ['public', 'paid', 'admin'],
      configured: stripeConfigured,
      configuredSummary: 'Stripe billing configuration is present.',
      missingSummary:
        'No complete Stripe billing configuration is present in this repo process; worker checkout/webhook routes are packaged but need real Stripe secrets and return URLs before they are live.',
      missing: [
        ...(!stripeSecretConfigured ? ['STRIPE_SECRET_KEY'] : []),
        ...(!stripePriceConfigured
          ? ['STRIPE_PRICE_BUILDER or STRIPE_PRICE_OPERATOR']
          : []),
        ...(!stripeReturnUrlsConfigured
          ? ['STRIPE_SUCCESS_URL and STRIPE_CANCEL_URL']
          : []),
      ],
      nextActions: [
        'Create Stripe prices and webhook secret bindings, then set the Stripe env keys locally or in qline.site Netlify env.',
      ],
      details: {
        secretConfigured: stripeSecretConfigured,
        priceConfigured: stripePriceConfigured,
        returnUrlsConfigured: stripeReturnUrlsConfigured,
        configSource:
          stripeConfigured && !hasConfiguredEnv(env, ['STRIPE_SECRET_KEY'])
            ? 'qline-netlify-env'
            : stripeConfigured
              ? 'local-process'
              : 'missing',
        qlineNetlifyEnv: netlifyEnvDetails,
        workerRoutePresent: hostedQWorkerPackage,
        checkoutRoute: hostedQWorkerPackage ? 'POST /checkout' : null,
        webhookRoute: hostedQWorkerPackage ? 'POST /stripe-webhook' : null,
      },
    }),
    configurationCheck({
      id: 'mail-engine-config',
      service: 'Mail/Resend',
      audience: ['public', 'paid', 'admin'],
      configured: resendConfigured || smtpConfigured,
      configuredSummary: 'Mail engine configuration is present.',
      missingSummary:
        'No Resend/SMTP mail engine configuration or route is present in this repo process.',
      missing: ['RESEND_API_KEY and RESEND_FROM_EMAIL, or SMTP_HOST/SMTP_URL'],
      nextActions: [
        'Set Resend sender credentials or SMTP settings before enabling account and update notifications.',
      ],
      details: {
        resendConfigured,
        smtpConfigured,
        qlineNetlifyEnv: netlifyEnvDetails,
        workerRoutePresent: hostedQWorkerPackage,
        route: hostedQWorkerPackage ? 'POST /mail/notify' : null,
      },
    }),
    configurationCheck({
      id: 'arobi-laas-config',
      service: 'AROBI ledger / LAAS',
      audience: ['public', 'private', 'admin'],
      configured: Boolean(arobiLaas.baseURL && arobiLaas.tokenConfigured),
      configuredSummary:
        arobiLaas.source === 'local_edge_secret'
          ? 'AROBI ledger/LAAS local edge secret and default health route are configured.'
          : 'AROBI ledger/LAAS base URL and token configuration are present.',
      missingSummary:
        'No AROBI ledger/LAAS API route and token are configured in this repo process; only local/public showcase JSON ledgers are present.',
      missing: [
        `${oneOf(AROBI_LAAS_URL_ENV_NAMES)} plus ${oneOf(AROBI_LAAS_TOKEN_ENV_NAMES)}`,
      ],
      nextActions: [
        'Configure an AROBI LAAS route and token, or install the local edge secret at ~/.arobi/edge-secrets.json.',
      ],
      details: {
        baseURL: arobiLaas.baseURL,
        tokenConfigured: arobiLaas.tokenConfigured,
        source: arobiLaas.source,
        qlineNetlifyEnv: netlifyEnvDetails,
        workerRoutePresent: hostedQWorkerPackage,
        route: hostedQWorkerPackage ? 'POST /laas/events' : null,
      },
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
  const apexBridgeHealthRunner =
    options.apexBridgeHealthRunner ?? ((runnerOptions: { strict: boolean }) =>
      runApexBridgeHealth({ strict: runnerOptions.strict }))
  const checks: ServiceRouteCheck[] = []
  const jawsReleasePublished = await checkJawsReleasePublished(fetchImpl, timeoutMs)
  const external = await buildExternalServiceConfig(fetchImpl, env, timeoutMs)
  const apexBridgeHealth = await apexBridgeHealthRunner({ strict: strictPrivate })

  for (const route of PUBLIC_HTTP_ROUTES) {
    checks.push(await checkHttpRoute(route, { fetchImpl, timeoutMs, strictPrivate, jawsReleasePublished }))
  }
  for (const route of buildConfiguredHttpRoutes(env, external)) {
    checks.push(await checkHttpRoute(route, { fetchImpl, timeoutMs, strictPrivate, jawsReleasePublished }))
  }
  for (const route of LOCAL_HTTP_ROUTES) {
    checks.push(await checkHttpRoute(route, { fetchImpl, timeoutMs, strictPrivate, jawsReleasePublished }))
  }
  checks.push(...buildApexBridgeRouteChecks(apexBridgeHealth))
  checks.push(...buildConfigurationChecks(env, external))

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
      if (check.missing?.length) {
        console.log(`  Missing: ${check.missing.join(', ')}`)
      }
      if (check.nextActions?.length) {
        for (const action of check.nextActions) {
          console.log(`  Next: ${action}`)
        }
      }
    }
  }

  return report.status === 'failed' ? 1 : 0
}

if (import.meta.main) {
  process.exit(await main())
}
