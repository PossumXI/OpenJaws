import { existsSync, readFileSync, writeFileSync } from 'fs'
import { basename, dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { queuePublicShowcaseActivitySync } from './publicShowcaseActivity.js'

export type DiscordQAgentRoutePolicy = {
  id: 'command_station' | 'updates' | 'training'
  label: string
  channelNames: string[]
  purpose: string
  cooldownMs: number
  voiceEnabled: boolean
}

export type DiscordQAgentRouteState = DiscordQAgentRoutePolicy & {
  lastPostedAt?: string | null
  lastVoicePostedAt?: string | null
  lastReason?: string | null
  lastSummary?: string | null
}

export type DiscordQAgentEvent = {
  at: string
  status: string
  summary: string
  channelId?: string | null
  channelName?: string | null
}

export type DiscordQAgentPatrolSnapshot = {
  harnessReachable: boolean
  harnessSummary: string
  deckSummary: string | null
  workerSummary: string | null
  trainingSummary: string | null
  hybridSummary: string | null
  routeQueueSummary: string | null
  queueLength: number
  recommendedLayerId?: string | null
}

export type DiscordQAgentKnowledgeState = {
  enabled: boolean
  ready: boolean
  rootLabel?: string | null
  generatedAt?: string | null
  fileCount: number
  chunkCount: number
  lastQueryAt?: string | null
  lastQuerySummary?: string | null
  lastError?: string | null
}

export type DiscordQAgentOperatorState = {
  operatorLabel?: string | null
  lastAction?: string | null
  lastCompletedAt?: string | null
  lastSummary?: string | null
  lastError?: string | null
  activeProcessPid?: number | null
  activeProcessCwd?: string | null
  activeProcessStartedAt?: string | null
}

export type DiscordQAgentReceipt = {
  version: 1
  updatedAt: string
  startedAt: string
  status: 'starting' | 'ready' | 'error'
  backend: string
  guilds: Array<{
    id: string
    name: string | null
  }>
  gateway: {
    connected: boolean
    userId?: string | null
    readyAt?: string | null
    lastHeartbeatAt?: string | null
    lastSequence?: number | null
    guildCount: number
    lastMessageAt?: string | null
    lastReplyAt?: string | null
    lastClosedAt?: string | null
    lastCloseCode?: number | null
    lastError?: string | null
  }
  schedule: {
    enabled: boolean
    intervalMs: number
    cycleCount: number
    lastStartedAt?: string | null
    lastCompletedAt?: string | null
    nextRunAt?: string | null
    lastSummary?: string | null
    lastError?: string | null
  }
  routing: {
    lastDecision?: string | null
    lastPostedChannelName?: string | null
    lastPostedReason?: string | null
    channels: DiscordQAgentRouteState[]
  }
  voice: {
    enabled: boolean
    provider: 'off' | 'elevenlabs' | 'system' | 'personaplex'
    ready: boolean
    stagedProvider?: string | null
    stagedReady?: boolean
    stagedSummary?: string | null
    runtimeUrl?: string | null
    renderProvider?: string | null
    renderSummary?: string | null
    connected?: boolean
    voiceId?: string | null
    voiceIdSource?: string | null
    modelId?: string | null
    guildId?: string | null
    channelId?: string | null
    channelName?: string | null
    joinedAt?: string | null
    lastRenderedAt?: string | null
    lastRenderProvider?: string | null
    lastRenderSummary?: string | null
    lastSpokenText?: string | null
    lastChannelName?: string | null
    lastHeardUserId?: string | null
    lastHeardAt?: string | null
    lastTranscriptSummary?: string | null
    lastError?: string | null
  }
  patrol: {
    lastStartedAt?: string | null
    lastCompletedAt?: string | null
    lastSummary?: string | null
    lastError?: string | null
    snapshot?: DiscordQAgentPatrolSnapshot | null
  }
  knowledge: DiscordQAgentKnowledgeState
  operator: DiscordQAgentOperatorState
  events: DiscordQAgentEvent[]
}

const MAX_DISCORD_Q_AGENT_EVENTS = 25
const OPENJAWS_REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

function humanizeDiscordOperatorAction(
  action: string | null | undefined,
): string | null {
  const normalized = action?.trim().toLowerCase()
  if (!normalized) {
    return null
  }
  switch (normalized) {
    case 'start-openjaws':
      return 'opening a bounded OpenJaws workspace'
    case 'ask-openjaws':
      return 'executing a bounded OpenJaws task'
    case 'ask-github-openjaws':
      return 'preparing a remote GitHub execution handoff'
    case 'confirm-push':
      return 'preparing a reviewed branch push'
    case 'roundtable-status':
      return 'auditing the governed roundtable queue'
    case 'pending-pushes':
      return 'reviewing bounded branch approvals'
    case 'workspaces':
      return 'reviewing supervised workspaces'
    case 'github-status':
      return 'checking GitHub execution readiness'
    case 'openjaws-status':
      return 'checking OpenJaws operator health'
    case 'stop-openjaws':
      return 'closing a bounded OpenJaws workspace'
    default:
      return `handling ${normalized.replace(/[-_]+/g, ' ')}`
  }
}

function resolveDiscordOperatorScope(
  cwd: string | null | undefined,
): string | null {
  const normalized = cwd?.trim()
  if (!normalized) {
    return null
  }
  const lower = normalized.replace(/\//g, '\\').toLowerCase()
  const mappings: Array<[string, string]> = [
    ['\\desktop\\cheeks\\asgard\\ignite\\apex-os-project\\apps', 'Apex apps'],
    ['\\desktop\\cheeks\\asgard', 'Asgard'],
    ['\\desktop\\immaculate', 'Immaculate'],
    ['\\openjaws\\openjaws', 'OpenJaws'],
    ['\\desktop\\sealed', 'SEALED'],
  ]
  for (const [pattern, label] of mappings) {
    if (lower.includes(pattern)) {
      return label
    }
  }
  const fallback = basename(normalized.replace(/[\\/]+$/, ''))
  return fallback.length > 0 ? fallback : null
}

function trimDiscordReceiptLine(value: string, limit = 160): string {
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value
}

const PUBLIC_SHOWCASE_OPERATOR_LINE =
  'The public view shows what happened, when it happened, and which systems participated, while sensitive actions and protected records stay private.'

function isLegacyPublicShowcaseOperatorLine(value: string): boolean {
  const normalized = value.toLowerCase()
  return (
    normalized.includes('#dev_support') ||
    normalized.includes('bounded action receipts') ||
    normalized.includes('2/3 bot receipts') ||
    normalized.includes('no active bounded task') ||
    normalized.includes('q patrol is ready; roundtable is ready')
  )
}

function normalizeDiscordReceiptTimestamp(
  value: string | null | undefined,
): string | null {
  const normalized = value?.trim()
  if (!normalized) {
    return null
  }
  const parsed = Date.parse(normalized)
  if (!Number.isFinite(parsed)) {
    return null
  }
  return new Date(parsed).toISOString()
}

function normalizeDiscordPublicOperatorLine(
  value: unknown,
): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (isLegacyPublicShowcaseOperatorLine(normalized)) {
    return PUBLIC_SHOWCASE_OPERATOR_LINE
  }
  return normalized.length > 0 ? normalized : null
}

function isAggregateControlledOperatorLine(
  value: string | null | undefined,
): boolean {
  const normalized = value?.trim().toLowerCase()
  if (!normalized) {
    return false
  }
  return (
    normalized.includes('public-safe aggregate publication verified') ||
    normalized.includes('bounded action receipts') ||
    normalized.includes('q patrol is ready') ||
    normalized.includes('roundtable is ready') ||
    normalized.includes('operator state is ready') ||
    normalized.includes('discord transport is ready') ||
    normalized.includes('bot receipts are ready') ||
    normalized.includes('oci-backed q is ready') ||
    normalized.includes('redacted proof loop') ||
    normalized.includes('asgard showcase fleet') ||
    normalized.includes('private routes') ||
    normalized.includes('the public view shows what happened')
  )
}

export function buildDiscordQAgentPublicOperatorLine(
  receipt: DiscordQAgentReceipt,
): string | null {
  const action = humanizeDiscordOperatorAction(receipt.operator.lastAction)
  const scope = resolveDiscordOperatorScope(receipt.operator.activeProcessCwd)
  if (action) {
    return trimDiscordReceiptLine(
      [
        'Q is',
        action,
        scope ? `in ${scope}` : null,
        'through the supervised OCI-backed Discord operator lane.',
      ]
        .filter(Boolean)
        .join(' '),
    )
  }
  if (receipt.gateway.connected) {
    return 'Q is online through the supervised OCI-backed Discord operator lane and posts only when a high-value public update is ready.'
  }
  return null
}

export function resolveDiscordQAgentPublicShowcaseStatusMetadata(args: {
  receipt: DiscordQAgentReceipt
  currentShowcase?: Record<string, unknown> | null
}): {
  operatorLine: string | null
  operatorUpdatedAt: string | null
} {
  const nextLine = buildDiscordQAgentPublicOperatorLine(args.receipt)
  const nextUpdatedAt =
    normalizeDiscordReceiptTimestamp(
      args.receipt.operator.lastCompletedAt ??
        args.receipt.updatedAt ??
        new Date().toISOString(),
    ) ?? new Date().toISOString()
  const currentLine = normalizeDiscordPublicOperatorLine(
    args.currentShowcase?.operatorLine,
  )
  const currentSummary = normalizeDiscordPublicOperatorLine(
    args.currentShowcase?.summary,
  )
  const currentUpdatedAt = normalizeDiscordReceiptTimestamp(
    typeof args.currentShowcase?.operatorUpdatedAt === 'string'
      ? args.currentShowcase.operatorUpdatedAt
      : null,
  )
  const preservedAggregateLine =
    (currentLine && isAggregateControlledOperatorLine(currentLine)
      ? currentLine
      : null) ??
    (currentSummary && isAggregateControlledOperatorLine(currentSummary)
      ? currentSummary
      : null)

  if (
    !args.receipt.operator.lastAction &&
    preservedAggregateLine
  ) {
    return {
      operatorLine: preservedAggregateLine,
      operatorUpdatedAt: currentUpdatedAt ?? nextUpdatedAt,
    }
  }

  if (nextLine) {
    return {
      operatorLine: nextLine,
      operatorUpdatedAt: nextUpdatedAt,
    }
  }

  return {
    operatorLine: currentLine,
    operatorUpdatedAt: currentUpdatedAt ?? nextUpdatedAt,
  }
}

export function buildDiscordQAgentPublicShowcaseActivityEntry(
  receipt: DiscordQAgentReceipt,
): {
  id: string
  timestamp: string | null
  title: string
  summary: string
  kind: string
  source: string
  tags: string[]
} | null {
  if (receipt.operator.lastAction) {
    const summary = buildDiscordQAgentPublicOperatorLine(receipt)
    if (!summary) {
      return null
    }
    const timestamp =
      receipt.operator.lastCompletedAt ??
      receipt.operator.activeProcessStartedAt ??
      receipt.updatedAt
    const scope = resolveDiscordOperatorScope(receipt.operator.activeProcessCwd)
    const tags = ['q', 'discord', 'openjaws', 'bounded']
    if (scope) {
      tags.push(scope.toLowerCase().replace(/\s+/g, '-'))
    }
    return {
      id: `discord-q-operator-${receipt.operator.lastAction}-${timestamp ?? 'latest'}`,
      timestamp,
      title: 'Supervised Q operator activity',
      summary,
      kind: 'operator',
      source: 'OpenJaws Discord lane',
      tags,
    }
  }
  if (receipt.gateway.connected && (receipt.routing.lastDecision || receipt.patrol.lastSummary)) {
    const timestamp =
      receipt.schedule.lastCompletedAt ??
      receipt.patrol.lastCompletedAt ??
      receipt.updatedAt
    return {
      id: `discord-q-patrol-${timestamp ?? 'latest'}`,
      timestamp,
      title: 'Supervised Q patrol update',
      summary:
        'Q is online through the supervised OCI-backed Discord operator lane and is publishing bounded status updates without opening the sealed 00 lane.',
      kind: 'patrol',
      source: 'OpenJaws Discord lane',
      tags: ['q', 'discord', 'status', 'bounded'],
    }
  }
  return null
}

export function getDiscordQAgentReceiptPath(root = OPENJAWS_REPO_ROOT): string {
  return resolve(root, 'local-command-station', 'discord-q-agent-receipt.json')
}

export function getDiscordQAgentRoutePolicies(): DiscordQAgentRoutePolicy[] {
  return [
    {
      id: 'command_station',
      label: 'Q command station',
      channelNames: ['q-command-station'],
      purpose: 'operator patrols, crew dispatch, and spoken Q digests',
      cooldownMs: 30 * 60_000,
      voiceEnabled: true,
    },
    {
      id: 'updates',
      label: 'OpenJaws updates',
      channelNames: ['openjaws-updates'],
      purpose: 'Immaculate and server-side operational updates',
      cooldownMs: 20 * 60_000,
      voiceEnabled: false,
    },
    {
      id: 'training',
      label: 'Q training lab',
      channelNames: ['q-training-lab'],
      purpose: 'Q training, hybrid, and route queue receipts',
      cooldownMs: 10 * 60_000,
      voiceEnabled: false,
    },
  ]
}

function cloneRoutePolicies(): DiscordQAgentRouteState[] {
  return getDiscordQAgentRoutePolicies().map(policy => ({ ...policy }))
}

function normalizeDiscordQAgentReceipt(
  value: unknown,
): DiscordQAgentReceipt | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  const record = value as Record<string, unknown>
  const scheduleRecord =
    record.schedule && typeof record.schedule === 'object' && !Array.isArray(record.schedule)
      ? (record.schedule as Record<string, unknown>)
      : {}
  const voiceRecord =
    record.voice && typeof record.voice === 'object' && !Array.isArray(record.voice)
      ? (record.voice as Record<string, unknown>)
      : {}
  const routingRecord =
    record.routing && typeof record.routing === 'object' && !Array.isArray(record.routing)
      ? (record.routing as Record<string, unknown>)
      : {}
  const base = createDiscordQAgentReceipt({
    backend:
      typeof record.backend === 'string' ? record.backend : 'Q backend unavailable',
    scheduleEnabled:
      typeof scheduleRecord.enabled === 'boolean' ? scheduleRecord.enabled : false,
    scheduleIntervalMs:
      typeof scheduleRecord.intervalMs === 'number' ? scheduleRecord.intervalMs : 0,
    voiceEnabled:
      typeof voiceRecord.enabled === 'boolean' ? voiceRecord.enabled : false,
    voiceReady:
      typeof voiceRecord.ready === 'boolean' ? voiceRecord.ready : false,
    voiceProvider:
      typeof voiceRecord.provider === 'string'
        ? (voiceRecord.provider as DiscordQAgentReceipt['voice']['provider'])
        : undefined,
    voiceId:
      typeof voiceRecord.voiceId === 'string' ? voiceRecord.voiceId : null,
    voiceIdSource:
      typeof voiceRecord.voiceIdSource === 'string'
        ? voiceRecord.voiceIdSource
        : null,
    voiceModelId:
      typeof voiceRecord.modelId === 'string' ? voiceRecord.modelId : null,
  })

  return {
    ...base,
    ...record,
    gateway: {
      ...base.gateway,
      ...((record.gateway as Record<string, unknown> | undefined) ?? {}),
    },
    schedule: {
      ...base.schedule,
      ...scheduleRecord,
    },
    routing: {
      ...base.routing,
      ...routingRecord,
      channels: Array.isArray(routingRecord.channels)
        ? (routingRecord.channels as DiscordQAgentRouteState[])
        : base.routing.channels,
    },
    voice: {
      ...base.voice,
      ...voiceRecord,
    },
    patrol: {
      ...base.patrol,
      ...((record.patrol as Record<string, unknown> | undefined) ?? {}),
    },
    knowledge: {
      ...base.knowledge,
      ...((record.knowledge as Record<string, unknown> | undefined) ?? {}),
    },
    operator: {
      ...base.operator,
      ...((record.operator as Record<string, unknown> | undefined) ?? {}),
    },
    guilds: Array.isArray(record.guilds)
      ? (record.guilds as DiscordQAgentReceipt['guilds'])
      : [],
    events: Array.isArray(record.events)
      ? (record.events as DiscordQAgentEvent[])
      : [],
  }
}

