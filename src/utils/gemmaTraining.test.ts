import { afterEach, describe, expect, it } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  buildGemmaTrainingRouteDispatchEnvelope,
  buildGemmaTrainingRouteResultEnvelope,
  buildGemmaTrainingRouteManifest,
  claimGemmaTrainingRouteQueueEntry,
  claimNextQueuedGemmaTrainingRoute,
  finalizeGemmaTrainingRouteQueueCompletion,
  finalizeGemmaTrainingRouteQueueDispatch,
  evaluateGemmaTrainingPreflight,
  getNextGemmaTrainingRoutePendingRemoteResult,
  getGemmaTrainingRouteQueueEntry,
  getGemmaTrainingRouteWorker,
  getLatestGemmaTrainingSnapshot,
  getNextQueuedGemmaTrainingRoute,
  isGemmaTrainingRouteQueueClaimExpired,
  isGemmaTrainingRouteQueuePendingRemoteResult,
  readGemmaTrainingRouteWorkers,
  readGemmaTrainingRouteWorkerRuntimeStatuses,
  readGemmaTrainingRegistry,
  reapStaleGemmaTrainingRouteQueueClaims,
  reapStaleGemmaTrainingRouteWorkers,
  releaseGemmaTrainingRouteQueueClaim,
  relativizeGemmaTrainingFileIntegrity,
  removeGemmaTrainingRouteWorkerRuntimeStatus,
  removeGemmaTrainingRouteWorker,
  renewGemmaTrainingRouteQueueClaim,
  resolveGemmaTrainingRoutePath,
  stageGemmaTrainingRouteFile,
  updateGemmaTrainingRouteQueueClaim,
  upsertGemmaTrainingRouteQueueEntry,
  upsertGemmaTrainingRegistryEntry,
  upsertGemmaTrainingRouteWorkerRuntimeStatus,
  upsertGemmaTrainingRouteWorker,
  verifyGemmaTrainingRouteManifest,
  verifyGemmaTrainingRouteDispatchEnvelope,
  verifyGemmaTrainingRouteResultEnvelope,
  verifyGemmaTrainingRouteManifestIntegrity,
  writeGemmaTrainingRegistry,
  computeGemmaTrainingFileIntegrity,
  buildGemmaTrainingRouteReceipt,
  getGemmaTrainingRouteQueueStatusSummary,
} from './gemmaTraining.js'

const tempDirs: string[] = []

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) {
      rmSync(dir, { recursive: true, force: true })
    }
  }
})

function makeRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), 'openjaws-gemma-training-'))
  tempDirs.push(dir)
  return dir
}

describe('gemmaTraining registry', () => {
  it('upserts registry entries by run id', () => {
    const root = makeRoot()

    upsertGemmaTrainingRegistryEntry(
      {
        runId: 'run-1',
        status: 'launched',
        pid: 123,
        launchedAt: '2026-04-11T00:00:00.000Z',
        outputDir: join(root, 'artifacts', 'gemma4-runs', 'run-1'),
        trainFile: 'train.jsonl',
        evalFile: 'eval.jsonl',
        baseModel: 'google/gemma-4-E4B-it',
        selectedTags: ['coding'],
        selectedLanguages: ['typescript'],
        runName: 'demo',
        logFiles: {
          stdout: 'stdout.log',
          stderr: 'stderr.log',
        },
        runStatePath: 'run-state.json',
      },
      root,
    )

    upsertGemmaTrainingRegistryEntry(
      {
        runId: 'run-1',
        status: 'running',
        pid: 456,
        launchedAt: '2026-04-11T00:00:00.000Z',
        outputDir: join(root, 'artifacts', 'gemma4-runs', 'run-1'),
        trainFile: 'train.jsonl',
        evalFile: 'eval.jsonl',
        baseModel: 'google/gemma-4-E4B-it',
        selectedTags: ['coding'],
        selectedLanguages: ['typescript'],
        runName: 'demo',
        logFiles: {
          stdout: 'stdout.log',
          stderr: 'stderr.log',
        },
        runStatePath: 'run-state.json',
      },
      root,
    )

    const entries = readGemmaTrainingRegistry(root)
    expect(entries).toHaveLength(1)
    expect(entries[0]?.status).toBe('running')
    expect(entries[0]?.pid).toBe(456)
  })

  it('reads the latest run snapshot and optional run-state file', async () => {
    const root = makeRoot()
    const outputDir = join(root, 'artifacts', 'gemma4-runs', 'run-2')
    writeGemmaTrainingRegistry(
      [
        {
          runId: 'run-2',
          status: 'route_requested',
          executionMode: 'immaculate_route_requested',
          pid: null,
          launchedAt: '2026-04-11T01:00:00.000Z',
          outputDir,
          trainFile: 'train.jsonl',
          evalFile: 'eval.jsonl',
          baseModel: 'google/gemma-4-E4B-it',
          selectedTags: ['agentic'],
          selectedLanguages: ['python'],
          runName: null,
          logFiles: {
            stdout: 'stdout.log',
            stderr: 'stderr.log',
          },
          runStatePath: join(outputDir, 'run-state.json'),
          preflight: {
            decision: 'remote_required',
            reasonCode: 'insufficient_host_memory',
            summary: 'Local host memory too tight',
            baseModel: 'google/gemma-4-E4B-it',
            useCpu: true,
          },
          routeRequest: {
            route: 'immaculate',
            requestedAt: '2026-04-11T01:00:01.000Z',
            target: 'gemma-train',
            recommendedLayerId: 'ollama-reasoner-gemma4-e4b',
            manifestPath: join(outputDir, 'route-request.json'),
            controlStatus: 200,
            controlAccepted: true,
            controlSummary: 'accepted',
            harnessSnapshot: {
              harnessUrl: 'http://127.0.0.1:8787',
              recommendedLayerId: 'ollama-reasoner-gemma4-e4b',
              layerCount: 4,
              executionCount: 2,
              workerCount: 1,
              assignment: {
                workerId: 'worker-remote-a',
                workerLabel: 'gpu-a',
                hostLabel: 'box-a',
                executionProfile: 'remote',
                assignedAt: '2026-04-11T01:00:01.000Z',
                reason: 'remote-capable · layer ollama-reasoner-gemma4-e4b',
              },
            },
            integrity: {
              algorithm: 'sha256',
              trainFile: {
                path: 'train.jsonl',
                bytes: 10,
                sha256: 'train-digest',
              },
              evalFile: {
                path: 'eval.jsonl',
                bytes: 8,
                sha256: 'eval-digest',
              },
            },
          },
        },
      ],
      root,
    )

    mkdirSync(outputDir, { recursive: true })
    upsertGemmaTrainingRouteQueueEntry(
      {
        runId: 'run-2',
        manifestPath: join(outputDir, 'route-request.json'),
        queuedAt: '2026-04-11T01:00:01.000Z',
        updatedAt: '2026-04-11T01:00:01.000Z',
        status: 'queued',
        assignmentAuthority: 'immaculate',
        target: 'gemma-train',
        recommendedLayerId: 'ollama-reasoner-gemma4-e4b',
        security: {
          algorithm: 'hmac-sha256',
          payloadSha256: 'payload-digest',
          signature: 'signature',
          signedAt: '2026-04-11T01:00:01.000Z',
          secretSource: '~/.openjaws/gemma-route-secret',
        },
        assignment: {
          workerId: 'worker-remote-a',
          workerLabel: 'gpu-a',
          hostLabel: 'box-a',
          executionProfile: 'remote',
          source: 'immaculate',
          assignedAt: '2026-04-11T01:00:01.000Z',
          reason: 'remote-capable · layer ollama-reasoner-gemma4-e4b',
        },
      },
      root,
    )
    await Bun.write(
      join(outputDir, 'run-state.json'),
      `${JSON.stringify(
        {
          status: 'route_requested',
          executionMode: 'immaculate_route_requested',
          pid: null,
          baseModel: 'google/gemma-4-E4B-it',
          trainFile: 'train.jsonl',
          evalFile: 'eval.jsonl',
          outputDir,
          runName: null,
          selectedTags: ['agentic'],
          selectedLanguages: ['python'],
          preflight: {
            decision: 'remote_required',
            reasonCode: 'insufficient_host_memory',
            summary: 'Local host memory too tight',
            baseModel: 'google/gemma-4-E4B-it',
            useCpu: true,
          },
          routeRequest: {
            route: 'immaculate',
            requestedAt: '2026-04-11T01:00:01.000Z',
            target: 'gemma-train',
            recommendedLayerId: 'ollama-reasoner-gemma4-e4b',
            manifestPath: join(outputDir, 'route-request.json'),
            controlStatus: 200,
            controlAccepted: true,
            controlSummary: 'accepted',
            harnessSnapshot: {
              harnessUrl: 'http://127.0.0.1:8787',
              recommendedLayerId: 'ollama-reasoner-gemma4-e4b',
              layerCount: 4,
              executionCount: 2,
              workerCount: 1,
              assignment: {
                workerId: 'worker-remote-a',
                workerLabel: 'gpu-a',
                hostLabel: 'box-a',
                executionProfile: 'remote',
                assignedAt: '2026-04-11T01:00:01.000Z',
                reason: 'remote-capable · layer ollama-reasoner-gemma4-e4b',
              },
            },
            integrity: {
              algorithm: 'sha256',
              trainFile: {
                path: 'train.jsonl',
                bytes: 10,
                sha256: 'train-digest',
              },
              evalFile: {
                path: 'eval.jsonl',
                bytes: 8,
                sha256: 'eval-digest',
              },
            },
          },
        },
        null,
        2,
      )}\n`,
    )

    const snapshot = getLatestGemmaTrainingSnapshot(root)
    expect(snapshot?.registry.runId).toBe('run-2')
    expect(snapshot?.state?.status).toBe('route_requested')
    expect(snapshot?.registry.executionMode).toBe('immaculate_route_requested')
    expect(snapshot?.state?.executionMode).toBe('immaculate_route_requested')
    expect(snapshot?.state?.preflight?.decision).toBe('remote_required')
    expect(snapshot?.state?.routeRequest?.route).toBe('immaculate')
    expect(snapshot?.state?.routeRequest?.controlAccepted).toBe(true)
    expect(snapshot?.state?.routeRequest?.harnessSnapshot?.assignment?.workerId).toBe(
      'worker-remote-a',
    )
    expect(snapshot?.state?.routeRequest?.recommendedLayerId).toBe(
      'ollama-reasoner-gemma4-e4b',
    )
    expect(snapshot?.state?.routeRequest?.integrity?.trainFile.sha256).toBe(
      'train-digest',
    )
    expect(snapshot?.routeQueue?.status).toBe('queued')
    expect(snapshot?.routeQueue?.assignment?.source).toBe('immaculate')
  })
})

