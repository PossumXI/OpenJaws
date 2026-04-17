import { describe, expect, test } from 'bun:test'
import {
  buildDryRunLaunch,
  buildHybridLaneReceipt,
  buildHybridLaunchArgs,
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
})
