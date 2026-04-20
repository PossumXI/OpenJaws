import type { DiscordQAgentReceipt } from '../utils/discordQAgentRuntime.js'
import type { ImmaculateHarnessStatus } from '../utils/immaculateHarness.js'
import type { QTraceSummary } from '../q/traceSummary.js'
import type { ImmaculateTraceSummary } from './traceSummary.js'

export type RuntimeCoherenceStatus = 'ok' | 'warning' | 'failed'

export type RuntimeCoherenceCheck = {
  id: string
  status: RuntimeCoherenceStatus
  summary: string
  detail?: string | null
}

export type RuntimeCoherenceProbe = {
  label: string
  url: string
  reachable: boolean
  status: string | null
  detail?: string | null
}

export type RoundtableRuntimeSnapshot = {
  status: string | null
  updatedAt?: string | null
  channelName?: string | null
  lastSummary?: string | null
  lastError?: string | null
}

export type RuntimeCoherenceReport = {
  status: RuntimeCoherenceStatus
  summary: string
  checks: RuntimeCoherenceCheck[]
}

function summarizeTrace(summary: {
  sessionId: string
  runState: string
  lastTimestamp: string | null
}): string {
  return `${summary.sessionId} · ${summary.runState}${
    summary.lastTimestamp ? ` · ${summary.lastTimestamp}` : ''
  }`
}

function hasActiveTrace(
  summary: ImmaculateTraceSummary | QTraceSummary | null,
): boolean {
  return summary?.runState === 'active'
}

function aggregateStatus(
  checks: RuntimeCoherenceCheck[],
): RuntimeCoherenceStatus {
  if (checks.some(check => check.status === 'failed')) {
    return 'failed'
  }
  if (checks.some(check => check.status === 'warning')) {
    return 'warning'
  }
  return 'ok'
}

export function buildRuntimeCoherenceReport(args: {
  harnessStatus: ImmaculateHarnessStatus
  qAgentReceipt: DiscordQAgentReceipt | null
  immaculateTrace: ImmaculateTraceSummary | null
  qTrace: QTraceSummary | null
  routeQueueDepth?: number | null
  roundtable?: RoundtableRuntimeSnapshot | null
  probes?: RuntimeCoherenceProbe[]
}): RuntimeCoherenceReport {
  const checks: RuntimeCoherenceCheck[] = []
  const queueDepth = args.routeQueueDepth ?? null
  const harnessReachable = args.harnessStatus.enabled && args.harnessStatus.reachable
  const qReceipt = args.qAgentReceipt

  checks.push({
    id: 'harness-live',
    status: harnessReachable ? 'ok' : 'warning',
    summary: harnessReachable
      ? `Immaculate reachable at ${args.harnessStatus.harnessUrl}`
      : `Immaculate unreachable at ${args.harnessStatus.harnessUrl}`,
    detail: args.harnessStatus.error ?? null,
  })

  if (!qReceipt) {
    checks.push({
      id: 'discord-q-receipt',
      status: 'warning',
      summary: 'Q Discord receipt is missing.',
      detail: 'The runtime can still be healthy, but there is no local receipt to reconcile.',
    })
  } else {
    const qRuntimeHealthy =
      qReceipt.status === 'ready' && qReceipt.gateway.connected === true
    checks.push({
      id: 'discord-q-receipt',
      status: qRuntimeHealthy ? 'ok' : 'failed',
      summary: qRuntimeHealthy
        ? `Q Discord runtime ready in ${qReceipt.guilds.length} guild${qReceipt.guilds.length === 1 ? '' : 's'}.`
        : `Q Discord runtime is ${qReceipt.status} with gateway ${
            qReceipt.gateway.connected ? 'connected' : 'offline'
          }.`,
      detail: qReceipt.gateway.lastReplyAt ?? qReceipt.gateway.lastHeartbeatAt ?? null,
    })

    if (qReceipt.patrol.snapshot) {
      checks.push({
        id: 'harness-receipt-alignment',
        status:
          qReceipt.patrol.snapshot.harnessReachable === harnessReachable
            ? 'ok'
            : 'failed',
        summary:
          qReceipt.patrol.snapshot.harnessReachable === harnessReachable
            ? 'Discord patrol snapshot matches live harness reachability.'
            : 'Discord patrol snapshot disagrees with live harness reachability.',
        detail: `receipt=${qReceipt.patrol.snapshot.harnessReachable} live=${harnessReachable}`,
      })

      if (queueDepth !== null) {
        checks.push({
          id: 'route-queue-depth',
          status:
            qReceipt.patrol.snapshot.queueLength === queueDepth ? 'ok' : 'warning',
          summary:
            qReceipt.patrol.snapshot.queueLength === queueDepth
              ? 'Discord patrol snapshot matches live route queue depth.'
              : 'Discord patrol snapshot queue depth drifted from the live route queue.',
          detail: `receipt=${qReceipt.patrol.snapshot.queueLength} live=${queueDepth}`,
        })
      }
    }
  }

  if (!args.immaculateTrace && !args.qTrace) {
    checks.push({
      id: 'trace-presence',
      status: 'warning',
      summary: 'No Immaculate or Q trace summaries were available.',
      detail: 'The live stack can run without a fresh trace, but there is nothing to audit.',
    })
  } else {
    checks.push({
      id: 'trace-presence',
      status: 'ok',
      summary: `Immaculate trace: ${
        args.immaculateTrace ? summarizeTrace(args.immaculateTrace) : 'missing'
      } | Q trace: ${args.qTrace ? summarizeTrace(args.qTrace) : 'missing'}`,
    })
  }

  if (!harnessReachable && (hasActiveTrace(args.immaculateTrace) || hasActiveTrace(args.qTrace))) {
    checks.push({
      id: 'active-trace-vs-harness',
      status: 'failed',
      summary:
        'An active Immaculate/Q trace exists while the live harness is unreachable.',
      detail: `immaculate=${args.immaculateTrace?.runState ?? 'missing'} q=${args.qTrace?.runState ?? 'missing'}`,
    })
  } else {
    checks.push({
      id: 'active-trace-vs-harness',
      status: 'ok',
      summary: harnessReachable
        ? 'Live harness and trace activity are compatible.'
        : 'No active trace is claiming a live harness while the harness is down.',
    })
  }

  if (args.roundtable) {
    const roundtableHealthy =
      args.roundtable.status !== 'running' ||
      (qReceipt?.status === 'ready' && qReceipt.gateway.connected === true)
    checks.push({
      id: 'roundtable-runtime',
      status: roundtableHealthy ? 'ok' : 'failed',
      summary: `Roundtable is ${args.roundtable.status ?? 'unknown'}${
        args.roundtable.channelName ? ` in #${args.roundtable.channelName}` : ''
      }.`,
      detail:
        args.roundtable.lastError ??
        args.roundtable.lastSummary ??
        args.roundtable.updatedAt ??
        null,
    })
  }

  for (const probe of args.probes ?? []) {
    checks.push({
      id: `probe-${probe.label}`,
      status: probe.reachable ? 'ok' : 'warning',
      summary: `${probe.label} ${probe.reachable ? 'reachable' : 'unreachable'} at ${probe.url}`,
      detail: probe.status ?? probe.detail ?? null,
    })
  }

  const status = aggregateStatus(checks)
  const okCount = checks.filter(check => check.status === 'ok').length
  const warningCount = checks.filter(check => check.status === 'warning').length
  const failedCount = checks.filter(check => check.status === 'failed').length

  return {
    status,
    summary: `Runtime coherence ${status}: ${okCount} ok, ${warningCount} warning, ${failedCount} failed.`,
    checks,
  }
}
