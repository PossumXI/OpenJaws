import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { buildRuntimeCoherenceReport } from '../src/immaculate/runtimeCoherence.js'
import { readLatestImmaculateTraceSummary } from '../src/immaculate/traceSummary.js'
import { readLatestQTraceSummary } from '../src/q/traceSummary.js'
import { readDiscordQAgentReceipt } from '../src/utils/discordQAgentRuntime.js'
import {
  loadDiscordRoundtableRuntimeState,
  readDiscordRoundtableSessionSnapshot,
} from '../src/utils/discordRoundtableRuntime.js'
import { getImmaculateHarnessStatus } from '../src/utils/immaculateHarness.js'
import { readQTrainingRouteQueue } from '../src/utils/qTraining.js'
import {
  type PersonaPlexProbeResult,
  probePersonaPlexRuntime,
} from './personaplex-probe.js'

type RuntimeCoherenceCliOptions = {
  json: boolean
}

type ProbeResult = {
  label: string
  url: string
  reachable: boolean
  status: string | null
  detail?: string | null
}

type DiscordProbeTarget = {
  label: string
  url: string
  receiptPath: string
}

type MinimalDiscordReceipt = {
  updatedAt?: string | null
  startedAt?: string | null
  status?: string | null
  gateway?: {
    connected?: boolean | null
    guildCount?: number | null
    readyAt?: string | null
    lastHeartbeatAt?: string | null
    lastCloseCode?: number | null
    lastError?: string | null
  } | null
}

const DISCORD_RECEIPT_FRESH_MS = 5 * 60 * 1000
const DISCORD_BLOCKED_RECEIPT_MAX_MS = 24 * 60 * 60 * 1000
const DISCORD_GATEWAY_CONFIG_CLOSE_CODES = new Set([1015, 4004, 4010, 4011, 4013, 4014])
const PERSONAPLEX_COHERENCE_TIMEOUT_MS = Math.max(
  1_000,
  Number.parseInt(process.env.PERSONAPLEX_COHERENCE_TIMEOUT_MS ?? '', 10) ||
    15_000,
)

const DISCORD_PROBE_DEFAULTS: Record<string, { envFile: string; port: number; receiptPath: string }> = {
  Q: {
    envFile: 'discord-q-agent.env.ps1',
    port: 8788,
    receiptPath: resolve('local-command-station', 'discord-q-agent-receipt.json'),
  },
  Viola: {
    envFile: 'discord-viola.env.ps1',
    port: 8789,
    receiptPath: resolve('local-command-station', 'bots', 'viola', 'discord-agent-receipt.json'),
  },
  Blackbeak: {
    envFile: 'discord-blackbeak.env.ps1',
    port: 8790,
    receiptPath: resolve(
      'local-command-station',
      'bots',
      'blackbeak',
      'discord-agent-receipt.json',
    ),
  },
}

export function parseArgs(argv: string[]): RuntimeCoherenceCliOptions {
  return {
    json: argv.includes('--json'),
  }
}

async function probeJsonHealth(
  label: string,
  url: string,
): Promise<ProbeResult> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(5_000),
    })
    const text = await response.text()
    const body = text.trim()
    let status: string | null = null
    let detail: string | null = null
    if (body) {
      try {
        const parsed = JSON.parse(body) as Record<string, unknown>
        status = typeof parsed.status === 'string' ? parsed.status : null
        detail =
          typeof parsed.gatewayLastError === 'string'
            ? parsed.gatewayLastError
            : typeof parsed.detail === 'string'
              ? parsed.detail
              : typeof parsed.lastError === 'string'
                ? parsed.lastError
                : null
      } catch {
        status = body
      }
    }
    return {
      label,
      url,
      reachable: response.ok,
      status,
      detail: response.ok ? detail : detail ?? `HTTP ${response.status}`,
    }
  } catch (error) {
    return {
      label,
      url,
      reachable: false,
      status: null,
      detail: error instanceof Error ? error.message : String(error),
    }
  }
}

export function buildPersonaPlexCoherenceProbe(
  result: PersonaPlexProbeResult,
): ProbeResult {
  return {
    label: 'PersonaPlex',
    url: result.websocketUrl,
    reachable: result.ready,
    status: result.ready ? null : result.status,
    detail: result.ready
      ? `${result.runtimeUrl} hello byte ${result.firstByte} in ${result.latencyMs}ms`
      : result.error ?? `probe status ${result.status}`,
  }
}

