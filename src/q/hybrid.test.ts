import { describe, expect, test } from 'bun:test'
import {
  buildDryRunLaunch,
  buildHybridLaneReceipt,
  buildHybridLaunchArgs,
  computeHybridFallbackWindow,
  isHybridTransportFailure,
  Q_HYBRID_FALLBACK_FAILURE_THRESHOLD,
} from './hybrid.js'

describe('q hybrid helpers', () => {
  test('builds launch args with lineage, phase, and filters', () => {
    expect(
      buildHybridLaunchArgs({
        bundleDir: 'D:/bundle',
        outputDir: 'D:/out',
        runName: 'lane',
        lineageId: 'lineage-1',
        phaseId: 'phase-1',
        baseModel: 'q-lite',
        route: 'immaculate',
        maxSteps: 8,
        numTrainEpochs: 1,
        tags: ['agentic'],
        languages: ['ts'],
        allowHostRisk: true,
      }),
    ).toEqual([
      'scripts/launch-q-train.ts',
      '--bundle-dir',
      'D:/bundle',
      '--output-dir',
      'D:/out',
      '--run-name',
      'lane',
      '--base-model',
      'q-lite',
      '--route',
      'immaculate',
      '--lineage-id',
      'lineage-1',
      '--phase-id',
      'phase-1',
      '--max-steps',
      '8',
      '--num-train-epochs',
      '1',
      '--allow-host-risk',
      '--tag',
      'agentic',
      '--language',
      'ts',
    ])
  })

  test('builds a lane receipt from parsed launch output', () => {
    const receipt = buildHybridLaneReceipt({
      lane: 'immaculate',
      baseModel: 'q',
      outputDir: 'D:/out/immaculate',
      lineageId: 'lineage-1',
      phaseId: 'phase-1',
      launch: buildDryRunLaunch({
        runId: 'run-1',
        executionMode: 'immaculate_route_requested',
        lineageId: 'lineage-1',
        phaseId: 'phase-1',
        routeQueueDisplayStatus: 'queued',
        routeQueueSummary: 'queued for worker',
      }),
    })

    expect(receipt).toMatchObject({
      lane: 'immaculate',
      runId: 'run-1',
      status: 'dry_run',
      executionMode: 'immaculate_route_requested',
      routeQueueDisplayStatus: 'queued',
      routeQueueSummary: 'queued for worker',
      lineageId: 'lineage-1',
      phaseId: 'phase-1',
    })
  })

  test('holds the fast path until the transport-failure threshold is reached', () => {
    const first = computeHybridFallbackWindow({
      history: {
        failureTimestamps: [],
        lastSuccessAt: null,
      },
      nowIso: '2026-04-17T12:00:00.000Z',
      transportFailed: true,
      success: false,
    })
    const second = computeHybridFallbackWindow({
      history: first.history,
      nowIso: '2026-04-17T12:00:20.000Z',
      transportFailed: true,
      success: false,
    })
    const third = computeHybridFallbackWindow({
      history: second.history,
      nowIso: '2026-04-17T12:00:40.000Z',
      transportFailed: true,
      success: false,
    })

    expect(first.fallbackWindow.active).toBe(false)
    expect(second.fallbackWindow.active).toBe(false)
    expect(third.fallbackWindow.active).toBe(true)
    expect(third.fallbackWindow.recentTransportFailureCount).toBe(
      Q_HYBRID_FALLBACK_FAILURE_THRESHOLD,
    )
  })

  test('resets the fallback window on a routed success', () => {
    const failed = computeHybridFallbackWindow({
      history: {
        failureTimestamps: [
          '2026-04-17T12:00:00.000Z',
          '2026-04-17T12:00:10.000Z',
        ],
        lastSuccessAt: null,
      },
      nowIso: '2026-04-17T12:00:20.000Z',
      transportFailed: true,
      success: false,
    })
    const recovered = computeHybridFallbackWindow({
      history: failed.history,
      nowIso: '2026-04-17T12:00:25.000Z',
      transportFailed: false,
      success: true,
    })

    expect(recovered.fallbackWindow.active).toBe(false)
    expect(recovered.fallbackWindow.recentTransportFailureCount).toBe(0)
    expect(recovered.fallbackWindow.lastSuccessAt).toBe(
      '2026-04-17T12:00:25.000Z',
    )
  })

  test('detects transport-style immaculate failures from stderr and queue summary', () => {
    expect(
      isHybridTransportFailure({
        status: 'failed',
        stderr: 'remote dispatch 503 · harness is unavailable',
        routeQueueSummary: null,
        routeQueueDisplayStatus: null,
      }),
    ).toBe(true)
    expect(
      isHybridTransportFailure({
        status: 'route_requested',
        stderr: '',
        routeQueueSummary: 'queued for worker',
        routeQueueDisplayStatus: 'queued',
      }),
    ).toBe(false)
  })
})
