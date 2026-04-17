import { describe, expect, test } from 'bun:test'
import { buildPythonTrainArgs, buildQRouteTarget } from './trainLaunch.js'

describe('q train launch helpers', () => {
  test('builds a normalized immaculate route target', () => {
    expect(
      buildQRouteTarget({
        baseModel: 'q-lite',
        tags: ['agentic', 'security'],
        languages: ['ts'],
        runName: 'nightly',
      }),
    ).toContain('q-train')
  })

  test('builds python launch args with route metadata', () => {
    expect(
      buildPythonTrainArgs({
        trainFile: 'D:/train.jsonl',
        evalFile: 'D:/eval.jsonl',
        baseModel: 'q-lite',
        outputDir: 'D:/out',
        runName: 'lane',
        lineageId: 'lineage-1',
        phaseId: 'phase-1',
        useCpu: true,
        maxSteps: 4,
        numTrainEpochs: 1,
        tags: ['agentic'],
        languages: ['ts'],
        routeManifestPath: 'D:/out/route-request.json',
        executionMode: 'immaculate_route_requested',
      }),
    ).toEqual([
      expect.stringContaining('training'),
      '--train-file',
      'D:/train.jsonl',
      '--base-model',
      'q-lite',
      '--output-dir',
      'D:/out',
      '--eval-file',
      'D:/eval.jsonl',
      '--run-name',
      'lane',
      '--lineage-id',
      'lineage-1',
      '--phase-id',
      'phase-1',
      '--use-cpu',
      '--max-steps',
      '4',
      '--num-train-epochs',
      '1',
      '--route-manifest',
      'D:/out/route-request.json',
      '--execution-mode',
      'immaculate_route_requested',
      '--tag',
      'agentic',
      '--language',
      'ts',
    ])
  })
})