describe('gemma route queue', () => {
  it('upserts queue entries and returns the next queued route', () => {
    const root = makeRoot()
    upsertGemmaTrainingRouteQueueEntry(
      {
        runId: 'run-a',
        manifestPath: join(root, 'run-a', 'route-request.json'),
        queuedAt: '2026-04-12T12:00:00.000Z',
        updatedAt: '2026-04-12T12:00:00.000Z',
        status: 'queued',
        target: 'a',
        recommendedLayerId: 'layer-a',
      },
      root,
    )
    upsertGemmaTrainingRouteQueueEntry(
      {
        runId: 'run-b',
        manifestPath: join(root, 'run-b', 'route-request.json'),
        queuedAt: '2026-04-12T12:01:00.000Z',
        updatedAt: '2026-04-12T12:01:00.000Z',
        status: 'claimed',
        target: 'b',
        recommendedLayerId: 'layer-b',
      },
      root,
    )

    expect(getGemmaTrainingRouteQueueEntry('run-a', root)?.status).toBe('queued')
    expect(getNextQueuedGemmaTrainingRoute(root)?.runId).toBe('run-a')
  })

  it('claims queued routes exclusively and reclaims stale claims', () => {
    const root = makeRoot()
    upsertGemmaTrainingRouteWorker(
      {
        workerId: 'worker-a',
        executionProfile: 'local',
        registeredAt: '2099-04-12T12:00:00.000Z',
        heartbeatAt: '2099-04-12T12:00:00.000Z',
        leaseExpiresAt: '2099-04-12T12:05:00.000Z',
        leaseDurationMs: 300_000,
        watch: false,
        allowHostRisk: true,
        supportedBaseModels: ['*'],
        preferredLayerIds: [],
      },
      root,
    )
    upsertGemmaTrainingRouteWorker(
      {
        workerId: 'worker-b',
        executionProfile: 'local',
        registeredAt: '2099-04-12T12:00:00.000Z',
        heartbeatAt: '2099-04-12T12:00:00.000Z',
        leaseExpiresAt: '2099-04-12T12:05:00.000Z',
        leaseDurationMs: 300_000,
        watch: false,
        allowHostRisk: true,
        supportedBaseModels: ['*'],
        preferredLayerIds: [],
      },
      root,
    )
    upsertGemmaTrainingRouteQueueEntry(
      {
        runId: 'run-a',
        manifestPath: join(root, 'run-a', 'route-request.json'),
        queuedAt: '2026-04-12T12:00:00.000Z',
        updatedAt: '2026-04-12T12:00:00.000Z',
        status: 'queued',
      },
      root,
    )
    upsertGemmaTrainingRouteQueueEntry(
      {
        runId: 'run-b',
        manifestPath: join(root, 'run-b', 'route-request.json'),
        queuedAt: '2026-04-12T12:00:01.000Z',
        updatedAt: '2026-04-12T12:00:01.000Z',
        status: 'queued',
      },
      root,
    )

    const firstClaim = claimGemmaTrainingRouteQueueEntry({
      runId: 'run-a',
      workerId: 'worker-a',
      root,
      claimedAt: '2026-04-12T12:00:02.000Z',
      claimTtlMs: 50,
    })
    const secondClaim = claimGemmaTrainingRouteQueueEntry({
      runId: 'run-b',
      workerId: 'worker-a',
      root,
      claimedAt: '2026-04-12T12:00:02.010Z',
      claimTtlMs: 500,
    })
    const blockedClaim = claimGemmaTrainingRouteQueueEntry({
      runId: 'run-a',
      workerId: 'worker-c',
      root,
      claimedAt: '2026-04-12T12:00:02.020Z',
      claimTtlMs: 50,
    })
    const recoveredClaim = claimGemmaTrainingRouteQueueEntry({
      runId: 'run-a',
      workerId: 'worker-a',
      root,
      claimedAt: '2026-04-12T12:00:02.200Z',
      claimTtlMs: 50,
    })

    expect(firstClaim?.runId).toBe('run-a')
    expect(secondClaim?.runId).toBe('run-b')
    expect(blockedClaim).toBeNull()
    expect(recoveredClaim?.claim?.workerId).toBe('worker-a')
    expect(
      isGemmaTrainingRouteQueueClaimExpired(
        recoveredClaim!,
        '2026-04-12T12:00:02.230Z',
      ),
    ).toBe(false)
  })

  it('updates, releases, and dispatches worker-owned claims', () => {
    const root = makeRoot()
    upsertGemmaTrainingRouteQueueEntry(
      {
        runId: 'run-a',
        manifestPath: join(root, 'run-a', 'route-request.json'),
        queuedAt: '2026-04-12T13:00:00.000Z',
        updatedAt: '2026-04-12T13:00:00.000Z',
        status: 'queued',
      },
      root,
    )

    const claim = claimGemmaTrainingRouteQueueEntry({
      runId: 'run-a',
      workerId: 'worker-a',
      root,
      claimedAt: '2026-04-12T13:00:01.000Z',
    })
    expect(claim?.status).toBe('claimed')

    const verified = updateGemmaTrainingRouteQueueClaim({
      runId: 'run-a',
      workerId: 'worker-a',
      root,
      updatedAt: '2026-04-12T13:00:02.000Z',
      status: 'claimed',
      signatureVerified: true,
      integrityVerified: true,
      preflight: {
        decision: 'allow_local',
        reasonCode: 'ok',
        summary: 'ready',
        baseModel: 'google/gemma-4-E4B-it',
        useCpu: true,
      },
    })
    expect(verified?.claim?.signatureVerified).toBe(true)
    expect(verified?.claim?.preflightDecision).toBe('allow_local')

    const released = releaseGemmaTrainingRouteQueueClaim({
      runId: 'run-a',
      workerId: 'worker-a',
      root,
      updatedAt: '2026-04-12T13:00:03.000Z',
    })
    expect(released?.status).toBe('queued')
    expect(released?.claim).toBeNull()

    claimGemmaTrainingRouteQueueEntry({
      runId: 'run-a',
      workerId: 'worker-a',
      root,
      claimedAt: '2026-04-12T13:00:04.000Z',
    })
    const dispatched = finalizeGemmaTrainingRouteQueueDispatch({
      runId: 'run-a',
      workerId: 'worker-a',
      root,
      dispatchedAt: '2026-04-12T13:00:05.000Z',
      executionMode: 'immaculate_routed',
      pid: 123,
      transport: 'remote_http',
      executionEndpoint: 'https://remote-gpu-box.example/execute',
      acknowledgedAt: '2026-04-12T13:00:05.500Z',
      remoteStatus: 202,
      remoteAccepted: true,
      remoteExecutionId: 'remote-exec-1',
      remoteSummary: 'remote dispatch acknowledged',
      remoteStateUrl: 'https://remote-gpu-box.example/state/remote-exec-1',
    })
    expect(dispatched?.status).toBe('dispatched')
    expect(dispatched?.dispatch?.executionMode).toBe('immaculate_routed')
    expect(dispatched?.dispatch?.transport).toBe('remote_http')
    expect(dispatched?.dispatch?.executionEndpoint).toBe(
      'https://remote-gpu-box.example/execute',
    )
    expect(dispatched?.dispatch?.remoteExecutionId).toBe('remote-exec-1')

    const completed = finalizeGemmaTrainingRouteQueueCompletion({
      runId: 'run-a',
      workerId: 'worker-a',
      root,
      finishedAt: '2026-04-12T13:04:00.000Z',
      executionId: 'remote-exec-1',
      status: 'completed',
      summary: 'remote execution completed',
      stateUrl: 'https://remote-gpu-box.example/state/remote-exec-1',
    })
    expect(completed?.status).toBe('completed')
    expect(completed?.claim).toBeNull()
    expect(completed?.dispatch?.remoteCompletionStatus).toBe('completed')
    expect(completed?.dispatch?.remoteCompletionSummary).toBe(
      'remote execution completed',
    )
    expect(getGemmaTrainingRouteQueueStatusSummary(completed)).toBe('completed')
  })

  it('renews active claims and reaps only stale claims', () => {
    const root = makeRoot()
    upsertGemmaTrainingRouteQueueEntry(
      {
        runId: 'run-live',
        manifestPath: join(root, 'run-live', 'route-request.json'),
        queuedAt: '2026-04-12T14:00:00.000Z',
        updatedAt: '2026-04-12T14:00:00.000Z',
        status: 'queued',
      },
      root,
    )
    upsertGemmaTrainingRouteQueueEntry(
      {
        runId: 'run-stale',
        manifestPath: join(root, 'run-stale', 'route-request.json'),
        queuedAt: '2026-04-12T14:01:00.000Z',
        updatedAt: '2026-04-12T14:01:00.000Z',
        status: 'queued',
      },
      root,
    )

    claimGemmaTrainingRouteQueueEntry({
      runId: 'run-live',
      workerId: 'worker-live',
      root,
      claimedAt: '2026-04-12T14:00:10.000Z',
      claimTtlMs: 1_000,
    })
    claimGemmaTrainingRouteQueueEntry({
      runId: 'run-stale',
      workerId: 'worker-stale',
      root,
      claimedAt: '2026-04-12T14:00:10.000Z',
      claimTtlMs: 100,
    })

    const renewed = renewGemmaTrainingRouteQueueClaim({
      runId: 'run-live',
      workerId: 'worker-live',
      root,
      renewedAt: '2026-04-12T14:00:10.500Z',
      claimTtlMs: 2_000,
    })
    const reaped = reapStaleGemmaTrainingRouteQueueClaims({
      root,
      now: '2026-04-12T14:00:10.700Z',
    })
    const liveEntry = getGemmaTrainingRouteQueueEntry('run-live', root)
    const staleEntry = getGemmaTrainingRouteQueueEntry('run-stale', root)

    expect(renewed?.claim?.heartbeatAt).toBe('2026-04-12T14:00:10.500Z')
    expect(renewed?.claim?.leaseDurationMs).toBe(2_000)
    expect(liveEntry?.status).toBe('claimed')
    expect(staleEntry?.status).toBe('queued')
    expect(reaped.map(entry => entry.runId)).toContain('run-stale')
    expect(reaped.map(entry => entry.runId)).not.toContain('run-live')
  })

  it('selects the oldest dispatched remote result pending for a worker', () => {
    const root = makeRoot()
    upsertGemmaTrainingRouteQueueEntry(
      {
        runId: 'run-pending-1',
        manifestPath: join(root, 'run-pending-1', 'route-request.json'),
        queuedAt: '2026-04-12T14:20:00.000Z',
        updatedAt: '2026-04-12T14:20:00.000Z',
        status: 'dispatched',
        assignment: {
          workerId: 'worker-remote-a',
          executionProfile: 'remote',
          assignedAt: '2026-04-12T14:20:00.000Z',
          reason: 'remote-capable',
        },
        dispatch: {
          dispatchedAt: '2026-04-12T14:21:00.000Z',
          executionMode: 'immaculate_routed',
          pid: null,
          transport: 'remote_http',
          workerId: 'worker-remote-a',
          remoteStateUrl: 'https://remote.example/state/1',
        },
      },
      root,
    )
    upsertGemmaTrainingRouteQueueEntry(
      {
        runId: 'run-pending-2',
        manifestPath: join(root, 'run-pending-2', 'route-request.json'),
        queuedAt: '2026-04-12T14:22:00.000Z',
        updatedAt: '2026-04-12T14:22:00.000Z',
        status: 'dispatched',
        assignment: {
          workerId: 'worker-remote-a',
          executionProfile: 'remote',
          assignedAt: '2026-04-12T14:22:00.000Z',
          reason: 'remote-capable',
        },
        dispatch: {
          dispatchedAt: '2026-04-12T14:23:00.000Z',
          executionMode: 'immaculate_routed',
          pid: null,
          transport: 'remote_http',
          workerId: 'worker-remote-a',
          remoteStateUrl: 'https://remote.example/state/2',
        },
      },
      root,
    )
    upsertGemmaTrainingRouteQueueEntry(
      {
        runId: 'run-complete',
        manifestPath: join(root, 'run-complete', 'route-request.json'),
        queuedAt: '2026-04-12T14:24:00.000Z',
        updatedAt: '2026-04-12T14:24:00.000Z',
        status: 'completed',
        assignment: {
          workerId: 'worker-remote-a',
          executionProfile: 'remote',
          assignedAt: '2026-04-12T14:24:00.000Z',
          reason: 'remote-capable',
        },
        dispatch: {
          dispatchedAt: '2026-04-12T14:25:00.000Z',
          executionMode: 'immaculate_routed',
          pid: null,
          transport: 'remote_http',
          workerId: 'worker-remote-a',
          remoteStateUrl: 'https://remote.example/state/3',
          remoteCompletionStatus: 'completed',
        },
      },
      root,
    )

    const next = getNextGemmaTrainingRoutePendingRemoteResult({
      workerId: 'worker-remote-a',
      root,
    })

    expect(isGemmaTrainingRouteQueuePendingRemoteResult(next, 'worker-remote-a')).toBe(
      true,
    )
    expect(next?.runId).toBe('run-pending-1')
  })

  it('assigns remote-required routes to the best active worker and enforces that claim', () => {
    const root = makeRoot()
    upsertGemmaTrainingRouteWorker(
      {
        workerId: 'worker-remote-a',
        executionProfile: 'remote',
        workerLabel: 'gpu-a',
        hostLabel: 'box-a',
        registeredAt: '2099-04-12T16:00:00.000Z',
        heartbeatAt: '2099-04-12T16:00:00.000Z',
        leaseExpiresAt: '2099-04-12T16:05:00.000Z',
        leaseDurationMs: 300_000,
        watch: true,
        allowHostRisk: true,
        supportedBaseModels: ['google/gemma-4-E4B-it'],
        preferredLayerIds: ['router-core'],
      },
      root,
    )
    upsertGemmaTrainingRouteWorker(
      {
        workerId: 'worker-remote-b',
        executionProfile: 'remote',
        workerLabel: 'gpu-b',
        hostLabel: 'box-b',
        registeredAt: '2099-04-12T16:00:00.000Z',
        heartbeatAt: '2099-04-12T16:00:00.000Z',
        leaseExpiresAt: '2099-04-12T16:05:00.000Z',
        leaseDurationMs: 300_000,
        watch: true,
        allowHostRisk: true,
        supportedBaseModels: ['google/gemma-4-E4B-it'],
        preferredLayerIds: ['other-layer'],
      },
      root,
    )

    upsertGemmaTrainingRouteQueueEntry(
      {
        runId: 'run-assigned',
        manifestPath: join(root, 'run-assigned', 'route-request.json'),
        queuedAt: '2026-04-12T16:00:05.000Z',
        updatedAt: '2026-04-12T16:00:05.000Z',
        status: 'queued',
        recommendedLayerId: 'router-core',
        baseModel: 'google/gemma-4-E4B-it',
        useCpu: true,
        requestedExecutionDecision: 'remote_required',
      },
      root,
    )

    const assigned = getGemmaTrainingRouteQueueEntry('run-assigned', root)
    const blockedClaim = claimNextQueuedGemmaTrainingRoute({
      workerId: 'worker-remote-b',
      root,
      claimedAt: '2026-04-12T16:00:10.000Z',
    })
    const acceptedClaim = claimNextQueuedGemmaTrainingRoute({
      workerId: 'worker-remote-a',
      root,
      claimedAt: '2026-04-12T16:00:10.100Z',
    })

    expect(assigned?.assignment?.workerId).toBe('worker-remote-a')
    expect(assigned?.assignment?.source).toBe('local')
    expect(assigned?.assignment?.reason).toContain('layer router-core')
    expect(blockedClaim).toBeNull()
    expect(acceptedClaim?.runId).toBe('run-assigned')
  })

  it('does not assign a model-specific route to a worker with no declared base-model support', () => {
    const root = makeRoot()
    upsertGemmaTrainingRouteWorker(
      {
        workerId: 'worker-remote-empty',
        executionProfile: 'remote',
        workerLabel: 'gpu-empty',
        hostLabel: 'box-empty',
        registeredAt: '2099-04-12T16:10:00.000Z',
        heartbeatAt: '2099-04-12T16:10:00.000Z',
        leaseExpiresAt: '2099-04-12T16:15:00.000Z',
        leaseDurationMs: 300_000,
        watch: true,
        allowHostRisk: true,
        supportedBaseModels: [],
        preferredLayerIds: ['router-core'],
      },
      root,
    )

    upsertGemmaTrainingRouteQueueEntry(
      {
        runId: 'run-unmatched-worker',
        manifestPath: join(root, 'run-unmatched-worker', 'route-request.json'),
        queuedAt: '2026-04-12T16:10:05.000Z',
        updatedAt: '2026-04-12T16:10:05.000Z',
        status: 'queued',
        recommendedLayerId: 'router-core',
        baseModel: 'google/gemma-4-E4B-it',
        useCpu: true,
        requestedExecutionDecision: 'remote_required',
      },
      root,
    )

    const entry = getGemmaTrainingRouteQueueEntry('run-unmatched-worker', root)
    const claim = claimNextQueuedGemmaTrainingRoute({
      workerId: 'worker-remote-empty',
      root,
      claimedAt: '2026-04-12T16:10:10.000Z',
    })

    expect(entry?.assignment).toBeUndefined()
    expect(claim).toBeNull()
  })

  it('preserves an immaculate assignment instead of rebalancing it locally', () => {
    const root = makeRoot()
    upsertGemmaTrainingRouteQueueEntry(
      {
        runId: 'run-immaculate-assigned',
        manifestPath: join(root, 'run-immaculate-assigned', 'route-request.json'),
        queuedAt: '2026-04-12T16:30:00.000Z',
        updatedAt: '2026-04-12T16:30:00.000Z',
        status: 'queued',
        assignmentAuthority: 'immaculate',
        baseModel: 'google/gemma-4-E4B-it',
        requestedExecutionDecision: 'remote_required',
        assignment: {
          workerId: 'worker-harness-a',
          workerLabel: 'gpu-harness-a',
          hostLabel: 'remote-box-a',
          executionProfile: 'remote',
          source: 'immaculate',
          assignedAt: '2026-04-12T16:30:00.000Z',
          reason: 'remote-capable · layer router-core',
        },
      },
      root,
    )
    upsertGemmaTrainingRouteWorker(
      {
        workerId: 'worker-local-b',
        executionProfile: 'remote',
        workerLabel: 'gpu-local-b',
        hostLabel: 'box-b',
        registeredAt: '2099-04-12T16:30:01.000Z',
        heartbeatAt: '2099-04-12T16:30:01.000Z',
        leaseExpiresAt: '2099-04-12T16:35:01.000Z',
        leaseDurationMs: 300_000,
        watch: true,
        allowHostRisk: true,
        supportedBaseModels: ['google/gemma-4-E4B-it'],
        preferredLayerIds: ['router-core'],
      },
      root,
    )

    const entry = getGemmaTrainingRouteQueueEntry('run-immaculate-assigned', root)

    expect(entry?.assignment?.workerId).toBe('worker-harness-a')
    expect(entry?.assignment?.source).toBe('immaculate')
    expect(entry?.assignmentAuthority).toBe('immaculate')
  })

  it('does not let an unassigned immaculate-authority route fall back to local claiming', () => {
    const root = makeRoot()
    upsertGemmaTrainingRouteQueueEntry(
      {
        runId: 'run-immaculate-unassigned',
        manifestPath: join(root, 'run-immaculate-unassigned', 'route-request.json'),
        queuedAt: '2026-04-12T16:40:00.000Z',
        updatedAt: '2026-04-12T16:40:00.000Z',
        status: 'queued',
        assignmentAuthority: 'immaculate',
        baseModel: 'google/gemma-4-E4B-it',
        requestedExecutionDecision: 'remote_required',
      },
      root,
    )
    upsertGemmaTrainingRouteWorker(
      {
        workerId: 'worker-local-b',
        executionProfile: 'remote',
        workerLabel: 'gpu-local-b',
        hostLabel: 'box-b',
        registeredAt: '2099-04-12T16:40:01.000Z',
        heartbeatAt: '2099-04-12T16:40:01.000Z',
        leaseExpiresAt: '2099-04-12T16:45:01.000Z',
        leaseDurationMs: 300_000,
        watch: true,
        allowHostRisk: true,
        supportedBaseModels: ['google/gemma-4-E4B-it'],
        preferredLayerIds: ['router-core'],
      },
      root,
    )

    const claim = claimNextQueuedGemmaTrainingRoute({
      workerId: 'worker-local-b',
      root,
      claimedAt: '2026-04-12T16:40:02.000Z',
    })
    const entry = getGemmaTrainingRouteQueueEntry('run-immaculate-unassigned', root)

    expect(claim).toBeNull()
    expect(entry?.status).toBe('queued')
    expect(entry?.assignmentAuthority).toBe('immaculate')
    expect(entry?.assignment).toBeUndefined()
  })

  it('allows an explicit manifest claim for an unassigned immaculate-authority route', () => {
    const root = makeRoot()
    const manifestPath = join(
      root,
      'run-immaculate-manual',
      'route-request.json',
    )
    upsertGemmaTrainingRouteQueueEntry(
      {
        runId: 'run-immaculate-manual',
        manifestPath,
        queuedAt: '2026-04-12T16:50:00.000Z',
        updatedAt: '2026-04-12T16:50:00.000Z',
        status: 'queued',
        assignmentAuthority: 'immaculate',
        baseModel: 'google/gemma-4-E4B-it',
        requestedExecutionDecision: 'remote_required',
      },
      root,
    )

    const claim = claimGemmaTrainingRouteQueueEntry({
      manifestPath,
      workerId: 'worker-manual',
      root,
      claimedAt: '2026-04-12T16:50:02.000Z',
    })
    const entry = getGemmaTrainingRouteQueueEntry('run-immaculate-manual', root)

    expect(claim?.runId).toBe('run-immaculate-manual')
    expect(claim?.claim?.workerId).toBe('worker-manual')
    expect(entry?.status).toBe('claimed')
    expect(entry?.assignmentAuthority).toBe('immaculate')
    expect(entry?.assignment).toBeUndefined()
  })

  it('summarizes an unassigned immaculate-authority route as pending assignment', () => {
    const root = makeRoot()
    upsertGemmaTrainingRouteQueueEntry(
      {
        runId: 'run-immaculate-summary',
        manifestPath: join(root, 'run-immaculate-summary', 'route-request.json'),
        queuedAt: '2026-04-12T16:55:00.000Z',
        updatedAt: '2026-04-12T16:55:00.000Z',
        status: 'queued',
        assignmentAuthority: 'immaculate',
        requestedExecutionDecision: 'remote_required',
      },
      root,
    )

    const entry = getGemmaTrainingRouteQueueEntry('run-immaculate-summary', root)

    expect(getGemmaTrainingRouteQueueStatusSummary(entry)).toBe('pending assignment')
  })

  it('builds a compact pending-assignment receipt from the latest routed snapshot', async () => {
    const root = makeRoot()
    const outputDir = join(root, 'artifacts', 'gemma4-runs', 'run-route-receipt')
    writeGemmaTrainingRegistry(
      [
        {
          runId: 'run-route-receipt',
          status: 'route_requested',
          executionMode: 'immaculate_route_requested',
          pid: null,
          launchedAt: '2026-04-11T01:00:00.000Z',
          outputDir,
          trainFile: 'train.jsonl',
          evalFile: 'eval.jsonl',
          baseModel: 'google/gemma-4-E4B-it',
          selectedTags: ['agentic'],
          selectedLanguages: ['python'],
          runName: 'receipt-demo',
          logFiles: {
            stdout: 'stdout.log',
            stderr: 'stderr.log',
          },
          runStatePath: join(outputDir, 'run-state.json'),
          routeRequest: {
            route: 'immaculate',
            requestedAt: '2026-04-11T01:00:01.000Z',
            target: 'gemma-train',
            recommendedLayerId: 'router-core',
            manifestPath: join(outputDir, 'route-request.json'),
            controlStatus: 200,
            controlAccepted: true,
            controlSummary: 'accepted',
            harnessSnapshot: {
              harnessUrl: 'http://127.0.0.1:8787',
              recommendedLayerId: 'router-core',
              layerCount: 4,
              executionCount: 2,
              workerCount: 2,
              healthyWorkerCount: 0,
              staleWorkerCount: 1,
              faultedWorkerCount: 1,
              assignment: null,
            },
          },
        },
      ],
      root,
    )
    upsertGemmaTrainingRouteQueueEntry(
      {
        runId: 'run-route-receipt',
        manifestPath: join(outputDir, 'route-request.json'),
        queuedAt: '2026-04-11T01:00:01.000Z',
        updatedAt: '2026-04-11T01:00:01.000Z',
        status: 'queued',
        assignmentAuthority: 'immaculate',
        recommendedLayerId: 'router-core',
      },
      root,
    )
    mkdirSync(outputDir, { recursive: true })
    await Bun.write(
      join(outputDir, 'run-state.json'),
      `${JSON.stringify(
        {
          status: 'route_requested',
          executionMode: 'immaculate_route_requested',
          pid: null,
          baseModel: 'google/gemma-4-E4B-it',
          trainFile: 'train.jsonl',
          evalFile: 'eval.jsonl',
          outputDir,
          runName: null,
          selectedTags: ['agentic'],
          selectedLanguages: ['python'],
          routeRequest: {
            route: 'immaculate',
            requestedAt: '2026-04-11T01:00:01.000Z',
            target: 'gemma-train',
            recommendedLayerId: 'router-core',
            manifestPath: join(outputDir, 'route-request.json'),
            controlStatus: 200,
            controlAccepted: true,
            controlSummary: 'accepted',
            harnessSnapshot: {
              harnessUrl: 'http://127.0.0.1:8787',
              recommendedLayerId: 'router-core',
              layerCount: 4,
              executionCount: 2,
              workerCount: 2,
              healthyWorkerCount: 0,
              staleWorkerCount: 1,
              faultedWorkerCount: 1,
              assignment: null,
            },
          },
          routeQueue: {
            runId: 'run-route-receipt',
            manifestPath: join(outputDir, 'route-request.json'),
            queuedAt: '2026-04-11T01:00:01.000Z',
            updatedAt: '2026-04-11T01:00:01.000Z',
            status: 'queued',
            assignmentAuthority: 'immaculate',
            recommendedLayerId: 'router-core',
            assignment: null,
            claim: null,
            dispatch: null,
          },
        },
        null,
        2,
      )}\n`,
    )

    const receipt = buildGemmaTrainingRouteReceipt({
      snapshot: getLatestGemmaTrainingSnapshot(root),
      compact: true,
    })

    expect(receipt).toEqual({
      displayStatus: 'pending_assignment',
      text: 'gemma pending · router-core · 2w · 0h · 1s · 1f',
      tone: 'warning',
    })
  })
})

