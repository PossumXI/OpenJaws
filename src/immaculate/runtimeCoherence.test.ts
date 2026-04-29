import { describe, expect, test } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
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

  test('warns instead of failing when a stale patrol snapshot says the recovered harness is offline', () => {
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
          provider: 'off',
          ready: false,
          connected: false,
        },
        patrol: {
          snapshot: {
            harnessReachable: false,
            harnessSummary: 'offline',
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
      immaculateTrace: null,
      qTrace: null,
      routeQueueDepth: 3,
    })

    expect(report.status).toBe('warning')
    expect(
      report.checks.find(check => check.id === 'harness-receipt-alignment'),
    ).toMatchObject({
      status: 'warning',
      summary: 'Discord patrol snapshot is stale; live harness has recovered.',
      detail: 'receipt=false live=true',
    })
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

  test('warns when the roundtable runtime is in an error state', () => {
    const report = buildRuntimeCoherenceReport({
      harnessStatus: {
        enabled: true,
        reachable: true,
        harnessUrl: 'http://127.0.0.1:8787',
      },
      qAgentReceipt: null,
      immaculateTrace: null,
      qTrace: null,
      roundtable: {
        status: 'error',
        channelName: 'dev_support',
        lastError: 'OpenJaws scripted operator job did not produce a result receipt.',
      },
    })

    expect(report.status).toBe('warning')
    expect(report.checks.find(check => check.id === 'roundtable-runtime')).toMatchObject({
      status: 'warning',
      summary: 'Roundtable is error in #dev_support.',
      detail: 'OpenJaws scripted operator job did not produce a result receipt.',
    })
  })

  test('warns when Q is reconnecting after a retryable Discord gateway close', () => {
    const report = buildRuntimeCoherenceReport({
      harnessStatus: {
        enabled: true,
        reachable: true,
        harnessUrl: 'http://127.0.0.1:8787',
      },
      qAgentReceipt: {
        version: 1,
        updatedAt: '2026-04-25T12:38:13.768Z',
        startedAt: '2026-04-25T12:07:36.900Z',
        status: 'error',
        backend: 'Q backend',
        guilds: [{ id: '1', name: 'Arobi' }],
        gateway: {
          connected: false,
          userId: 'bot-1',
          guildCount: 1,
          lastSequence: 8,
          lastCloseCode: 1006,
          lastError: 'Discord gateway closed with code 1006: Connection ended',
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
          provider: 'off',
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
          enabled: true,
          ready: true,
          fileCount: 10,
          chunkCount: 10,
        },
        operator: {},
        events: [],
      },
      immaculateTrace: null,
      qTrace: null,
      routeQueueDepth: 0,
    })

    expect(report.status).toBe('warning')
    expect(report.checks.find(check => check.id === 'discord-q-receipt')).toMatchObject({
      status: 'warning',
      summary: 'Q Discord runtime is reconnecting after gateway close 1006.',
      detail: 'Discord gateway closed with code 1006: Connection ended',
    })
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

  test('warns when a reachable Discord agent probe reports degraded health', () => {
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
          label: 'Viola',
          url: 'http://127.0.0.1:8789/health',
          reachable: true,
          status: 'error',
          detail: 'Discord gateway authentication failed.',
        },
      ],
    })

    expect(report.status).toBe('warning')
    expect(report.checks.find(check => check.id === 'probe-Viola')).toMatchObject({
      status: 'warning',
      summary: expect.stringContaining('reachable but reporting degraded health'),
      detail: 'Discord gateway authentication failed.',
    })
  })

  test('preserves detailed diagnostics for unreachable runtime probes', () => {
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
          detail: 'PersonaPlex WebSocket error (mode windows, last healthy 4d ago)',
        },
      ],
    })

    expect(report.status).toBe('warning')
    expect(report.checks.find(check => check.id === 'probe-PersonaPlex')).toMatchObject({
      status: 'warning',
      summary: expect.stringContaining('PersonaPlex unreachable'),
      detail: 'PersonaPlex WebSocket error (mode windows, last healthy 4d ago)',
    })
  })
})
