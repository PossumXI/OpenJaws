import { existsSync, readFileSync } from 'fs'
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

const DISCORD_GATEWAY_CONFIG_CLOSE_CODES = new Set([1015, 4004, 4010, 4011, 4013, 4014])

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

function traceSummaryPathExists(path: string | null | undefined): boolean {
  if (!path) {
    return false
  }

  return existsSync(path)
}

function readTraceSessionStartedPath(path: string): string | null {
  try {
    const firstLine = readFileSync(path, 'utf8')
      .split(/\r?\n/)
      .map(line => line.trim())
      .find(Boolean)

    if (!firstLine) {
      return null
    }

    const event = JSON.parse(firstLine) as {
      tracePath?: unknown
      type?: unknown
    }

    if (event.type !== 'session.started') {
      return null
    }

    return typeof event.tracePath === 'string' ? event.tracePath : null
  } catch {
    return null
  }
}

function isRetryableDiscordGatewayClose(code: number | null | undefined): boolean {
  return typeof code === 'number' && !DISCORD_GATEWAY_CONFIG_CLOSE_CODES.has(code)
}

function getRoundtableRuntimeCheckStatus(args: {
  roundtable: RoundtableRuntimeSnapshot
  qReceipt: DiscordQAgentReceipt | null
}): RuntimeCoherenceStatus {
  const status = args.roundtable.status?.toLowerCase() ?? 'unknown'
  if (status === 'error' || status === 'stale') {
    return 'warning'
  }
  if (
    status === 'running' &&
    !(args.qReceipt?.status === 'ready' && args.qReceipt.gateway.connected === true)
  ) {
    return 'failed'
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
    const qGatewayRetrying =
      qReceipt.status === 'error' &&
      qReceipt.gateway.connected === false &&
      isRetryableDiscordGatewayClose(qReceipt.gateway.lastCloseCode)
    const qReceiptStatus = qRuntimeHealthy
      ? 'ok'
      : qGatewayRetrying
        ? 'warning'
        : 'failed'
    const qReceiptSummary = qRuntimeHealthy
      ? `Q Discord runtime ready in ${qReceipt.guilds.length} guild${qReceipt.guilds.length === 1 ? '' : 's'}.`
      : qGatewayRetrying
        ? `Q Discord runtime is reconnecting after gateway close ${qReceipt.gateway.lastCloseCode}.`
        : `Q Discord runtime is ${qReceipt.status} with gateway ${
            qReceipt.gateway.connected ? 'connected' : 'offline'
          }.`
    const voiceEnabled = qReceipt.voice.enabled === true
    const voiceReady = qReceipt.voice.ready === true
    const voiceConnected = qReceipt.voice.connected === true
    checks.push({
      id: 'discord-q-receipt',
      status: qReceiptStatus,
      summary: qReceiptSummary,
      detail:
        qReceipt.gateway.lastError ??
        qReceipt.gateway.lastReplyAt ??
        qReceipt.gateway.lastHeartbeatAt ??
        null,
    })

    if (voiceEnabled) {
      const voiceRuntimeHealthy = voiceReady && voiceConnected
      checks.push({
        id: 'voice-runtime',
        status: voiceRuntimeHealthy ? 'ok' : qRuntimeHealthy ? 'warning' : 'failed',
        summary: voiceRuntimeHealthy
          ? `Q voice runtime ready via ${qReceipt.voice.provider}.`
          : `Q voice runtime is ${voiceReady ? 'disconnected' : 'not ready'} via ${
              qReceipt.voice.provider
            }.`,
        detail:
          qReceipt.voice.runtimeUrl ??
          qReceipt.voice.lastError ??
          qReceipt.voice.lastChannelName ??
          null,
      })
    }

    if (qReceipt.patrol.snapshot) {
      const snapshotMatches =
        qReceipt.patrol.snapshot.harnessReachable === harnessReachable
      const staleOfflineSnapshot =
        qReceipt.patrol.snapshot.harnessReachable === false && harnessReachable
      checks.push({
        id: 'harness-receipt-alignment',
        status: snapshotMatches ? 'ok' : staleOfflineSnapshot ? 'warning' : 'failed',
        summary:
          snapshotMatches
            ? 'Discord patrol snapshot matches live harness reachability.'
            : staleOfflineSnapshot
              ? 'Discord patrol snapshot is stale; live harness has recovered.'
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

  if (args.immaculateTrace) {
    const immaculateTracePathExists = traceSummaryPathExists(args.immaculateTrace.path)
    checks.push({
      id: 'immaculate-trace-path',
      status: immaculateTracePathExists ? 'ok' : 'warning',
      summary: immaculateTracePathExists
        ? `Latest local Immaculate trace summary points to ${args.immaculateTrace.path}.`
        : `Latest local Immaculate trace summary points to a missing file: ${args.immaculateTrace.path}.`,
    })

    if (immaculateTracePathExists) {
      const tracePath = readTraceSessionStartedPath(args.immaculateTrace.path)
      checks.push({
        id: 'immaculate-trace-provenance',
        status: tracePath === args.immaculateTrace.path ? 'ok' : 'warning',
        summary:
          tracePath === args.immaculateTrace.path
            ? 'Latest local Immaculate trace provenance matches the summary path.'
            : 'Latest local Immaculate trace provenance does not match the summary path.',
        detail: tracePath ?? 'missing session.started tracePath',
      })
    }
  }

  if (args.qTrace) {
    const qTracePathExists = traceSummaryPathExists(args.qTrace.path)
    checks.push({
      id: 'q-trace-path',
      status: qTracePathExists ? 'ok' : 'warning',
      summary: qTracePathExists
        ? `Latest local Q trace summary points to ${args.qTrace.path}.`
        : `Latest local Q trace summary points to a missing file: ${args.qTrace.path}.`,
    })

    if (qTracePathExists) {
      const tracePath = readTraceSessionStartedPath(args.qTrace.path)
      checks.push({
        id: 'q-trace-provenance',
        status: tracePath === args.qTrace.path ? 'ok' : 'warning',
        summary:
          tracePath === args.qTrace.path
            ? 'Latest local Q trace provenance matches the summary path.'
            : 'Latest local Q trace provenance does not match the summary path.',
        detail: tracePath ?? 'missing session.started tracePath',
      })
    }
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
    const roundtableStatus = getRoundtableRuntimeCheckStatus({
      roundtable: args.roundtable,
      qReceipt,
    })
    checks.push({
      id: 'roundtable-runtime',
      status: roundtableStatus,
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
    const probeReportsError =
      probe.reachable &&
      /^(blocked|error|failed|unhealthy|degraded)$/i.test(probe.status ?? '')
    checks.push({
      id: `probe-${probe.label}`,
      status: probeReportsError ? 'warning' : probe.reachable ? 'ok' : 'warning',
      summary: `${probe.label} ${
        probe.reachable
          ? probeReportsError
            ? 'reachable but reporting degraded health'
            : 'reachable'
          : 'unreachable'
      } at ${probe.url}`,
      detail: probeReportsError
        ? probe.detail ?? probe.status ?? null
        : probe.status ?? probe.detail ?? null,
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
