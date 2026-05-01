import { describe, expect, test } from 'bun:test'
import {
  buildRouteDispatchPythonArgs,
  evaluateQRouteCognitiveAdmission,
  getWorkerLeaseDurationMs,
  validateRemoteExecutionEndpoint,
} from './routing.js'
import type {
  QTrainingPreflight,
  QTrainingRouteManifest,
  QTrainingRouteQueueEntry,
} from '../utils/qTraining.js'

const routeNow = '2026-05-01T12:00:00.000Z'

function makeManifest(
  overrides: Partial<QTrainingRouteManifest> = {},
): QTrainingRouteManifest {
  return {
    runId: 'run-1',
    routeRequest: {
      route: 'immaculate',
      requestedAt: routeNow,
      target: 'q-train',
      recommendedLayerId: null,
      manifestPath: 'D:/out/route-request.json',
      controlStatus: 200,
      controlAccepted: true,
      controlSummary: 'accepted',
      harnessSnapshot: null,
      integrity: null,
      security: null,
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
      decision: 'allow_local',
      reasonCode: 'ok',
      summary: 'ready',
      baseModel: 'q-lite',
      useCpu: true,
    },
    security: {
      algorithm: 'hmac-sha256',
      payloadSha256: 'abc',
      signature: 'sig',
      secretSource: 'OPENJAWS_Q_ROUTE_SECRET',
      signedAt: routeNow,
    },
    ...overrides,
  }
}

function makePreflight(
  overrides: Partial<QTrainingPreflight> = {},
): QTrainingPreflight {
  return {
    decision: 'allow_local',
    reasonCode: 'ok',
    summary: 'ready',
    baseModel: 'q-lite',
    useCpu: true,
    ...overrides,
  }
}

function makeQueueEntry(
  overrides: Partial<QTrainingRouteQueueEntry> = {},
): QTrainingRouteQueueEntry {
  return {
    runId: 'run-1',
    manifestPath: 'D:/out/route-request.json',
    queuedAt: routeNow,
    updatedAt: routeNow,
    status: 'claimed',
    baseModel: 'q-lite',
    useCpu: true,
    lineageId: 'lineage-1',
    phaseId: 'phase-1',
    requestedExecutionDecision: 'allow_local',
    claim: {
      workerId: 'worker-1',
      claimedAt: routeNow,
    },
    ...overrides,
  }
}

const validRouteSecurity = {
  valid: true,
  reason: 'ok' as const,
  payloadSha256: 'abc',
  expectedPayloadSha256: 'abc',
  actualSignature: 'sig',
  expectedSignature: 'sig',
  secretSource: 'OPENJAWS_Q_ROUTE_SECRET' as const,
}

const validRouteIntegrity = {
  valid: true,
  trainPath: 'D:/out/bundle/train.jsonl',
  trainActualSha256: 'train-sha',
  trainExpectedSha256: 'train-sha',
  evalPath: 'D:/out/bundle/eval.jsonl',
  evalActualSha256: 'eval-sha',
  evalExpectedSha256: 'eval-sha',
}

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

  test('admits signed local Q route dispatch with governor approval from the route receipt', () => {
    const admission = evaluateQRouteCognitiveAdmission({
      manifest: makeManifest(),
      manifestPath: 'D:/out/route-request.json',
      workerId: 'worker-1',
      dispatchTransport: 'local_process',
      remoteExecution: false,
      routeSecurity: validRouteSecurity,
      routeIntegrity: validRouteIntegrity,
      preflight: makePreflight(),
      queueEntry: makeQueueEntry(),
      now: routeNow,
    })

    expect(admission).toMatchObject({
      status: 'allow',
      goalId: 'q-route:run-1',
      toolName: 'q.route.dispatch',
      riskTier: 2,
      missingApprovals: [],
      pacingStatus: 'clear',
    })
    expect(admission.trace.nodes.map(node => node.kind)).toContain('goal')
    expect(admission.memoryUpdates.map(update => update.layer)).toContain(
      'working',
    )
    expect(admission.scorecardMetrics.policyCompliance).toBeGreaterThan(0.9)
  })

  test('blocks remote Q route dispatch when ledger approval is absent', () => {
    const admission = evaluateQRouteCognitiveAdmission({
      manifest: makeManifest({
        routeRequest: {
          ...makeManifest().routeRequest,
          controlAccepted: false,
          controlSummary: null,
        },
      }),
      manifestPath: 'D:/out/route-request.json',
      workerId: 'worker-1',
      dispatchTransport: 'remote_http',
      remoteExecution: true,
      routeSecurity: validRouteSecurity,
      routeIntegrity: validRouteIntegrity,
      preflight: makePreflight({ decision: 'remote_required' }),
      queueEntry: makeQueueEntry(),
      now: routeNow,
    })

    expect(admission.status).toBe('review')
    expect(admission.riskTier).toBe(3)
    expect(admission.missingApprovals).toEqual(['ledger_recorder'])
    expect(admission.nextStep).toContain('collect missing approvals')
    expect(admission.memoryUpdates.some(update => update.layer === 'procedural')).toBe(
      true,
    )
  })
})
