import { existsSync } from 'fs'
import { resolve } from 'path'
import { buildRuntimeCoherenceReport } from '../src/immaculate/runtimeCoherence.js'
import { readLatestImmaculateTraceSummary } from '../src/immaculate/traceSummary.js'
import { readLatestQTraceSummary } from '../src/q/traceSummary.js'
import { readDiscordQAgentReceipt } from '../src/utils/discordQAgentRuntime.js'
import { readDiscordRoundtableSessionSnapshot } from '../src/utils/discordRoundtableRuntime.js'
import { getImmaculateHarnessStatus } from '../src/utils/immaculateHarness.js'
import { readQTrainingRouteQueue } from '../src/utils/qTraining.js'

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
    const response = await fetch(url)
    const text = await response.text()
    const body = text.trim()
    let status: string | null = null
    if (body) {
      try {
        const parsed = JSON.parse(body) as Record<string, unknown>
        status = typeof parsed.status === 'string' ? parsed.status : null
      } catch {
        status = body
      }
    }
    return {
      label,
      url,
      reachable: response.ok,
      status,
      detail: response.ok ? null : `HTTP ${response.status}`,
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
  const report = buildRuntimeCoherenceReport({
    harnessStatus,
    qAgentReceipt: readDiscordQAgentReceipt(root),
    immaculateTrace: readLatestImmaculateTraceSummary(root),
    qTrace: readLatestQTraceSummary(root),
    routeQueueDepth: readQTrainingRouteQueue(root).length,
    roundtable: readRoundtableState(root),
    probes: await Promise.all([
      probeJsonHealth('Q', 'http://127.0.0.1:8788/health'),
      probeJsonHealth('Viola', 'http://127.0.0.1:8789/health'),
      probeJsonHealth('Blackbeak', 'http://127.0.0.1:8790/health'),
    ]),
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
