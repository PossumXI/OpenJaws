import { readFileSync, readdirSync, statSync } from 'fs'
import { join, resolve } from 'path'
import { createImmaculateEvent, type ImmaculateEvent } from './events.js'

type LatencyStats = {
  count: number
  p50Ms: number | null
  p95Ms: number | null
  maxMs: number | null
}

export type ImmaculateTraceRunState = 'active' | 'completed' | 'stale'

export type ImmaculateTraceSummary = {
  path: string
  sessionId: string
  eventCount: number
  startedAt: string | null
  endedAt: string | null
  lastTimestamp: string | null
  runState: ImmaculateTraceRunState
  countsByType: Record<string, number>
  routeDispatchCount: number
  routeLeaseCount: number
  workerAssignmentCount: number
  latestRouteId: string | null
  latestWorkerId: string | null
  interactionLatency: LatencyStats
  llmLatency: LatencyStats
  reflexLatency: LatencyStats
  cognitiveLatency: LatencyStats
}

type TraceSummaryReadOptions = {
  referenceTimeMs?: number
  activeWindowMs?: number
}

export const IMMACULATE_ACTIVE_TRACE_WINDOW_MS = 15 * 60 * 1000

function percentile(sorted: number[], ratio: number): number | null {
  if (sorted.length === 0) {
    return null
  }
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * ratio) - 1),
  )
  return sorted[index] ?? null
}

function summarizeLatencies(values: number[]): LatencyStats {
  if (values.length === 0) {
    return {
      count: 0,
      p50Ms: null,
      p95Ms: null,
      maxMs: null,
    }
  }
  const sorted = [...values].sort((left, right) => left - right)
  return {
    count: sorted.length,
    p50Ms: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    maxMs: sorted.at(-1) ?? null,
  }
}

