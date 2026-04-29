import axios from 'axios'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { jsonStringify } from './slowOperations.js'
import { getSettings_DEPRECATED } from './settings/settings.js'
import {
  IMMACULATE_CREW_POLICY,
  resolveImmaculatePressureDelayMs,
} from '../immaculate/policies.js'

export const IMMACULATE_HARNESS_ACTIONS = [
  'health',
  'snapshot',
  'topology',
  'governance_status',
  'intelligence',
  'executions',
  'workers',
  'ollama_models',
  'tool_capabilities',
  'tool_receipts',
  'tool_receipt',
  'tool_fetch',
  'tool_search',
  'artifact_package',
  'register_ollama',
  'register_worker',
  'heartbeat_worker',
  'unregister_worker',
  'assign_worker',
  'control',
  'run',
] as const

export type ImmaculateHarnessAction =
  (typeof IMMACULATE_HARNESS_ACTIONS)[number]

export const IMMACULATE_CONTROL_ACTIONS = [
  'pause',
  'resume',
  'boost',
  'reroute',
  'pulse',
  'reset',
  'step',
] as const

export type ImmaculateControlAction =
  (typeof IMMACULATE_CONTROL_ACTIONS)[number]

export const IMMACULATE_OLLAMA_ROLES = [
  'soul',
  'mid',
  'reasoner',
  'guard',
] as const

export type ImmaculateOllamaRole = (typeof IMMACULATE_OLLAMA_ROLES)[number]

export const IMMACULATE_TOOL_RECEIPT_KINDS = ['fetch', 'search'] as const

export type ImmaculateToolReceiptKind =
  (typeof IMMACULATE_TOOL_RECEIPT_KINDS)[number]

export const IMMACULATE_SEARCH_FRESHNESS = [
  'day',
  'week',
  'month',
  'year',
] as const

export type ImmaculateSearchFreshness =
  (typeof IMMACULATE_SEARCH_FRESHNESS)[number]

export const IMMACULATE_ARTIFACT_FORMATS = [
  'markdown',
  'text',
  'json',
  'html',
  'docx',
  'pdf',
] as const

export type ImmaculateArtifactFormat =
  (typeof IMMACULATE_ARTIFACT_FORMATS)[number]

type ImmaculateHarnessSettingsLike = {
  immaculate?: {
    enabled?: boolean
    mode?: string
    harnessUrl?: string
    apiKey?: string
    apiKeyEnv?: string
    actor?: string
  }
} | null | undefined

export type ImmaculateHarnessInputLike = {
  action: ImmaculateHarnessAction
  actor?: string
  purpose?: string[]
  policyId?: string
  consentScope?: string
}

export type ImmaculateHarnessConfig = {
  enabled: boolean
  mode: string
  harnessUrl: string
  apiKey?: string
  apiKeySource?: string
  actor: string
}

export type ImmaculateGovernanceProfile = {
  action: string
  purpose: string[]
  policyId: string
  consentScope: string
}

export type ImmaculateHarnessResolvedGovernance = {
  action: string
  purpose: string[]
  policyId: string
  consentScope: string
  actor: string
}

export type ImmaculateHarnessResult = {
  status: number
  route: string
  summary: string
  json: string
  governance: ImmaculateHarnessResolvedGovernance | null
}

export type ImmaculateHarnessStatus = {
  enabled: boolean
  mode: string
  harnessUrl: string
  actor: string
  apiKeySource?: string
  loopback: boolean
  reachable: boolean
  status?: number
  service?: string
  clients?: number
  error?: string
}

export type ImmaculateHarnessDeckReceipt = {
  cycle?: number
  nodes?: number
  edges?: number
  profile?: string
  objective?: string
  layerCount: number
  executionCount: number
  recommendedLayerId?: string
}

export type ImmaculateHarnessWorkerExecutionProfile = 'local' | 'remote'

export type ImmaculateHarnessWorkerHealthStatus =
  | 'healthy'
  | 'stale'
  | 'faulted'

export type ImmaculateHarnessWorkerRecord = {
  workerId: string
  workerLabel?: string | null
  hostLabel?: string | null
  executionProfile: ImmaculateHarnessWorkerExecutionProfile
  executionEndpoint?: string | null
  registeredAt: string
  heartbeatAt: string
  leaseExpiresAt: string
  leaseDurationMs: number
  healthStatus?: ImmaculateHarnessWorkerHealthStatus
  healthSummary?: string
  healthReason?: string
  lastHealthAt?: string
  leaseRemainingMs?: number
  assignmentEligible?: boolean
  assignmentBlockedReason?: string | null
  watch: boolean
  allowHostRisk: boolean
  supportedBaseModels: string[]
  preferredLayerIds: string[]
}

export type ImmaculateHarnessWorkerAssignment = {
  workerId: string
  workerLabel?: string | null
  hostLabel?: string | null
  executionProfile: ImmaculateHarnessWorkerExecutionProfile
  executionEndpoint?: string | null
  assignedAt: string
  reason: string
  score?: number
  healthStatus?: ImmaculateHarnessWorkerHealthStatus
  healthSummary?: string
}

export type ImmaculateHarnessWorkerCatalog = {
  workers: ImmaculateHarnessWorkerRecord[]
  workerCount?: number
  healthyWorkerCount?: number
  staleWorkerCount?: number
  faultedWorkerCount?: number
  eligibleWorkerCount?: number
  blockedWorkerCount?: number
  recommendedLayerId?: string
}

export type ImmaculateCrewPressureVerdict = {
  action: Extract<ImmaculateControlAction, 'boost' | 'pulse' | 'reroute'>
  label: 'expand' | 'hold' | 'reroute'
  detail: string
  value?: number
}

export type ImmaculatePressureWindow = {
  label: 'clear' | 'hold' | 'reroute'
  delayMs: number
  detail: string
}

export type ImmaculateCrewWaveState = {
  teamName: string
  crewSize: number
  label: ImmaculatePressureWindow['label']
  detail: string
  delayMs: number
  updatedAt: number
  holdUntil?: number
  executionCount?: number
  recommendedLayerId?: string
}

export type ImmaculateCrewBurstBudget = {
  teamName: string
  label: 'hold' | 'reroute'
  maxSpawns: number
  remainingSpawns: number
  detail: string
  updatedAt: number
  holdUntil?: number
  recommendedLayerId?: string
}

function normalizeInlineText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

const DEFAULT_HARNESS_URL = 'http://127.0.0.1:8787'
let localImmaculateEnvCache:
  | { cacheKey: string; values: Record<string, string> }
  | null = null
const DEFAULT_ACTOR = 'openjaws'
const REQUEST_TIMEOUT_MS = 20_000
const HEALTH_TIMEOUT_MS = 7_500
const DEFAULT_ACTUATION_TIMEOUT_MS = 1_500
const DEFAULT_OBJECTIVE_LENGTH = 180

const GOVERNANCE_PROFILES: Partial<
  Record<ImmaculateHarnessAction, ImmaculateGovernanceProfile>
