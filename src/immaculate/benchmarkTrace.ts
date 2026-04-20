import { mkdirSync, appendFileSync } from 'fs'
import { join, resolve } from 'path'
import {
  createImmaculateEvent,
  stableSerializeImmaculateEvent,
  type ImmaculateEvent,
  type ImmaculateEventName,
} from './events.js'

export type BenchmarkTraceWriter = {
  path: string
  sessionId: string
  startedAt: number
  sessionMetadata: BenchmarkTraceSessionMetadata | null
}

export type BenchmarkTraceSessionMetadata = {
  runId?: string
  sessionScope?: string
  repoPath?: string
  worktreePath?: string
  gitBranch?: string | null
  repoSha?: string | null
}

function resolveBenchmarkTracePath(outputDir: string, sessionId: string): string {
  return resolve(outputDir, `${sessionId}.trace.jsonl`)
}

export function createBenchmarkTraceWriter(args: {
  outputDir: string
  sessionId: string
  sessionMetadata?: BenchmarkTraceSessionMetadata | null
}): BenchmarkTraceWriter {
  mkdirSync(args.outputDir, { recursive: true })
  const writer: BenchmarkTraceWriter = {
    path: resolveBenchmarkTracePath(args.outputDir, args.sessionId),
    sessionId: args.sessionId,
    startedAt: Date.now(),
    sessionMetadata: args.sessionMetadata ?? null,
  }
  const sessionStartedPayload: Record<string, unknown> = {
    tracePath: writer.path,
  }
  if (writer.sessionMetadata) {
    for (const [key, value] of Object.entries(writer.sessionMetadata)) {
      if (value !== null && value !== undefined) {
        sessionStartedPayload[key] = value
      }
    }
  }
  appendBenchmarkTraceEvent(writer, 'session.started', sessionStartedPayload)
  return writer
}

export function appendBenchmarkTraceEvent(
  writer: BenchmarkTraceWriter,
  type: ImmaculateEventName,
  payload: Record<string, unknown>,
): void {
  const event = createImmaculateEvent({
    schemaVersion: 'immaculate.event.v1',
    timestamp: new Date().toISOString(),
    sessionId: writer.sessionId,
    type,
    ...payload,
  } as ImmaculateEvent)
  appendFileSync(writer.path, `${stableSerializeImmaculateEvent(event)}\n`, 'utf8')
}

export function closeBenchmarkTraceWriter(writer: BenchmarkTraceWriter): void {
  appendBenchmarkTraceEvent(writer, 'session.ended', {
    durationMs: Math.max(0, Date.now() - writer.startedAt),
  })
}
