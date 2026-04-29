import { existsSync, readFileSync } from 'fs'
import { homedir } from 'os'
import { join, resolve } from 'path'

export type DiscordAgentAuthStatus = 'ok' | 'warning'
export type ImmaculateToolPreflightStatus = 'ok' | 'warning'
export type ImmaculateSearchSmokeStatus = 'passed' | 'warning' | 'skipped'

export type DiscordAgentAuthTarget = {
  label: string
  envFilePath: string
}

export type DiscordAgentAuthResult = {
  label: string
  envFilePath: string
  status: DiscordAgentAuthStatus
  summary: string
  gatewayEnabled: boolean
  tokenPresent: boolean
  applicationId?: string | null
  applicationMatches?: boolean | null
  botId?: string | null
  username?: string | null
  httpStatus?: number | null
}

export type DiscordAgentAuthReport = {
  status: DiscordAgentAuthStatus
  overallStatus: DiscordAgentAuthStatus
  generatedAt: string
  results: DiscordAgentAuthResult[]
  immaculate: ImmaculateToolPreflightResult
}

export type ImmaculateToolPreflightResult = {
  status: ImmaculateToolPreflightStatus
  summary: string
  harnessUrl: string
  apiKeyPresent: boolean
  apiKeySource?: string | null
  reachable: boolean
  httpStatus?: number | null
  fetchStatus?: string | null
  searchStatus?: string | null
  searchReason?: string | null
  artifactStatus?: string | null
  receiptStatus?: string | null
  searchSmoke?: ImmaculateSearchSmokeResult
}

export type ImmaculateSearchSmokeResult = {
  status: ImmaculateSearchSmokeStatus
  summary: string
  query: string
  httpStatus?: number | null
  receiptId?: string | null
  resultCount?: number | null
}

type DiscordUserResponse = {
  id?: unknown
  username?: unknown
  global_name?: unknown
}

const DISCORD_USER_ENDPOINT = 'https://discord.com/api/v10/users/@me'
const IMMACULATE_SEARCH_SMOKE_QUERY = 'Tavily Search API documentation'

const DEFAULT_AGENT_TARGETS = [
  {
    label: 'Q',
    envFile: 'discord-q-agent.env.ps1',
  },
  {
    label: 'Viola',
    envFile: 'discord-viola.env.ps1',
  },
  {
    label: 'Blackbeak',
    envFile: 'discord-blackbeak.env.ps1',
  },
] as const

function parseBooleanFlag(value: string | null, defaultValue: boolean): boolean {
  if (!value) {
    return defaultValue
  }
  const normalized = value.trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false
  }
  return defaultValue
}

function stripEnvQuotes(value: string): string {
  const trimmed = value.trim()
  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

export function parsePowerShellEnvAssignments(source: string): Record<string, string> {
  const values: Record<string, string> = {}
  const pattern =
    /^\s*\$env:([A-Z0-9_]+)\s*=\s*(?:'([^']*)'|"([^"]*)"|([^\r\n#]+))\s*$/gim
  for (const match of source.matchAll(pattern)) {
    const key = match[1]?.trim()
    if (!key) {
      continue
    }
    values[key] = (match[2] ?? match[3] ?? match[4] ?? '').trim()
  }
  return values
}

export function parseDotEnvAssignments(source: string): Record<string, string> {
  const values: Record<string, string> = {}
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) {
      continue
    }
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (!match) {
      continue
    }
    values[match[1]] = stripEnvQuotes(match[2])
  }
  return values
}

export function resolveDiscordAgentAuthTargets(
  root = process.cwd(),
): DiscordAgentAuthTarget[] {
  return DEFAULT_AGENT_TARGETS.map(target => ({
    label: target.label,
    envFilePath: resolve(root, 'local-command-station', target.envFile),
  }))
}

export function aggregateDiscordAgentAuthStatus(
  results: DiscordAgentAuthResult[],
): DiscordAgentAuthStatus {
  return results.some(result => result.status === 'warning') ? 'warning' : 'ok'
}

function aggregateOverallStatus(
  results: DiscordAgentAuthResult[],
  immaculate: ImmaculateToolPreflightResult,
): DiscordAgentAuthStatus {
  return results.some(result => result.status === 'warning') ||
    immaculate.status === 'warning'
    ? 'warning'
    : 'ok'
}

