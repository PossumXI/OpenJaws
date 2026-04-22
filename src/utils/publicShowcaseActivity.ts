import { spawn } from 'child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs'
import { dirname, join, resolve } from 'path'
import {
  getApexTenantGovernanceMirrorPath,
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

const MAX_PUBLIC_SHOWCASE_ACTIVITY_ENTRIES = 8
const pendingSyncs = new Map<string, PublicShowcaseActivitySyncArgs>()
const pendingLedgerSyncs = new Map<string, string>()
const activeLedgerSyncRoots = new Set<string>()
let flushScheduled = false
let ledgerFlushScheduled = false

function sanitizeInlineText(
  value: string | null | undefined,
  maxLength = 280,
): string | null {
  if (!value) {
    return null
  }
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (!normalized) {
    return null
  }
  if (normalized.length <= maxLength) {
    return normalized
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`
}

function normalizeTimestamp(value: string | null | undefined): string | null {
  if (!value) {
    return null
  }
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null
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
        .filter((value): value is string => Boolean(value)),
    ),
  )
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

function getPublicShowcaseActivityRoot(root = process.cwd()): string {
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
  root = process.cwd(),
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
  const root = args.root ?? process.cwd()
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
        return parsed as PublicShowcaseActivityFeed
      }
    } catch {
      // ignore and continue to the next bounded mirror candidate
    }
  }

  return null
}

export function getPublicShowcaseLedgerSyncScriptPath(
  root = process.cwd(),
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
        env: {
          ...process.env,
          ASGARD_PUBLIC_SHOWCASE_LEDGER_SYNC_ENABLED: '1',
          ASGARD_PUBLIC_SHOWCASE_ACTIVITY_FILE: activityPath,
          AROBI_PUBLIC_SHOWCASE_ACTIVITY_FILE: activityPath,
        },
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
    receipt.operator.lastCompletedAt ??
      receipt.schedule.lastCompletedAt ??
      receipt.patrol.lastCompletedAt ??
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
    summary: `${summaryParts.join(' ')}. ${governanceParts.join(' ')}`.trim(),
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
  if (!receipt.gateway.connected && !receipt.operator.lastAction && !receipt.patrol.lastSummary) {
    return null
  }

  const timestamp =
    receipt.operator.lastCompletedAt ??
    receipt.schedule.lastCompletedAt ??
    receipt.patrol.lastCompletedAt ??
    receipt.updatedAt
  const operatorLine = receipt.operator.lastAction
    ? `${displayName} is ${sanitizeInlineText(receipt.operator.lastAction?.replace(/[-_]+/g, ' '), 72)} through the supervised Discord/OpenJaws lane.`
    : null
  const patrolLine = sanitizeInlineText(
    receipt.operator.lastSummary ??
      receipt.patrol.lastSummary ??
      receipt.schedule.lastSummary ??
      (receipt.gateway.connected
        ? `${displayName} Discord runtime is online through the supervised bounded operator lane.`
        : `${displayName} Discord runtime is currently offline on the supervised bounded operator lane.`),
    220,
  )

  return createEntry({
    id: `discord-${profileKey}-${timestamp ?? 'latest'}`,
    timestamp,
    title: receipt.operator.lastAction
      ? `Supervised ${displayName} operator activity`
      : `Supervised ${displayName} patrol update`,
    summary: [operatorLine, patrolLine].filter(Boolean).join(' '),
    kind: receipt.operator.lastAction ? 'operator' : 'patrol',
    status:
      receipt.status === 'error'
        ? 'failed'
        : receipt.gateway.connected
          ? 'ok'
          : 'warning',
    source: 'OpenJaws Discord lane',
    operatorActions: [
      normalizeOperatorAction(receipt.operator.lastAction),
      receipt.operator.lastAction
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
    summary: [governance.headline, ...governance.details].join('. '),
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
  const channelName =
    args.session?.roundtableChannelName ?? args.runtime?.roundtableChannelName ?? null
  const summary =
    args.session?.lastSummary ??
    args.runtime?.lastSummary ??
    args.session?.lastError ??
    args.runtime?.lastError ??
    'Roundtable runtime updated through the supervised OpenJaws execution lane.'

  return createEntry({
    id: `roundtable-${status}-${timestamp ?? 'latest'}`,
    timestamp,
    title: 'Roundtable runtime',
    summary: `Roundtable is ${status}${channelName ? ` in #${channelName}` : ''}. ${summary}`,
    kind: 'roundtable_runtime',
    status:
      status === 'error'
        ? 'failed'
        : status === 'running' || status === 'awaiting_approval' || status === 'queued'
          ? 'warning'
          : 'ok',
    source: 'OpenJaws roundtable lane',
    operatorActions: ['roundtable_runtime', 'immaculate_handoff'],
    subsystems: ['openjaws', 'immaculate', 'discord'],
    artifacts: ['roundtable:session'],
    tags: ['roundtable', 'bounded', 'supervised'],
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
  const hasFailure =
    args.entries.some(entry => entry.status === 'failed') ||
    args.qReceipt?.status === 'error'
  const hasWarning =
    !hasFailure &&
    (
      args.entries.length === 0 ||
      args.entries.some(entry => entry.status === 'warning') ||
      (args.qReceipt ? args.qReceipt.gateway.connected !== true : true)
    )

  const status = hasFailure ? 'failed' : hasWarning ? 'warning' : 'ok'
  const summary = hasFailure
    ? 'Supervised OpenJaws audit surfaces currently show at least one failed runtime signal. Public status remains redacted and bounded.'
    : hasWarning
      ? 'Supervised OpenJaws audit surfaces are live but still show bounded warnings or incomplete runtime coverage.'
      : 'Supervised OpenJaws audit surfaces are live and bounded across Discord, Q, roundtable, and orchestration traces.'

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
  const apexGovernanceEntry = buildApexTenantGovernanceEntry(
    readStoredApexTenantGovernanceSummary(root),
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

  const entries = [
    qEntry,
    ...agentEntries,
    apexGovernanceEntry,
    ...apexOperatorActivityEntries,
    nysusAgentActivityEntry,
    roundtableEntry,
    actionabilityEntry,
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
          title: 'Q reasoning trace',
          source: 'Q trace',
          kind: 'q_trace',
          runState: qTrace.runState,
          sessionId: qTrace.sessionId,
          eventCount: qTrace.eventCount,
          timestamp: qTrace.lastTimestamp ?? qTrace.endedAt ?? qTrace.startedAt,
          summaryPrefix: 'Q',
          operatorActions: ['q_reasoning_trace', 'model_trace'],
          subsystems: ['q', 'openjaws'],
          artifacts: ['q:trace-summary'],
          tags: ['q', 'trace', 'bounded'],
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
  mkdirSync(dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, `${JSON.stringify(feed, null, 2)}\n`, 'utf8')
  if (mirrorPath) {
    mkdirSync(dirname(mirrorPath), { recursive: true })
    writeFileSync(mirrorPath, `${JSON.stringify(feed, null, 2)}\n`, 'utf8')
  }
  return outputPath
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

  for (const args of queued) {
    try {
      syncPublicShowcaseActivityFromRoot(args)
    } catch {
      // Public showcase sync must never break the live operator loop.
    }
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

  if (flushScheduled) {
    return
  }
  flushScheduled = true
  queueMicrotask(flushQueuedPublicShowcaseActivitySyncs)
}
