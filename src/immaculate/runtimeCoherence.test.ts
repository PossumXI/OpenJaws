import { describe, expect, test } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { buildRuntimeCoherenceReport } from './runtimeCoherence.js'

function readyQReceipt() {
  return {
    version: 1,
    updatedAt: '2026-04-20T12:00:00.000Z',
    startedAt: '2026-04-20T10:00:00.000Z',
    status: 'ready' as const,
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
      enabled: false,
      provider: 'system',
      ready: false,
      connected: false,
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
  }
}

describe('runtimeCoherence', () => {
  test('scores public Immaculate intelligence readiness separately from topology reachability', () => {
    const report = buildRuntimeCoherenceReport({
      harnessStatus: {
        enabled: true,
        reachable: true,
        harnessUrl: 'http://127.0.0.1:8787',
      },
      immaculateIntelligenceStatus: {
        status: 'degraded',
        service: 'immaculate-harness',
        visibility: 'public-redacted',
        summary: 'degraded: 3 governed work items are queued',
        reasons: ['3 governed work items are queued'],
        recommendedLayerId: 'router-core',
        layerPlane: {
          layerCount: 2,
          readyLayerCount: 2,
        },
        workerPlane: {
          workerCount: 4,
          healthyWorkerCount: 4,
          readiness: 'ready',
        },
        executionPlane: {
          executionCount: 7,
        },
        governor: {
          queueDepth: 3,
        },
        persistence: {
          recoveryMode: 'snapshot',
          persistedEventCount: 9774,
          integrityStatus: 'verified',
          integrityFindingCount: 0,
        },
      },
      qAgentReceipt: null,
      immaculateTrace: null,
      qTrace: null,
    })

    const check = report.checks.find(
      item => item.id === 'harness-intelligence-status',
    )

    expect(check?.status).toBe('warning')
    expect(check?.summary).toContain(
      '2/2 ready layers and worker readiness ready',
    )
    expect(check?.detail).toBe('degraded: 3 governed work items are queued')
  })

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
    expect(
      report.checks.find(check => check.id === 'trace-freshness')?.status,
    ).toBe('warning')
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

  test('warns when roundtable session truth is expired or stale after reconciliation', () => {
    const freshEndedAt = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    const freshStartedAt = new Date(Date.now() - 30 * 60 * 1000).toISOString()

    for (const roundtableStatus of ['expired', 'stale'] as const) {
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
            enabled: false,
            provider: 'system',
            ready: false,
            connected: false,
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
        immaculateTrace: {
          path: 'immaculate.trace.jsonl',
          sessionId: 'immaculate-fresh',
          eventCount: 3,
          startedAt: freshStartedAt,
          endedAt: freshEndedAt,
          lastTimestamp: freshEndedAt,
          runState: 'completed',
          countsByType: {},
          routeDispatchCount: 0,
          routeLeaseCount: 0,
          workerAssignmentCount: 0,
          latestRouteId: null,
          latestWorkerId: null,
          interactionLatency: { count: 0, p50Ms: null, p95Ms: null, maxMs: null },
          llmLatency: { count: 0, p50Ms: null, p95Ms: null, maxMs: null },
          reflexLatency: { count: 0, p50Ms: null, p95Ms: null, maxMs: null },
          cognitiveLatency: { count: 0, p50Ms: null, p95Ms: null, maxMs: null },
        },
        qTrace: null,
        routeQueueDepth: 0,
        roundtable: {
          status: roundtableStatus,
          channelName: 'dev_support',
          updatedAt: freshEndedAt,
          lastSummary: 'Q action awaiting_approval: Q audit-and-tighten pass',
        },
      })

      expect(report.status).toBe('warning')
      expect(
        report.checks.find(check => check.id === 'roundtable-runtime')?.status,
      ).toBe('warning')
      expect(
        report.checks.find(check => check.id === 'roundtable-runtime')?.summary,
      ).toBe(`Roundtable is ${roundtableStatus} in #dev_support.`)
      expect(
        report.checks.find(check => check.id === 'roundtable-runtime')?.detail,
      ).toBe('Q action awaiting_approval: Q audit-and-tighten pass')
    }
  })

  test('warns when roundtable has a live runtime error even if the session is idle', () => {
    const report = buildRuntimeCoherenceReport({
      harnessStatus: {
        enabled: true,
        reachable: true,
        harnessUrl: 'http://127.0.0.1:8787',
      },
      qAgentReceipt: readyQReceipt(),
      immaculateTrace: null,
      qTrace: null,
      routeQueueDepth: 0,
      roundtable: {
        status: 'idle',
        channelName: 'dev_support',
        lastError: 'OCI provider rejected the roundtable model.',
      },
    })

    const check = report.checks.find(item => item.id === 'roundtable-runtime')
    expect(report.status).toBe('warning')
    expect(check?.status).toBe('warning')
    expect(check?.detail).toBe('OCI provider rejected the roundtable model.')
  })

  test('warns when an active roundtable session has no live launch child', () => {
    const report = buildRuntimeCoherenceReport({
      harnessStatus: {
        enabled: true,
        reachable: true,
        harnessUrl: 'http://127.0.0.1:8787',
      },
      qAgentReceipt: readyQReceipt(),
      immaculateTrace: null,
      qTrace: null,
      routeQueueDepth: 0,
      roundtable: {
        status: 'running',
        channelName: 'dev_support',
        launchChildAlive: false,
        launchDetail:
          'Roundtable session is running, but launch pid 1234 is not running.',
      },
    })

    const check = report.checks.find(item => item.id === 'roundtable-runtime')
    expect(report.status).toBe('warning')
    expect(check?.status).toBe('warning')
    expect(check?.detail).toBe(
      'Roundtable session is running, but launch pid 1234 is not running.',
    )
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

  test('marks recent completed traces as fresh for release auditing', () => {
    const freshEndedAt = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    const freshStartedAt = new Date(Date.now() - 30 * 60 * 1000).toISOString()

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
          enabled: false,
          provider: 'system',
          ready: false,
          connected: false,
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
      immaculateTrace: {
        path: 'immaculate.trace.jsonl',
        sessionId: 'immaculate-fresh',
        eventCount: 3,
        startedAt: freshStartedAt,
        endedAt: freshEndedAt,
        lastTimestamp: freshEndedAt,
        runState: 'completed',
        countsByType: {},
        routeDispatchCount: 0,
        routeLeaseCount: 0,
        workerAssignmentCount: 0,
        latestRouteId: null,
        latestWorkerId: null,
        interactionLatency: { count: 0, p50Ms: null, p95Ms: null, maxMs: null },
        llmLatency: { count: 0, p50Ms: null, p95Ms: null, maxMs: null },
        reflexLatency: { count: 0, p50Ms: null, p95Ms: null, maxMs: null },
        cognitiveLatency: { count: 0, p50Ms: null, p95Ms: null, maxMs: null },
      },
      qTrace: null,
      routeQueueDepth: 0,
      roundtable: {
        status: 'completed',
        channelName: 'dev_support',
      },
    })

    expect(
      report.checks.find(check => check.id === 'trace-freshness')?.status,
    ).toBe('ok')
  })

  test('warns when the latest local trace summary points to a missing file path', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'openjaws-runtime-coherence-'))
    const missingImmaculateTracePath = join(tempDir, 'missing-immaculate.trace.jsonl')
    const missingQTracePath = join(tempDir, 'missing-q.trace.jsonl')

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
          enabled: false,
          provider: 'system',
          ready: false,
          connected: false,
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
      immaculateTrace: {
        path: missingImmaculateTracePath,
        sessionId: 'immaculate-1',
        eventCount: 5,
        startedAt: '2026-04-20T10:00:00.000Z',
        endedAt: null,
        lastTimestamp: '2026-04-20T10:05:00.000Z',
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
      qTrace: {
        path: missingQTracePath,
        kind: 'benchmark',
        sessionId: 'q-1',
        eventCount: 2,
        startedAt: '2026-04-20T10:00:00.000Z',
        endedAt: null,
        lastTimestamp: '2026-04-20T10:05:00.000Z',
        runState: 'completed',
        countsByType: {},
        routeDispatchCount: 0,
        routeLeaseCount: 0,
        workerAssignmentCount: 0,
        latestRouteId: null,
        latestWorkerId: null,
        interactionLatency: { count: 0, p50Ms: null, p95Ms: null, maxMs: null },
        llmLatency: { count: 0, p50Ms: null, p95Ms: null, maxMs: null },
        reflexLatency: { count: 0, p50Ms: null, p95Ms: null, maxMs: null },
        cognitiveLatency: { count: 0, p50Ms: null, p95Ms: null, maxMs: null },
      },
    })

    expect(report.status).toBe('warning')
    expect(report.checks.find(check => check.id === 'immaculate-trace-path')?.status).toBe(
      'warning',
    )
    expect(report.checks.find(check => check.id === 'q-trace-path')?.status).toBe('warning')
  })

  test('warns when the trace provenance path in session.started diverges from the summary path', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'openjaws-runtime-coherence-provenance-'))
    const immaculateTracePath = join(tempDir, 'immaculate.trace.jsonl')
    const qTracePath = join(tempDir, 'q.trace.jsonl')

    writeFileSync(
      immaculateTracePath,
      [
        JSON.stringify({
          schemaVersion: 'immaculate.event.v1',
          timestamp: '2026-04-20T10:00:00.000Z',
          sessionId: 'immaculate-1',
          type: 'session.started',
          tracePath: join(tempDir, 'elsewhere.trace.jsonl'),
        }),
      ].join('\n'),
      'utf8',
    )

    writeFileSync(
      qTracePath,
      [
        JSON.stringify({
          schemaVersion: 'immaculate.event.v1',
          timestamp: '2026-04-20T10:00:00.000Z',
          sessionId: 'q-1',
          type: 'session.started',
          tracePath: join(tempDir, 'elsewhere-q.trace.jsonl'),
        }),
      ].join('\n'),
      'utf8',
    )

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
          enabled: false,
          provider: 'system',
          ready: false,
          connected: false,
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
      immaculateTrace: {
        path: immaculateTracePath,
        sessionId: 'immaculate-1',
        eventCount: 1,
        startedAt: '2026-04-20T10:00:00.000Z',
        endedAt: null,
        lastTimestamp: '2026-04-20T10:00:00.000Z',
        runState: 'completed',
        countsByType: {},
        routeDispatchCount: 0,
        routeLeaseCount: 0,
        workerAssignmentCount: 0,
        latestRouteId: null,
        latestWorkerId: null,
        interactionLatency: { count: 0, p50Ms: null, p95Ms: null, maxMs: null },
        llmLatency: { count: 0, p50Ms: null, p95Ms: null, maxMs: null },
        reflexLatency: { count: 0, p50Ms: null, p95Ms: null, maxMs: null },
        cognitiveLatency: { count: 0, p50Ms: null, p95Ms: null, maxMs: null },
      },
      qTrace: {
        path: qTracePath,
        kind: 'benchmark',
        sessionId: 'q-1',
        eventCount: 1,
        startedAt: '2026-04-20T10:00:00.000Z',
        endedAt: null,
        lastTimestamp: '2026-04-20T10:00:00.000Z',
        runState: 'completed',
        countsByType: {},
        routeDispatchCount: 0,
        routeLeaseCount: 0,
        workerAssignmentCount: 0,
        latestRouteId: null,
        latestWorkerId: null,
        interactionLatency: { count: 0, p50Ms: null, p95Ms: null, maxMs: null },
        llmLatency: { count: 0, p50Ms: null, p95Ms: null, maxMs: null },
        reflexLatency: { count: 0, p50Ms: null, p95Ms: null, maxMs: null },
        cognitiveLatency: { count: 0, p50Ms: null, p95Ms: null, maxMs: null },
      },
    })

    expect(report.status).toBe('warning')
    expect(
      report.checks.find(check => check.id === 'immaculate-trace-provenance')?.status,
    ).toBe('warning')
    expect(report.checks.find(check => check.id === 'q-trace-provenance')?.status).toBe(
      'warning',
    )
  })

  test('keeps actionable probe detail ahead of generic probe status', () => {
    const report = buildRuntimeCoherenceReport({
      harnessStatus: {
        enabled: true,
        reachable: true,
        harnessUrl: 'http://127.0.0.1:8787',
      },
      qAgentReceipt: null,
      immaculateTrace: null,
      qTrace: null,
      probes: [
        {
          label: 'PersonaPlex',
          url: 'ws://127.0.0.1:8998/api/chat',
          reachable: false,
          status: 'error',
          detail:
            'PersonaPlex WebSocket error | start it with the local voice launcher',
        },
      ],
    })

    expect(report.checks.find(check => check.id === 'probe-PersonaPlex')?.detail).toBe(
      'PersonaPlex WebSocket error | start it with the local voice launcher',
    )
  })

  test('normalizes probe labels into stable check ids', () => {
    const report = buildRuntimeCoherenceReport({
      harnessStatus: {
        enabled: true,
        reachable: true,
        harnessUrl: 'http://127.0.0.1:8787',
      },
      qAgentReceipt: null,
      immaculateTrace: null,
      qTrace: null,
      probes: [
        {
          label: 'Apex browser bridge',
          url: 'http://127.0.0.1:8799',
          reachable: true,
          status: 'healthy',
        },
      ],
    })

    expect(report.checks.some(check => check.id === 'probe-Apex-browser-bridge')).toBe(
      true,
    )
  })
})