async function probePersonaPlexCoherence(): Promise<ProbeResult> {
  try {
    return buildPersonaPlexCoherenceProbe(
      await probePersonaPlexRuntime({
        json: true,
        timeoutMs: PERSONAPLEX_COHERENCE_TIMEOUT_MS,
        runtimeUrl: process.env.PERSONAPLEX_URL?.trim() || null,
        textPrompt:
          process.env.PERSONAPLEX_TEXT_PROMPT?.trim() ||
          process.env.PERSONAPLEX_PREWARM_TEXT_PROMPT?.trim() ||
          'You enjoy having a good conversation.',
        voicePrompt:
          process.env.PERSONAPLEX_VOICE_PROMPT?.trim() ||
          process.env.PERSONAPLEX_PREWARM_VOICE_PROMPT?.trim() ||
          'NATF2.pt',
      }),
    )
  } catch (error) {
    return {
      label: 'PersonaPlex',
      url: process.env.PERSONAPLEX_URL?.trim() || 'local PersonaPlex runtime',
      reachable: false,
      status: 'error',
      detail: error instanceof Error ? error.message : String(error),
    }
  }
}

function readDiscordEnvAssignment(envFilePath: string, key: string): string | null {
  if (!existsSync(envFilePath)) {
    return null
  }
  const source = readFileSync(envFilePath, 'utf8')
  const pattern = new RegExp(
    String.raw`^\s*\$env:${key}\s*=\s*['"]([^'"]+)['"]\s*$`,
    'm',
  )
  const match = source.match(pattern)
  return match?.[1]?.trim() || null
}

function resolveDiscordProbePort(root: string, label: string): number {
  const defaults = DISCORD_PROBE_DEFAULTS[label]
  if (!defaults) {
    throw new Error(`Unsupported Discord probe label: ${label}`)
  }
  const envFilePath = resolve(root, 'local-command-station', defaults.envFile)
  const configuredPort = Number.parseInt(
    readDiscordEnvAssignment(envFilePath, 'DISCORD_Q_AGENT_PORT') ?? '',
    10,
  )
  return Number.isFinite(configuredPort) && configuredPort > 0
    ? configuredPort
    : defaults.port
}

function resolveDiscordProbeReceiptPath(root: string, label: string): string {
  const defaults = DISCORD_PROBE_DEFAULTS[label]
  if (!defaults) {
    throw new Error(`Unsupported Discord probe label: ${label}`)
  }
  const envFilePath = resolve(root, 'local-command-station', defaults.envFile)
  const configuredReceiptPath = readDiscordEnvAssignment(
    envFilePath,
    'DISCORD_AGENT_RECEIPT_PATH',
  )
  if (!configuredReceiptPath) {
    return resolve(root, defaults.receiptPath)
  }
  return configuredReceiptPath
}

export function resolveDiscordProbeTarget(
  root: string,
  label: string,
): DiscordProbeTarget {
  const port = resolveDiscordProbePort(root, label)
  return {
    label,
    url: `http://127.0.0.1:${port}/health`,
    receiptPath: resolveDiscordProbeReceiptPath(root, label),
  }
}

function readMinimalDiscordReceipt(path: string): MinimalDiscordReceipt | null {
  if (!existsSync(path)) {
    return null
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as MinimalDiscordReceipt
  } catch {
    return null
  }
}

function isFreshDiscordReceipt(
  receipt: MinimalDiscordReceipt | null,
  now = Date.now(),
): receipt is MinimalDiscordReceipt {
  if (!receipt) {
    return false
  }
  return [
    receipt.updatedAt,
    receipt.gateway?.lastHeartbeatAt,
    receipt.gateway?.readyAt,
  ].some(timestamp => {
    const parsed = typeof timestamp === 'string' ? Date.parse(timestamp) : Number.NaN
    return Number.isFinite(parsed) && now - parsed <= DISCORD_RECEIPT_FRESH_MS
  })
}

function isRecentBlockedDiscordReceipt(
  receipt: MinimalDiscordReceipt | null,
  now = Date.now(),
): receipt is MinimalDiscordReceipt {
  if (!receipt || receipt.status !== 'error') {
    return false
  }
  const closeCode = receipt.gateway?.lastCloseCode
  if (typeof closeCode !== 'number' || !DISCORD_GATEWAY_CONFIG_CLOSE_CODES.has(closeCode)) {
    return false
  }
  const updatedAt = typeof receipt.updatedAt === 'string'
    ? Date.parse(receipt.updatedAt)
    : Number.NaN
  if (!Number.isFinite(updatedAt)) {
    return false
  }
  return now - updatedAt <= DISCORD_BLOCKED_RECEIPT_MAX_MS
}

