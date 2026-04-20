import { describe, expect, test } from 'bun:test'
import {
  createImmaculateEvent,
  stableSerializeImmaculateEvent,
} from './events.js'

describe('immaculate event contract', () => {
  test('accepts a typed route dispatch event', () => {
    expect(
      createImmaculateEvent({
        schemaVersion: 'immaculate.event.v1',
        timestamp: '2026-04-17T00:00:00.000Z',
        sessionId: 'session-1',
        type: 'route.dispatched',
        routeId: 'route-1',
        provider: 'oci',
        model: 'Q',
      }),
    ).toMatchObject({
      type: 'route.dispatched',
      routeId: 'route-1',
      provider: 'oci',
      model: 'Q',
    })
  })

  test('accepts a typed session started event with provenance metadata', () => {
    expect(
      createImmaculateEvent({
        schemaVersion: 'immaculate.event.v1',
        timestamp: '2026-04-17T00:00:00.000Z',
        sessionId: 'session-1',
        type: 'session.started',
        tracePath: 'D:/openjaws/OpenJaws/artifacts/terminalbench/run-1.trace.jsonl',
        runId: 'run-1',
        sessionScope: 'terminalbench:bounded',
        repoPath: 'D:/openjaws/OpenJaws',
        worktreePath: 'D:/openjaws/OpenJaws',
        gitBranch: 'agent/openjaws-terminalbench-provenance',
        repoSha: '0123456789abcdef0123456789abcdef01234567',
      }),
    ).toMatchObject({
      type: 'session.started',
      tracePath: 'D:/openjaws/OpenJaws/artifacts/terminalbench/run-1.trace.jsonl',
      runId: 'run-1',
      sessionScope: 'terminalbench:bounded',
      repoPath: 'D:/openjaws/OpenJaws',
      worktreePath: 'D:/openjaws/OpenJaws',
      gitBranch: 'agent/openjaws-terminalbench-provenance',
      repoSha: '0123456789abcdef0123456789abcdef01234567',
    })
  })

  test('serializes events with a stable key order', () => {
    const serialized = stableSerializeImmaculateEvent({
      schemaVersion: 'immaculate.event.v1',
      timestamp: '2026-04-17T00:00:00.000Z',
      sessionId: 'session-1',
      type: 'worker.assigned',
      routeId: 'route-2',
      workerId: 'worker-1',
      assignmentId: 'assignment-1',
    })

    expect(serialized).toBe(
      '{"assignmentId":"assignment-1","routeId":"route-2","schemaVersion":"immaculate.event.v1","sessionId":"session-1","timestamp":"2026-04-17T00:00:00.000Z","type":"worker.assigned","workerId":"worker-1"}',
    )
  })
})