describe('gemma route workers', () => {
  it('upserts and removes worker runtime sync statuses', () => {
    const root = makeRoot()
    upsertGemmaTrainingRouteWorkerRuntimeStatus(
      {
        workerId: 'worker-runtime-a',
        workerLabel: 'gpu-a',
        hostLabel: 'box-a',
        executionProfile: 'remote',
        status: 'register_failed',
        updatedAt: '2026-04-12T19:00:00.000Z',
        summary: 'Immaculate worker registration failed.',
        detail: 'ECONNREFUSED',
        harnessUrl: 'http://127.0.0.1:1',
        supportedBaseModels: ['google/gemma-4-E4B-it'],
        preferredLayerIds: ['router-core'],
      },
      root,
    )

    upsertGemmaTrainingRouteWorkerRuntimeStatus(
      {
        workerId: 'worker-runtime-a',
        workerLabel: 'gpu-a',
        hostLabel: 'box-a',
        executionProfile: 'remote',
        status: 'ready',
        updatedAt: '2026-04-12T19:01:00.000Z',
        summary: 'Immaculate worker heartbeat synchronized.',
        detail: null,
        harnessUrl: 'http://127.0.0.1:8787',
        supportedBaseModels: ['google/gemma-4-E4B-it'],
        preferredLayerIds: ['router-core'],
      },
      root,
    )

    const statuses = readGemmaTrainingRouteWorkerRuntimeStatuses(root)
    const removed = removeGemmaTrainingRouteWorkerRuntimeStatus(
      'worker-runtime-a',
      root,
    )

    expect(statuses).toHaveLength(1)
    expect(statuses[0]?.status).toBe('ready')
    expect(statuses[0]?.harnessUrl).toBe('http://127.0.0.1:8787')
    expect(removed?.workerId).toBe('worker-runtime-a')
    expect(readGemmaTrainingRouteWorkerRuntimeStatuses(root)).toHaveLength(0)
  })

  it('registers workers, reaps stale workers, and clears orphaned assignments', () => {
    const root = makeRoot()
    upsertGemmaTrainingRouteWorker(
      {
        workerId: 'worker-remote-a',
        executionProfile: 'remote',
        workerLabel: 'gpu-a',
        hostLabel: 'box-a',
        registeredAt: '2099-04-12T17:00:00.000Z',
        heartbeatAt: '2099-04-12T17:00:00.000Z',
        leaseExpiresAt: '2099-04-12T17:00:10.000Z',
        leaseDurationMs: 10_000,
        watch: true,
        allowHostRisk: false,
        supportedBaseModels: ['google/gemma-4-E4B-it'],
        preferredLayerIds: ['router-core'],
      },
      root,
    )
    upsertGemmaTrainingRouteQueueEntry(
      {
        runId: 'run-worker-assignment',
        manifestPath: join(root, 'run-worker-assignment', 'route-request.json'),
        queuedAt: '2026-04-12T17:00:01.000Z',
        updatedAt: '2026-04-12T17:00:01.000Z',
        status: 'queued',
        recommendedLayerId: 'router-core',
        baseModel: 'google/gemma-4-E4B-it',
        requestedExecutionDecision: 'remote_required',
      },
      root,
    )

    const beforeReap = getGemmaTrainingRouteQueueEntry(
      'run-worker-assignment',
      root,
    )
    const registeredWorker = getGemmaTrainingRouteWorker('worker-remote-a', root)
    const reaped = reapStaleGemmaTrainingRouteWorkers({
      root,
      now: '2099-04-12T17:00:11.000Z',
    })
    const afterReap = getGemmaTrainingRouteQueueEntry(
      'run-worker-assignment',
      root,
    )

    expect(registeredWorker?.workerLabel).toBe('gpu-a')
    expect(readGemmaTrainingRouteWorkers(root)).toHaveLength(0)
    expect(beforeReap?.assignment?.workerId).toBe('worker-remote-a')
    expect(reaped).toHaveLength(0)
    expect(afterReap?.assignment).toBeNull()
  })

  it('removes a worker explicitly from the registry', () => {
    const root = makeRoot()
    upsertGemmaTrainingRouteWorker(
      {
        workerId: 'worker-local-a',
        executionProfile: 'local',
        registeredAt: '2099-04-12T18:00:00.000Z',
        heartbeatAt: '2099-04-12T18:00:00.000Z',
        leaseExpiresAt: '2099-04-12T18:05:00.000Z',
        leaseDurationMs: 300_000,
        watch: false,
        allowHostRisk: true,
        supportedBaseModels: [],
        preferredLayerIds: [],
      },
      root,
    )

    const removed = removeGemmaTrainingRouteWorker('worker-local-a', root)

    expect(removed?.workerId).toBe('worker-local-a')
    expect(readGemmaTrainingRouteWorkers(root)).toHaveLength(0)
  })
})

