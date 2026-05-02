import { existsSync, readFileSync } from 'fs'
import type { DiscordQAgentReceipt } from '../utils/discordQAgentRuntime.js'
import type {
  ImmaculateHarnessIntelligenceStatus,
  ImmaculateHarnessStatus,
} from '../utils/immaculateHarness.js'
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
  launchChildAlive?: boolean | null
  launchDetail?: string | null
}

export type RuntimeSourceState = {
  root: string
  expectedBranch?: string | null
  branch?: string | null
  head?: string | null
  upstream?: string | null
  upstreamHead?: string | null
  ahead?: number | null
  behind?: number | null
  dirty?: boolean | null
  changedFileCount?: number | null
  error?: string | null
}

export type RuntimeCoherenceReport = {
  status: RuntimeCoherenceStatus
  summary: string
  checks: RuntimeCoherenceCheck[]
}

const RELEASE_TRACE_FRESHNESS_WINDOW_MS = 24 * 60 * 60 * 1000

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

function getTraceTimestampMs(
  summary: ImmaculateTraceSummary | QTraceSummary | null,
): number | null {
  if (!summary) {
    return null
  }

  for (const candidate of [
    summary.lastTimestamp,
    summary.endedAt,
    summary.startedAt,
  ]) {
    if (!candidate) {
      continue
    }
    const timestampMs = Date.parse(candidate)
    if (Number.isFinite(timestampMs)) {
      return timestampMs
    }
  }

  return null
}

function isTraceFreshForRelease(
  summary: ImmaculateTraceSummary | QTraceSummary | null,
  referenceTimeMs: number,
): boolean {
  const timestampMs = getTraceTimestampMs(summary)
  return (
    timestampMs !== null &&
    referenceTimeMs - timestampMs <= RELEASE_TRACE_FRESHNESS_WINDOW_MS
  )
}

