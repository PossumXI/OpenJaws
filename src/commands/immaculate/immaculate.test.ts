import { describe, expect, test } from 'bun:test'
import {
  formatImmaculateStatusMessage,
  parseImmaculateCommand,
} from './immaculate.js'

describe('/immaculate command parsing', () => {
  test('defaults to status with empty args', () => {
    expect(parseImmaculateCommand('')).toEqual({ type: 'status' })
  })

  test('parses direct control actions with target and value', () => {
    expect(parseImmaculateCommand('boost router-core 0.7')).toEqual({
      type: 'control',
      action: 'boost',
      target: 'router-core',
      value: 0.7,
    })
  })

  test('parses run with optional layer flag', () => {
    expect(
      parseImmaculateCommand('run --layer ollama-mid-q-e4b tighten routing'),
    ).toEqual({
      type: 'run',
      layerId: 'ollama-mid-q-e4b',
      objective: 'tighten routing',
    })
  })

  test('rejects unknown register roles', () => {
    expect(parseImmaculateCommand('register captain')).toEqual({
      type: 'error',
      message:
        'Unknown Immaculate Ollama role "captain". Valid roles: soul, mid, reasoner, guard',
    })
  })
})

describe('/immaculate status formatting', () => {
  test('formats live status with deck receipt', () => {
    expect(
      formatImmaculateStatusMessage(
        {
          enabled: true,
          mode: 'balanced',
          harnessUrl: 'http://127.0.0.1:8787',
          actor: 'openjaws',
          loopback: true,
          reachable: true,
          status: 200,
          service: 'immaculate-harness',
          clients: 0,
        },
        {
          profile: 'human-connectome-harness',
          cycle: 1032,
          nodes: 11,
          edges: 16,
          layerCount: 1,
          executionCount: 0,
          recommendedLayerId: 'ollama-mid-q-e4b',
        },
        {
          path: 'D:/openjaws/OpenJaws/artifacts/immaculate/session-traces/session.jsonl',
          sessionId: 'session-1',
          eventCount: 12,
          startedAt: '2026-04-16T00:00:00.000Z',
          endedAt: '2026-04-16T00:05:00.000Z',
          lastTimestamp: '2026-04-16T00:05:00.000Z',
          countsByType: {
            'route.dispatched': 2,
            'worker.assigned': 1,
          },
          routeDispatchCount: 2,
          routeLeaseCount: 1,
          workerAssignmentCount: 1,
          latestRouteId: 'route-2',
          latestWorkerId: 'worker-1',
          interactionLatency: {
            count: 3,
            p50Ms: 120,
            p95Ms: 450,
            maxMs: 450,
          },
          llmLatency: {
            count: 2,
            p50Ms: 200,
            p95Ms: 300,
            maxMs: 300,
          },
          reflexLatency: {
            count: 1,
            p50Ms: 80,
            p95Ms: 80,
            maxMs: 80,
          },
          cognitiveLatency: {
            count: 1,
            p50Ms: 140,
            p95Ms: 140,
            maxMs: 140,
          },
        },
      ),
    ).toContain('Trace: session-1 · 12 events · 2 dispatched · 1 assigned')
  })
})
