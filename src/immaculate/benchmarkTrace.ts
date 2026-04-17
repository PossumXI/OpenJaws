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
}

function resolveBenchmarkTracePath(outputDir: string, sessionId: string): string {
  return resolve(outputDir, `${sessionId}.trace.jsonl`)
}

export function createBenchmarkTraceWriter(args: {
  outputDir: string
  sessionId: string
}): BenchmarkTraceWriter {
  mkdirSync(args.outputDir, { recursive: true })
  const writer: BenchmarkTraceWriter = {
    path: resolveBenchmarkTracePath(args.outputDir, args.sessionId),
    sessionId: args.sessionId,
    startedAt: Date.now(),
  }
  appendBenchmarkTraceEvent(writer, 'session.started', {
    tracePath: writer.path,
  })
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