function normalizeHarnessUrl(value?: string | null): string {
  const trimmed = value?.trim()
  return (trimmed || 'http://127.0.0.1:8787').replace(/\/+$/, '')
}

function resolveImmaculateEnvPaths(root = process.cwd()): string[] {
  const userProfile = process.env.USERPROFILE?.trim() || homedir()
  return Array.from(
    new Set(
      [
        process.env.IMMACULATE_ENV_FILE?.trim() || null,
        resolve(root, '.env.local'),
        resolve(root, '.env'),
        userProfile ? join(userProfile, 'Desktop', 'Immaculate', '.env.local') : null,
        userProfile ? join(userProfile, 'Desktop', 'Immaculate', '.env') : null,
      ].filter((value): value is string => Boolean(value)),
    ),
  )
}

function readImmaculateEnv(root = process.cwd()): Record<string, string> {
  const values: Record<string, string> = {}
  for (const path of resolveImmaculateEnvPaths(root)) {
    if (!existsSync(path)) {
      continue
    }
    const parsed = parseDotEnvAssignments(readFileSync(path, 'utf8'))
    for (const [key, value] of Object.entries(parsed)) {
      if (!(key in values)) {
        values[key] = value
      }
    }
  }
  return values
}

function resolveImmaculatePreflightConfig(root = process.cwd()): {
  harnessUrl: string
  apiKey?: string
  apiKeySource?: string
} {
  const env = readImmaculateEnv(root)
  const configuredUrl =
    process.env.IMMACULATE_HARNESS_URL?.trim() ||
    env.IMMACULATE_HARNESS_URL?.trim()
  const configuredPort =
    process.env.IMMACULATE_PORT?.trim() || env.IMMACULATE_PORT?.trim()
  const configuredHost =
    process.env.IMMACULATE_HOST?.trim() || env.IMMACULATE_HOST?.trim() || '127.0.0.1'
  const apiKey =
    process.env.IMMACULATE_API_KEY?.trim() || env.IMMACULATE_API_KEY?.trim()
  const apiKeySource = process.env.IMMACULATE_API_KEY?.trim()
    ? 'process:IMMACULATE_API_KEY'
    : env.IMMACULATE_API_KEY?.trim()
      ? 'local-env:IMMACULATE_API_KEY'
      : undefined
  return {
    harnessUrl: normalizeHarnessUrl(
      configuredUrl || (configuredPort ? `http://${configuredHost}:${configuredPort}` : null),
    ),
    apiKey,
    apiKeySource,
  }
}

