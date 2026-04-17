import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, mkdirSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  closeBenchmarkTraceWriter,
  createBenchmarkTraceWriter,
  appendBenchmarkTraceEvent,
} from '../immaculate/benchmarkTrace.js'
import { readLatestQTraceSummary } from './traceSummary.js'

const tempRoots: string[] = []

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop()
    if (root) {
      rmSync(root, { recursive: true, force: true })
    }
  }
})

describe('q trace summary', () => {
  test('reads the latest typed Q benchmark trace from artifacts', () => {
    const root = mkdtempSync(join(tmpdir(), 'openjaws-q-trace-'))
    tempRoots.push(root)
    const outputDir = join(root, 'artifacts', 'q-soak-test')
    mkdirSync(outputDir, { recursive: true })
    const writer = createBenchmarkTraceWriter({
      outputDir,
      sessionId: 'q-soak-test-session',
    })
    appendBenchmarkTraceEvent(writer, 'route.dispatched', {
      routeId: 'route-1',
      runId: 'run-1',
      provider: 'oci',
      model: 'Q',
    })
    appendBenchmarkTraceEvent(writer, 'worker.assigned', {
      workerId: 'worker-1',
      routeId: 'route-1',
    })
    appendBenchmarkTraceEvent(writer, 'turn.complete', {
      turnId: 'turn-1',
      routeId: 'route-1',
      workerId: 'worker-1',
      status: 'completed',
      latencyMs: 240,
    })
    closeBenchmarkTraceWriter(writer)

    expect(readLatestQTraceSummary(root)).toMatchObject({
      kind: 'benchmark',
      sessionId: 'q-soak-test-session',
      routeDispatchCount: 1,
      workerAssignmentCount: 1,
      latestRouteId: 'route-1',
      latestWorkerId: 'worker-1',
      path: writer.path,
    })
  })
})
