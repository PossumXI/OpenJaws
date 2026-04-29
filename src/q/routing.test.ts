import { describe, expect, test } from 'bun:test'
import {
  buildRouteDispatchPythonArgs,
  getWorkerLeaseDurationMs,
  resolveRemoteDispatchAckBlockReason,
  validateRemoteExecutionEndpoint,
} from './routing.js'

describe('q routing helpers', () => {
  test('computes worker lease duration from ttl and poll interval', () => {
    expect(
      getWorkerLeaseDurationMs({
        root: null,
        manifestPath: null,
        dryRun: false,
        allowHostRisk: false,
        python: null,
        workerId: 'worker-1',
        workerLabel: null,
        hostLabel: null,
        executionProfile: 'local',
        executionEndpoint: null,
        baseModels: [],
        preferredLayers: [],
        claimTtlMs: 10_000,
        heartbeatMs: 5_000,
        watch: true,
        pollMs: 8_000,
        idleExitMs: null,
        dispatchDelayMs: null,
      }),
    ).toBe(24_000)
  })

  test('builds route-dispatch python args from a manifest', () => {
    expect(
      buildRouteDispatchPythonArgs({
        manifestPath: 'D:/out/route-request.json',
        manifestDir: 'D:/out',
        executionMode: 'immaculate_routed',
        manifest: {
          runId: 'run-1',
          routeRequest: {
            route: 'immaculate',
            requestedAt: '2026-04-16T00:00:00.000Z',
            target: 'q-train',
            recommendedLayerId: null,
            manifestPath: 'D:/out/route-request.json',
            controlStatus: 200,
            controlAccepted: true,
            controlSummary: 'accepted',
            harnessSnapshot: null,
            integrity: null,
          },
          training: {
            baseModel: 'q-lite',
            runName: 'lane',
            trainFile: 'bundle/train.jsonl',
            evalFile: 'bundle/eval.jsonl',
            selectedTags: ['agentic'],
            selectedLanguages: ['ts'],
            outputDir: '.',
            useCpu: true,
            lineageId: 'lineage-1',
            phaseId: 'phase-1',
            maxSteps: 4,
            numTrainEpochs: 1,
          },
          preflight: {
            decision: 'local_ok',
            summary: 'ready',
            checks: [],
          },
          security: {
            algorithm: 'hmac-sha256',
            payloadSha256: 'abc',
            signature: 'sig',
            keyId: 'key',
          },
          createdAt: '2026-04-16T00:00:00.000Z',
        },
      }),
    ).toEqual([
      expect.stringContaining('training'),
      '--train-file',
      expect.stringContaining('bundle'),
      '--base-model',
      'q-lite',
      '--output-dir',
      'D:/out',
      '--route-manifest',
      'D:/out/route-request.json',
      '--execution-mode',
      'immaculate_routed',
      '--eval-file',
      expect.stringContaining('bundle'),
      '--run-name',
      'lane',
      '--use-cpu',
      '--max-steps',
      '4',
      '--num-train-epochs',
      '1',
      '--tag',
      'agentic',
      '--language',
      'ts',
    ])
  })

  test('allows https remote execution endpoints by default', () => {
    expect(
      validateRemoteExecutionEndpoint({
        endpoint: 'https://remote-gpu-box.example/execute',
        allowHostRisk: false,
      }),
    ).toEqual({
      ok: true,
      endpoint: 'https://remote-gpu-box.example/execute',
    })
  })

  test('blocks insecure public remote execution endpoints without host-risk override', () => {
    expect(
      validateRemoteExecutionEndpoint({
        endpoint: 'http://remote-gpu-box.example/execute',
        allowHostRisk: false,
      }),
    ).toEqual({
      ok: false,
      error:
        'remote execution endpoint must use https unless it targets a trusted local host or allow-host-risk is enabled',
    })
  })

  test('allows insecure loopback endpoints for local routed execution', () => {
    expect(
      validateRemoteExecutionEndpoint({
        endpoint: 'http://127.0.0.1:8787/execute',
        allowHostRisk: false,
      }),
    ).toEqual({
      ok: true,
      endpoint: 'http://127.0.0.1:8787/execute',
    })
  })

  test('requires remote dispatch acknowledgements to include a state URL', () => {
    expect(
      resolveRemoteDispatchAckBlockReason({
        accepted: true,
        executionId: 'exec-1',
        summary: 'accepted',
        stateUrl: null,
        status: 202,
      }),
    ).toBe('remote dispatch 202 accepted without stateUrl')

    expect(
      resolveRemoteDispatchAckBlockReason({
        accepted: true,
        executionId: 'exec-1',
        summary: 'accepted',
        stateUrl: ' https://route.example/state/run-1.json ',
        status: 202,
      }),
    ).toBeNull()
  })
})