> = {
  executions: {
    action: 'cognitive-trace-read',
    purpose: ['cognitive-trace-read'],
    policyId: 'cognitive-trace-read-default',
    consentScope: 'system:intelligence',
  },
  workers: {
    action: 'cognitive-trace-read',
    purpose: ['cognitive-trace-read'],
    policyId: 'cognitive-trace-read-default',
    consentScope: 'system:intelligence',
  },
  register_ollama: {
    action: 'cognitive-registration',
    purpose: ['cognitive-registration'],
    policyId: 'cognitive-ops-default',
    consentScope: 'system:intelligence',
  },
  register_worker: {
    action: 'cognitive-registration',
    purpose: ['cognitive-registration'],
    policyId: 'cognitive-ops-default',
    consentScope: 'system:intelligence',
  },
  heartbeat_worker: {
    action: 'cognitive-registration',
    purpose: ['cognitive-registration'],
    policyId: 'cognitive-ops-default',
    consentScope: 'system:intelligence',
  },
  unregister_worker: {
    action: 'cognitive-registration',
    purpose: ['cognitive-registration'],
    policyId: 'cognitive-ops-default',
    consentScope: 'system:intelligence',
  },
  assign_worker: {
    action: 'cognitive-execution',
    purpose: ['cognitive-execution'],
    policyId: 'cognitive-run-default',
    consentScope: 'system:intelligence',
  },
  control: {
    action: 'operator-control',
    purpose: ['orchestration-control'],
    policyId: 'operator-control-default',
    consentScope: 'operator:openjaws',
  },
  run: {
    action: 'cognitive-execution',
    purpose: ['cognitive-execution'],
    policyId: 'cognitive-run-default',
    consentScope: 'system:intelligence',
  },
  tool_capabilities: {
    action: 'cognitive-trace-read',
    purpose: ['cognitive-trace-read'],
    policyId: 'cognitive-trace-read-default',
    consentScope: 'system:intelligence',
  },
  tool_receipts: {
    action: 'event-read',
    purpose: ['event-read'],
    policyId: 'event-read-default',
    consentScope: 'system:audit',
  },
  tool_receipt: {
    action: 'event-read',
    purpose: ['event-read'],
    policyId: 'event-read-default',
    consentScope: 'system:audit',
  },
  tool_fetch: {
    action: 'internet-fetch',
    purpose: ['internet-fetch'],
    policyId: 'internet-fetch-default',
    consentScope: 'system:research',
  },
  tool_search: {
    action: 'internet-search',
    purpose: ['internet-search'],
    policyId: 'internet-search-default',
    consentScope: 'system:research',
  },
  artifact_package: {
    action: 'document-delivery',
    purpose: ['artifact-delivery'],
    policyId: 'document-delivery-default',
    consentScope: 'system:delivery',
  },
}

export function normalizeImmaculateHarnessUrl(url?: string | null): string {
  const trimmed = url?.trim()
  if (!trimmed) {
    return DEFAULT_HARNESS_URL
  }
  return trimmed.replace(/\/+$/, '')
}

export function isLoopbackHarnessUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(parsed.hostname)
  } catch {
    return false
  }
}

function stripDotEnvQuotes(value: string): string {
  const trimmed = value.trim()
  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function getLocalImmaculateEnvPaths(): string[] {
  const configured = process.env.IMMACULATE_ENV_FILE?.trim()
  if (configured) {
    return [configured]
  }
  const userProfile = process.env.USERPROFILE?.trim()
  return Array.from(
    new Set(
      [
        userProfile ? join(userProfile, 'Desktop', 'Immaculate', '.env.local') : null,
        userProfile ? join(userProfile, 'Desktop', 'Immaculate', '.env') : null,
      ].filter((value): value is string => Boolean(value)),
    ),
  )
}

function readLocalImmaculateEnv(): Record<string, string> {
  const paths = getLocalImmaculateEnvPaths()
  const cacheKey = paths.join('|')
  if (localImmaculateEnvCache?.cacheKey === cacheKey) {
    return localImmaculateEnvCache.values
  }

  const values: Record<string, string> = {}
  for (const path of paths) {
    if (!existsSync(path)) {
      continue
    }
    const content = readFileSync(path, 'utf8')
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim()
      if (!line || line.startsWith('#')) {
        continue
      }
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
      if (!match) {
        continue
      }
      values[match[1]] = stripDotEnvQuotes(match[2])
    }
  }

  localImmaculateEnvCache = { cacheKey, values }
  return values
}

function getLocalImmaculateEnvValue(name: string): string | undefined {
  const value = readLocalImmaculateEnv()[name]?.trim()
  return value || undefined
}

function resolveLocalImmaculateHarnessUrl(): string | undefined {
  const direct = getLocalImmaculateEnvValue('IMMACULATE_HARNESS_URL')
  if (direct) {
    return direct
  }
  const port = getLocalImmaculateEnvValue('IMMACULATE_PORT')
  const host = getLocalImmaculateEnvValue('IMMACULATE_HOST') || '127.0.0.1'
  return port ? `http://${host}:${port}` : undefined
}

function resolveImmaculateApiKey(
  settings: ImmaculateHarnessSettingsLike,
): { apiKey?: string; apiKeySource?: string } {
  const configuredEnv = settings?.immaculate?.apiKeyEnv?.trim()
  if (configuredEnv && process.env[configuredEnv]?.trim()) {
    return {
      apiKey: process.env[configuredEnv]?.trim(),
      apiKeySource: configuredEnv,
    }
  }

  if (process.env.IMMACULATE_API_KEY?.trim()) {
    return {
      apiKey: process.env.IMMACULATE_API_KEY.trim(),
      apiKeySource: 'IMMACULATE_API_KEY',
    }
  }

  const localApiKey = getLocalImmaculateEnvValue('IMMACULATE_API_KEY')
  if (localApiKey) {
    return {
      apiKey: localApiKey,
      apiKeySource: 'IMMACULATE_ENV_FILE',
    }
  }

  if (settings?.immaculate?.apiKey?.trim()) {
    return {
      apiKey: settings.immaculate.apiKey.trim(),
      apiKeySource: 'settings',
    }
  }

  return {}
}

export function getImmaculateHarnessConfig(
  settings: ImmaculateHarnessSettingsLike = getSettings_DEPRECATED(),
): ImmaculateHarnessConfig {
  const { apiKey, apiKeySource } = resolveImmaculateApiKey(settings)
  return {
    enabled: settings?.immaculate?.enabled !== false,
    mode: settings?.immaculate?.mode?.trim() || 'balanced',
    harnessUrl: normalizeImmaculateHarnessUrl(
      process.env.IMMACULATE_HARNESS_URL ||
        settings?.immaculate?.harnessUrl ||
        resolveLocalImmaculateHarnessUrl(),
    ),
    apiKey,
    apiKeySource,
    actor:
      process.env.IMMACULATE_ACTOR?.trim() ||
      settings?.immaculate?.actor?.trim() ||
      DEFAULT_ACTOR,
  }
}

export function getImmaculateHarnessGovernanceProfile(
  action: ImmaculateHarnessAction,
): ImmaculateGovernanceProfile | null {
  return GOVERNANCE_PROFILES[action] ?? null
}

export function resolveImmaculateHarnessGovernance(
  input: ImmaculateHarnessInputLike,
  config: ImmaculateHarnessConfig = getImmaculateHarnessConfig(),
): ImmaculateHarnessResolvedGovernance | null {
  const profile = getImmaculateHarnessGovernanceProfile(input.action)
  if (!profile) {
    return null
  }

  const actor = input.actor?.trim() || config.actor
  const consentScope =
    input.consentScope?.trim() ||
    (input.action === 'control' ? `operator:${actor}` : profile.consentScope)

  return {
    action: profile.action,
    purpose:
      input.purpose && input.purpose.length > 0
        ? [...new Set(input.purpose.map(value => value.trim()).filter(Boolean))]
        : profile.purpose,
    policyId: input.policyId?.trim() || profile.policyId,
    consentScope,
    actor,
  }
}

export function buildImmaculateHarnessHeaders(
  input: ImmaculateHarnessInputLike,
  config: ImmaculateHarnessConfig = getImmaculateHarnessConfig(),
): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  }
  if (config.apiKey) {
    headers.Authorization = `Bearer ${config.apiKey}`
  }

  const governance = resolveImmaculateHarnessGovernance(input, config)
  if (!governance) {
    return headers
  }

  headers['x-immaculate-actor'] = governance.actor
  headers['x-immaculate-purpose'] = governance.purpose.join(',')
  headers['x-immaculate-policy-id'] = governance.policyId
  headers['x-immaculate-consent-scope'] = governance.consentScope
  return headers
}

