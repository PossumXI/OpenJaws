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
    provider: 'off' | 'elevenlabs'
    ready: boolean
    voiceId?: string | null
    voiceIdSource?: string | null
    modelId?: string | null
    lastRenderedAt?: string | null
    lastSpokenText?: string | null
    lastChannelName?: string | null
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

export function createDiscordQAgentReceipt(args: {
  backend: string
  scheduleEnabled: boolean
  scheduleIntervalMs: number
  voiceEnabled: boolean
  voiceReady: boolean
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
      provider: args.voiceEnabled ? 'elevenlabs' : 'off',
      ready: args.voiceReady,
      voiceId: args.voiceId ?? null,
      voiceIdSource: args.voiceIdSource ?? null,
      modelId: args.voiceModelId ?? null,
      lastRenderedAt: null,
      lastSpokenText: null,
      lastChannelName: null,
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
  return JSON.parse(readFileSync(receiptPath, 'utf8')) as DiscordQAgentReceipt
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
