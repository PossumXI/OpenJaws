import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  appendBenchmarkTraceEvent,
  closeBenchmarkTraceWriter,
  createBenchmarkTraceWriter,
} from './benchmarkTrace.js'
import { readImmaculateTraceSummary } from './traceSummary.js'

const cleanupDirs: string[] = []

afterEach(() => {
  while (cleanupDirs.length > 0) {
    const dir = cleanupDirs.pop()
    if (dir) {
      rmSync(dir, { recursive: true, force: true })
    }
  }
})

describe('traceSummary', () => {
  test('summarizes typed immaculate traces', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'openjaws-trace-summary-'))
    cleanupDirs.push(tempDir)
    mkdirSync(tempDir, { recursive: true })
    const writer = createBenchmarkTraceWriter({
      outputDir: tempDir,
      sessionId: 'trace-session',
    })
    appendBenchmarkTraceEvent(writer, 'route.dispatched', {
      routeId: 'route-1',
      runId: 'run-1',
      provider: 'oci',
      model: 'Q',
      queueDepth: 1,
      projectRoot: 'D:/openjaws/OpenJaws',
    })
    appendBenchmarkTraceEvent(writer, 'worker.assigned', {
      workerId: 'worker-1',
      routeId: 'route-1',
      assignmentId: 'assignment-1',
      projectRoot: 'D:/openjaws/OpenJaws',
    })
    appendBenchmarkTraceEvent(writer, 'interaction.completed', {
      spanId: 'span-1',
      name: 'interaction',
      latencyMs: 120,
      outputPreview: 'done',
      attributes: {},
    })
    appendBenchmarkTraceEvent(writer, 'llm.request.completed', {
      spanId: 'span-2',
      name: 'llm',
      latencyMs: 250,
      outputPreview: 'done',
      attributes: {},
    })
    appendBenchmarkTraceEvent(writer, 'reflex.sampled', {
      sampleId: 'sample-1',
      workerId: 'worker-1',
      latencyMs: 90,
      tokenCount: null,
      status: 'completed',
    })
    closeBenchmarkTraceWriter(writer)

    const summary = readImmaculateTraceSummary(join(tempDir, 'trace-session.trace.jsonl'))

    expect(summary.sessionId).toBe('trace-session')
    expect(summary.eventCount).toBeGreaterThanOrEqual(6)
    expect(summary.routeDispatchCount).toBe(1)
    expect(summary.workerAssignmentCount).toBe(1)
    expect(summary.latestRouteId).toBe('route-1')
    expect(summary.latestWorkerId).toBe('worker-1')
    expect(summary.interactionLatency.p50Ms).toBe(120)
    expect(summary.llmLatency.p95Ms).toBe(250)
    expect(summary.reflexLatency.p50Ms).toBe(90)
  })
})