function getImmaculateHarnessRoute(
  action: ImmaculateHarnessAction,
  input?: {
    worker?: {
      workerId?: string
    }
    receipts?: {
      kind?: ImmaculateToolReceiptKind
      limit?: number
      receiptId?: string
    }
  },
): { method: 'GET' | 'POST'; route: string } {
  switch (action) {
    case 'health':
      return { method: 'GET', route: '/api/health' }
    case 'snapshot':
      return { method: 'GET', route: '/api/snapshot' }
    case 'topology':
      return { method: 'GET', route: '/api/topology' }
    case 'governance_status':
      return { method: 'GET', route: '/api/governance/status' }
    case 'intelligence':
      return { method: 'GET', route: '/api/intelligence' }
    case 'executions':
      return { method: 'GET', route: '/api/intelligence/executions' }
    case 'workers':
      return { method: 'GET', route: '/api/intelligence/workers' }
    case 'ollama_models':
      return { method: 'GET', route: '/api/intelligence/ollama/models' }
    case 'tool_capabilities':
      return { method: 'GET', route: '/api/tools/capabilities' }
    case 'tool_receipts': {
      const params = new URLSearchParams()
      if (input?.receipts?.kind) {
        params.set('kind', input.receipts.kind)
      }
      if (
        typeof input?.receipts?.limit === 'number' &&
        Number.isFinite(input.receipts.limit)
      ) {
        params.set('limit', String(input.receipts.limit))
      }
      const query = params.toString()
      return {
        method: 'GET',
        route: `/api/tools/receipts${query ? `?${query}` : ''}`,
      }
    }
    case 'tool_receipt': {
      const kind = input?.receipts?.kind?.trim()
      const receiptId = input?.receipts?.receiptId?.trim()
      if (!kind || !receiptId) {
        throw new Error('tool_receipt requires receipts.kind and receipts.receiptId')
      }
      return {
        method: 'GET',
        route: `/api/tools/receipts/${encodeURIComponent(kind)}/${encodeURIComponent(receiptId)}`,
      }
    }
    case 'tool_fetch':
      return { method: 'POST', route: '/api/tools/fetch' }
    case 'tool_search':
      return { method: 'POST', route: '/api/tools/search' }
    case 'artifact_package':
      return { method: 'POST', route: '/api/artifacts/package' }
    case 'register_ollama':
      return { method: 'POST', route: '/api/intelligence/ollama/register' }
    case 'register_worker':
      return { method: 'POST', route: '/api/intelligence/workers/register' }
    case 'heartbeat_worker':
      if (!input?.worker?.workerId?.trim()) {
        throw new Error('heartbeat_worker requires worker.workerId')
      }
      return {
        method: 'POST',
        route: `/api/intelligence/workers/${encodeURIComponent(input.worker.workerId.trim())}/heartbeat`,
      }
    case 'unregister_worker':
      if (!input?.worker?.workerId?.trim()) {
        throw new Error('unregister_worker requires worker.workerId')
      }
      return {
        method: 'POST',
        route: `/api/intelligence/workers/${encodeURIComponent(input.worker.workerId.trim())}/unregister`,
      }
    case 'assign_worker':
      return { method: 'POST', route: '/api/intelligence/workers/assign' }
    case 'control':
      return { method: 'POST', route: '/api/control' }
    case 'run':
      return { method: 'POST', route: '/api/intelligence/run' }
  }
}

function summarizeImmaculateHarnessResponse(
  action: ImmaculateHarnessAction,
  body: unknown,
  status: number,
): string {
  if (status >= 400) {
    if (
      typeof body === 'object' &&
      body !== null &&
      'message' in body &&
      typeof body.message === 'string'
    ) {
      return body.message
    }
    return `HTTP ${status}`
  }

  const data =
    typeof body === 'object' && body !== null
      ? (body as Record<string, unknown>)
      : null

  switch (action) {
    case 'health':
      return `${String(data?.status ?? 'ok')} · ${String(data?.service ?? 'immaculate-harness')} · ${String(data?.clients ?? 0)} clients`
    case 'snapshot':
      return `cycle ${String(data?.snapshot && typeof data.snapshot === 'object' && data.snapshot !== null && 'cycle' in data.snapshot ? data.snapshot.cycle : '?')} · nodes ${String(data?.snapshot && typeof data.snapshot === 'object' && data.snapshot !== null && 'nodes' in data.snapshot && Array.isArray(data.snapshot.nodes) ? data.snapshot.nodes.length : '?')}`
    case 'topology':
      return `${String(data?.nodes ?? '?')} nodes · ${String(data?.edges ?? '?')} edges · cycle ${String(data?.cycle ?? '?')}`
    case 'governance_status':
      return `${String(data?.mode ?? 'enforced')} · ${String(data?.policyCount ?? '?')} policies · ${String(data?.decisionCount ?? '?')} decisions`
    case 'intelligence':
      return `${Array.isArray(data?.layers) ? data.layers.length : 0} layers · ${Array.isArray(data?.executions) ? data.executions.length : 0} executions`
    case 'executions':
      return `${Array.isArray(data?.executions) ? data.executions.length : 0} executions · ${Array.isArray(data?.layers) ? data.layers.length : 0} layers`
    case 'workers':
      return `${Array.isArray(data?.workers) ? data.workers.length : 0} workers · ${String(data?.recommendedLayerId ?? 'layer pending')}`
    case 'ollama_models':
      return `${Array.isArray(data?.models) ? data.models.length : 0} local models`
    case 'tool_capabilities': {
      const capabilities =
        data?.capabilities && typeof data.capabilities === 'object'
          ? (data.capabilities as Record<string, unknown>)
          : null
      const internet =
        capabilities?.internet && typeof capabilities.internet === 'object'
          ? (capabilities.internet as Record<string, unknown>)
          : null
      const search =
        internet?.search && typeof internet.search === 'object'
          ? (internet.search as Record<string, unknown>)
          : null
      return `tools ready · search ${String(search?.status ?? 'unknown')}`
    }
    case 'tool_receipts': {
      const receipts =
        data?.receipts && typeof data.receipts === 'object'
          ? (data.receipts as Record<string, unknown>)
          : null
      return `${String(receipts?.count ?? 0)} tool receipts`
    }
    case 'tool_receipt':
      return data?.record ? 'tool receipt loaded' : 'tool receipt response received'
    case 'tool_fetch': {
      const receipt =
        data?.receipt && typeof data.receipt === 'object'
          ? (data.receipt as Record<string, unknown>)
          : null
      return `fetch receipt ${String(receipt?.id ?? 'created')} · HTTP ${String(receipt?.status ?? '?')}`
    }
    case 'tool_search': {
      const receipt =
        data?.receipt && typeof data.receipt === 'object'
          ? (data.receipt as Record<string, unknown>)
          : null
      return `search receipt ${String(receipt?.id ?? 'created')} · ${String(receipt?.resultCount ?? 0)} results`
    }
    case 'artifact_package': {
      const receipt =
        data?.receipt && typeof data.receipt === 'object'
          ? (data.receipt as Record<string, unknown>)
          : null
      return `artifact ${String(receipt?.name ?? 'created')} · ${String(receipt?.format ?? 'unknown')} · ${String(receipt?.byteLength ?? '?')} bytes`
    }
    case 'register_ollama':
      return data?.accepted === true
        ? `accepted · ${String(data?.layer && typeof data.layer === 'object' && data.layer !== null && 'model' in data.layer ? data.layer.model : 'layer registered')}`
        : 'register request completed'
    case 'register_worker':
      return data?.accepted === true
        ? `accepted · ${String(data?.worker && typeof data.worker === 'object' && data.worker !== null && 'workerId' in data.worker ? data.worker.workerId : 'worker registered')}`
        : 'worker register request completed'
    case 'heartbeat_worker':
      return data?.accepted === true
        ? `accepted · ${String(data?.worker && typeof data.worker === 'object' && data.worker !== null && 'workerId' in data.worker ? data.worker.workerId : 'worker heartbeat')}`
        : 'worker heartbeat request completed'
    case 'unregister_worker':
      return data?.accepted === true
        ? `accepted · ${String(data?.worker && typeof data.worker === 'object' && data.worker !== null && 'workerId' in data.worker ? data.worker.workerId : 'worker removed')}`
        : 'worker unregister request completed'
    case 'assign_worker':
      return data?.accepted === true
        ? `accepted · ${String(data?.assignment && typeof data.assignment === 'object' && data.assignment !== null && 'workerId' in data.assignment ? data.assignment.workerId : 'no eligible worker')}`
        : 'worker assignment request completed'
    case 'control':
      return data?.accepted === true ? 'accepted' : 'control request completed'
    case 'run':
      return data?.accepted === true
        ? `accepted · ${String(data?.execution && typeof data.execution === 'object' && data.execution !== null && 'status' in data.execution ? data.execution.status : 'completed')}`
        : 'run request completed'
  }
}

