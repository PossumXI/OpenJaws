import { readFileSync, readdirSync, statSync } from 'fs'
import { join, resolve } from 'path'
import { createImmaculateEvent, type ImmaculateEvent } from './events.js'

type LatencyStats = {
  count: number
  p50Ms: number | null
  p95Ms: number | null
  maxMs: number | null
}

export type ImmaculateTraceSummary = {
  path: string
  sessionId: string
  eventCount: number
  startedAt: string | null
  endedAt: string | null
  lastTimestamp: string | null
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

export function readImmaculateTraceSummary(path: string): ImmaculateTraceSummary {
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

  return {
    path,
    sessionId: events[0]!.sessionId,
    eventCount: events.length,
    startedAt: startedEvent?.timestamp ?? events[0]!.timestamp,
    endedAt: endedEvent?.timestamp ?? null,
    lastTimestamp: lastEvent?.timestamp ?? null,
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

export function readLatestImmaculateTraceSummary(
  root = process.cwd(),
): ImmaculateTraceSummary | null {
  const latestPath = listImmaculateTraceFiles(root)[0]
  if (!latestPath) {
    return null
  }
  try {
    return readImmaculateTraceSummary(latestPath)
  } catch {
    return null
  }
}
