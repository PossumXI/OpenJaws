import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join, resolve } from 'path'
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
}

const MAX_PUBLIC_SHOWCASE_ACTIVITY_ENTRIES = 8
const pendingSyncs = new Map<string, PublicShowcaseActivitySyncArgs>()
let flushScheduled = false

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
    subsystems: uniqueStrings(args.subsystems ?? []),
    artifacts: uniqueStrings(args.artifacts ?? []),
    tags: uniqueStrings(args.tags ?? []),
  }
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

function readStoredDiscordQAgentReceipt(root: string): DiscordQAgentReceipt | null {
  const receiptPath = resolve(root, 'local-command-station', 'discord-q-agent-receipt.json')
  const parsed = readJsonFile(receiptPath)
  return parsed ? (parsed as unknown as DiscordQAgentReceipt) : null
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

function buildFallbackQEntry(receipt: DiscordQAgentReceipt): PublicShowcaseActivityEntry | null {
  if (!receipt.gateway.connected && !receipt.operator.lastAction && !receipt.patrol.lastSummary) {
    return null
  }

  const timestamp =
    receipt.operator.lastCompletedAt ??
    receipt.schedule.lastCompletedAt ??
    receipt.patrol.lastCompletedAt ??
    receipt.updatedAt
  const operatorLine = receipt.operator.lastAction
    ? `Q is ${sanitizeInlineText(receipt.operator.lastAction?.replace(/[-_]+/g, ' '), 72)} through the supervised Discord/OpenJaws lane.`
    : null
  const patrolLine = sanitizeInlineText(
    receipt.operator.lastSummary ??
      receipt.patrol.lastSummary ??
      receipt.schedule.lastSummary ??
      (receipt.gateway.connected
        ? 'Q Discord runtime is online through the supervised bounded operator lane.'
        : 'Q Discord runtime is currently offline on the supervised bounded operator lane.'),
    220,
  )

  return createEntry({
    id: `discord-q-${timestamp ?? 'latest'}`,
    timestamp,
    title: receipt.operator.lastAction
      ? 'Supervised Q operator activity'
      : 'Supervised Q patrol update',
    summary: [operatorLine, patrolLine].filter(Boolean).join(' '),
    kind: receipt.operator.lastAction ? 'operator' : 'patrol',
    status:
      receipt.status === 'error'
        ? 'failed'
        : receipt.gateway.connected
          ? 'ok'
          : 'warning',
    source: 'OpenJaws Discord lane',
    subsystems: ['openjaws', 'q', 'discord'],
    artifacts: ['discord:q-agent-receipt'],
    tags: ['q', 'discord', 'openjaws', 'bounded'],
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
    subsystems: uniqueStrings([
      'openjaws',
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
  const qReceipt = args.qAgentReceipt ?? readStoredDiscordQAgentReceipt(root)
  const qEntry = args.qEntry ?? (qReceipt ? buildFallbackQEntry(qReceipt) : null)
  const roundtableSession = args.roundtableSession ?? readStoredRoundtableSession(root)
  const roundtableRuntime = args.roundtableRuntime ?? readStoredRoundtableRuntime(root)
  const roundtableEntry = buildRoundtableEntry({
    session: roundtableSession,
    runtime: roundtableRuntime,
  })
  const immaculateTrace = readLatestImmaculateTraceSummary(root)
  const qTrace = readLatestQTraceSummary(root)

  const entries = [
    qEntry,
    roundtableEntry,
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
): string {
  mkdirSync(dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, `${JSON.stringify(feed, null, 2)}\n`, 'utf8')
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
  writePublicShowcaseActivityFeed(feed)
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
  })

  if (flushScheduled) {
    return
  }
  flushScheduled = true
  queueMicrotask(flushQueuedPublicShowcaseActivitySyncs)
}