export function createDiscordQAgentReceipt(args: {
  backend: string
  scheduleEnabled: boolean
  scheduleIntervalMs: number
  voiceEnabled: boolean
  voiceReady: boolean
  voiceProvider?: DiscordQAgentReceipt['voice']['provider']
  voiceId?: string | null
  voiceIdSource?: string | null
  voiceModelId?: string | null
  voiceRenderProvider?: string | null
  voiceRenderSummary?: string | null
}): DiscordQAgentReceipt {
  const now = new Date().toISOString()
  return {
    version: 1,
    updatedAt: now,
    startedAt: now,
    status: 'starting',
    backend: args.backend,
    guilds: [],
    gateway: {
      connected: false,
      userId: null,
      guildCount: 0,
      lastSequence: null,
      lastClosedAt: null,
      lastCloseCode: null,
      lastError: null,
    },
    schedule: {
      enabled: args.scheduleEnabled,
      intervalMs: args.scheduleIntervalMs,
      cycleCount: 0,
      nextRunAt: null,
      lastSummary: null,
      lastError: null,
    },
    routing: {
      lastDecision: null,
      lastPostedChannelName: null,
      lastPostedReason: null,
      channels: cloneRoutePolicies(),
    },
    voice: {
      enabled: args.voiceEnabled,
      provider: args.voiceEnabled ? args.voiceProvider ?? 'elevenlabs' : 'off',
      ready: args.voiceReady,
      stagedProvider: null,
      stagedReady: false,
      stagedSummary: null,
      runtimeUrl: null,
      renderProvider: args.voiceRenderProvider ?? null,
      renderSummary: args.voiceRenderSummary ?? null,
      connected: false,
      voiceId: args.voiceId ?? null,
      voiceIdSource: args.voiceIdSource ?? null,
      modelId: args.voiceModelId ?? null,
      guildId: null,
      channelId: null,
      channelName: null,
      joinedAt: null,
      lastRenderedAt: null,
      lastRenderProvider: null,
      lastRenderSummary: null,
      lastSpokenText: null,
      lastChannelName: null,
      lastHeardUserId: null,
      lastHeardAt: null,
      lastTranscriptSummary: null,
      lastError: null,
    },
    patrol: {
      lastStartedAt: null,
      lastCompletedAt: null,
      lastSummary: null,
      lastError: null,
      snapshot: null,
    },
    knowledge: {
      enabled: false,
      ready: false,
      rootLabel: null,
      generatedAt: null,
      fileCount: 0,
      chunkCount: 0,
      lastQueryAt: null,
      lastQuerySummary: null,
      lastError: null,
    },
    operator: {
      operatorLabel: null,
      lastAction: null,
      lastCompletedAt: null,
      lastSummary: null,
      lastError: null,
      activeProcessPid: null,
      activeProcessCwd: null,
      activeProcessStartedAt: null,
    },
    events: [],
  }
}