function parseJsonRecord(json: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(json)
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

function parsePositiveNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : undefined
}

function parseWorkerHealthCounts(data: Record<string, unknown> | null): Pick<
  ImmaculateHarnessWorkerCatalog,
  | 'workerCount'
  | 'healthyWorkerCount'
  | 'staleWorkerCount'
  | 'faultedWorkerCount'
  | 'eligibleWorkerCount'
  | 'blockedWorkerCount'
> {
  return {
    workerCount: parsePositiveNumber(data?.workerCount),
    healthyWorkerCount: parsePositiveNumber(data?.healthyWorkerCount),
    staleWorkerCount: parsePositiveNumber(data?.staleWorkerCount),
    faultedWorkerCount: parsePositiveNumber(data?.faultedWorkerCount),
    eligibleWorkerCount: parsePositiveNumber(data?.eligibleWorkerCount),
    blockedWorkerCount: parsePositiveNumber(data?.blockedWorkerCount),
  }
}

function deriveWorkerHealthCounts(
  workers: ImmaculateHarnessWorkerRecord[],
): Pick<
  ImmaculateHarnessWorkerCatalog,
  | 'workerCount'
  | 'healthyWorkerCount'
  | 'staleWorkerCount'
  | 'faultedWorkerCount'
  | 'eligibleWorkerCount'
  | 'blockedWorkerCount'
> {
  const healthyWorkerCount = workers.filter(
    worker => worker.healthStatus === 'healthy',
  ).length
  const staleWorkerCount = workers.filter(
    worker => worker.healthStatus === 'stale',
  ).length
  const faultedWorkerCount = workers.filter(
    worker => worker.healthStatus === 'faulted',
  ).length
  const eligibleWorkerCount = workers.filter(
    worker => worker.assignmentEligible === true,
  ).length
  return {
    workerCount: workers.length,
    healthyWorkerCount,
    staleWorkerCount,
    faultedWorkerCount,
    eligibleWorkerCount,
    blockedWorkerCount: workers.length - eligibleWorkerCount,
  }
}

function resolveWorkerHealthCounts(
  data: Record<string, unknown> | null,
  workers: ImmaculateHarnessWorkerRecord[],
): Pick<
  ImmaculateHarnessWorkerCatalog,
  | 'workerCount'
  | 'healthyWorkerCount'
  | 'staleWorkerCount'
  | 'faultedWorkerCount'
  | 'eligibleWorkerCount'
  | 'blockedWorkerCount'
> {
  const parsed = parseWorkerHealthCounts(data)
  const derived = deriveWorkerHealthCounts(workers)
  return {
    workerCount: parsed.workerCount ?? derived.workerCount,
    healthyWorkerCount: parsed.healthyWorkerCount ?? derived.healthyWorkerCount,
    staleWorkerCount: parsed.staleWorkerCount ?? derived.staleWorkerCount,
    faultedWorkerCount: parsed.faultedWorkerCount ?? derived.faultedWorkerCount,
    eligibleWorkerCount: parsed.eligibleWorkerCount ?? derived.eligibleWorkerCount,
    blockedWorkerCount: parsed.blockedWorkerCount ?? derived.blockedWorkerCount,
  }
}

function parseWorkerRecord(
  value: unknown,
): ImmaculateHarnessWorkerRecord | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const record = value as Record<string, unknown>
  const executionProfile = record.executionProfile
  if (
    typeof record.workerId !== 'string' ||
    typeof record.registeredAt !== 'string' ||
    typeof record.heartbeatAt !== 'string' ||
    typeof record.leaseExpiresAt !== 'string' ||
    typeof record.leaseDurationMs !== 'number' ||
    typeof record.watch !== 'boolean' ||
    typeof record.allowHostRisk !== 'boolean' ||
    (executionProfile !== 'local' && executionProfile !== 'remote')
  ) {
    return null
  }
  return {
    workerId: record.workerId,
    workerLabel:
      typeof record.workerLabel === 'string' ? record.workerLabel : undefined,
    hostLabel: typeof record.hostLabel === 'string' ? record.hostLabel : undefined,
    executionProfile,
    executionEndpoint:
      typeof record.executionEndpoint === 'string'
        ? record.executionEndpoint
        : undefined,
    registeredAt: record.registeredAt,
    heartbeatAt: record.heartbeatAt,
    leaseExpiresAt: record.leaseExpiresAt,
    leaseDurationMs: record.leaseDurationMs,
    healthStatus:
      record.healthStatus === 'healthy' ||
      record.healthStatus === 'stale' ||
      record.healthStatus === 'faulted'
        ? record.healthStatus
        : undefined,
    healthSummary:
      typeof record.healthSummary === 'string' ? record.healthSummary : undefined,
    healthReason:
      typeof record.healthReason === 'string' ? record.healthReason : undefined,
    lastHealthAt:
      typeof record.lastHealthAt === 'string' ? record.lastHealthAt : undefined,
    leaseRemainingMs: parsePositiveNumber(record.leaseRemainingMs),
    assignmentEligible:
      typeof record.assignmentEligible === 'boolean'
        ? record.assignmentEligible
        : undefined,
    assignmentBlockedReason:
      typeof record.assignmentBlockedReason === 'string'
        ? record.assignmentBlockedReason
        : undefined,
    watch: record.watch,
    allowHostRisk: record.allowHostRisk,
    supportedBaseModels: Array.isArray(record.supportedBaseModels)
      ? record.supportedBaseModels.filter(
          value => typeof value === 'string',
        ) as string[]
      : [],
    preferredLayerIds: Array.isArray(record.preferredLayerIds)
      ? record.preferredLayerIds.filter(
          value => typeof value === 'string',
        ) as string[]
      : [],
  }
}

