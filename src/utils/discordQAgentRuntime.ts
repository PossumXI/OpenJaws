import { existsSync, readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'

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
    connected?: boolean
    voiceId?: string | null
    voiceIdSource?: string | null
    modelId?: string | null
    guildId?: string | null
    channelId?: string | null
    channelName?: string | null
    joinedAt?: string | null
    lastRenderedAt?: string | null
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

export function getDiscordQAgentReceiptPath(root = process.cwd()): string {
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
      connected: false,
      voiceId: args.voiceId ?? null,
      voiceIdSource: args.voiceIdSource ?? null,
      modelId: args.voiceModelId ?? null,
      guildId: null,
      channelId: null,
      channelName: null,
      joinedAt: null,
      lastRenderedAt: null,
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
  root = process.cwd(),
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
  root = process.cwd(),
) {
  const receiptPath = getDiscordQAgentReceiptPath(root)
  writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8')
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