export function readDiscordQAgentReceipt(
  root = OPENJAWS_REPO_ROOT,
): DiscordQAgentReceipt | null {
  const receiptPath = getDiscordQAgentReceiptPath(root)
  if (!existsSync(receiptPath)) {
    return null
  }
  return normalizeDiscordQAgentReceipt(
    JSON.parse(readFileSync(receiptPath, 'utf8')),
  )
}

export function writeDiscordQAgentReceipt(
  receipt: DiscordQAgentReceipt,
  root = OPENJAWS_REPO_ROOT,
) {
  const receiptPath = getDiscordQAgentReceiptPath(root)
  writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8')
  queuePublicShowcaseActivitySync({
    root,
    qAgentReceipt: receipt,
    qEntry: buildDiscordQAgentPublicShowcaseActivityEntry(receipt),
  })
}

export function recordDiscordQAgentEvent(
  receipt: DiscordQAgentReceipt,
  event: DiscordQAgentEvent,
) {
  receipt.updatedAt = event.at
  receipt.events = [event, ...receipt.events].slice(0, MAX_DISCORD_Q_AGENT_EVENTS)
}

export function upsertDiscordQAgentRouteState(
  receipt: DiscordQAgentReceipt,
  routeId: DiscordQAgentRouteState['id'],
  patch: Partial<DiscordQAgentRouteState>,
) {
  receipt.routing.channels = receipt.routing.channels.map(route =>
    route.id === routeId ? { ...route, ...patch } : route,
  )
}