function parseWorkerAssignment(
  value: unknown,
): ImmaculateHarnessWorkerAssignment | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const record = value as Record<string, unknown>
  const executionProfile = record.executionProfile
  if (
    typeof record.workerId !== 'string' ||
    typeof record.assignedAt !== 'string' ||
    typeof record.reason !== 'string' ||
    (executionProfile !== 'local' && executionProfile !== 'remote')
  ) {
    return null
  }
  return {
    workerId: record.workerId,
    workerLabel:
      typeof record.workerLabel === 'string' ? record.workerLabel : undefined,
    hostLabel: typeof record.hostLabel === 'string' ? record.hostLabel : undefined,
    executionProfile,
    executionEndpoint:
      typeof record.executionEndpoint === 'string'
        ? record.executionEndpoint
        : undefined,
    assignedAt: record.assignedAt,
    reason: record.reason,
    score: typeof record.score === 'number' ? record.score : undefined,
    healthStatus:
      record.healthStatus === 'healthy' ||
      record.healthStatus === 'stale' ||
      record.healthStatus === 'faulted'
        ? record.healthStatus
        : undefined,
    healthSummary:
      typeof record.healthSummary === 'string' ? record.healthSummary : undefined,
  }
}

function isWorkerRecord(
  value: ImmaculateHarnessWorkerRecord | null,
): value is ImmaculateHarnessWorkerRecord {
  return value !== null
}

function resolveImmaculateHarnessErrorMessage(
  result: ImmaculateHarnessResult,
  data: Record<string, unknown> | null,
  fallback: string,
): string {
  return (
    (typeof data?.message === 'string' && data.message) ||
    (typeof data?.error === 'string' && data.error) ||
    result.summary ||
    fallback
  )
}

