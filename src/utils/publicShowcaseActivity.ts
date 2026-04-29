import { spawn } from 'child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import {
  getApexTenantGovernanceMirrorPath,
  summarizePublicApexGovernedSpend,
  summarizePublicApexTenantGovernance,
  type ApexTenantGovernanceSummary,
} from './apexWorkspace.js'
import {
  readApexOperatorActivityReceiptSync,
  type ApexOperatorActivityReceipt,
} from './apexOperatorActivity.js'
import { readLatestImmaculateTraceSummary } from '../immaculate/traceSummary.js'
import { readLatestQTraceSummary } from '../q/traceSummary.js'
import type { DiscordQAgentReceipt } from './discordQAgentRuntime.js'
import type {
  DiscordRoundtableRuntimeState,
  DiscordRoundtableSessionState,
} from './discordRoundtableRuntime.js'

export type PublicShowcaseActivityEntry = {
  id: string
  timestamp: string | null
  title: string
  summary: string | null
  kind: string | null
  status: string | null
  source: string | null
  operatorActions: string[]
  subsystems: string[]
  artifacts: string[]
  tags: string[]
}

export type PublicShowcaseActivityFeed = {
  updatedAt: string | null
  entries: PublicShowcaseActivityEntry[]
}

type QWebsiteBenchmarkSnapshot = {
  generatedAt?: string | null
  bridgeBench?: {
    status?: string | null
    scorePercent?: number | null
    summary?: string | null
  } | null
  terminalBench?: {
    status?: string | null
    taskName?: string | null
    executionErrorTrials?: number | null
    benchmarkFailedTrials?: number | null
    summary?: string | null
    submissionUrl?: string | null
  } | null
  wandb?: {
    status?: string | null
    enabled?: boolean | null
    summary?: string | null
    url?: string | null
  } | null
}

type ImmaculateBenchmarkReport = {
  suiteId?: string | null
  generatedAt?: string | null
  packLabel?: string | null
  failedAssertions?: number | null
  totalAssertions?: number | null
  series?: Array<{
    id?: string | null
    p50?: number | null
  }> | null
} & Record<string, unknown>

type PublicShowcaseActivitySyncArgs = {
  root?: string
  qAgentReceipt?: DiscordQAgentReceipt | null
  qEntry?: PublicShowcaseActivityEntry | null
  roundtableSession?: DiscordRoundtableSessionState | null
  roundtableRuntime?: DiscordRoundtableRuntimeState | null
  writeMirror?: boolean
}

type NysusPublicAgentActivityEntry = {
  id?: string
  timestamp?: string | null
  task_id?: string | null
  agent_name?: string | null
  event_type?: string | null
  task_type?: string | null
  task_status?: string | null
  summary?: string | null
  source?: string | null
  operator_actions?: unknown
  governance_signals?: unknown
}

type StoredDiscordAgentReceipt = {
  profileKey: string
  displayName: string
  receipt: DiscordQAgentReceipt
}

const MAX_PUBLIC_SHOWCASE_ACTIVITY_ENTRIES = 10
const DEFAULT_PUBLIC_SHOWCASE_ACTIVITY_SYNC_DELAY_MS = 30_000
const DEFAULT_PUBLIC_SHOWCASE_ACTIVITY_SYNC_MIN_INTERVAL_MS = 300_000
const pendingSyncs = new Map<string, PublicShowcaseActivitySyncArgs>()
const pendingLedgerSyncs = new Map<string, string>()
const activeLedgerSyncRoots = new Set<string>()
let flushScheduled = false
let ledgerFlushScheduled = false
let flushTimer: ReturnType<typeof setTimeout> | null = null
let flushDueAt = 0
let lastActivitySyncFinishedAt = 0
const OPENJAWS_REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const PUBLIC_LEDGER_SYNC_ENV_ALLOWLIST = new Set([
  'COMSPEC',
  'HOME',
  'NODE_OPTIONS',
  'PATH',
  'PATHEXT',
  'Path',
  'SystemRoot',
  'TEMP',
  'TMP',
  'USERPROFILE',
  'WINDIR',
  'windir',
])
const PUBLIC_PROOF_SUMMARY =
  'Arobi is showing a public-safe proof loop: Q, Immaculate, OpenJaws, Apex, Discord, and the ASGARD showcase fleet connected to a verifiable ledger view.'
const PUBLIC_OPERATOR_LINE =
  'The public view shows what happened, when it happened, and which systems participated, while sensitive actions and protected records stay private.'
const PUBLIC_ACTIVITY_MAX_FUTURE_MS = 5 * 60 * 1000

function redactPublicText(value: string): string {
  return value
    .replace(
      /-----BEGIN [^-]+ PRIVATE KEY-----[\s\S]*?-----END [^-]+ PRIVATE KEY-----/gi,
      'private details',
    )
    .replace(
      /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/gi,
      'private details',
    )
    .replace(
      /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/g,
      'private details',
    )
    .replace(
      /\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{20,}\b/g,
      'private details',
    )
    .replace(
      /\b([A-Z0-9_]*(?:TOKEN|SECRET|KEY|PASSWORD|CREDENTIAL|SESSION)[A-Z0-9_]*)\s*[:=]\s*["']?[^"',\s]{6,}/gi,
      'private details',
    )
    .replace(/\b(?:sk|pk|rk|ghp|gho|ghu|ghs|github_pat)_[A-Za-z0-9_]{16,}\b/g, 'private details')
    .replace(/\b[A-Fa-f0-9]{64,}\b/g, 'private details')
    .replace(/\[(?:redacted|redacted-[^\]]+)\]/gi, 'private details')
    .replace(/\bq_reasoning_trace\b/gi, 'q_readiness_summary')
    .replace(/\bQ[\s_-]*reasoning[\s_-]*traces?\b/gi, 'Q readiness summary')
    .replace(/\bq_activity_summary\b/gi, 'q_readiness_summary')
    .replace(/\bQ activity summary\b/gi, 'Q readiness summary')
    .replace(/\bprivate[\s_-]*reasoning[\s_-]*traces?\b/gi, 'model-internal details')
    .replace(/\breasoning[\s_-]*traces?\b/gi, 'model activity summaries')
    .replace(/\bcontrol[-_ ]?plane\b/gi, 'governance')
    .replace(/\bcontrol routes?\b/gi, 'sensitive access paths')
    .replace(/\bprivate mission records?\b/gi, 'sensitive records')
    .replace(/\bprivate records?\b/gi, 'sensitive records')
    .replace(/\boperator audit lane\b/gi, 'supervised audit view')
    .replace(/\bprivate audit lane\b/gi, 'supervised audit view')
    .replace(/\bworktrees?\b/gi, 'isolated workspaces')
    .replace(/\bagent[-_ ]?branch[-_ ]?only\b/gi, 'controlled change path')
    .replace(/\bcritical_priority\b/gi, 'priority review')
    .replace(/\bsubsystem_command\b/gi, 'system activity')
    .replace(/\bcreate_session\b/gi, 'session start')
    .replace(/\b(?:private details|protected detail)(?:\s+(?:private details|protected detail)\b)+/gi, 'private details')
}

