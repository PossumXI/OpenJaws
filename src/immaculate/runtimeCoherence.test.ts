import { describe, expect, test } from 'bun:test'
import { buildRuntimeCoherenceReport } from './runtimeCoherence.js'

describe('runtimeCoherence', () => {
  test('reports an ok fail-closed state when the harness is down and traces are not active', () => {
    const report = buildRuntimeCoherenceReport({
      harnessStatus: {
        enabled: true,
        reachable: false,
        harnessUrl: 'http://127.0.0.1:8787',
        error: 'connect ECONNREFUSED',
      },
      qAgentReceipt: {
        version: 1,
        updatedAt: '2026-04-20T12:00:00.000Z',
        startedAt: '2026-04-20T10:00:00.000Z',
        status: 'ready',
        backend: 'Q backend',
        guilds: [{ id: '1', name: 'Arobi' }],
        gateway: {
          connected: true,
          userId: 'bot-1',
          guildCount: 1,
          lastSequence: 42,
        },
        schedule: {
          enabled: true,
          intervalMs: 900_000,
          cycleCount: 2,
        },
        routing: {
          lastDecision: null,
          lastPostedChannelName: null,
          lastPostedReason: null,
          channels: [],
        },
        voice: {
          enabled: true,
          provider: 'system',
          ready: true,
          connected: true,
        },
        patrol: {
          snapshot: {
            harnessReachable: false,
            harnessSummary: 'unreachable',
            deckSummary: null,
            workerSummary: null,
            trainingSummary: null,
            hybridSummary: null,
            routeQueueSummary: null,
            queueLength: 3,
            recommendedLayerId: null,
          },
        },
        knowledge: {
          enabled: false,
          ready: false,
          fileCount: 0,
          chunkCount: 0,
        },
        operator: {},
        events: [],
      },
      immaculateTrace: {
        path: 'immaculate.trace.jsonl',
        sessionId: 'immaculate-1',
        eventCount: 5,
        startedAt: '2026-04-18T10:00:00.000Z',
        endedAt: '2026-04-18T10:05:00.000Z',
        lastTimestamp: '2026-04-18T10:05:00.000Z',
        runState: 'completed',
        countsByType: {},
        routeDispatchCount: 1,
        routeLeaseCount: 1,
        workerAssignmentCount: 1,
        latestRouteId: 'route-1',
        latestWorkerId: 'worker-1',
        interactionLatency: { count: 0, p50Ms: null, p95Ms: null, maxMs: null },
        llmLatency: { count: 0, p50Ms: null, p95Ms: null, maxMs: null },
        reflexLatency: { count: 0, p50Ms: null, p95Ms: null, maxMs: null },
        cognitiveLatency: { count: 0, p50Ms: null, p95Ms: null, maxMs: null },
      },
      qTrace: null,
      routeQueueDepth: 3,
      roundtable: {
        status: 'completed',
        channelName: 'dev_support',
      },
      probes: [
        {
          label: 'Q',
          url: 'http://127.0.0.1:8788/health',
          reachable: true,
          status: 'ok',
        },
      ],
    })

    expect(report.status).toBe('warning')
    expect(
      report.checks.find(check => check.id === 'harness-receipt-alignment')?.status,
    ).toBe('ok')
    expect(
      report.checks.find(check => check.id === 'route-queue-depth')?.status,
    ).toBe('ok')
  })

  test('fails when a live harness disagreement or active trace drift is detected', () => {
    const report = buildRuntimeCoherenceReport({
      harnessStatus: {
        enabled: true,
        reachable: false,
        harnessUrl: 'http://127.0.0.1:8787',
        error: 'connect ECONNREFUSED',
      },
      qAgentReceipt: {
        version: 1,
        updatedAt: '2026-04-20T12:00:00.000Z',
        startedAt: '2026-04-20T10:00:00.000Z',
        status: 'ready',
        backend: 'Q backend',
        guilds: [],
        gateway: {
          connected: true,
          userId: 'bot-1',
          guildCount: 0,
          lastSequence: 42,
        },
        schedule: {
          enabled: true,
          intervalMs: 900_000,
          cycleCount: 2,
        },
        routing: {
          lastDecision: null,
          lastPostedChannelName: null,
          lastPostedReason: null,
          channels: [],
        },
        voice: {
          enabled: true,
          provider: 'system',
          ready: true,
          connected: true,
        },
        patrol: {
          snapshot: {
            harnessReachable: true,
            harnessSummary: 'reachable',
            deckSummary: null,
            workerSummary: null,
            trainingSummary: null,
            hybridSummary: null,
            routeQueueSummary: null,
            queueLength: 1,
            recommendedLayerId: null,
          },
        },
        knowledge: {
          enabled: false,
          ready: false,
          fileCount: 0,
          chunkCount: 0,
        },
        operator: {},
        events: [],
      },
      immaculateTrace: {
        path: 'immaculate.trace.jsonl',
        sessionId: 'immaculate-1',
        eventCount: 5,
        startedAt: '2026-04-20T10:00:00.000Z',
        endedAt: null,
        lastTimestamp: '2026-04-20T10:05:00.000Z',
        runState: 'active',
        countsByType: {},
        routeDispatchCount: 1,
        routeLeaseCount: 1,
        workerAssignmentCount: 1,
        latestRouteId: 'route-1',
        latestWorkerId: 'worker-1',
        interactionLatency: { count: 0, p50Ms: null, p95Ms: null, maxMs: null },
        llmLatency: { count: 0, p50Ms: null, p95Ms: null, maxMs: null },
        reflexLatency: { count: 0, p50Ms: null, p95Ms: null, maxMs: null },
        cognitiveLatency: { count: 0, p50Ms: null, p95Ms: null, maxMs: null },
      },
      qTrace: null,
      routeQueueDepth: 3,
      roundtable: {
        status: 'running',
        channelName: 'dev_support',
      },
    })

    expect(report.status).toBe('failed')
    expect(
      report.checks.find(check => check.id === 'harness-receipt-alignment')?.status,
    ).toBe('failed')
    expect(
      report.checks.find(check => check.id === 'active-trace-vs-harness')?.status,
    ).toBe('failed')
  })

  test('warns when the voice runtime is enabled but not actually connected', () => {
    const report = buildRuntimeCoherenceReport({
      harnessStatus: {
        enabled: true,
        reachable: true,
        harnessUrl: 'http://127.0.0.1:8787',
      },
      qAgentReceipt: {
        version: 1,
        updatedAt: '2026-04-20T12:00:00.000Z',
        startedAt: '2026-04-20T10:00:00.000Z',
        status: 'ready',
        backend: 'Q backend',
        guilds: [{ id: '1', name: 'Arobi' }],
        gateway: {
          connected: true,
          userId: 'bot-1',
          guildCount: 1,
          lastSequence: 42,
        },
        schedule: {
          enabled: true,
          intervalMs: 900_000,
          cycleCount: 2,
        },
        routing: {
          lastDecision: null,
          lastPostedChannelName: null,
          lastPostedReason: null,
          channels: [],
        },
        voice: {
          enabled: true,
          provider: 'system',
          ready: true,
          connected: false,
          runtimeUrl: 'ws://127.0.0.1:8791',
        },
        patrol: {
          snapshot: {
            harnessReachable: true,
            harnessSummary: 'reachable',
            deckSummary: null,
            workerSummary: null,
            trainingSummary: null,
            hybridSummary: null,
            routeQueueSummary: null,
            queueLength: 0,
            recommendedLayerId: null,
          },
        },
        knowledge: {
          enabled: false,
          ready: false,
          fileCount: 0,
          chunkCount: 0,
        },
        operator: {},
        events: [],
      },
      immaculateTrace: null,
      qTrace: null,
      routeQueueDepth: 0,
      roundtable: {
        status: 'completed',
        channelName: 'dev_support',
      },
    })

    expect(report.status).toBe('warning')
    expect(
      report.checks.find(check => check.id === 'voice-runtime')?.status,
    ).toBe('warning')
  })
})