function summarizeTraceFreshness(
  label: string,
  summary: ImmaculateTraceSummary | QTraceSummary | null,
): string | null {
  if (!summary) {
    return null
  }

  const timestamp =
    summary.lastTimestamp ?? summary.endedAt ?? summary.startedAt ?? 'unknown'
  return `${label} ${summary.sessionId} last updated ${timestamp}`
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

function normalizeProbeCheckId(label: string): string {
  return (
    label
      .trim()
      .replace(/[^A-Za-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'runtime-probe'
  )
}

function isWeakRoundtableProgressSignal(
  roundtable: RoundtableRuntimeSnapshot,
): boolean {
  const combined = [roundtable.lastSummary, roundtable.lastError]
    .filter(Boolean)
    .join('\n')
  return (
    /\bheld back\b/i.test(combined) ||
    /\bno (?:file|code) changes? (?:were )?detected\b/i.test(combined) ||
    /\bartifact-only output\b/i.test(combined) ||
    /\bmixed code and artifact output\b/i.test(combined) ||
    /\bunknown roundtable action\b/i.test(combined)
  )
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

export function buildRuntimeCoherenceReport(args: {
  harnessStatus: ImmaculateHarnessStatus
  immaculateIntelligenceStatus?: ImmaculateHarnessIntelligenceStatus | null
  qAgentReceipt: DiscordQAgentReceipt | null
  immaculateTrace: ImmaculateTraceSummary | null
  qTrace: QTraceSummary | null
  routeQueueDepth?: number | null
  roundtable?: RoundtableRuntimeSnapshot | null
  sourceState?: RuntimeSourceState | null
  probes?: RuntimeCoherenceProbe[]
}): RuntimeCoherenceReport {
  const checks: RuntimeCoherenceCheck[] = []
  const queueDepth = args.routeQueueDepth ?? null
  const harnessReachable = args.harnessStatus.enabled && args.harnessStatus.reachable
  const qReceipt = args.qAgentReceipt
  const referenceTimeMs = Date.now()

  checks.push({
    id: 'harness-live',
    status: harnessReachable ? 'ok' : 'warning',
    summary: harnessReachable
      ? `Immaculate reachable at ${args.harnessStatus.harnessUrl}`
      : `Immaculate unreachable at ${args.harnessStatus.harnessUrl}`,
    detail: args.harnessStatus.error ?? null,
  })

  if (
    Object.prototype.hasOwnProperty.call(
      args,
      'immaculateIntelligenceStatus',
    )
  ) {
    const intelligenceStatus = args.immaculateIntelligenceStatus ?? null
    checks.push({
      id: 'harness-intelligence-status',
      status: !intelligenceStatus
        ? harnessReachable
          ? 'warning'
          : 'ok'
        : intelligenceStatus.status === 'blocked'
          ? 'failed'
          : intelligenceStatus.status === 'degraded'
            ? 'warning'
            : 'ok',
      summary: !intelligenceStatus
        ? harnessReachable
          ? 'Immaculate public intelligence status is unavailable.'
          : 'Immaculate public intelligence status is unavailable while the harness is offline.'
        : `Immaculate public intelligence status is ${intelligenceStatus.status ?? 'unknown'} with ${intelligenceStatus.layerPlane.readyLayerCount ?? 0}/${intelligenceStatus.layerPlane.layerCount ?? 0} ready layers and worker readiness ${intelligenceStatus.workerPlane.readiness ?? 'unknown'}.`,
      detail:
        intelligenceStatus?.summary ??
        intelligenceStatus?.reasons.join(' | ') ??
        null,
    })
  }

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
    const voiceEnabled = qReceipt.voice.enabled === true
    const voiceReady = qReceipt.voice.ready === true
    const voiceConnected = qReceipt.voice.connected === true
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

    const staleTraceSummaries = [
      !isTraceFreshForRelease(args.immaculateTrace, referenceTimeMs)
        ? summarizeTraceFreshness('Immaculate trace', args.immaculateTrace)
        : null,
      !isTraceFreshForRelease(args.qTrace, referenceTimeMs)
        ? summarizeTraceFreshness('Q trace', args.qTrace)
        : null,
    ].filter((value): value is string => Boolean(value))

    checks.push({
      id: 'trace-freshness',
      status: staleTraceSummaries.length === 0 ? 'ok' : 'warning',
      summary:
        staleTraceSummaries.length === 0
          ? 'Latest local traces are fresh enough for release auditing.'
          : 'Latest local traces are stale for release auditing.',
      detail: staleTraceSummaries.join(' | ') || null,
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

  if (Object.prototype.hasOwnProperty.call(args, 'sourceState')) {
    const sourceState = args.sourceState ?? null
    if (!sourceState) {
      checks.push({
        id: 'openjaws-source-state',
        status: 'warning',
        summary: 'OpenJaws source checkout state was not available.',
        detail:
          'Runtime coherence cannot prove which source tree launched the local operator services.',
      })
    } else if (sourceState.error) {
      checks.push({
        id: 'openjaws-source-state',
        status: 'warning',
        summary: 'OpenJaws source checkout state could not be reconciled.',
        detail: `${sourceState.root} · ${sourceState.error}`,
      })
    } else {
      const driftReasons = [
        sourceState.expectedBranch &&
        sourceState.branch &&
        sourceState.branch !== sourceState.expectedBranch
          ? `branch=${sourceState.branch} expected=${sourceState.expectedBranch}`
          : null,
        sourceState.behind && sourceState.behind > 0
          ? `behind upstream by ${sourceState.behind}`
          : null,
        sourceState.ahead && sourceState.ahead > 0
          ? `ahead of upstream by ${sourceState.ahead}`
          : null,
        sourceState.dirty
          ? `${sourceState.changedFileCount ?? 'unknown'} changed file${
              sourceState.changedFileCount === 1 ? '' : 's'
            }`
          : null,
      ].filter((item): item is string => Boolean(item))
      const sourceAligned = driftReasons.length === 0
      checks.push({
        id: 'openjaws-source-state',
        status: sourceAligned ? 'ok' : 'warning',
        summary: sourceAligned
          ? 'OpenJaws source checkout is aligned for runtime use.'
          : 'OpenJaws source checkout has runtime drift.',
        detail:
          [
            `root=${sourceState.root}`,
            sourceState.branch ? `branch=${sourceState.branch}` : null,
            sourceState.head ? `head=${sourceState.head}` : null,
            sourceState.upstream ? `upstream=${sourceState.upstream}` : null,
            sourceState.upstreamHead
              ? `upstreamHead=${sourceState.upstreamHead}`
              : null,
            sourceState.ahead !== null && sourceState.ahead !== undefined
              ? `ahead=${sourceState.ahead}`
              : null,
            sourceState.behind !== null && sourceState.behind !== undefined
              ? `behind=${sourceState.behind}`
              : null,
            ...driftReasons,
          ].filter((item): item is string => Boolean(item)).join(' · ') ||
          null,
      })
    }
  }

  if (args.roundtable) {
    const roundtableSessionExpired =
      args.roundtable.status === 'expired' || args.roundtable.status === 'stale'
    const roundtableStatus = args.roundtable.status?.toLowerCase() ?? null
    const roundtableActive =
      roundtableStatus === 'running' ||
      roundtableStatus === 'queued' ||
      roundtableStatus === 'awaiting_approval'
    const roundtableHasRuntimeFault =
      Boolean(args.roundtable.lastError) ||
      (roundtableActive && args.roundtable.launchChildAlive === false)
    const roundtableHasWeakProgress =
      !roundtableHasRuntimeFault && isWeakRoundtableProgressSignal(args.roundtable)
    const roundtableHealthy =
      !roundtableHasRuntimeFault &&
      !roundtableHasWeakProgress &&
      ((!roundtableSessionExpired && args.roundtable.status !== 'running') ||
        (qReceipt?.status === 'ready' && qReceipt.gateway.connected === true))
    checks.push({
      id: 'roundtable-runtime',
      status:
        (roundtableSessionExpired ||
          roundtableHasRuntimeFault ||
          roundtableHasWeakProgress)
          ? 'warning'
          : roundtableHealthy
            ? 'ok'
            : 'failed',
      summary: `Roundtable is ${args.roundtable.status ?? 'unknown'}${
        args.roundtable.channelName ? ` in #${args.roundtable.channelName}` : ''
      }.`,
      detail:
        args.roundtable.launchDetail ??
        args.roundtable.lastError ??
        (roundtableHasWeakProgress && args.roundtable.lastSummary
          ? `Roundtable is active, but the latest governed action did not produce a code-bearing result: ${args.roundtable.lastSummary}`
          : null) ??
        args.roundtable.lastSummary ??
        args.roundtable.updatedAt ??
        null,
    })
  }

  for (const probe of args.probes ?? []) {
    checks.push({
      id: `probe-${normalizeProbeCheckId(probe.label)}`,
      status: probe.reachable ? 'ok' : 'warning',
      summary: `${probe.label} ${probe.reachable ? 'reachable' : 'unreachable'} at ${probe.url}`,
      detail: probe.detail ?? probe.status ?? null,
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