describe('evaluateGemmaTrainingPreflight', () => {
  it('blocks when the train split is missing', () => {
    const root = makeRoot()
    const preflight = evaluateGemmaTrainingPreflight({
      baseModel: 'google/gemma-4-E4B-it',
      trainFile: join(root, 'missing-train.jsonl'),
      useCpu: true,
    })

    expect(preflight.decision).toBe('preflight_blocked')
    expect(preflight.reasonCode).toBe('missing_train_file')
  })

  it('requires a remote box when host memory is too tight for local CPU training', () => {
    const root = makeRoot()
    const trainFile = join(root, 'train.jsonl')
    writeFileSync(trainFile, '{"messages":[]}\n', 'utf8')

    const preflight = evaluateGemmaTrainingPreflight({
      baseModel: 'google/gemma-4-E4B-it',
      trainFile,
      useCpu: true,
      modelBytes: 16 * 1024 ** 3,
      availableMemoryBytes: 8 * 1024 ** 3,
      totalMemoryBytes: 16 * 1024 ** 3,
    })

    expect(preflight.decision).toBe('remote_required')
    expect(preflight.reasonCode).toBe('insufficient_host_memory')
    expect(preflight.requiredAvailableMemoryBytes).not.toBeNull()
  })

  it('allows a local CPU launch when the memory gate is satisfied', () => {
    const root = makeRoot()
    const trainFile = join(root, 'train.jsonl')
    writeFileSync(trainFile, '{"messages":[]}\n', 'utf8')

    const preflight = evaluateGemmaTrainingPreflight({
      baseModel: 'google/gemma-4-E2B-it',
      trainFile,
      useCpu: true,
      modelBytes: 10 * 1024 ** 3,
      availableMemoryBytes: 16 * 1024 ** 3,
      totalMemoryBytes: 32 * 1024 ** 3,
    })

    expect(preflight.decision).toBe('allow_local')
    expect(preflight.reasonCode).toBe('ok')
  })
})