function parseTraceTimestampMs(value: string | null): number | null {
  if (!value) {
    return null
  }
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

function getTraceActivityTimestampMs(summary: {
  lastTimestamp: string | null
  startedAt: string | null
}): number | null {
  return (
    parseTraceTimestampMs(summary.lastTimestamp) ??
    parseTraceTimestampMs(summary.startedAt)
  )
}

function getTraceRecencyTimestampMs(summary: {
  endedAt: string | null
  lastTimestamp: string | null
  startedAt: string | null
}): number {
  return (
    parseTraceTimestampMs(summary.lastTimestamp) ??
    parseTraceTimestampMs(summary.endedAt) ??
    parseTraceTimestampMs(summary.startedAt) ??
    0
  )
}

export function classifyImmaculateTraceRunState(
  summary: {
    endedAt: string | null
    lastTimestamp: string | null
    startedAt: string | null
  },
  options: TraceSummaryReadOptions = {},
): ImmaculateTraceRunState {
  if (summary.endedAt) {
    return 'completed'
  }

  const activityTimestampMs = getTraceActivityTimestampMs(summary)
  if (activityTimestampMs === null) {
    return 'stale'
  }

  const referenceTimeMs = options.referenceTimeMs ?? Date.now()
  const activeWindowMs =
    options.activeWindowMs ?? IMMACULATE_ACTIVE_TRACE_WINDOW_MS

  return referenceTimeMs - activityTimestampMs <= activeWindowMs
    ? 'active'
    : 'stale'
}

export function resolveImmaculateTraceDir(root = process.cwd()): string {
  return resolve(
    process.env.OPENJAWS_SESSION_TRACE_DIR ??
      join(root, 'artifacts', 'immaculate', 'session-traces'),
  )
}

export function listImmaculateTraceFiles(root = process.cwd()): string[] {
  const traceDir = resolveImmaculateTraceDir(root)
  try {
    return readdirSync(traceDir)
      .filter(entry => entry.endsWith('.jsonl'))
      .map(entry => join(traceDir, entry))
      .sort(
        (left, right) =>
          statSync(right).mtimeMs - statSync(left).mtimeMs,
      )
  } catch {
    return []
  }
}

export function readImmaculateTraceSummary(
  path: string,
  options: TraceSummaryReadOptions = {},
): ImmaculateTraceSummary {
  const lines = readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
  const events: ImmaculateEvent[] = lines.map(line =>
    createImmaculateEvent(JSON.parse(line) as ImmaculateEvent),
  )
  if (events.length === 0) {
    throw new Error(`Trace file ${path} did not contain any events.`)
  }

  const countsByType: Record<string, number> = {}
  const interactionLatencies: number[] = []
  const llmLatencies: number[] = []
  const reflexLatencies: number[] = []
  const cognitiveLatencies: number[] = []
  let latestRouteId: string | null = null
  let latestWorkerId: string | null = null

  for (const event of events) {
    countsByType[event.type] = (countsByType[event.type] ?? 0) + 1
    switch (event.type) {
      case 'route.dispatched':
      case 'route.leased':
        latestRouteId = event.routeId
        latestWorkerId = event.workerId ?? latestWorkerId
        break
      case 'worker.assigned':
        latestRouteId = event.routeId
        latestWorkerId = event.workerId
        break
      case 'interaction.completed':
        interactionLatencies.push(event.latencyMs)
        break
      case 'llm.request.completed':
        llmLatencies.push(event.latencyMs)
        break
      case 'reflex.sampled':
        reflexLatencies.push(event.latencyMs)
        latestWorkerId = event.workerId ?? latestWorkerId
        break
      case 'cognitive.sampled':
        cognitiveLatencies.push(event.latencyMs)
        latestWorkerId = event.workerId ?? latestWorkerId
        break
      case 'turn.complete':
        latestRouteId = event.routeId ?? latestRouteId
        latestWorkerId = event.workerId ?? latestWorkerId
        break
    }
  }

  const startedEvent = events.find(event => event.type === 'session.started')
  const endedEvent = [...events].reverse().find(event => event.type === 'session.ended')
  const lastEvent = events.at(-1) ?? null

  const summary = {
    path,
    sessionId: events[0]!.sessionId,
    eventCount: events.length,
    startedAt: startedEvent?.timestamp ?? events[0]!.timestamp,
    endedAt: endedEvent?.timestamp ?? null,
    lastTimestamp: lastEvent?.timestamp ?? null,
  }

  return {
    ...summary,
    runState: classifyImmaculateTraceRunState(summary, options),
    countsByType,
    routeDispatchCount: countsByType['route.dispatched'] ?? 0,
    routeLeaseCount: countsByType['route.leased'] ?? 0,
    workerAssignmentCount: countsByType['worker.assigned'] ?? 0,
    latestRouteId,
    latestWorkerId,
    interactionLatency: summarizeLatencies(interactionLatencies),
    llmLatency: summarizeLatencies(llmLatencies),
    reflexLatency: summarizeLatencies(reflexLatencies),
    cognitiveLatency: summarizeLatencies(cognitiveLatencies),
  }
}

export function listImmaculateTraceSummaries(
  root = process.cwd(),
  options: TraceSummaryReadOptions = {},
): ImmaculateTraceSummary[] {
  return listImmaculateTraceFiles(root).flatMap(path => {
    try {
      return [readImmaculateTraceSummary(path, options)]
    } catch {
      return []
    }
  })
}

function getTraceRunStateRank(runState: ImmaculateTraceRunState): number {
  switch (runState) {
    case 'active':
      return 2
    case 'completed':
      return 1
    default:
      return 0
  }
}

export function selectPreferredImmaculateTraceSummary(
  summaries: ImmaculateTraceSummary[],
): ImmaculateTraceSummary | null {
  if (summaries.length === 0) {
    return null
  }

  return [...summaries].sort((left, right) => {
    const runStateRank =
      getTraceRunStateRank(right.runState) -
      getTraceRunStateRank(left.runState)
    if (runStateRank !== 0) {
      return runStateRank
    }

    const recencyDelta =
      getTraceRecencyTimestampMs(right) - getTraceRecencyTimestampMs(left)
    if (recencyDelta !== 0) {
      return recencyDelta
    }

    return right.path.localeCompare(left.path)
  })[0] ?? null
}

export function readLatestImmaculateTraceSummary(
  root = process.cwd(),
  options: TraceSummaryReadOptions = {},
): ImmaculateTraceSummary | null {
  return selectPreferredImmaculateTraceSummary(
    listImmaculateTraceSummaries(root, options),
  )
}