function buildImmaculatePreflightHeaders(
  apiKey?: string,
  governance: {
    actor?: string
    purpose?: string
    policyId?: string
    consentScope?: string
  } = {},
): HeadersInit {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'x-immaculate-actor': governance.actor ?? 'discord-agent-auth-preflight',
    'x-immaculate-purpose': governance.purpose ?? 'cognitive-trace-read',
    'x-immaculate-policy-id': governance.policyId ?? 'cognitive-trace-read-default',
    'x-immaculate-consent-scope': governance.consentScope ?? 'system:intelligence',
  }
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`
  }
  return headers
}

function readNestedRecord(
  value: unknown,
  path: string[],
): Record<string, unknown> | null {
  let cursor = value
  for (const key of path) {
    if (typeof cursor !== 'object' || cursor === null || !(key in cursor)) {
      return null
    }
    cursor = (cursor as Record<string, unknown>)[key]
  }
  return typeof cursor === 'object' && cursor !== null && !Array.isArray(cursor)
    ? cursor as Record<string, unknown>
    : null
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function readCapabilityStatus(
  capabilities: unknown,
  path: string[],
): string | null {
  let cursor: unknown = capabilities
  for (const key of path) {
    if (typeof cursor !== 'object' || cursor === null || !(key in cursor)) {
      return null
    }
    cursor = (cursor as Record<string, unknown>)[key]
  }
  return typeof cursor === 'string' ? cursor : null
}

function readCapabilityReason(capabilities: unknown): string | null {
  if (
    typeof capabilities !== 'object' ||
    capabilities === null ||
    !('capabilities' in capabilities)
  ) {
    return null
  }
  const search = (capabilities as {
    capabilities?: {
      internet?: {
        search?: {
          reason?: unknown
        }
      }
    }
  }).capabilities?.internet?.search
  return typeof search?.reason === 'string' ? search.reason : null
}

async function runImmaculateSearchSmoke(args: {
  harnessUrl: string
  apiKey: string
  fetchImpl: typeof fetch
  timeoutMs: number
  query?: string
}): Promise<ImmaculateSearchSmokeResult> {
  const query = args.query?.trim() || IMMACULATE_SEARCH_SMOKE_QUERY
  try {
    const response = await args.fetchImpl(`${args.harnessUrl}/api/tools/search`, {
      method: 'POST',
      headers: {
        ...buildImmaculatePreflightHeaders(args.apiKey, {
          purpose: 'internet-search',
          policyId: 'internet-search-default',
          consentScope: 'system:research',
        }),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        maxResults: 2,
      }),
      signal: AbortSignal.timeout(args.timeoutMs),
    })
    const httpStatus = response.status
    const body = await response.json().catch(() => null)
    if (!response.ok) {
      const message =
        typeof body === 'object' &&
        body !== null &&
        'message' in body &&
        typeof body.message === 'string'
          ? body.message
          : `HTTP ${httpStatus}`
      return {
        status: 'warning',
        summary: `Governed search smoke failed: ${message}`,
        query,
        httpStatus,
      }
    }

    const receipt = readNestedRecord(body, ['receipt'])
    const receiptId = readString(receipt?.id)
    const resultCount =
      readNumber(receipt?.resultCount) ??
      (Array.isArray(receipt?.results) ? receipt.results.length : null)
    return {
      status: receiptId ? 'passed' : 'warning',
      summary: receiptId
        ? `Governed search smoke passed with receipt ${receiptId}.`
        : 'Governed search smoke completed but no receipt id was returned.',
      query,
      httpStatus,
      receiptId,
      resultCount,
    }
  } catch (error) {
    return {
      status: 'warning',
      summary: `Governed search smoke could not run: ${error instanceof Error ? error.message : String(error)}`,
      query,
      httpStatus: null,
    }
  }
}

export async function checkImmaculateToolPreflight(args: {
  root?: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
  searchSmoke?: boolean
} = {}): Promise<ImmaculateToolPreflightResult> {
  const fetchImpl = args.fetchImpl ?? fetch
  const config = resolveImmaculatePreflightConfig(args.root ?? process.cwd())
  const headers = buildImmaculatePreflightHeaders(config.apiKey)
  const timeoutMs = args.timeoutMs ?? 7_500

  if (!config.apiKey) {
    return {
      status: 'warning',
      summary:
        'IMMACULATE_API_KEY is not available from process env or local Immaculate env files.',
      harnessUrl: config.harnessUrl,
      apiKeyPresent: false,
      apiKeySource: null,
      reachable: false,
      httpStatus: null,
    }
  }

  try {
    const health = await fetchImpl(`${config.harnessUrl}/api/health`, {
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!health.ok) {
      return {
        status: 'warning',
        summary: `Immaculate harness health returned HTTP ${health.status}.`,
        harnessUrl: config.harnessUrl,
        apiKeyPresent: true,
        apiKeySource: config.apiKeySource ?? null,
        reachable: false,
        httpStatus: health.status,
      }
    }

    const capabilitiesResponse = await fetchImpl(
      `${config.harnessUrl}/api/tools/capabilities`,
      {
        headers,
        signal: AbortSignal.timeout(timeoutMs),
      },
    )
    const httpStatus = capabilitiesResponse.status
    const body = await capabilitiesResponse.json().catch(() => null)
    if (!capabilitiesResponse.ok) {
      return {
        status: 'warning',
        summary: `Immaculate tool capabilities returned HTTP ${httpStatus}.`,
        harnessUrl: config.harnessUrl,
        apiKeyPresent: true,
        apiKeySource: config.apiKeySource ?? null,
        reachable: true,
        httpStatus,
      }
    }

    const fetchStatus = readCapabilityStatus(body, [
      'capabilities',
      'internet',
      'fetch',
      'status',
    ])
    const searchStatus = readCapabilityStatus(body, [
      'capabilities',
      'internet',
      'search',
      'status',
    ])
    const artifactStatus = readCapabilityStatus(body, [
      'capabilities',
      'artifacts',
      'status',
    ])
    const receiptStatus = readCapabilityStatus(body, [
      'capabilities',
      'receipts',
      'status',
    ])
    const searchReason = readCapabilityReason(body)
    const essentialsReady =
      fetchStatus === 'available' &&
      artifactStatus === 'available' &&
      receiptStatus === 'available'
    const searchReady = searchStatus === 'available'
    const searchSmoke = searchReady && args.searchSmoke !== false
      ? await runImmaculateSearchSmoke({
          harnessUrl: config.harnessUrl,
          apiKey: config.apiKey,
          fetchImpl,
          timeoutMs,
        })
      : {
          status: 'skipped',
          summary: `Governed search smoke skipped because search is ${searchStatus ?? 'unknown'}.`,
          query: IMMACULATE_SEARCH_SMOKE_QUERY,
        } satisfies ImmaculateSearchSmokeResult
    const status: ImmaculateToolPreflightStatus =
      essentialsReady && searchReady && searchSmoke.status === 'passed'
        ? 'ok'
        : 'warning'
    const summary = searchReady && searchSmoke.status === 'passed'
      ? `Immaculate governed fetch, search, artifacts, and receipts are available. ${searchSmoke.summary}`
      : searchReady
        ? `Immaculate governed fetch/search/artifacts/receipts are configured, but ${searchSmoke.summary}`
      : `Immaculate governed fetch/artifacts/receipts are ${essentialsReady ? 'available' : 'not fully available'}; search is ${searchStatus ?? 'unknown'}.`

    return {
      status,
      summary: searchReason && !searchReady ? `${summary} ${searchReason}` : summary,
      harnessUrl: config.harnessUrl,
      apiKeyPresent: true,
      apiKeySource: config.apiKeySource ?? null,
      reachable: true,
      httpStatus,
      fetchStatus,
      searchStatus,
      searchReason,
      artifactStatus,
      receiptStatus,
      searchSmoke,
    }
  } catch (error) {
    return {
      status: 'warning',
      summary: `Immaculate tool preflight could not reach harness: ${error instanceof Error ? error.message : String(error)}`,
      harnessUrl: config.harnessUrl,
      apiKeyPresent: true,
      apiKeySource: config.apiKeySource ?? null,
      reachable: false,
      httpStatus: null,
    }
  }
}

async function probeDiscordBotToken(args: {
  token: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
}): Promise<{
  status: DiscordAgentAuthStatus
  summary: string
  httpStatus?: number | null
  botId?: string | null
  username?: string | null
}> {
  const fetchImpl = args.fetchImpl ?? fetch
  try {
    const response = await fetchImpl(DISCORD_USER_ENDPOINT, {
      headers: {
        Authorization: `Bot ${args.token}`,
      },
      signal: AbortSignal.timeout(args.timeoutMs ?? 10_000),
    })
    const httpStatus = response.status
    if (response.ok) {
      const body = await response.json().catch(() => null) as DiscordUserResponse | null
      const botId = typeof body?.id === 'string' ? body.id : null
      const username = typeof body?.username === 'string'
        ? body.username
        : typeof body?.global_name === 'string'
          ? body.global_name
          : null
      return {
        status: 'ok',
        summary: `Discord accepted bot token${username ? ` for ${username}` : ''}.`,
        httpStatus,
        botId,
        username,
      }
    }
    if (httpStatus === 401 || httpStatus === 403) {
      return {
        status: 'warning',
        summary: `Discord rejected bot token with HTTP ${httpStatus}; rotate DISCORD_BOT_TOKEN before starting this agent.`,
        httpStatus,
      }
    }
    return {
      status: 'warning',
      summary: `Discord token preflight returned HTTP ${httpStatus}; retry before treating the token as bad.`,
      httpStatus,
    }
  } catch (error) {
    return {
      status: 'warning',
      summary: `Discord token preflight could not reach Discord: ${error instanceof Error ? error.message : String(error)}`,
      httpStatus: null,
    }
  }
}

export async function checkDiscordAgentAuthTarget(args: {
  target: DiscordAgentAuthTarget
  fetchImpl?: typeof fetch
  timeoutMs?: number
}): Promise<DiscordAgentAuthResult> {
  const { target } = args
  if (!existsSync(target.envFilePath)) {
    return {
      label: target.label,
      envFilePath: target.envFilePath,
      status: 'warning',
      summary: 'Discord agent env file is missing.',
      gatewayEnabled: false,
      tokenPresent: false,
    }
  }

  const env = parsePowerShellEnvAssignments(readFileSync(target.envFilePath, 'utf8'))
  const gatewayEnabled = parseBooleanFlag(env.DISCORD_GATEWAY_ENABLED ?? null, true)
  const applicationId =
    env.DISCORD_APPLICATION_ID?.trim() || env.DISCORD_CLIENT_ID?.trim() || null
  const token = env.DISCORD_BOT_TOKEN?.trim() ?? ''
  if (!gatewayEnabled) {
    return {
      label: target.label,
      envFilePath: target.envFilePath,
      status: 'ok',
      summary: 'Discord gateway auth skipped because DISCORD_GATEWAY_ENABLED is false.',
      gatewayEnabled,
      tokenPresent: Boolean(token),
      applicationId,
      applicationMatches: null,
    }
  }
  if (!token) {
    return {
      label: target.label,
      envFilePath: target.envFilePath,
      status: 'warning',
      summary: 'DISCORD_BOT_TOKEN is missing for a gateway-enabled agent.',
      gatewayEnabled,
      tokenPresent: false,
      applicationId,
      applicationMatches: null,
    }
  }

  const probe = await probeDiscordBotToken({
    token,
    fetchImpl: args.fetchImpl,
    timeoutMs: args.timeoutMs,
  })
  const applicationMatches =
    applicationId && probe.botId ? applicationId === probe.botId : null
  if (probe.status === 'ok' && !applicationId) {
    return {
      label: target.label,
      envFilePath: target.envFilePath,
      status: 'warning',
      summary:
        'Discord accepted the bot token, but DISCORD_APPLICATION_ID is missing; set it before starting this agent.',
      gatewayEnabled,
      tokenPresent: true,
      applicationId,
      applicationMatches,
      botId: probe.botId ?? null,
      username: probe.username ?? null,
      httpStatus: probe.httpStatus ?? null,
    }
  }
  if (probe.status === 'ok' && applicationMatches === false) {
    return {
      label: target.label,
      envFilePath: target.envFilePath,
      status: 'warning',
      summary:
        `Discord accepted the bot token for ${probe.username ?? probe.botId ?? 'a bot'}, but it does not match DISCORD_APPLICATION_ID; update the env file before starting this agent.`,
      gatewayEnabled,
      tokenPresent: true,
      applicationId,
      applicationMatches,
      botId: probe.botId ?? null,
      username: probe.username ?? null,
      httpStatus: probe.httpStatus ?? null,
    }
  }
  return {
    label: target.label,
    envFilePath: target.envFilePath,
    status: probe.status,
    summary: probe.summary,
    gatewayEnabled,
    tokenPresent: true,
    applicationId,
    applicationMatches,
    botId: probe.botId ?? null,
    username: probe.username ?? null,
    httpStatus: probe.httpStatus ?? null,
  }
}

export async function buildDiscordAgentAuthReport(args: {
  root?: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
} = {}): Promise<DiscordAgentAuthReport> {
  const targets = resolveDiscordAgentAuthTargets(args.root ?? process.cwd())
  const [results, immaculate] = await Promise.all([
    Promise.all(
      targets.map(target =>
        checkDiscordAgentAuthTarget({
          target,
          fetchImpl: args.fetchImpl,
          timeoutMs: args.timeoutMs,
        }),
      ),
    ),
    checkImmaculateToolPreflight({
      root: args.root,
      fetchImpl: args.fetchImpl,
      timeoutMs: args.timeoutMs,
    }),
  ])
  const status = aggregateOverallStatus(results, immaculate)
  return {
    status,
    overallStatus: status,
    generatedAt: new Date().toISOString(),
    results,
    immaculate,
  }
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const json = argv.includes('--json')
  const report = await buildDiscordAgentAuthReport()
  if (json) {
    console.log(JSON.stringify(report, null, 2))
  } else {
    console.log(
      [
        `Discord auth preflight ${report.status}`,
        ...report.results.map(result => `- [${result.status}] ${result.label}: ${result.summary}`),
        `- [${report.immaculate.status}] Immaculate tools: ${report.immaculate.summary}`,
      ].join('\n'),
    )
  }
  return 0
}

if (import.meta.main) {
  const exitCode = await main()
  process.exit(exitCode)
}
