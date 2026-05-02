import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { buildRuntimeCoherenceReport } from '../src/immaculate/runtimeCoherence.js'
import { readLatestImmaculateTraceSummary } from '../src/immaculate/traceSummary.js'
import { readLatestQTraceSummary } from '../src/q/traceSummary.js'
import { readDiscordQAgentReceipt } from '../src/utils/discordQAgentRuntime.js'
import { readDiscordRoundtableSessionSnapshot } from '../src/utils/discordRoundtableRuntime.js'
import {
  getImmaculateHarnessIntelligenceStatus,
  getImmaculateHarnessStatus,
} from '../src/utils/immaculateHarness.js'
import {
  APEX_BROWSER_API_URL,
  APEX_CHRONO_API_URL,
  APEX_WORKSPACE_API_URL,
  getApexBrowserHealth,
  getApexChronoHealth,
  getApexWorkspaceHealth,
  probeApexLocalHealth,
  type ApexWorkspaceHealth,
} from '../src/utils/apexWorkspace.js'
import { readQTrainingRouteQueue } from '../src/utils/qTraining.js'
import {
  type PersonaPlexProbeResult,
  probePersonaPlexRuntime,
  redactPersonaPlexProbeWebSocketUrl,
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

type ApexBridgeProbeDefinition = {
  label: string
  url: string
  getHealth: () => Promise<ApexWorkspaceHealth | null>
  getListenerHealth: () => Promise<ApexWorkspaceHealth | null>
}

type RoundtableLaunchState = {
  pid?: number | null
  startedAt?: string | null
}

const APEX_BRIDGE_PROBES: ApexBridgeProbeDefinition[] = [
  {
    label: 'Apex workspace bridge',
    url: APEX_WORKSPACE_API_URL,
    getHealth: getApexWorkspaceHealth,
    getListenerHealth: () => probeApexLocalHealth(APEX_WORKSPACE_API_URL),
  },
  {
    label: 'Apex Chrono bridge',
    url: APEX_CHRONO_API_URL,
    getHealth: getApexChronoHealth,
    getListenerHealth: () => probeApexLocalHealth(APEX_CHRONO_API_URL),
  },
  {
    label: 'Apex browser bridge',
    url: APEX_BROWSER_API_URL,
    getHealth: getApexBrowserHealth,
    getListenerHealth: () => probeApexLocalHealth(APEX_BROWSER_API_URL),
  },
]

const PERSONAPLEX_COHERENCE_TIMEOUT_MS = Math.max(
  1_000,
  Number.parseInt(process.env.PERSONAPLEX_COHERENCE_TIMEOUT_MS ?? '', 10) ||
    15_000,
)

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

export function buildApexBridgeCoherenceProbe(
  label: string,
  url: string,
  health: ApexWorkspaceHealth | null,
  listenerHealth: ApexWorkspaceHealth | null = null,
): ProbeResult {
  const healthDetail = (value: ApexWorkspaceHealth) =>
    `${value.service} ${value.version} · ${value.timestamp}`
  return {
    label,
    url,
    reachable: Boolean(health),
    status: health?.status ?? null,
    detail: health
      ? healthDetail(health)
      : listenerHealth
        ? `${healthDetail(listenerHealth)} answered locally, but it is not trusted by this OpenJaws session. Stop the listener or set OPENJAWS_APEX_TRUST_LOCALHOST=1 when you intentionally want to trust an already-running local bridge.`
        : 'Bridge did not answer its local health contract. Run `bun run apex:bridges:start` from a current OpenJaws checkout to attempt a guarded launch.',
  }
}

export function buildPersonaPlexCoherenceProbe(
  result: PersonaPlexProbeResult,
): ProbeResult {
  const repairDetail =
    result.repair.status === 'ready' ? null : result.repair.summary
  const missingDetail =
    result.repair.missing.length > 0
      ? `missing local launcher: ${result.repair.missing.join(', ')}`
      : null
  const warningDetail =
    result.repair.warnings.length > 0
      ? result.repair.warnings.join(' | ')
      : null
  const nextActionDetail =
    result.repair.nextActions.length > 0
      ? `next action: ${result.repair.nextActions[0]}`
      : null
  return {
    label: 'PersonaPlex',
    url: redactPersonaPlexProbeWebSocketUrl(result.websocketUrl),
    reachable: result.ready,
    status: result.ready ? null : result.status,
    detail: result.ready
      ? `${result.runtimeUrl} hello byte ${result.firstByte} in ${result.latencyMs}ms`
      : [
          result.error ?? `probe status ${result.status}`,
          repairDetail,
          missingDetail,
          warningDetail,
          nextActionDetail,
        ].filter((part): part is string => Boolean(part)).join(' | '),
  }
}

async function probePersonaPlexCoherence(): Promise<ProbeResult> {
  try {
    return buildPersonaPlexCoherenceProbe(
      await probePersonaPlexRuntime({
        json: true,
        allowRemote:
          process.env.PERSONAPLEX_ALLOW_REMOTE?.trim() === '1' ||
          process.env.PERSONAPLEX_ALLOW_REMOTE?.trim().toLowerCase() === 'true',
        timeoutMs: PERSONAPLEX_COHERENCE_TIMEOUT_MS,
        runtimeUrl: process.env.PERSONAPLEX_URL?.trim() || null,
        stationRoot:
          process.env.PERSONAPLEX_STATION_ROOT?.trim() ||
          process.env.OPENJAWS_LOCAL_COMMAND_STATION_ROOT?.trim() ||
          null,
        runtimeStatePath:
          process.env.PERSONAPLEX_RUNTIME_STATE_PATH?.trim() || null,
        launcherPath: process.env.PERSONAPLEX_LAUNCHER_PATH?.trim() || null,
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

async function probeApexBridgeCoherence(): Promise<ProbeResult[]> {
  return Promise.all(
    APEX_BRIDGE_PROBES.map(async probe =>
      buildApexBridgeCoherenceProbe(
        probe.label,
        probe.url,
        await probe.getHealth(),
        await probe.getListenerHealth(),
      ),
    ),
  )
}

export function readRoundtableState(root: string) {
  const runtimeDir = resolve(root, 'local-command-station', 'roundtable-runtime')
  if (!existsSync(runtimeDir)) {
    return null
  }
  const parsed = readDiscordRoundtableSessionSnapshot(root)
  if (!parsed) {
    return null
  }
  const launchState = readRoundtableLaunchState(root)
  const activeSession =
    parsed.status === 'running' ||
    parsed.status === 'queued' ||
    parsed.status === 'awaiting_approval'
  const launchChildAlive =
    !launchState || launchState.pid === undefined || launchState.pid === null
      ? activeSession
        ? false
        : null
      : isProcessAliveByPid(launchState.pid)
  const launchDetail =
    activeSession && !launchState
        ? `Roundtable session is ${parsed.status}, but launch state is missing.`
        : activeSession && launchState?.pid === undefined
          ? `Roundtable session is ${parsed.status}, but launch pid is missing.`
          : activeSession && launchState?.pid === null
            ? `Roundtable session is ${parsed.status}, but launch pid is missing.`
            : activeSession && launchChildAlive === false
              ? `Roundtable session is ${parsed.status}, but launch pid ${launchState.pid} is not running.`
              : null
  return {
    status: parsed.status,
    updatedAt: parsed.updatedAt,
    channelName: parsed.roundtableChannelName,
    lastSummary: parsed.lastSummary,
    lastError: parsed.lastError,
    launchChildAlive,
    launchDetail,
  }
}

function readRoundtableLaunchState(root: string): RoundtableLaunchState | null {
  const launchPath = resolve(
    root,
    'local-command-station',
    'roundtable-runtime',
    'discord-roundtable-launch.json',
  )
  if (!existsSync(launchPath)) {
    return null
  }
  try {
    return JSON.parse(readFileSync(launchPath, 'utf8')) as RoundtableLaunchState
  } catch {
    return null
  }
}

function isProcessAliveByPid(pid: number | null | undefined): boolean {
  if (!pid || pid <= 0) {
    return false
  }
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const options = parseArgs(argv)
  const root = process.cwd()
  const [harnessStatus, publicIntelligenceStatus] = await Promise.all([
    getImmaculateHarnessStatus(),
    getImmaculateHarnessIntelligenceStatus(),
  ])
  const [agentProbes, personaPlexProbe, apexBridgeProbes] = await Promise.all([
    Promise.all([
      probeJsonHealth('Q', 'http://127.0.0.1:8788/health'),
      probeJsonHealth('Viola', 'http://127.0.0.1:8789/health'),
      probeJsonHealth('Blackbeak', 'http://127.0.0.1:8790/health'),
    ]),
    probePersonaPlexCoherence(),
    probeApexBridgeCoherence(),
  ])
  const report = buildRuntimeCoherenceReport({
    harnessStatus,
    immaculateIntelligenceStatus: publicIntelligenceStatus,
    qAgentReceipt: readDiscordQAgentReceipt(root),
    immaculateTrace: readLatestImmaculateTraceSummary(root),
    qTrace: readLatestQTraceSummary(root),
    routeQueueDepth: readQTrainingRouteQueue(root).length,
    roundtable: readRoundtableState(root),
    probes: [...agentProbes, personaPlexProbe, ...apexBridgeProbes],
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