describe('gemma route manifest security', () => {
  it('signs and verifies a staged route manifest', () => {
    const root = makeRoot()
    const manifestDir = join(root, 'artifacts', 'gemma4-runs', 'run-route')
    mkdirSync(manifestDir, { recursive: true })

    const trainSource = join(root, 'train-source.jsonl')
    const evalSource = join(root, 'eval-source.jsonl')
    writeFileSync(trainSource, '{"messages":[{"role":"user","content":"hi"}]}\n')
    writeFileSync(evalSource, '{"messages":[{"role":"assistant","content":"ok"}]}\n')

    const stagedTrain = stageGemmaTrainingRouteFile({
      sourcePath: trainSource,
      manifestDir,
      relativePath: join('bundle', 'train.jsonl'),
    })
    const stagedEval = stageGemmaTrainingRouteFile({
      sourcePath: evalSource,
      manifestDir,
      relativePath: join('bundle', 'eval.jsonl'),
    })

    const manifest = buildGemmaTrainingRouteManifest({
      runId: 'run-route',
      routeRequest: {
        route: 'immaculate',
        requestedAt: '2026-04-12T12:00:00.000Z',
        target: 'gemma-train',
        manifestPath: join(manifestDir, 'route-request.json'),
        controlStatus: 200,
        controlAccepted: true,
        controlSummary: 'accepted',
        harnessSnapshot: {
          harnessUrl: 'http://127.0.0.1:8787',
          recommendedLayerId: 'router-core',
          layerCount: 3,
          executionCount: 1,
          workerCount: 1,
          assignment: {
            workerId: 'worker-remote-a',
            workerLabel: 'gpu-a',
            hostLabel: 'box-a',
            executionProfile: 'remote',
            assignedAt: '2026-04-12T12:00:00.000Z',
            reason: 'remote-capable · layer router-core',
          },
        },
        integrity: {
          algorithm: 'sha256',
          trainFile: stagedTrain,
          evalFile: stagedEval,
        },
      },
      training: {
        baseModel: 'google/gemma-4-E4B-it',
        runName: 'route-demo',
        trainFile: stagedTrain.path,
        evalFile: stagedEval.path,
        selectedTags: ['agentic'],
        selectedLanguages: ['python'],
        outputDir: '.',
        useCpu: true,
        maxSteps: 1,
        numTrainEpochs: 1,
      },
      preflight: {
        decision: 'remote_required',
        reasonCode: 'insufficient_host_memory',
        summary: 'remote box required',
        baseModel: 'google/gemma-4-E4B-it',
        useCpu: true,
      },
      env: {
        OPENJAWS_GEMMA_ROUTE_SECRET: 'test-route-secret',
      } as NodeJS.ProcessEnv,
    })

    const signature = verifyGemmaTrainingRouteManifest(manifest, {
      secret: 'test-route-secret',
    })
    const integrity = verifyGemmaTrainingRouteManifestIntegrity(
      manifest,
      manifestDir,
    )

    expect(signature.valid).toBe(true)
    expect(signature.reason).toBe('ok')
    expect(integrity.valid).toBe(true)
    expect(integrity.trainPath).toBe(join(manifestDir, 'bundle', 'train.jsonl'))
    expect(integrity.evalPath).toBe(join(manifestDir, 'bundle', 'eval.jsonl'))
  })

  it('detects manifest tampering after signing', () => {
    const root = makeRoot()
    const manifestDir = join(root, 'artifacts', 'gemma4-runs', 'run-route-tamper')
    mkdirSync(manifestDir, { recursive: true })

    const trainSource = join(root, 'train-source.jsonl')
    writeFileSync(trainSource, '{"messages":[{"role":"user","content":"hi"}]}\n')

    const stagedTrain = stageGemmaTrainingRouteFile({
      sourcePath: trainSource,
      manifestDir,
      relativePath: join('bundle', 'train.jsonl'),
    })

    const manifest = buildGemmaTrainingRouteManifest({
      runId: 'run-route-tamper',
      routeRequest: {
        route: 'immaculate',
        requestedAt: '2026-04-12T12:05:00.000Z',
        target: 'gemma-train',
        manifestPath: join(manifestDir, 'route-request.json'),
        integrity: {
          algorithm: 'sha256',
          trainFile: stagedTrain,
          evalFile: null,
        },
      },
      training: {
        baseModel: 'google/gemma-4-E4B-it',
        runName: null,
        trainFile: stagedTrain.path,
        evalFile: null,
        selectedTags: [],
        selectedLanguages: [],
        outputDir: '.',
        useCpu: true,
      },
      preflight: {
        decision: 'remote_required',
        reasonCode: 'insufficient_host_memory',
        summary: 'remote box required',
        baseModel: 'google/gemma-4-E4B-it',
        useCpu: true,
      },
      env: {
        OPENJAWS_GEMMA_ROUTE_SECRET: 'test-route-secret',
      } as NodeJS.ProcessEnv,
    })

    manifest.training.selectedTags.push('security')
    const signature = verifyGemmaTrainingRouteManifest(manifest, {
      secret: 'test-route-secret',
    })

    expect(signature.valid).toBe(false)
    expect(signature.reason).toBe('payload_mismatch')
  })

  it('builds and verifies a signed remote dispatch envelope with inline route files', () => {
    const root = makeRoot()
    const manifestDir = join(
      root,
      'artifacts',
      'gemma4-runs',
      'run-route-dispatch',
    )
    mkdirSync(manifestDir, { recursive: true })

    const trainSource = join(root, 'train-source.jsonl')
    const evalSource = join(root, 'eval-source.jsonl')
    writeFileSync(trainSource, '{"messages":[{"role":"user","content":"hi"}]}\n')
    writeFileSync(evalSource, '{"messages":[{"role":"assistant","content":"ok"}]}\n')

    const stagedTrain = stageGemmaTrainingRouteFile({
      sourcePath: trainSource,
      manifestDir,
      relativePath: join('bundle', 'train.jsonl'),
    })
    const stagedEval = stageGemmaTrainingRouteFile({
      sourcePath: evalSource,
      manifestDir,
      relativePath: join('bundle', 'eval.jsonl'),
    })

    const manifest = buildGemmaTrainingRouteManifest({
      runId: 'run-route-dispatch',
      routeRequest: {
        route: 'immaculate',
        requestedAt: '2026-04-12T12:10:00.000Z',
        target: 'gemma-train',
        manifestPath: join(manifestDir, 'route-request.json'),
        controlStatus: 200,
        controlAccepted: true,
        controlSummary: 'accepted',
        integrity: {
          algorithm: 'sha256',
          trainFile: stagedTrain,
          evalFile: stagedEval,
        },
      },
      training: {
        baseModel: 'google/gemma-4-E4B-it',
        runName: 'route-dispatch-demo',
        trainFile: stagedTrain.path,
        evalFile: stagedEval.path,
        selectedTags: ['agentic'],
        selectedLanguages: ['python'],
        outputDir: '.',
        useCpu: true,
        maxSteps: 1,
        numTrainEpochs: 1,
      },
      preflight: {
        decision: 'remote_required',
        reasonCode: 'insufficient_host_memory',
        summary: 'remote box required',
        baseModel: 'google/gemma-4-E4B-it',
        useCpu: true,
      },
      env: {
        OPENJAWS_GEMMA_ROUTE_SECRET: 'test-route-secret',
      } as NodeJS.ProcessEnv,
    })

    const envelope = buildGemmaTrainingRouteDispatchEnvelope({
      manifest,
      manifestPath: join(manifestDir, 'route-request.json'),
      manifestDir,
      workerId: 'worker-remote-a',
      executionMode: 'immaculate_routed',
      dispatchedAt: '2026-04-12T12:11:00.000Z',
      env: {
        OPENJAWS_GEMMA_ROUTE_SECRET: 'test-route-secret',
      } as NodeJS.ProcessEnv,
    })

    const verification = verifyGemmaTrainingRouteDispatchEnvelope(envelope, {
      secret: 'test-route-secret',
    })

    expect(envelope.payload.files).toHaveLength(2)
    expect(
      envelope.payload.files.some(file => file.path === 'bundle/train.jsonl'),
    ).toBe(true)
    expect(verification.valid).toBe(true)
    expect(verification.reason).toBe('ok')
  })

  it('detects tampering in a signed remote dispatch envelope', () => {
    const root = makeRoot()
    const manifestDir = join(
      root,
      'artifacts',
      'gemma4-runs',
      'run-route-dispatch-tamper',
    )
    mkdirSync(manifestDir, { recursive: true })

    const trainSource = join(root, 'train-source.jsonl')
    writeFileSync(trainSource, '{"messages":[{"role":"user","content":"hi"}]}\n')

    const stagedTrain = stageGemmaTrainingRouteFile({
      sourcePath: trainSource,
      manifestDir,
      relativePath: join('bundle', 'train.jsonl'),
    })

    const manifest = buildGemmaTrainingRouteManifest({
      runId: 'run-route-dispatch-tamper',
      routeRequest: {
        route: 'immaculate',
        requestedAt: '2026-04-12T12:15:00.000Z',
        target: 'gemma-train',
        manifestPath: join(manifestDir, 'route-request.json'),
        integrity: {
          algorithm: 'sha256',
          trainFile: stagedTrain,
          evalFile: null,
        },
      },
      training: {
        baseModel: 'google/gemma-4-E4B-it',
        runName: null,
        trainFile: stagedTrain.path,
        evalFile: null,
        selectedTags: [],
        selectedLanguages: [],
        outputDir: '.',
        useCpu: true,
      },
      preflight: {
        decision: 'remote_required',
        reasonCode: 'insufficient_host_memory',
        summary: 'remote box required',
        baseModel: 'google/gemma-4-E4B-it',
        useCpu: true,
      },
      env: {
        OPENJAWS_GEMMA_ROUTE_SECRET: 'test-route-secret',
      } as NodeJS.ProcessEnv,
    })

    const envelope = buildGemmaTrainingRouteDispatchEnvelope({
      manifest,
      manifestPath: join(manifestDir, 'route-request.json'),
      manifestDir,
      workerId: 'worker-remote-a',
      executionMode: 'immaculate_routed',
      dispatchedAt: '2026-04-12T12:16:00.000Z',
      env: {
        OPENJAWS_GEMMA_ROUTE_SECRET: 'test-route-secret',
      } as NodeJS.ProcessEnv,
    })

    envelope.payload.files[0]!.contentBase64 = Buffer.from(
      '{"messages":[{"role":"user","content":"tampered"}]}\n',
      'utf8',
    ).toString('base64')

    const verification = verifyGemmaTrainingRouteDispatchEnvelope(envelope, {
      secret: 'test-route-secret',
    })

    expect(verification.valid).toBe(false)
    expect(verification.reason).toBe('payload_mismatch')
  })

  it('builds and verifies a signed remote result envelope', () => {
    const envelope = buildGemmaTrainingRouteResultEnvelope({
      runId: 'run-route-result',
      manifestPath: 'route-request.json',
      workerId: 'worker-remote-a',
      executionId: 'remote-exec-2',
      executionMode: 'immaculate_routed',
      finishedAt: '2026-04-12T12:20:00.000Z',
      status: 'completed',
      summary: 'remote execution completed',
      stateUrl: 'https://remote-gpu-box.example/state/remote-exec-2',
      runState: {
        status: 'completed',
        finishedAt: '2026-04-12T12:20:00.000Z',
        globalStep: 1,
        epoch: 1,
        loss: 1.25,
        evalLoss: 0.98,
      },
      runSummary: {
        base_model: 'google/gemma-4-E4B-it',
        run_name: 'remote-result-demo',
      },
      metricsSummary: {
        latest_train_metrics: {
          loss: 1.25,
        },
        latest_eval_metrics: {
          eval_loss: 0.98,
        },
      },
      env: {
        OPENJAWS_GEMMA_ROUTE_SECRET: 'test-route-secret',
      } as NodeJS.ProcessEnv,
    })

    const verification = verifyGemmaTrainingRouteResultEnvelope(envelope, {
      secret: 'test-route-secret',
    })

    expect(verification.valid).toBe(true)
    expect(verification.reason).toBe('ok')
    expect(envelope.payload.status).toBe('completed')
    expect(envelope.payload.executionId).toBe('remote-exec-2')
  })

  it('detects tampering in a signed remote result envelope', () => {
    const envelope = buildGemmaTrainingRouteResultEnvelope({
      runId: 'run-route-result-tamper',
      manifestPath: 'route-request.json',
      workerId: 'worker-remote-a',
      executionId: 'remote-exec-3',
      executionMode: 'immaculate_routed',
      finishedAt: '2026-04-12T12:25:00.000Z',
      status: 'failed',
      summary: 'remote execution failed',
      runState: {
        status: 'failed',
        finishedAt: '2026-04-12T12:25:00.000Z',
        error: 'oom',
      },
      runSummary: null,
      metricsSummary: null,
      env: {
        OPENJAWS_GEMMA_ROUTE_SECRET: 'test-route-secret',
      } as NodeJS.ProcessEnv,
    })

    envelope.payload.summary = 'tampered'

    const verification = verifyGemmaTrainingRouteResultEnvelope(envelope, {
      secret: 'test-route-secret',
    })

    expect(verification.valid).toBe(false)
    expect(verification.reason).toBe('payload_mismatch')
  })
})