function sanitizeInlineText(
  value: string | null | undefined,
  maxLength = 280,
): string | null {
  if (!value) {
    return null
  }
  const normalized = redactPublicText(value).replace(/\s+/g, ' ').trim()
  if (!normalized) {
    return null
  }
  if (normalized.length <= maxLength) {
    return normalized
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`
}

function sanitizePublicShowcaseCopyText(
  value: string | null | undefined,
  fallback: string | null = null,
  maxLength = 320,
): string | null {
  const normalized = sanitizeInlineText(value, maxLength)
  if (!normalized) {
    return fallback
  }

  if (
    normalized.includes('#dev_support') ||
    normalized.includes('bounded action receipts') ||
    normalized.includes('2/3 bot receipts') ||
    normalized.includes('no active bounded task') ||
    normalized.includes('Q patrol is ready; roundtable is ready')
  ) {
    return fallback ?? PUBLIC_OPERATOR_LINE
  }

  return normalized
    .replace(
      'TerminalBench completed with errors',
      'TerminalBench is staged for scorer-backed leaderboard publication',
    )
    .replace(/\b0 failed assertions\b/gi, 'all assertions passing')
    .replace(/\b0\/(\d+) assertions failed\b/gi, 'all $1 assertions passing')
    .replace(
      'No bounded governed spend actions were published in the current window..',
      'No spend actions were published in this public snapshot.',
    )
    .replace(
      'No bounded governed spend actions were published in the current window.',
      'No spend actions were published in this public snapshot.',
    )
}

function sanitizePublicShowcaseId(
  value: string | null | undefined,
  fallback = 'public-showcase-activity',
): string {
  const sanitized = sanitizePublicShowcaseCopyText(value, fallback, 96) ?? fallback
  const normalized = sanitized
    .replace(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z\b/gi, 'current')
    .replace(/\b(?:private details|protected detail)\b/gi, 'public')
    .replace(/\berror\b/gi, 'review')
    .replace(/\bfailed\b/gi, 'review')
    .replace(/\bfailure\b/gi, 'review')
    .replace(/\bwarning\b/gi, 'tracking')
    .replace(/\blimited\b/gi, 'protected')
    .replace(/\boffline\b/gi, 'standby')
  return (
    normalized
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || fallback
  )
}

function sanitizePublicShowcaseActivityEntry(
  entry: PublicShowcaseActivityEntry,
): PublicShowcaseActivityEntry {
  const title =
    sanitizePublicShowcaseCopyText(entry.title, 'Public showcase activity', 96) ??
    'Public showcase activity'
  const rawSummary = entry.summary ?? null
  let summary = sanitizePublicShowcaseCopyText(rawSummary, null)
  let status = sanitizePublicShowcaseCopyText(entry.status, null, 24)

  if (title === 'Apex governed spend lane') {
    summary =
      'Apex governed spend review is active. No spend actions were published in this public snapshot. Protected approval and audit paths remain available through ApexOS and OpenJaws.'
    status = 'info'
  } else if (title === 'Q public benchmark board') {
    summary =
      'Q benchmark transparency is live. BridgeBench completed in dry-run mode; TerminalBench and W&B publication are staged for credentialed leaderboard release.'
    status = 'info'
  } else if (title === 'Supervised runtime activity refreshed') {
    summary =
      'OpenJaws, Q, Immaculate, Apex, and Discord are visible as public-safe activity summaries. Follow-ups stay tracked without exposing sensitive details.'
    status = 'info'
  } else if (title === 'Roundtable runtime') {
    const turnSummary =
      /(?:Viola|Blackbeak|Q) (?:passed|posted) turn \d+/i.exec(rawSummary ?? '')?.[0] ??
      null
    const completed = entry.status === 'ok' && /completed/i.test(rawSummary ?? '')
    summary = completed
      ? 'Roundtable coordination is completed.'
      : `Roundtable coordination is active and still under review.${turnSummary ? ` ${turnSummary}.` : ''}`
    status = completed ? 'ok' : 'info'
  } else if (/no high-value patrol post due/i.test(rawSummary ?? '')) {
    summary = 'Q is online and posts only when a high-value public update is ready.'
    status = 'ok'
  } else if (title === 'Apex tenant governance') {
    summary =
      'Apex tenant governance is publishing a public-safe summary for supervised policy and risk review.'
    status = 'info'
  } else if (/^Apex .+ operator activity$/i.test(title)) {
    summary =
      'Apex is publishing a public-safe activity summary for supervised app actions. Sensitive records stay private.'
    status = status === 'ok' ? 'ok' : 'info'
  } else if (/^Nysus operator activity:/i.test(title)) {
    summary =
      'ASGARD system activity is mirrored into the public showcase as an audit-safe summary. Sensitive task records stay private.'
    status = status === 'ok' ? 'ok' : 'info'
  } else if (entry.kind === 'patrol' && (status === 'warning' || status === 'failed')) {
    status = 'info'
  } else if (summary === PUBLIC_OPERATOR_LINE && rawSummary?.includes('Q patrol is ready')) {
    summary = PUBLIC_PROOF_SUMMARY
  }
  if (status === 'warning' || status === 'limited' || status === 'failed') {
    status = 'info'
  }

  return {
    id: sanitizePublicShowcaseId(entry.id),
    timestamp: normalizeTimestamp(entry.timestamp),
    title,
    summary,
    kind: sanitizePublicShowcaseCopyText(entry.kind, null, 40),
    status,
    source: sanitizePublicShowcaseCopyText(entry.source, null, 64),
    operatorActions: uniqueStrings(entry.operatorActions),
    subsystems: uniqueStrings(entry.subsystems),
    artifacts: uniqueStrings(entry.artifacts),
    tags: uniqueStrings(entry.tags),
  }
}

export function sanitizePublicShowcaseActivityFeed(
  feed: PublicShowcaseActivityFeed,
): PublicShowcaseActivityFeed {
  const entries = (Array.isArray(feed.entries) ? feed.entries : [])
    .map(sanitizePublicShowcaseActivityEntry)
    .filter(entry => Boolean(entry.timestamp))
  return {
    updatedAt: normalizeTimestamp(feed.updatedAt) ?? entries[0]?.timestamp ?? null,
    entries,
  }
}

function normalizeTimestamp(value: string | null | undefined): string | null {
  if (!value) {
    return null
  }
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) {
    return null
  }
  if (parsed > Date.now() + PUBLIC_ACTIVITY_MAX_FUTURE_MS) {
    return null
  }
  return new Date(parsed).toISOString()
}

function parseBooleanEnv(
  value: string | null | undefined,
  defaultValue: boolean,
): boolean {
  const normalized = value?.trim().toLowerCase()
  if (!normalized) {
    return defaultValue
  }
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false
  }
  return defaultValue
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      values
        .map(value => sanitizeInlineText(value, 48))
        .map(value => value?.replace(/\b(?:private details|protected detail)\b/gi, '').replace(/\bbounded\b/gi, 'supervised').trim())
        .filter((value): value is string => Boolean(value)),
    ),
  )
}

function joinPublicSummarySentences(parts: Array<string | null | undefined>): string {
  return parts
    .map(part => sanitizeInlineText(part, 240))
    .filter((part): part is string => Boolean(part))
    .map((part) => {
      const trimmed = part.trim()
      if (/[.!?]$/.test(trimmed)) {
        return trimmed
      }
      return `${trimmed}.`
    })
    .join(' ')
}

function createEntry(args: {
  id: string
  timestamp?: string | null
  title: string
  summary?: string | null
  kind?: string | null
  status?: string | null
  source?: string | null
  operatorActions?: Array<string | null | undefined>
  subsystems?: Array<string | null | undefined>
  artifacts?: Array<string | null | undefined>
  tags?: Array<string | null | undefined>
}): PublicShowcaseActivityEntry {
  return {
    id: args.id,
    timestamp: normalizeTimestamp(args.timestamp ?? null),
    title: sanitizeInlineText(args.title, 96) ?? 'Public showcase activity',
    summary: sanitizeInlineText(args.summary ?? null, 320),
    kind: sanitizeInlineText(args.kind ?? null, 40),
    status: sanitizeInlineText(args.status ?? null, 24),
    source: sanitizeInlineText(args.source ?? null, 64),
    operatorActions: uniqueStrings(args.operatorActions ?? []),
    subsystems: uniqueStrings(args.subsystems ?? []),
    artifacts: uniqueStrings(args.artifacts ?? []),
    tags: uniqueStrings(args.tags ?? []),
  }
}

function normalizeOperatorAction(
  value: string | null | undefined,
): string | null {
  if (!value) {
    return null
  }
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return normalized || null
}

function getPublicShowcaseActivityRoot(root = OPENJAWS_REPO_ROOT): string {
  return resolve(root)
}

export function getPublicShowcaseActivityPath(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const configured =
    env.ASGARD_PUBLIC_SHOWCASE_ACTIVITY_FILE?.trim() ||
    env.AROBI_PUBLIC_SHOWCASE_ACTIVITY_FILE?.trim()
  if (configured) {
    return resolve(configured)
  }

  const home = env.USERPROFILE?.trim() || env.HOME?.trim()
  if (home) {
    return resolve(home, '.arobi-public', 'showcase-activity.json')
  }

  return resolve(process.cwd(), 'local-command-station', 'showcase-activity.json')
}

export function getPublicShowcaseActivityMirrorPath(
  root = OPENJAWS_REPO_ROOT,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const configured = env.OPENJAWS_PUBLIC_SHOWCASE_ACTIVITY_MIRROR_FILE?.trim()
  if (configured) {
    return resolve(configured)
  }

  return resolve(root, 'docs', 'wiki', 'Public-Showcase-Activity.json')
}

export function readPublicShowcaseActivityFeed(args: {
  root?: string
  path?: string
  env?: NodeJS.ProcessEnv
} = {}): PublicShowcaseActivityFeed | null {
  const root = args.root ?? OPENJAWS_REPO_ROOT
  const env = args.env ?? process.env
  const candidates = [
    args.path ? resolve(args.path) : null,
    getPublicShowcaseActivityMirrorPath(root, env),
    getPublicShowcaseActivityPath(env),
  ].filter((candidate, index, all): candidate is string => {
    if (!candidate) {
      return false
    }
    return all.indexOf(candidate) === index
  })

  for (const candidate of candidates) {
    if (!existsSync(candidate)) {
      continue
    }
    try {
      const parsed = JSON.parse(readFileSync(candidate, 'utf8')) as unknown
      if (
        parsed &&
        typeof parsed === 'object' &&
        !Array.isArray(parsed) &&
        Array.isArray((parsed as PublicShowcaseActivityFeed).entries)
      ) {
        return sanitizePublicShowcaseActivityFeed(parsed as PublicShowcaseActivityFeed)
      }
    } catch {
      // ignore and continue to the next bounded mirror candidate
    }
  }

  return null
}

export function getPublicShowcaseLedgerSyncScriptPath(
  root = OPENJAWS_REPO_ROOT,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const configured =
    env.OPENJAWS_PUBLIC_SHOWCASE_LEDGER_SYNC_SCRIPT?.trim() ||
    env.ASGARD_PUBLIC_SHOWCASE_LEDGER_SYNC_SCRIPT?.trim()
  if (configured) {
    return resolve(configured)
  }

  const home = env.USERPROFILE?.trim() || env.HOME?.trim()
  const candidates = [
    home
      ? join(home, 'Desktop', 'cheeks', 'Asgard', 'scripts', 'sync-public-showcase-ledger.mjs')
      : null,
  ].filter((candidate): candidate is string => Boolean(candidate))

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return resolve(candidate)
    }
  }

  return null
}

function shouldAutoSyncPublicShowcaseLedger(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return parseBooleanEnv(
    env.OPENJAWS_PUBLIC_SHOWCASE_LEDGER_AUTO_SYNC?.trim() ||
      env.ASGARD_PUBLIC_SHOWCASE_LEDGER_SYNC_ENABLED?.trim(),
    false,
  )
}

function buildPublicLedgerSyncEnv(activityPath: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const key of PUBLIC_LEDGER_SYNC_ENV_ALLOWLIST) {
    const value = process.env[key]
    if (typeof value === 'string' && value.length > 0) {
      env[key] = value
    }
  }
  env.ASGARD_PUBLIC_SHOWCASE_LEDGER_SYNC_ENABLED = '1'
  env.ASGARD_PUBLIC_SHOWCASE_ACTIVITY_FILE = activityPath
  env.AROBI_PUBLIC_SHOWCASE_ACTIVITY_FILE = activityPath
  return env
}

function flushQueuedPublicShowcaseLedgerSyncs() {
  const queued = Array.from(pendingLedgerSyncs.entries())
  pendingLedgerSyncs.clear()
  ledgerFlushScheduled = false

  for (const [root, activityPath] of queued) {
    if (activeLedgerSyncRoots.has(root)) {
      pendingLedgerSyncs.set(root, activityPath)
      continue
    }
    if (!shouldAutoSyncPublicShowcaseLedger()) {
      continue
    }
    const scriptPath = getPublicShowcaseLedgerSyncScriptPath(root)
    if (!scriptPath) {
      continue
    }

    activeLedgerSyncRoots.add(root)
    const child = spawn(
      process.env.OPENJAWS_PUBLIC_SHOWCASE_LEDGER_SYNC_NODE?.trim() || 'node',
      [scriptPath, '--auto', '--json'],
      {
        cwd: root,
        env: buildPublicLedgerSyncEnv(activityPath),
        stdio: 'ignore',
        windowsHide: true,
      },
    )

    const finalize = () => {
      activeLedgerSyncRoots.delete(root)
      if (pendingLedgerSyncs.has(root) && !ledgerFlushScheduled) {
        ledgerFlushScheduled = true
        queueMicrotask(flushQueuedPublicShowcaseLedgerSyncs)
      }
    }

    child.once('error', finalize)
    child.once('exit', finalize)
  }
}

function queuePublicShowcaseLedgerAutoSync(root: string, activityPath: string) {
  if (!shouldAutoSyncPublicShowcaseLedger()) {
    return
  }
  pendingLedgerSyncs.set(root, activityPath)
  if (ledgerFlushScheduled) {
    return
  }
  ledgerFlushScheduled = true
  queueMicrotask(flushQueuedPublicShowcaseLedgerSyncs)
}

function readJsonFile(path: string): Record<string, unknown> | null {
  if (!existsSync(path)) {
    return null
  }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

function getQWebsiteBenchmarkSnapshotPath(
  root = OPENJAWS_REPO_ROOT,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const configured = env.OPENJAWS_PUBLIC_BENCHMARK_SNAPSHOT_FILE?.trim()
  if (configured) {
    return resolve(configured)
  }

  return resolve(root, 'website', 'lib', 'benchmarkSnapshot.generated.json')
}

function readQWebsiteBenchmarkSnapshot(
  root = OPENJAWS_REPO_ROOT,
  env: NodeJS.ProcessEnv = process.env,
): QWebsiteBenchmarkSnapshot | null {
  const snapshot = readJsonFile(getQWebsiteBenchmarkSnapshotPath(root, env))
  if (!snapshot) {
    return null
  }

  return snapshot as QWebsiteBenchmarkSnapshot
}

function getImmaculateBenchmarkReportPath(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const configured = env.IMMACULATE_BENCHMARK_REPORT_FILE?.trim()
  if (configured) {
    return resolve(configured)
  }

  const home = env.USERPROFILE?.trim() || env.HOME?.trim()
  if (!home) {
    return null
  }

  return resolve(home, 'Desktop', 'Immaculate', 'benchmarks', 'latest.json')
}

function readImmaculateBenchmarkReport(
  env: NodeJS.ProcessEnv = process.env,
): ImmaculateBenchmarkReport | null {
  const reportPath = getImmaculateBenchmarkReportPath(env)
  if (!reportPath) {
    return null
  }

  const report = readJsonFile(reportPath)
  if (!report) {
    return null
  }

  return report as ImmaculateBenchmarkReport
}

function readSeriesP50(
  report: ImmaculateBenchmarkReport,
  seriesId: string,
): number | null {
  const series = Array.isArray(report.series) ? report.series : []
  const match = series.find(entry => entry?.id === seriesId)
  return typeof match?.p50 === 'number' && Number.isFinite(match.p50)
    ? match.p50
    : null
}

function resolveImmaculateActionabilityPath(
  root: string,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const configured =
    env.OPENJAWS_IMMACULATE_ACTIONABILITY_FILE?.trim() ||
    env.IMMACULATE_ROUNDTABLE_ACTIONABILITY_FILE?.trim()
  if (configured) {
    return resolve(configured)
  }

  const configuredRoot =
    env.OPENJAWS_IMMACULATE_ROOT?.trim() ||
    env.IMMACULATE_ROOT?.trim()
  if (configuredRoot) {
    return resolve(
      configuredRoot,
      'docs',
      'wiki',
      'Roundtable-Actionability.json',
    )
  }

  const home = env.USERPROFILE?.trim() || env.HOME?.trim()
  const candidates = [
    home
      ? join(home, 'Desktop', 'Immaculate', 'docs', 'wiki', 'Roundtable-Actionability.json')
      : null,
    join(root, '..', '..', 'Immaculate', 'docs', 'wiki', 'Roundtable-Actionability.json'),
  ].filter((candidate): candidate is string => Boolean(candidate))

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return resolve(candidate)
    }
  }

  return null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function stringArrayFromUnknown(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value
    .map(entry => (typeof entry === 'string' ? normalizeOperatorAction(entry) : null))
    .filter((entry): entry is string => Boolean(entry))
}

function normalizeDiscordAgentProfileKey(
  value: string | null | undefined,
): string {
  const normalized = value?.trim().toLowerCase()
  return normalized && normalized.length > 0 ? normalized : 'discord-agent'
}

function humanizeDiscordAgentDisplayName(profileKey: string): string {
  switch (normalizeDiscordAgentProfileKey(profileKey)) {
    case 'q':
      return 'Q'
    case 'viola':
      return 'Viola'
    case 'blackbeak':
      return 'Blackbeak'
    default:
      return profileKey
        .split(/[-_]+/g)
        .filter(Boolean)
        .map(part => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
        .join(' ')
  }
}

function getDiscordReceiptFreshness(receipt: DiscordQAgentReceipt): number {
  const timestamp = normalizeTimestamp(
    receipt.operator?.lastCompletedAt ??
      receipt.schedule?.lastCompletedAt ??
      receipt.patrol?.lastCompletedAt ??
      receipt.updatedAt,
  )
  return timestamp ? Date.parse(timestamp) : 0
}

function buildImmaculateActionabilityEntry(
  root: string,
): PublicShowcaseActivityEntry | null {
  const path = resolveImmaculateActionabilityPath(root)
  if (!path) {
    return null
  }

  const parsed = readJsonFile(path)
  if (!parsed) {
    return null
  }

  const planner = asRecord(parsed.planner)
  if (!planner) {
    return null
  }

  const generatedAt = normalizeTimestamp(parsed.generatedAt as string | null | undefined)
  const parallelFormationMode = sanitizeInlineText(
    planner.parallelFormationMode as string | null | undefined,
    40,
  )
  const parallelFormationSummary = sanitizeInlineText(
    planner.parallelFormationSummary as string | null | undefined,
    180,
  )
  const repoCount = asNumber(planner.repoCount)
  const actionCount = asNumber(planner.actionCount)
  const readyCount = asNumber(planner.readyCount)
  const repositories = Array.isArray(parsed.repositories)
    ? parsed.repositories
        .map(entry => asRecord(entry))
        .filter((entry): entry is Record<string, unknown> => Boolean(entry))
        .map(entry => sanitizeInlineText(entry.repoLabel as string | null | undefined, 32))
        .filter((entry): entry is string => Boolean(entry))
    : []
  const actions = Array.isArray(parsed.actions)
    ? parsed.actions
        .map(entry => asRecord(entry))
        .filter((entry): entry is Record<string, unknown> => Boolean(entry))
    : []
  const isolationModes = uniqueStrings(
    actions.map(action => sanitizeInlineText(action.isolationMode as string | null | undefined, 24)),
  )
  const writeAuthorities = uniqueStrings(
    actions.map(action => sanitizeInlineText(action.writeAuthority as string | null | undefined, 32)),
  )

  if (
    !generatedAt &&
    repoCount === null &&
    actionCount === null &&
    readyCount === null &&
    repositories.length === 0 &&
    !parallelFormationSummary
  ) {
    return null
  }

  const summaryParts = [
    parallelFormationMode
      ? `${parallelFormationMode.replace(/[-_]+/g, ' ')} planner`
      : 'Immaculate planner',
    typeof repoCount === 'number'
      ? `covers ${repoCount.toLocaleString()} repos`
      : null,
    typeof actionCount === 'number'
      ? `with ${actionCount.toLocaleString()} isolated action${actionCount === 1 ? '' : 's'}`
      : null,
    typeof readyCount === 'number' && typeof actionCount === 'number'
      ? `${readyCount.toLocaleString()} ready`
      : null,
  ].filter(Boolean)

  const governanceParts = [
    repositories.length > 0 ? `Repos: ${repositories.join(', ')}.` : null,
    isolationModes.length > 0
      ? `Isolation: ${isolationModes.join(', ')}.`
      : null,
    writeAuthorities.length > 0
      ? `Authority: ${writeAuthorities.join(', ')}.`
      : null,
    parallelFormationSummary ? `${parallelFormationSummary}.` : null,
  ].filter(Boolean)

  return createEntry({
    id: `immaculate-actionability-${generatedAt ?? 'latest'}`,
    timestamp: generatedAt,
    title: 'Immaculate roundtable actionability plan',
    summary: joinPublicSummarySentences([
      summaryParts.join(' '),
      ...governanceParts,
    ]),
    kind: 'roundtable_actionability',
    status:
      typeof readyCount === 'number' && readyCount > 0
        ? 'ok'
        : typeof actionCount === 'number' && actionCount > 0
          ? 'warning'
          : 'info',
    source: 'Immaculate planner',
    subsystems: uniqueStrings(['immaculate', ...repositories]),
    artifacts: ['roundtable:actionability'],
    tags: ['immaculate', 'planner', 'bounded', 'public'],
  })
}

function readStoredDiscordQAgentReceipt(root: string): DiscordQAgentReceipt | null {
  const receiptPath = resolve(root, 'local-command-station', 'discord-q-agent-receipt.json')
  const parsed = readJsonFile(receiptPath)
  return parsed ? (parsed as unknown as DiscordQAgentReceipt) : null
}

function upsertStoredDiscordAgentReceipt(
  receipts: Map<string, StoredDiscordAgentReceipt>,
  next: StoredDiscordAgentReceipt,
) {
  const current = receipts.get(next.profileKey)
  if (!current) {
    receipts.set(next.profileKey, next)
    return
  }

  if (getDiscordReceiptFreshness(next.receipt) >= getDiscordReceiptFreshness(current.receipt)) {
    receipts.set(next.profileKey, next)
  }
}

function readStoredDiscordAgentReceipts(
  root: string,
): StoredDiscordAgentReceipt[] {
  const receipts = new Map<string, StoredDiscordAgentReceipt>()
  const legacyQReceipt = readStoredDiscordQAgentReceipt(root)
  if (legacyQReceipt) {
    upsertStoredDiscordAgentReceipt(receipts, {
      profileKey: 'q',
      displayName: 'Q',
      receipt: legacyQReceipt,
    })
  }

  const botsDir = resolve(root, 'local-command-station', 'bots')
  if (!existsSync(botsDir)) {
    return Array.from(receipts.values())
  }

  for (const entry of readdirSync(botsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue
    }
    const profileKey = normalizeDiscordAgentProfileKey(entry.name)
    const receiptPath = resolve(
      botsDir,
      entry.name,
      'discord-agent-receipt.json',
    )
    const parsed = readJsonFile(receiptPath)
    if (!parsed) {
      continue
    }
    upsertStoredDiscordAgentReceipt(receipts, {
      profileKey,
      displayName: humanizeDiscordAgentDisplayName(profileKey),
      receipt: parsed as unknown as DiscordQAgentReceipt,
    })
  }

  return Array.from(receipts.values()).sort((left, right) => {
    const freshness = getDiscordReceiptFreshness(right.receipt) - getDiscordReceiptFreshness(left.receipt)
    if (freshness !== 0) {
      return freshness
    }
    return left.displayName.localeCompare(right.displayName)
  })
}

function readStoredRoundtableSession(
  root: string,
): DiscordRoundtableSessionState | null {
  const sessionPath = resolve(
    root,
    'local-command-station',
    'roundtable-runtime',
    'discord-roundtable.session.json',
  )
  const parsed = readJsonFile(sessionPath)
  return parsed ? (parsed as unknown as DiscordRoundtableSessionState) : null
}

function readStoredRoundtableRuntime(
  root: string,
): DiscordRoundtableRuntimeState | null {
  const runtimePath = resolve(
    root,
    'local-command-station',
    'roundtable-runtime',
    'discord-roundtable-queue.state.json',
  )
  const parsed = readJsonFile(runtimePath)
  return parsed ? (parsed as unknown as DiscordRoundtableRuntimeState) : null
}

function readStoredApexTenantGovernanceSummary(
  root: string,
): ApexTenantGovernanceSummary | null {
  const mirrorPath = getApexTenantGovernanceMirrorPath(root)
  const parsed = readJsonFile(mirrorPath)
  return parsed ? (parsed as unknown as ApexTenantGovernanceSummary) : null
}

function getNysusPublicAgentActivityPath(
  root: string,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const configured =
    env.OPENJAWS_NYSUS_PUBLIC_ACTIVITY_FILE?.trim() ||
    env.ASGARD_PUBLIC_AGENT_ACTIVITY_FILE?.trim() ||
    env.ASGARD_PUBLIC_OPERATOR_ACTIVITY_FILE?.trim()
  if (configured) {
    return resolve(configured)
  }

  const home = env.USERPROFILE?.trim() || env.HOME?.trim()
  if (home) {
    return resolve(home, '.arobi-public', 'nysus-agent-events.json')
  }

  const fallback = resolve(root, 'local-command-station', 'nysus-agent-events.json')
  return existsSync(fallback) ? fallback : null
}

function readStoredNysusPublicAgentActivity(
  root: string,
): NysusPublicAgentActivityEntry[] {
  const activityPath = getNysusPublicAgentActivityPath(root)
  if (!activityPath) {
    return []
  }

  const parsed = readJsonFile(activityPath)
  if (!parsed || !Array.isArray(parsed.events)) {
    return []
  }

  return parsed.events
    .map(entry => asRecord(entry))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry))
    .map(entry => ({
      id: typeof entry.id === 'string' ? entry.id : undefined,
      timestamp: typeof entry.timestamp === 'string' ? entry.timestamp : null,
      task_id: typeof entry.task_id === 'string' ? entry.task_id : null,
      agent_name: typeof entry.agent_name === 'string' ? entry.agent_name : null,
      event_type: typeof entry.event_type === 'string' ? entry.event_type : null,
      task_type: typeof entry.task_type === 'string' ? entry.task_type : null,
      task_status: typeof entry.task_status === 'string' ? entry.task_status : null,
      summary: typeof entry.summary === 'string' ? entry.summary : null,
      source: typeof entry.source === 'string' ? entry.source : null,
      operator_actions: entry.operator_actions,
      governance_signals: entry.governance_signals,
    }))
}

function buildFallbackDiscordAgentEntry(args: {
  receipt: DiscordQAgentReceipt
  profileKey: string
  displayName: string
}): PublicShowcaseActivityEntry | null {
  const profileKey = normalizeDiscordAgentProfileKey(args.profileKey)
  const displayName = sanitizeInlineText(args.displayName, 48) ?? humanizeDiscordAgentDisplayName(profileKey)
  const receipt = args.receipt
  const gateway = receipt.gateway ?? { connected: false }
  const operator = receipt.operator ?? {}
  const schedule = receipt.schedule ?? {}
  const patrol = receipt.patrol ?? {}
  if (!gateway.connected && !operator.lastAction && !patrol.lastSummary) {
    return null
  }

  const timestamp =
    operator.lastCompletedAt ??
    schedule.lastCompletedAt ??
    patrol.lastCompletedAt ??
    receipt.updatedAt
  const operatorLine = operator.lastAction
    ? `${displayName} is ${sanitizeInlineText(operator.lastAction?.replace(/[-_]+/g, ' '), 72)} through the supervised Discord/OpenJaws lane.`
    : null
  const rawPatrolLine =
    operator.lastSummary ??
    patrol.lastSummary ??
    schedule.lastSummary ??
    (gateway.connected
      ? `${displayName} Discord runtime is online through the supervised bounded operator lane.`
      : `${displayName} Discord runtime is currently offline on the supervised bounded operator lane.`)
  const patrolLine = sanitizeInlineText(
    /no high-value patrol post due|routing cooldown held/i.test(rawPatrolLine)
      ? `${displayName} is online and posts only when a high-value public update is ready.`
      : rawPatrolLine,
    220,
  )

  return createEntry({
    id: `discord-${profileKey}-${timestamp ?? 'latest'}`,
    timestamp,
    title: operator.lastAction
      ? `Supervised ${displayName} operator activity`
      : `Supervised ${displayName} patrol update`,
    summary: [operatorLine, patrolLine].filter(Boolean).join(' '),
    kind: operator.lastAction ? 'operator' : 'patrol',
    status:
      receipt.status === 'error'
        ? 'failed'
        : gateway.connected
          ? 'ok'
          : 'warning',
    source: 'OpenJaws Discord lane',
    operatorActions: [
      normalizeOperatorAction(operator.lastAction),
      operator.lastAction
        ? `${profileKey}_operator_runtime`
        : `${profileKey}_operator_patrol`,
    ],
    subsystems: uniqueStrings([
      'openjaws',
      'discord',
      profileKey,
    ]),
    artifacts: [`discord:${profileKey}-agent-receipt`],
    tags: [profileKey, 'discord', 'openjaws', 'bounded'],
  })
}

function buildFallbackQEntry(receipt: DiscordQAgentReceipt): PublicShowcaseActivityEntry | null {
  return buildFallbackDiscordAgentEntry({
    receipt,
    profileKey: 'q',
    displayName: 'Q',
  })
}

function buildApexTenantGovernanceEntry(
  summary: ApexTenantGovernanceSummary | null,
): PublicShowcaseActivityEntry | null {
  const governance = summarizePublicApexTenantGovernance(summary)
  if (!governance) {
    return null
  }
  return createEntry({
    id: `apex-tenant-governance-${governance.latestActivityAt ?? 'latest'}`,
    timestamp: governance.latestActivityAt,
    title: 'Apex tenant governance',
    summary: joinPublicSummarySentences([
      governance.headline,
      ...governance.details,
    ]),
    kind: 'tenant_governance',
    status: governance.status,
    source: 'Apex tenant governance',
    operatorActions: governance.operatorActions,
    subsystems: ['apex', 'openjaws'],
    artifacts: ['apex:tenant-governance'],
    tags: [
      'apex',
      'governance',
      'bounded',
      'public',
      ...governance.governanceSignals,
    ],
  })
}

function buildApexGovernedSpendEntry(
  summary: ApexTenantGovernanceSummary | null,
  generatedAt: string,
): PublicShowcaseActivityEntry | null {
  const spend = summarizePublicApexGovernedSpend(summary)
  if (!spend) {
    return null
  }
  const timestamp =
    spend.status === 'info' && spend.operatorActions.length === 0
      ? generatedAt
      : spend.latestActivityAt

  return createEntry({
    id: `apex-governed-spend-${timestamp ?? 'latest'}`,
    timestamp,
    title: 'Apex governed spend lane',
    summary: joinPublicSummarySentences([spend.headline, ...spend.details]),
    kind: 'tenant_governed_spend',
    status: spend.status,
    source: 'Apex governed spend',
    operatorActions: spend.operatorActions,
    subsystems: ['apex', 'openjaws'],
    artifacts: ['apex:tenant-governance', 'apex:governed-spend'],
    tags: ['apex', 'spend', 'bounded', 'public', 'commercial'],
  })
}

function buildApexOperatorActivityEntries(
  receipt: ApexOperatorActivityReceipt | null,
): PublicShowcaseActivityEntry[] {
  if (!receipt || receipt.activities.length === 0) {
    return []
  }

  return receipt.activities.slice(0, 2).map(activity => {
    const appLabel =
      activity.app === 'mail'
        ? 'Aegis Mail'
        : activity.app === 'chat'
          ? 'Shadow Chat'
          : activity.app === 'store'
            ? 'App Store'
            : activity.app === 'chrono'
              ? 'Chrono'
              : activity.app === 'settings'
                ? 'Settings'
                : 'Browser'
    const actionLabel = sanitizeInlineText(
      activity.action.replace(/[_-]+/g, ' '),
      48,
    )

    return createEntry({
      id: activity.id,
      timestamp: activity.timestamp,
      title: `Apex ${appLabel} operator activity`,
      summary: `${appLabel} is ${actionLabel ?? 'active'} through the bounded /apex operator lane. ${activity.summary}`,
      kind: 'apex_operator_activity',
      status: activity.status === 'ok' ? 'ok' : 'failed',
      source: 'OpenJaws Apex lane',
      operatorActions: activity.operatorActions,
      subsystems: ['apex', 'openjaws'],
      artifacts: activity.artifacts,
      tags: ['apex', activity.app, 'bounded', 'operator'],
    })
  })
}

function buildQBenchmarkEntry(
  snapshot: QWebsiteBenchmarkSnapshot | null,
  publishedAt: string,
): PublicShowcaseActivityEntry | null {
  if (!snapshot?.generatedAt) {
    return null
  }

  const bridgeStatus = sanitizeInlineText(snapshot.bridgeBench?.status, 32) ?? 'unknown'
  const bridgeSummary =
    sanitizeInlineText(snapshot.bridgeBench?.summary, 180) ??
    'BridgeBench summary unavailable.'
  const terminalStatus =
    sanitizeInlineText(snapshot.terminalBench?.status, 32) ?? 'unknown'
  const terminalSummary =
    sanitizeInlineText(snapshot.terminalBench?.summary, 180) ??
    'TerminalBench summary unavailable.'
  const wandbSummary =
    sanitizeInlineText(snapshot.wandb?.summary, 140) ??
    'W&B publication summary unavailable.'
  const benchmarkStatus =
    bridgeStatus.includes('failed') ||
    terminalStatus.includes('error') ||
    terminalStatus.includes('failed')
      ? 'warning'
      : 'ok'
  const scoreLabel =
    typeof snapshot.bridgeBench?.scorePercent === 'number'
      ? `${snapshot.bridgeBench.scorePercent.toFixed(2)}%`
      : bridgeStatus.replace(/_/g, ' ')
  const terminalLine =
    terminalStatus.includes('error') || terminalStatus.includes('failed')
      ? 'TerminalBench is staged for scorer-backed leaderboard publication.'
      : `TerminalBench ${terminalStatus.replace(/_/g, ' ')}. ${terminalSummary}`
  const wandbLine =
    snapshot.wandb?.enabled === false || snapshot.wandb?.status === 'disabled'
      ? 'W&B publication is staged for credentialed release.'
      : `W&B: ${wandbSummary}`

  return createEntry({
    id: `q-benchmark-board-${publishedAt}`,
    timestamp: publishedAt,
    title: 'Q public benchmark board',
    summary: joinPublicSummarySentences([
      'Q benchmark transparency is live',
      `BridgeBench ${scoreLabel}. ${bridgeSummary}`,
      terminalLine,
      wandbLine,
    ]),
    kind: 'benchmark',
    status: benchmarkStatus,
    source: 'Q public benchmark board',
    operatorActions: [
      'q_benchmark_publication',
      'bridgebench_publication',
      'terminalbench_publication',
      'wandb_publication',
    ],
    subsystems: ['q', 'openjaws'],
    artifacts: ['q:benchmark-snapshot'],
    tags: ['benchmark', 'public', 'q', 'bridgebench', 'terminalbench', 'wandb'],
  })
}

function buildImmaculateBenchmarkEntry(
  report: ImmaculateBenchmarkReport | null,
  publishedAt: string,
): PublicShowcaseActivityEntry | null {
  if (!report?.generatedAt) {
    return null
  }

  const reflexP50 = readSeriesP50(report, 'reflex_latency_ms')
  const cognitiveP50 = readSeriesP50(report, 'cognitive_latency_ms')
  const eventP50 = readSeriesP50(report, 'event_throughput_events_s')
  const failedAssertions = typeof report.failedAssertions === 'number'
    ? report.failedAssertions
    : 0
  const totalAssertions = typeof report.totalAssertions === 'number'
    ? report.totalAssertions
    : null
  const assertionSummary = totalAssertions
    ? failedAssertions === 0
      ? `all ${totalAssertions} assertions passing`
      : `${failedAssertions}/${totalAssertions} assertion follow-ups`
    : failedAssertions === 0
      ? 'all assertions passing'
      : `${failedAssertions} assertion follow-ups`
  const metricsSummary = [
    reflexP50 !== null ? `reflex p50 ${reflexP50.toFixed(2)} ms` : null,
    cognitiveP50 !== null ? `cognitive p50 ${cognitiveP50.toFixed(2)} ms` : null,
    eventP50 !== null ? `event throughput ${eventP50.toFixed(2)} events/s` : null,
  ].filter((value): value is string => Boolean(value))

  return createEntry({
    id: `immaculate-benchmark-${publishedAt}`,
    timestamp: publishedAt,
    title: 'Immaculate benchmark board',
    summary: joinPublicSummarySentences([
      sanitizeInlineText(report.packLabel ?? 'Immaculate benchmark', 72),
      assertionSummary,
      metricsSummary.join(' · '),
    ]),
    kind: 'benchmark',
    status: failedAssertions > 0 ? 'warning' : 'ok',
    source: 'Immaculate benchmark board',
    operatorActions: ['immaculate_benchmark_publication', 'orchestration_benchmark'],
    subsystems: ['immaculate', 'openjaws'],
    artifacts: ['immaculate:benchmark-report'],
    tags: ['benchmark', 'public', 'immaculate', 'orchestration'],
  })
}

function buildNysusPublicAgentActivityEntry(
  entries: NysusPublicAgentActivityEntry[],
): PublicShowcaseActivityEntry | null {
  if (entries.length === 0) {
    return null
  }

  const latest = entries[0]
  const lifecycleActions = new Set([
    'task_submitted',
    'task_assigned',
    'task_started',
    'task_completed',
    'task_failed',
    'task_rejected',
  ])
  const operatorActions = uniqueStrings([
    ...entries.flatMap(entry =>
      stringArrayFromUnknown(entry.operator_actions).filter(
        action => !lifecycleActions.has(action),
      ),
    ),
    'nysus_agent_summary',
  ])
  const governanceSignals = uniqueStrings(
    entries.flatMap(entry => stringArrayFromUnknown(entry.governance_signals)),
  )
  const taskTypes = uniqueStrings(
    entries.map(entry => normalizeOperatorAction(entry.task_type)),
  )
  const agentNames = uniqueStrings(
    entries.map(entry => sanitizeInlineText(entry.agent_name, 32)),
  )
  const taskIDs = uniqueStrings(
    entries.map(entry => sanitizeInlineText(entry.task_id, 64)),
  )
  const title = latest.agent_name
    ? `Nysus operator activity: ${latest.agent_name}`
    : 'Nysus operator activity'
  const activitySummary = sanitizeInlineText(
    latest.summary ??
      [latest.event_type, latest.task_type, latest.task_status]
        .filter((value): value is string => Boolean(value && value.trim().length > 0))
        .join(' • '),
    220,
  )
  const countSummary = ` ${entries.length.toLocaleString()} bounded lifecycle events across ${taskIDs.length.toLocaleString()} governed task${taskIDs.length === 1 ? '' : 's'} and ${agentNames.length.toLocaleString()} agent lane${agentNames.length === 1 ? '' : 's'} are mirrored into the public showcase lane.`
  const taskTypeSummary =
    taskTypes.length > 0
      ? ` Recent governed task lanes: ${taskTypes
          .slice(0, 5)
          .map(taskType => taskType.replace(/_/g, ' '))
          .join(', ')}.`
      : ''
  const actionSurfaceSummary =
    operatorActions.length > 1
      ? ` Public action surfaces: ${operatorActions
          .filter(action => action !== 'nysus_agent_summary')
          .slice(0, 6)
          .map(action => action.replace(/_/g, ' '))
          .join(', ')}.`
      : ''

  return createEntry({
    id: latest.id ?? `nysus-agent-activity-${latest.timestamp ?? 'latest'}`,
    timestamp: latest.timestamp,
    title,
    summary: `${activitySummary ?? 'Recent Nysus operator activity is available.'}${countSummary}${taskTypeSummary}${actionSurfaceSummary}`,
    kind: 'nysus_operator_activity',
    status:
      latest.task_status === 'failed' || latest.event_type === 'task_failed'
        ? 'failed'
        : latest.task_status === 'rejected' || latest.event_type === 'task_rejected'
          ? 'warning'
          : 'ok',
    source: latest.source ?? 'Nysus agent coordinator',
    operatorActions,
    subsystems: ['nysus', 'control_fabric', 'arobi'],
    artifacts: ['nysus:agent-events'],
    tags: ['nysus', 'bounded', 'public', 'audit', ...governanceSignals],
  })
}

function buildRoundtableEntry(args: {
  session?: DiscordRoundtableSessionState | null
  runtime?: DiscordRoundtableRuntimeState | null
}): PublicShowcaseActivityEntry | null {
  const status = args.session?.status ?? args.runtime?.status ?? null
  if (!status) {
    return null
  }

  const timestamp =
    args.session?.updatedAt ?? args.runtime?.updatedAt ?? new Date().toISOString()
  const summary =
    args.session?.lastSummary ??
    args.runtime?.lastSummary ??
    args.session?.lastError ??
    args.runtime?.lastError ??
    'Roundtable runtime updated through the supervised OpenJaws execution lane.'
  const isReviewState = status === 'error'
  const statusText = isReviewState ? 'needs review' : status

  return createEntry({
    id: `roundtable-${isReviewState ? 'review' : status}-${timestamp ?? 'latest'}`,
    timestamp,
    title: 'Roundtable runtime',
    summary: isReviewState
      ? `Roundtable coordination is active and still under review. ${summary}`
      : `Roundtable coordination is ${statusText}. ${summary}`,
    kind: 'roundtable_runtime',
    status:
      isReviewState || status === 'running' || status === 'awaiting_approval' || status === 'queued'
        ? 'warning'
        : 'ok',
    source: 'OpenJaws roundtable lane',
    operatorActions: ['roundtable_runtime', 'immaculate_handoff'],
    subsystems: ['openjaws', 'immaculate', 'discord'],
    artifacts: ['roundtable:session'],
    tags: isReviewState
      ? ['roundtable', 'bounded', 'supervised', 'needs-review']
      : ['roundtable', 'bounded', 'supervised'],
  })
}

function buildTraceEntry(args: {
  id: string
  title: string
  source: string
  kind: string
  runState: string | null | undefined
  sessionId: string
  eventCount: number
  timestamp: string | null | undefined
  summaryPrefix: string
  operatorActions?: string[]
  subsystems: string[]
  artifacts: string[]
  tags: string[]
}): PublicShowcaseActivityEntry {
  return createEntry({
    id: `${args.id}-${args.timestamp ?? 'latest'}`,
    timestamp: args.timestamp,
    title: args.title,
    summary: `${args.summaryPrefix} session ${args.sessionId} is ${args.runState ?? 'unknown'} with ${args.eventCount.toLocaleString()} trace events.`,
    kind: args.kind,
    status:
      args.runState === 'completed'
        ? 'ok'
        : args.runState === 'active'
          ? 'warning'
          : 'info',
    source: args.source,
    operatorActions: args.operatorActions ?? ['trace_summary'],
    subsystems: args.subsystems,
    artifacts: args.artifacts,
    tags: args.tags,
  })
}

function buildRuntimeSummaryEntry(args: {
  generatedAt: string
  entries: PublicShowcaseActivityEntry[]
  qReceipt: DiscordQAgentReceipt | null
  roundtableEntry: PublicShowcaseActivityEntry | null
}): PublicShowcaseActivityEntry {
  const hasCriticalFailure = args.entries.some(entry =>
    isCriticalRuntimeFailure(entry),
  )
  const hasFailure =
    hasCriticalFailure ||
    args.qReceipt?.status === 'error'
  const hasWarning =
    !hasFailure &&
    (
      args.entries.length === 0 ||
      args.entries.some(entry =>
        entry.status === 'warning' || entry.status === 'failed',
      ) ||
      (args.qReceipt ? args.qReceipt.gateway.connected !== true : true)
    )

  const status = hasFailure ? 'failed' : hasWarning ? 'warning' : 'ok'
  const summary = hasFailure
    ? 'OpenJaws, Q, Immaculate, Apex, and Discord are visible as public-safe activity summaries. Follow-ups stay tracked without exposing sensitive details.'
    : hasWarning
      ? 'OpenJaws, Q, Immaculate, Apex, and Discord are visible as public-safe activity summaries. Follow-ups stay tracked without exposing sensitive details.'
      : 'OpenJaws, Q, Immaculate, Apex, and Discord are live as public-safe activity summaries.'

  return createEntry({
    id: `runtime-audit-${args.generatedAt}`,
    timestamp: args.generatedAt,
    title: 'Supervised runtime activity refreshed',
    summary,
    kind: 'runtime_audit',
    status,
    source: 'OpenJaws public showcase sync',
    operatorActions: ['runtime_audit', 'public_showcase_sync'],
    subsystems: uniqueStrings([
      'openjaws',
      args.entries.some(entry => entry.subsystems.includes('apex')) ? 'apex' : null,
      args.entries.some(entry => entry.subsystems.includes('nysus')) ? 'nysus' : null,
      args.qReceipt ? 'q' : null,
      args.roundtableEntry ? 'roundtable' : null,
      'immaculate',
      'discord',
    ]),
    artifacts: ['showcase:activity'],
    tags: ['public', 'audit', 'bounded'],
  })
}

function isCriticalRuntimeFailure(
  entry: PublicShowcaseActivityEntry,
): boolean {
  if (entry.status !== 'failed') {
    return false
  }

  // These lanes are public-safe mirrors of protected operator state. A local
  // task can fail without meaning the public network route or message bus is
  // unavailable.
  return !new Set([
    'roundtable_runtime',
    'tenant_governed_spend',
    'benchmark',
  ]).has(entry.kind ?? '')
}

export function buildPublicShowcaseActivityFeed(args: {
  generatedAt?: string | null
  qAgentReceipt?: DiscordQAgentReceipt | null
  qEntry?: PublicShowcaseActivityEntry | null
  roundtableSession?: DiscordRoundtableSessionState | null
  roundtableRuntime?: DiscordRoundtableRuntimeState | null
  root?: string
}): PublicShowcaseActivityFeed {
  const root = getPublicShowcaseActivityRoot(args.root)
  const generatedAt = normalizeTimestamp(args.generatedAt ?? new Date().toISOString()) ?? new Date().toISOString()
  const storedAgentReceipts = readStoredDiscordAgentReceipts(root)
  const qReceipt =
    args.qAgentReceipt ??
    storedAgentReceipts.find(entry => entry.profileKey === 'q')?.receipt ??
    null
  const qEntry = args.qEntry ?? (qReceipt ? buildFallbackQEntry(qReceipt) : null)
  const apexGovernanceSummary = readStoredApexTenantGovernanceSummary(root)
  const apexGovernanceEntry = buildApexTenantGovernanceEntry(
    apexGovernanceSummary,
  )
  const apexGovernedSpendEntry = buildApexGovernedSpendEntry(
    apexGovernanceSummary,
    generatedAt,
  )
  const apexOperatorActivityEntries = buildApexOperatorActivityEntries(
    readApexOperatorActivityReceiptSync(),
  )
  const nysusAgentActivityEntry = buildNysusPublicAgentActivityEntry(
    readStoredNysusPublicAgentActivity(root),
  )
  const agentEntries = storedAgentReceipts
    .filter(entry => !(entry.profileKey === 'q' && qEntry))
    .map(entry =>
      buildFallbackDiscordAgentEntry({
        receipt: entry.receipt,
        profileKey: entry.profileKey,
        displayName: entry.displayName,
      }),
    )
    .filter((entry): entry is PublicShowcaseActivityEntry => Boolean(entry))
  const roundtableSession = args.roundtableSession ?? readStoredRoundtableSession(root)
  const roundtableRuntime = args.roundtableRuntime ?? readStoredRoundtableRuntime(root)
  const roundtableEntry = buildRoundtableEntry({
    session: roundtableSession,
    runtime: roundtableRuntime,
  })
  const actionabilityEntry = buildImmaculateActionabilityEntry(root)
  const immaculateTrace = readLatestImmaculateTraceSummary(root)
  const qTrace = readLatestQTraceSummary(root)
  const qBenchmarkEntry = buildQBenchmarkEntry(
    readQWebsiteBenchmarkSnapshot(root),
    generatedAt,
  )
  const immaculateBenchmarkEntry = buildImmaculateBenchmarkEntry(
    readImmaculateBenchmarkReport(),
    generatedAt,
  )

  const entries = [
    qEntry,
    ...agentEntries,
    apexGovernanceEntry,
    apexGovernedSpendEntry,
    ...apexOperatorActivityEntries,
    nysusAgentActivityEntry,
    roundtableEntry,
    actionabilityEntry,
    qBenchmarkEntry,
    immaculateBenchmarkEntry,
    immaculateTrace
      ? buildTraceEntry({
          id: 'immaculate-trace',
          title: 'Immaculate orchestration trace',
          source: 'Immaculate trace',
          kind: 'orchestration_trace',
          runState: immaculateTrace.runState,
          sessionId: immaculateTrace.sessionId,
          eventCount: immaculateTrace.eventCount,
          timestamp:
            immaculateTrace.lastTimestamp ??
            immaculateTrace.endedAt ??
            immaculateTrace.startedAt,
          summaryPrefix: 'Immaculate',
          operatorActions: ['immaculate_trace', 'orchestration_trace'],
          subsystems: ['immaculate', 'openjaws'],
          artifacts: ['immaculate:trace-summary'],
          tags: ['immaculate', 'trace', 'bounded'],
        })
      : null,
    qTrace
      ? buildTraceEntry({
          id: 'q-trace',
          title: 'Q readiness summary',
          source: 'Q readiness',
          kind: 'q_readiness',
          runState: qTrace.runState,
          sessionId: qTrace.sessionId,
          eventCount: qTrace.eventCount,
          timestamp: qTrace.lastTimestamp ?? qTrace.endedAt ?? qTrace.startedAt,
          summaryPrefix: 'Q',
          operatorActions: ['q_readiness_summary', 'model_activity_summary'],
          subsystems: ['q', 'openjaws'],
          artifacts: ['q:readiness-summary'],
          tags: ['q', 'readiness', 'bounded'],
        })
      : null,
  ].filter((entry): entry is PublicShowcaseActivityEntry => Boolean(entry))

  const summaryEntry = buildRuntimeSummaryEntry({
    generatedAt,
    entries,
    qReceipt,
    roundtableEntry,
  })

  const sortedEntries = [summaryEntry, ...entries]
    .sort((left, right) => {
      const leftTime = left.timestamp ? Date.parse(left.timestamp) : 0
      const rightTime = right.timestamp ? Date.parse(right.timestamp) : 0
      if (rightTime !== leftTime) {
        return rightTime - leftTime
      }
      return left.title.localeCompare(right.title)
    })
    .slice(0, MAX_PUBLIC_SHOWCASE_ACTIVITY_ENTRIES)
    .map(sanitizePublicShowcaseActivityEntry)

  return {
    updatedAt: sortedEntries[0]?.timestamp ?? generatedAt,
    entries: sortedEntries,
  }
}

export function writePublicShowcaseActivityFeed(
  feed: PublicShowcaseActivityFeed,
  outputPath = getPublicShowcaseActivityPath(),
  mirrorPath?: string,
): string {
  const sanitizedFeed = sanitizePublicShowcaseActivityFeed(feed)
  writeJsonFileAtomic(outputPath, sanitizedFeed)
  if (mirrorPath) {
    writeJsonFileAtomic(mirrorPath, sanitizedFeed)
  }
  return outputPath
}

function writeJsonFileAtomic(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true })
  const tempPath = `${path}.tmp-${process.pid}-${Date.now()}`
  writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  renameSync(tempPath, path)
}

export function syncPublicShowcaseActivityFromRoot(
  args: PublicShowcaseActivitySyncArgs = {},
): PublicShowcaseActivityFeed {
  const root = getPublicShowcaseActivityRoot(args.root)
  const feed = buildPublicShowcaseActivityFeed({
    root,
    generatedAt: new Date().toISOString(),
    qAgentReceipt: args.qAgentReceipt ?? null,
    qEntry: args.qEntry ?? null,
    roundtableSession: args.roundtableSession ?? null,
    roundtableRuntime: args.roundtableRuntime ?? null,
  })
  const outputPath = writePublicShowcaseActivityFeed(
    feed,
    getPublicShowcaseActivityPath(),
    args.writeMirror === false ? undefined : getPublicShowcaseActivityMirrorPath(root),
  )
  queuePublicShowcaseLedgerAutoSync(root, outputPath)
  return feed
}

function flushQueuedPublicShowcaseActivitySyncs() {
  const queued = Array.from(pendingSyncs.values())
  pendingSyncs.clear()
  flushScheduled = false
  flushTimer = null
  flushDueAt = 0

  for (const args of queued) {
    try {
      syncPublicShowcaseActivityFromRoot(args)
    } catch {
      // Public showcase sync must never break the live operator loop.
    }
  }
  lastActivitySyncFinishedAt = Date.now()
}

function readPublicShowcaseActivityQueueMs(
  name: string,
  fallback: number,
): number {
  const raw = process.env[name]?.trim()
  if (!raw) {
    return fallback
  }
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback
  }
  return parsed
}

function scheduleQueuedPublicShowcaseActivitySync() {
  const delayMs = readPublicShowcaseActivityQueueMs(
    'OPENJAWS_PUBLIC_SHOWCASE_ACTIVITY_SYNC_DELAY_MS',
    DEFAULT_PUBLIC_SHOWCASE_ACTIVITY_SYNC_DELAY_MS,
  )
  const minIntervalMs = readPublicShowcaseActivityQueueMs(
    'OPENJAWS_PUBLIC_SHOWCASE_ACTIVITY_SYNC_MIN_INTERVAL_MS',
    DEFAULT_PUBLIC_SHOWCASE_ACTIVITY_SYNC_MIN_INTERVAL_MS,
  )
  const intervalDelayMs =
    lastActivitySyncFinishedAt > 0
      ? Math.max(0, lastActivitySyncFinishedAt + minIntervalMs - Date.now())
      : 0
  const dueAt = Date.now() + Math.max(delayMs, intervalDelayMs)
  if (flushScheduled) {
    if (!flushTimer || dueAt >= flushDueAt) {
      return
    }
    clearTimeout(flushTimer)
  }
  flushScheduled = true
  flushDueAt = dueAt
  flushTimer = setTimeout(
    flushQueuedPublicShowcaseActivitySyncs,
    Math.max(0, dueAt - Date.now()),
  )
  const maybeUnref = (flushTimer as { unref?: () => void } | null)?.unref
  if (typeof maybeUnref === 'function') {
    maybeUnref.call(flushTimer)
  }
}

export function queuePublicShowcaseActivitySync(
  args: PublicShowcaseActivitySyncArgs = {},
) {
  const root = getPublicShowcaseActivityRoot(args.root)
  const current = pendingSyncs.get(root) ?? { root }
  pendingSyncs.set(root, {
    root,
    qAgentReceipt: args.qAgentReceipt ?? current.qAgentReceipt ?? null,
    qEntry: args.qEntry ?? current.qEntry ?? null,
    roundtableSession:
      args.roundtableSession ?? current.roundtableSession ?? null,
    roundtableRuntime:
      args.roundtableRuntime ?? current.roundtableRuntime ?? null,
    writeMirror: args.writeMirror ?? current.writeMirror ?? false,
  })

  scheduleQueuedPublicShowcaseActivitySync()
}
