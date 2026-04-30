import { existsSync } from 'fs'
import { resolve } from 'path'
import { buildRuntimeCoherenceReport } from '../src/immaculate/runtimeCoherence.js'
import { readLatestImmaculateTraceSummary } from '../src/immaculate/traceSummary.js'
import { readLatestQTraceSummary } from '../src/q/traceSummary.js'
import { readDiscordQAgentReceipt } from '../src/utils/discordQAgentRuntime.js'
import { readDiscordRoundtableSessionSnapshot } from '../src/utils/discordRoundtableRuntime.js'
import { getImmaculateHarnessStatus } from '../src/utils/immaculateHarness.js'
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

export function buildPersonaPlexCoherenceProbe(
  result: PersonaPlexProbeResult,
): ProbeResult {
  const repairDetail =
    result.repair.status === 'ready' ? null : result.repair.summary
  const missingDetail =
    result.repair.missing.length > 0
      ? `missing local launcher: ${result.repair.missing.join(', ')}`
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

function readRoundtableState(root: string) {
  const runtimeDir = resolve(root, 'local-command-station', 'roundtable-runtime')
  if (!existsSync(runtimeDir)) {
    return null
  }
  const parsed = readDiscordRoundtableSessionSnapshot(root)
  if (!parsed) {
    return null
  }
  return {
    status: parsed.status,
    updatedAt: parsed.updatedAt,
    channelName: parsed.roundtableChannelName,
    lastSummary: parsed.lastSummary,
    lastError: parsed.lastError,
  }
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const options = parseArgs(argv)
  const root = process.cwd()
  const harnessStatus = await getImmaculateHarnessStatus()
  const [agentProbes, personaPlexProbe] = await Promise.all([
    Promise.all([
      probeJsonHealth('Q', 'http://127.0.0.1:8788/health'),
      probeJsonHealth('Viola', 'http://127.0.0.1:8789/health'),
      probeJsonHealth('Blackbeak', 'http://127.0.0.1:8790/health'),
    ]),
    probePersonaPlexCoherence(),
  ])
  const report = buildRuntimeCoherenceReport({
    harnessStatus,
    qAgentReceipt: readDiscordQAgentReceipt(root),
    immaculateTrace: readLatestImmaculateTraceSummary(root),
    qTrace: readLatestQTraceSummary(root),
    routeQueueDepth: readQTrainingRouteQueue(root).length,
    roundtable: readRoundtableState(root),
    probes: [...agentProbes, personaPlexProbe],
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