export async function callImmaculateHarness(
  input: ImmaculateHarnessInputLike & {
    control?: {
      action: ImmaculateControlAction
      target?: string
      value?: number
    }
    run?: {
      layerId?: string
      objective?: string
    }
    register?: {
      role?: ImmaculateOllamaRole
    }
    worker?: {
      workerId: string
      workerLabel?: string | null
      hostLabel?: string | null
      executionProfile?: ImmaculateHarnessWorkerExecutionProfile
      executionEndpoint?: string | null
      registeredAt?: string
      heartbeatAt?: string
      leaseDurationMs?: number
      watch?: boolean
      allowHostRisk?: boolean
      supportedBaseModels?: string[]
      preferredLayerIds?: string[]
    }
    assignWorker?: {
      requestedExecutionDecision?:
        | 'allow_local'
        | 'remote_required'
        | 'preflight_blocked'
      baseModel?: string | null
      preferredLayerIds?: string[]
      recommendedLayerId?: string | null
      target?: string | null
    }
    receipts?: {
      kind?: ImmaculateToolReceiptKind
      limit?: number
      receiptId?: string
    }
    toolFetch?: {
      url: string
      maxBytes?: number
    }
    toolSearch?: {
      query: string
      maxResults?: number
      freshness?: ImmaculateSearchFreshness
      domains?: string[]
    }
    artifact?: {
      name?: string
      format: ImmaculateArtifactFormat
      content: string
      sourceReceiptPath?: string
      metadata?: Record<string, unknown>
    }
  },
  options: {
    signal?: AbortSignal
    settings?: ImmaculateHarnessSettingsLike
    timeoutMs?: number
  } = {},
): Promise<ImmaculateHarnessResult> {
  const config = getImmaculateHarnessConfig(options.settings)
  const { method, route } = getImmaculateHarnessRoute(input.action, input)
  let data: unknown

  if (input.action === 'control') {
    if (!input.control) {
      throw new Error('control action requires control payload')
    }
    data = input.control
  } else if (input.action === 'run') {
    data = input.run ?? {}
  } else if (input.action === 'register_ollama') {
    data = input.register ?? {}
  } else if (
    input.action === 'register_worker' ||
    input.action === 'heartbeat_worker' ||
    input.action === 'unregister_worker'
  ) {
    data = input.worker ?? {}
  } else if (input.action === 'assign_worker') {
    data = input.assignWorker ?? {}
  } else if (input.action === 'tool_fetch') {
    if (!input.toolFetch?.url?.trim()) {
      throw new Error('tool_fetch requires toolFetch.url')
    }
    data = input.toolFetch
  } else if (input.action === 'tool_search') {
    if (!input.toolSearch?.query?.trim()) {
      throw new Error('tool_search requires toolSearch.query')
    }
    data = input.toolSearch
  } else if (input.action === 'artifact_package') {
    if (!input.artifact?.format || typeof input.artifact.content !== 'string') {
      throw new Error('artifact_package requires artifact.format and artifact.content')
    }
    data = input.artifact
  }

  try {
    const response = await axios.request({
      method,
      url: `${config.harnessUrl}${route}`,
      headers: buildImmaculateHarnessHeaders(input, config),
      data,
      timeout: options.timeoutMs ?? REQUEST_TIMEOUT_MS,
      signal: options.signal,
      validateStatus: () => true,
    })

    return {
      status: response.status,
      route,
      summary: summarizeImmaculateHarnessResponse(
        input.action,
        response.data,
        response.status,
      ),
      json: jsonStringify(response.data),
      governance: resolveImmaculateHarnessGovernance(input, config),
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Immaculate harness request failed'
    throw new Error(
      `Immaculate harness request failed for ${route} at ${config.harnessUrl}: ${message}`,
    )
  }
}

export async function getImmaculateHarnessStatus(
  settings: ImmaculateHarnessSettingsLike = getSettings_DEPRECATED(),
): Promise<ImmaculateHarnessStatus> {
  const config = getImmaculateHarnessConfig(settings)
  const loopback = isLoopbackHarnessUrl(config.harnessUrl)
  if (!config.enabled) {
    return {
      enabled: false,
      mode: config.mode,
      harnessUrl: config.harnessUrl,
      actor: config.actor,
      apiKeySource: config.apiKeySource,
      loopback,
      reachable: false,
    }
  }

  try {
    const response = await axios.get(`${config.harnessUrl}/api/health`, {
      headers: buildImmaculateHarnessHeaders({ action: 'health' }, config),
      timeout: HEALTH_TIMEOUT_MS,
      validateStatus: () => true,
    })
    const data =
      typeof response.data === 'object' && response.data !== null
        ? (response.data as Record<string, unknown>)
        : null
    return {
      enabled: true,
      mode: config.mode,
      harnessUrl: config.harnessUrl,
      actor: config.actor,
      apiKeySource: config.apiKeySource,
      loopback,
      reachable: response.status < 500,
      status: response.status,
      service:
        typeof data?.service === 'string' ? data.service : 'immaculate-harness',
      clients: typeof data?.clients === 'number' ? data.clients : undefined,
      error:
        response.status >= 400
          ? summarizeImmaculateHarnessResponse(
              'health',
              response.data,
              response.status,
            )
          : undefined,
    }
  } catch (error) {
    return {
      enabled: true,
      mode: config.mode,
      harnessUrl: config.harnessUrl,
      actor: config.actor,
      apiKeySource: config.apiKeySource,
      loopback,
      reachable: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function getImmaculateHarnessDeckReceipt(
  settings: ImmaculateHarnessSettingsLike = getSettings_DEPRECATED(),
): Promise<ImmaculateHarnessDeckReceipt | null> {
  const status = await getImmaculateHarnessStatus(settings)
  if (!status.enabled || !status.reachable) {
    return null
  }

  try {
    const [topologyResult, intelligenceResult] = await Promise.all([
      callImmaculateHarness(
        { action: 'topology' },
        { settings, timeoutMs: HEALTH_TIMEOUT_MS },
      ),
      callImmaculateHarness(
        { action: 'intelligence' },
        { settings, timeoutMs: HEALTH_TIMEOUT_MS },
      ),
    ])

    const topology = parseJsonRecord(topologyResult.json)
    const intelligence = parseJsonRecord(intelligenceResult.json)
    return {
      cycle:
        typeof topology?.cycle === 'number' ? topology.cycle : undefined,
      nodes:
        typeof topology?.nodes === 'number' ? topology.nodes : undefined,
      edges:
        typeof topology?.edges === 'number' ? topology.edges : undefined,
      profile:
        typeof topology?.profile === 'string' ? topology.profile : undefined,
      objective:
        typeof topology?.objective === 'string'
          ? topology.objective
          : undefined,
      layerCount: Array.isArray(intelligence?.layers)
        ? intelligence.layers.length
        : 0,
      executionCount: Array.isArray(intelligence?.executions)
        ? intelligence.executions.length
        : 0,
      recommendedLayerId:
        typeof intelligence?.recommendedLayerId === 'string'
          ? intelligence.recommendedLayerId
          : undefined,
    }
  } catch {
    return null
  }
}

export async function getImmaculateHarnessWorkers(
  settings: ImmaculateHarnessSettingsLike = getSettings_DEPRECATED(),
): Promise<ImmaculateHarnessWorkerCatalog | null> {
  const status = await getImmaculateHarnessStatus(settings)
  if (!status.enabled || !status.reachable) {
    return null
  }

  try {
    const result = await callImmaculateHarness(
      { action: 'workers' },
      { settings, timeoutMs: HEALTH_TIMEOUT_MS },
    )
    const data = parseJsonRecord(result.json)
    const workers = Array.isArray(data?.workers)
      ? data.workers.map(parseWorkerRecord).filter(isWorkerRecord)
      : []
    const counts = resolveWorkerHealthCounts(data, workers)
    return {
      workers,
      ...counts,
      recommendedLayerId:
        typeof data?.recommendedLayerId === 'string'
          ? data.recommendedLayerId
          : undefined,
    }
  } catch {
    return null
  }
}

export async function registerImmaculateHarnessWorker(args: {
  workerId: string
  workerLabel?: string | null
  hostLabel?: string | null
  executionProfile: ImmaculateHarnessWorkerExecutionProfile
  executionEndpoint?: string | null
  registeredAt?: string
  heartbeatAt?: string
  leaseDurationMs?: number
  watch?: boolean
  allowHostRisk?: boolean
  supportedBaseModels?: string[]
  preferredLayerIds?: string[]
}): Promise<ImmaculateHarnessWorkerRecord | null> {
  const result = await callImmaculateHarness({
    action: 'register_worker',
    worker: args,
  })
  const data = parseJsonRecord(result.json)
  if (result.status >= 400) {
    throw new Error(
      resolveImmaculateHarnessErrorMessage(
        result,
        data,
        'Unable to register Immaculate worker.',
      ),
    )
  }
  const worker = parseWorkerRecord(data?.worker)
  if (!worker) {
    throw new Error('Immaculate worker registration returned no worker record.')
  }
  return worker
}

export async function heartbeatImmaculateHarnessWorker(args: {
  workerId: string
  heartbeatAt?: string
  leaseDurationMs?: number
  workerLabel?: string | null
  hostLabel?: string | null
  executionProfile?: ImmaculateHarnessWorkerExecutionProfile
  executionEndpoint?: string | null
  watch?: boolean
  allowHostRisk?: boolean
  supportedBaseModels?: string[]
  preferredLayerIds?: string[]
}): Promise<ImmaculateHarnessWorkerRecord | null> {
  const result = await callImmaculateHarness({
    action: 'heartbeat_worker',
    worker: args,
  })
  const data = parseJsonRecord(result.json)
  if (result.status >= 400) {
    throw new Error(
      resolveImmaculateHarnessErrorMessage(
        result,
        data,
        'Unable to heartbeat Immaculate worker.',
      ),
    )
  }
  const worker = parseWorkerRecord(data?.worker)
  if (!worker) {
    throw new Error('Immaculate worker heartbeat returned no worker record.')
  }
  return worker
}

export async function unregisterImmaculateHarnessWorker(
  workerId: string,
): Promise<ImmaculateHarnessWorkerRecord | null> {
  const result = await callImmaculateHarness({
    action: 'unregister_worker',
    worker: { workerId },
  })
  const data = parseJsonRecord(result.json)
  if (result.status >= 400) {
    throw new Error(
      resolveImmaculateHarnessErrorMessage(
        result,
        data,
        'Unable to unregister Immaculate worker.',
      ),
    )
  }
  return parseWorkerRecord(data?.worker)
}

export async function assignImmaculateHarnessWorker(args: {
  requestedExecutionDecision?: 'allow_local' | 'remote_required' | 'preflight_blocked'
  baseModel?: string | null
  preferredLayerIds?: string[]
  recommendedLayerId?: string | null
  target?: string | null
}): Promise<{
  assignment: ImmaculateHarnessWorkerAssignment | null
  workers: ImmaculateHarnessWorkerRecord[]
  workerCount?: number
  healthyWorkerCount?: number
  staleWorkerCount?: number
  faultedWorkerCount?: number
  eligibleWorkerCount?: number
  blockedWorkerCount?: number
  recommendedLayerId?: string
} | null> {
  const result = await callImmaculateHarness({
    action: 'assign_worker',
    assignWorker: args,
  })
  const data = parseJsonRecord(result.json)
  if (result.status >= 400) {
    throw new Error(
      resolveImmaculateHarnessErrorMessage(
        result,
        data,
        'Unable to assign Immaculate worker.',
      ),
    )
  }
  const workers = Array.isArray(data?.workers)
    ? data.workers.map(parseWorkerRecord).filter(isWorkerRecord)
    : []
  return {
    assignment: parseWorkerAssignment(data?.assignment),
    workers,
    ...resolveWorkerHealthCounts(data, workers),
    recommendedLayerId:
      typeof data?.recommendedLayerId === 'string'
        ? data.recommendedLayerId
        : undefined,
  }
}

export function formatImmaculateHarnessInlineStatus(
  status: ImmaculateHarnessStatus,
  deckReceipt: ImmaculateHarnessDeckReceipt | null = null,
): string {
  if (!status.enabled) {
    return `immaculate off · mode ${status.mode}`
  }

  const parts = [
    status.reachable ? 'immaculate online' : 'immaculate offline',
    `mode ${status.mode}`,
  ]

  if (deckReceipt?.profile) {
    parts.push(deckReceipt.profile)
  }
  if (deckReceipt?.recommendedLayerId) {
    parts.push(`layer ${deckReceipt.recommendedLayerId}`)
  }

  return parts.join(' · ')
}

export function buildImmaculateCheckpointReceipt({
  status,
  stage,
  detail,
}: {
  status: ImmaculateHarnessStatus
  stage: string
  detail?: string
}): string {
  const parts = [
    `Immaculate checkpoint: ${stage}`,
    formatImmaculateHarnessInlineStatus(status),
  ]
  if (detail?.trim()) {
    parts.push(detail.trim())
  }
  if (!status.reachable && status.error) {
    parts.push(normalizeInlineText(status.error))
  }
  return parts.join(' · ')
}

export function normalizeImmaculateObjective(
  value?: string | null,
  maxLength: number = DEFAULT_OBJECTIVE_LENGTH,
): string | null {
  const normalized = normalizeInlineText(value ?? '')
  if (!normalized) {
    return null
  }
  if (normalized.length <= maxLength) {
    return normalized
  }
  return `${normalized.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`
}

export function buildImmaculateAgentObjective({
  agentType,
  model,
  task,
}: {
  agentType: string
  model?: string | null
  task?: string | null
}): string {
  const parts = [`${normalizeInlineText(agentType || 'agent')} agent`]
  if (model?.trim()) {
    parts.push(`model ${normalizeInlineText(model)}`)
  }
  const normalizedTask = normalizeImmaculateObjective(task, 140)
  if (normalizedTask) {
    parts.push(normalizedTask)
  }
  return parts.join(' · ')
}

export function buildImmaculateToolDecisionDetail({
  toolName,
  outcome,
  reason,
}: {
  toolName: string
  outcome: 'denied' | 'retry'
  reason?: string | null
}): string {
  const parts = [
    `tool ${normalizeInlineText(toolName)}`,
    outcome === 'retry' ? 'retry eligible' : 'denied',
  ]
  const normalizedReason = normalizeImmaculateObjective(reason, 100)
  if (normalizedReason) {
    parts.push(normalizedReason)
  }
  return parts.join(' · ')
}

export function buildImmaculateCrewObjective({
  teamName,
  teammateName,
  crewSize,
  model,
  prompt,
  backendType,
}: {
  teamName: string
  teammateName: string
  crewSize: number
  model?: string | null
  prompt?: string | null
  backendType?: string | null
}): string {
  const parts = [
    `crew ${normalizeInlineText(teamName)}`,
    `member ${normalizeInlineText(teammateName)}`,
    `${crewSize} active`,
  ]
  if (backendType?.trim()) {
    parts.push(normalizeInlineText(backendType))
  }
  if (model?.trim()) {
    parts.push(`model ${normalizeInlineText(model)}`)
  }
  const normalizedPrompt = normalizeImmaculateObjective(prompt, 120)
  if (normalizedPrompt) {
    parts.push(normalizedPrompt)
  }
  return parts.join(' · ')
}

export function resolveImmaculateCrewPressureVerdict({
  crewSize,
  deckReceipt,
}: {
  crewSize: number
  deckReceipt: ImmaculateHarnessDeckReceipt | null
}): ImmaculateCrewPressureVerdict {
  const layerCount = deckReceipt?.layerCount ?? 0
  const executionCount = deckReceipt?.executionCount ?? 0
  const recommendedLayerId = deckReceipt?.recommendedLayerId
  const highPressure =
    executionCount >= Math.max(3, layerCount * 2) ||
    (layerCount > 0 && crewSize > layerCount + 1)
  const warmPressure =
    executionCount >= Math.max(1, layerCount) ||
    (layerCount > 0 && crewSize > layerCount)

  if (highPressure) {
    return {
      action: 'reroute',
      label: 'reroute',
      detail: recommendedLayerId
        ? `pressure high · recommend ${recommendedLayerId}`
        : 'pressure high',
    }
  }

  if (warmPressure) {
    return {
      action: 'pulse',
      label: 'hold',
      detail: recommendedLayerId
        ? `pressure warm · recommend ${recommendedLayerId}`
        : 'pressure warm',
      value: 1,
    }
  }

  return {
    action: 'boost',
    label: 'expand',
    detail: recommendedLayerId
      ? `pressure nominal · recommend ${recommendedLayerId}`
      : 'pressure nominal',
    value: Math.max(1, crewSize),
  }
}

export function resolveImmaculateCrewLaunchWindow({
  crewSize,
  deckReceipt,
}: {
  crewSize: number
  deckReceipt: ImmaculateHarnessDeckReceipt | null
}): ImmaculatePressureWindow {
  const verdict = resolveImmaculateCrewPressureVerdict({
    crewSize,
    deckReceipt,
  })

  if (verdict.label === 'reroute') {
    const delayMs = resolveImmaculatePressureDelayMs(verdict.label)
    return {
      label: 'reroute',
      delayMs,
      detail: `launch window ${delayMs}ms · ${verdict.detail}`,
    }
  }

  if (verdict.label === 'hold') {
    const delayMs = resolveImmaculatePressureDelayMs(verdict.label)
    return {
      label: 'hold',
      delayMs,
      detail: `launch window ${delayMs}ms · ${verdict.detail}`,
    }
  }

  return {
    label: 'clear',
    delayMs: 0,
    detail: verdict.detail,
  }
}

export function resolveImmaculateRetryWindow({
  deckReceipt,
}: {
  deckReceipt: ImmaculateHarnessDeckReceipt | null
}): ImmaculatePressureWindow {
  const layerCount = deckReceipt?.layerCount ?? 0
  const executionCount = deckReceipt?.executionCount ?? 0
  const recommendedLayerId = deckReceipt?.recommendedLayerId

  if (executionCount >= Math.max(3, layerCount * 2)) {
    const delayMs = resolveImmaculatePressureDelayMs('reroute')
    return {
      label: 'reroute',
      delayMs,
      detail: recommendedLayerId
        ? `retry window ${delayMs}ms · recommend ${recommendedLayerId}`
        : `retry window ${delayMs}ms`,
    }
  }

  if (executionCount >= Math.max(1, layerCount)) {
    const delayMs = resolveImmaculatePressureDelayMs('hold')
    return {
      label: 'hold',
      delayMs,
      detail: recommendedLayerId
        ? `retry window ${delayMs}ms · recommend ${recommendedLayerId}`
        : `retry window ${delayMs}ms`,
    }
  }

  return {
    label: 'clear',
    delayMs: 0,
    detail: recommendedLayerId
      ? `retry window clear · recommend ${recommendedLayerId}`
      : 'retry window clear',
  }
}

export function createImmaculateCrewWaveState({
  teamName,
  crewSize,
  deckReceipt,
  now = Date.now(),
}: {
  teamName: string
  crewSize: number
  deckReceipt: ImmaculateHarnessDeckReceipt | null
  now?: number
}): ImmaculateCrewWaveState {
  const window = resolveImmaculateCrewLaunchWindow({
    crewSize,
    deckReceipt,
  })
  return {
    teamName,
    crewSize,
    label: window.label,
    detail: window.detail,
    delayMs: window.delayMs,
    updatedAt: now,
    ...(window.delayMs > 0 && { holdUntil: now + window.delayMs }),
    ...(deckReceipt?.executionCount !== undefined && {
      executionCount: deckReceipt.executionCount,
    }),
    ...(deckReceipt?.recommendedLayerId && {
      recommendedLayerId: deckReceipt.recommendedLayerId,
    }),
  }
}

export function isImmaculateCrewWaveActive(
  wave: ImmaculateCrewWaveState | null | undefined,
  {
    teamName,
    now = Date.now(),
  }: {
    teamName?: string | null
    now?: number
  } = {},
): boolean {
  if (!wave) {
    return false
  }
  if (teamName?.trim() && wave.teamName !== teamName.trim()) {
    return false
  }
  if (wave.label === 'clear') {
    return false
  }
  if (wave.holdUntil && wave.holdUntil > now) {
    return true
  }
  return now - wave.updatedAt <= IMMACULATE_CREW_POLICY.retentionMs
}

export function summarizeImmaculateCrewWave(
  wave: ImmaculateCrewWaveState | null | undefined,
  {
    teamName,
    now = Date.now(),
  }: {
    teamName?: string | null
    now?: number
  } = {},
): {
  text: string
  tone: 'suggestion' | 'warning' | 'error'
} | null {
  if (!isImmaculateCrewWaveActive(wave, { teamName, now })) {
    return null
  }
  return {
    text: `wave ${wave.label} · ${wave.detail}`,
    tone:
      wave.label === 'reroute'
        ? 'error'
        : wave.label === 'hold'
          ? 'warning'
          : 'suggestion',
  }
}

export function createImmaculateCrewBurstBudget({
  teamName,
  crewSize,
  deckReceipt,
  now = Date.now(),
}: {
  teamName: string
  crewSize: number
  deckReceipt: ImmaculateHarnessDeckReceipt | null
  now?: number
}): ImmaculateCrewBurstBudget | null {
  const window = resolveImmaculateCrewLaunchWindow({
    crewSize,
    deckReceipt,
  })
  const recommendedLayerId = deckReceipt?.recommendedLayerId

  if (window.label === 'clear') {
    return null
  }

  const maxSpawns = window.label === 'hold' ? 1 : 0
  return {
    teamName,
    label: window.label,
    maxSpawns,
    remainingSpawns: Math.max(0, maxSpawns - 1),
    detail:
      window.label === 'hold'
        ? recommendedLayerId
          ? `burst cap 1 · recommend ${recommendedLayerId}`
          : 'burst cap 1'
        : recommendedLayerId
          ? `burst cap 0 · recommend ${recommendedLayerId}`
          : 'burst cap 0',
    updatedAt: now,
    ...(window.delayMs > 0 && { holdUntil: now + window.delayMs }),
    ...(recommendedLayerId && { recommendedLayerId }),
  }
}

export function isImmaculateCrewBurstBudgetActive(
  budget: ImmaculateCrewBurstBudget | null | undefined,
  {
    teamName,
    now = Date.now(),
  }: {
    teamName?: string | null
    now?: number
  } = {},
): boolean {
  if (!budget) {
    return false
  }
  if (teamName?.trim() && budget.teamName !== teamName.trim()) {
    return false
  }
  if (budget.holdUntil && budget.holdUntil > now) {
    return true
  }
  return now - budget.updatedAt <= IMMACULATE_CREW_POLICY.retentionMs
}

export function shouldDeferImmaculateCrewSpawn(
  budget: ImmaculateCrewBurstBudget | null | undefined,
  {
    teamName,
    now = Date.now(),
  }: {
    teamName: string
    now?: number
  },
): boolean {
  if (!isImmaculateCrewBurstBudgetActive(budget, { teamName, now })) {
    return false
  }
  return (budget?.remainingSpawns ?? 0) <= 0
}

export function summarizeImmaculateCrewBurstBudget(
  budget: ImmaculateCrewBurstBudget | null | undefined,
  {
    teamName,
    now = Date.now(),
  }: {
    teamName?: string | null
    now?: number
  } = {},
): {
  text: string
  tone: 'warning' | 'error'
} | null {
  if (!isImmaculateCrewBurstBudgetActive(budget, { teamName, now })) {
    return null
  }
  return {
    text: `burst ${budget.label} · ${budget.detail}`,
    tone: budget.label === 'reroute' ? 'error' : 'warning',
  }
}

export function buildImmaculateActuationReceipt({
  stage,
  result,
  detail,
}: {
  stage: string
  result: ImmaculateHarnessResult
  detail?: string
}): string {
  const parts = [
    `Immaculate actuation: ${normalizeInlineText(stage)}`,
    normalizeInlineText(result.summary),
  ]
  if (detail?.trim()) {
    parts.push(normalizeInlineText(detail))
  }
  if (result.governance) {
    parts.push(result.governance.action, result.governance.consentScope)
  }
  return parts.join(' · ')
}

export async function actuateImmaculateCrewHandoff(
  {
    teamName,
    teammateName,
    crewSize,
    model,
    prompt,
    backendType,
    deckReceipt,
  }: {
    teamName: string
    teammateName: string
    crewSize: number
    model?: string | null
    prompt?: string | null
    backendType?: string | null
    deckReceipt?: ImmaculateHarnessDeckReceipt | null
  },
  options: {
    signal?: AbortSignal
    settings?: ImmaculateHarnessSettingsLike
    timeoutMs?: number
  } = {},
): Promise<ImmaculateHarnessResult | null> {
  const config = getImmaculateHarnessConfig(options.settings)
  if (!config.enabled) {
    return null
  }
  const target = buildImmaculateCrewObjective({
    teamName,
    teammateName,
    crewSize,
    model,
    prompt,
    backendType,
  })
  const verdict = resolveImmaculateCrewPressureVerdict({
    crewSize,
    deckReceipt: deckReceipt ?? null,
  })
  return callImmaculateHarness(
    {
      action: 'control',
      purpose: [
        'orchestration-control',
        'crew-handoff',
        'multi-agent',
        verdict.label === 'reroute'
          ? 'crew-reroute'
          : verdict.label === 'hold'
            ? 'crew-hold'
            : 'crew-expand',
      ],
      control: {
        action: verdict.action,
        target,
        ...(verdict.value !== undefined && { value: verdict.value }),
      },
    },
    {
      ...options,
      timeoutMs: options.timeoutMs ?? DEFAULT_ACTUATION_TIMEOUT_MS,
    },
  )
}

export async function actuateImmaculateAgentHandoff(
  {
    agentType,
    model,
    task,
  }: {
    agentType: string
    model?: string | null
    task?: string | null
  },
  options: {
    signal?: AbortSignal
    settings?: ImmaculateHarnessSettingsLike
    timeoutMs?: number
  } = {},
): Promise<ImmaculateHarnessResult | null> {
  const config = getImmaculateHarnessConfig(options.settings)
  if (!config.enabled) {
    return null
  }
  const target = buildImmaculateAgentObjective({
    agentType,
    model,
    task,
  })
  return callImmaculateHarness(
    {
      action: 'control',
      purpose: ['orchestration-control', 'agent-handoff'],
      control: {
        action: 'pulse',
        target,
      },
    },
    {
      ...options,
      timeoutMs: options.timeoutMs ?? DEFAULT_ACTUATION_TIMEOUT_MS,
    },
  )
}

export async function actuateImmaculateToolDecision(
  {
    toolName,
    retrySuggested,
  }: {
    toolName: string
    retrySuggested?: boolean
  },
  options: {
    signal?: AbortSignal
    settings?: ImmaculateHarnessSettingsLike
    timeoutMs?: number
  } = {},
): Promise<ImmaculateHarnessResult | null> {
  const config = getImmaculateHarnessConfig(options.settings)
  if (!config.enabled) {
    return null
  }
  return callImmaculateHarness(
    {
      action: 'control',
      purpose: [
        'orchestration-control',
        retrySuggested ? 'tool-retry-window' : 'tool-reroute',
      ],
      control: {
        action: retrySuggested ? 'pulse' : 'reroute',
        target: normalizeInlineText(toolName),
      },
    },
    {
      ...options,
      timeoutMs: options.timeoutMs ?? DEFAULT_ACTUATION_TIMEOUT_MS,
    },
  )
}

export function buildImmaculateHarnessSystemContext(
  status: ImmaculateHarnessStatus,
  deckReceipt: ImmaculateHarnessDeckReceipt | null = null,
): string | null {
  if (!status.enabled) {
    return null
  }

  const lines = [
    'Immaculate is the default orchestration substrate for this session.',
    `Harness: ${status.reachable ? 'online' : 'offline'} · mode ${status.mode} · actor ${status.actor} · ${status.harnessUrl}`,
  ]

  if (status.service || status.clients !== undefined) {
    lines.push(
      `Service: ${status.service ?? 'immaculate-harness'}${status.clients !== undefined ? ` · ${status.clients} clients` : ''}`,
    )
  }

  if (deckReceipt) {
    lines.push(
      `Deck: ${deckReceipt.profile ?? 'live'} · cycle ${deckReceipt.cycle ?? '?'} · ${deckReceipt.nodes ?? '?'} nodes · ${deckReceipt.edges ?? '?'} edges`,
    )
    lines.push(
      `Intelligence: ${deckReceipt.layerCount} layers · ${deckReceipt.executionCount} executions${deckReceipt.recommendedLayerId ? ` · recommended ${deckReceipt.recommendedLayerId}` : ''}`,
    )
    if (deckReceipt.objective) {
      lines.push(`Objective: ${deckReceipt.objective}`)
    }
  }

  if (status.error) {
    lines.push(`Issue: ${normalizeInlineText(status.error)}`)
  }

  lines.push(
    'Default scope: provider/model routing, openckeek agent delegation, tool calls, command execution, web search and scrubbing, code build/compile, and training or fine-tuning workflows.',
  )
  lines.push(
    'When orchestration state matters, prefer ImmaculateHarness health/topology/intelligence/executions/run/control over reconstructing that state indirectly.',
  )

  return lines.join('\n')
}