export function buildDiscordProbeFallback(
  target: DiscordProbeTarget,
): ProbeResult | null {
  const receipt = readMinimalDiscordReceipt(target.receiptPath)
  const fresh = isFreshDiscordReceipt(receipt)
  const recentlyBlocked = isRecentBlockedDiscordReceipt(receipt)
  if (!fresh && !recentlyBlocked) {
    return null
  }
  const receiptStatus = receipt.status ?? 'unknown'
  const gatewayConnected = receipt.gateway?.connected === true
  if (receiptStatus !== 'ready' || !gatewayConnected) {
    const detailParts = [
      receipt.gateway?.lastError,
      typeof receipt.gateway?.lastCloseCode === 'number'
        ? `gateway close ${receipt.gateway.lastCloseCode}`
        : null,
      `fresh receipt ${receipt.updatedAt}`,
    ].filter((part): part is string => Boolean(part))
    return {
      label: target.label,
      url: target.receiptPath,
      reachable: true,
      status:
        receiptStatus === 'error'
          ? recentlyBlocked && !fresh
            ? 'blocked'
            : 'error'
          : `receipt_${receiptStatus}`,
      detail: [
        ...detailParts,
        recentlyBlocked && !fresh ? 'stale non-retryable receipt retained for diagnosis' : null,
      ].filter((part): part is string => Boolean(part)).join(' · '),
    }
  }

  return {
    label: target.label,
    url: target.receiptPath,
    reachable: true,
    status: `receipt_ready:${receipt.gateway?.guildCount ?? 0}`,
    detail: `fresh receipt ${receipt.updatedAt}`,
  }
}

function isLiveRoundtableSessionStatus(status: string | null | undefined): boolean {
  return status === 'running' || status === 'queued' || status === 'awaiting_approval'
}

export function readRoundtableState(root: string) {
  const statePath = resolve(root, 'local-command-station', 'roundtable-runtime')
  if (!existsSync(statePath)) {
    return null
  }
  const parsed = loadDiscordRoundtableRuntimeState(root)
  const session = readDiscordRoundtableSessionSnapshot(root)
  const queueStatus = parsed.status?.toLowerCase() ?? null
  const preferSession =
    session &&
    isLiveRoundtableSessionStatus(session.status) &&
    (queueStatus === 'idle' || queueStatus === 'completed')
  const lastSummary =
    preferSession && parsed.status !== session.status
      ? `Conversation session is ${session.status}; governed queue is ${parsed.status}. ${
          parsed.lastSummary ?? session.lastSummary ?? ''
        }`.trim()
      : parsed.lastSummary
  return {
    status: preferSession ? session.status : parsed.status,
    updatedAt: preferSession ? session.updatedAt : parsed.updatedAt,
    channelName: session?.roundtableChannelName ?? parsed.roundtableChannelName,
    lastSummary,
    lastError: parsed.lastError,
  }
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const options = parseArgs(argv)
  const root = process.cwd()
  const harnessStatus = await getImmaculateHarnessStatus()
  const probeTargets = ['Q', 'Viola', 'Blackbeak'].map(label =>
    resolveDiscordProbeTarget(root, label),
  )
  const [rawProbes, personaPlexProbe] = await Promise.all([
    Promise.all(
      probeTargets.map(target => probeJsonHealth(target.label, target.url)),
    ),
    probePersonaPlexCoherence(),
  ])
  const probes = rawProbes.map((probe, index) => {
    if (probe.reachable) {
      return probe
    }
    return buildDiscordProbeFallback(probeTargets[index]!) ?? probe
  })
  const report = buildRuntimeCoherenceReport({
    harnessStatus,
    qAgentReceipt: readDiscordQAgentReceipt(root),
    immaculateTrace: readLatestImmaculateTraceSummary(root),
    qTrace: readLatestQTraceSummary(root),
    routeQueueDepth: readQTrainingRouteQueue(root).length,
    roundtable: readRoundtableState(root),
    probes: [...probes, personaPlexProbe],
  })

  const output = options.json
    ? JSON.stringify(report, null, 2)
    : [report.summary, ...report.checks.map(check => {
        const detail = check.detail ? ` · ${check.detail}` : ''
        return `- [${check.status}] ${check.id}: ${check.summary}${detail}`
      })].join('\n')

  console.log(output)
  return report.status === 'failed' ? 1 : 0
}

if (import.meta.main) {
  const exitCode = await main()
  process.exit(exitCode)
}
