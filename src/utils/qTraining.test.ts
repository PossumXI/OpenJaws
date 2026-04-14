import { afterEach, describe, expect, it } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  buildQTrainingRouteDispatchEnvelope,
  buildQTrainingRouteResultEnvelope,
  buildQTrainingRouteManifest,
  claimQTrainingRouteQueueEntry,
  claimNextQueuedQTrainingRoute,
  finalizeQTrainingRouteQueueCompletion,
  finalizeQTrainingRouteQueueDispatch,
  evaluateQTrainingPreflight,
  getNextQTrainingRoutePendingRemoteResult,
  getQTrainingRouteQueueEntry,
  getQTrainingRouteWorker,
  getOpenJawsTrainingModelDisplay,
  getOpenJawsTrainingModelLabel,
  getLatestQTrainingSnapshot,
  getNextQueuedQTrainingRoute,
  isQTrainingRouteQueueClaimExpired,
  isQTrainingRouteQueuePendingRemoteResult,
  readQTrainingRouteWorkers,
  readQTrainingRouteWorkerRuntimeStatuses,
  readQTrainingRegistry,
  Q_PRO_BASE_MODEL,
  Q_SMOKE_BASE_MODEL,
  Q_ULTRA_BASE_MODEL,
  reapStaleQTrainingRouteQueueClaims,
  reapStaleQTrainingRouteWorkers,
  releaseQTrainingRouteQueueClaim,
  relativizeQTrainingFileIntegrity,
  removeQTrainingRouteWorkerRuntimeStatus,
  removeQTrainingRouteWorker,
  renewQTrainingRouteQueueClaim,
  resolveQTrainingRoutePath,
  stageQTrainingRouteFile,
  updateQTrainingRouteQueueClaim,
  upsertQTrainingRouteQueueEntry,
  upsertQTrainingRegistryEntry,
  upsertQTrainingRouteWorkerRuntimeStatus,
  upsertQTrainingRouteWorker,
  verifyQTrainingRouteManifest,
  verifyQTrainingRouteDispatchEnvelope,
  verifyQTrainingRouteResultEnvelope,
  verifyQTrainingRouteManifestIntegrity,
  writeQTrainingRegistry,
  computeQTrainingFileIntegrity,
  buildQTrainingRouteReceipt,
  DEFAULT_Q_BASE_MODEL,
  getQTrainingRouteQueueStatusSummary,
} from './qTraining.js'

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
  const dir = mkdtempSync(join(tmpdir(), 'openjaws-q-training-'))
  tempDirs.push(dir)
  return dir
}

describe('qTraining registry', () => {
  it('maps upstream Q family checkpoints to Q display labels', () => {
    expect(getOpenJawsTrainingModelLabel(Q_SMOKE_BASE_MODEL)).toBe(
      'Q Lite',
    )
    expect(getOpenJawsTrainingModelLabel(DEFAULT_Q_BASE_MODEL)).toBe('Q')
    expect(getOpenJawsTrainingModelLabel(Q_PRO_BASE_MODEL)).toBe('Q Pro')
    expect(getOpenJawsTrainingModelLabel(Q_ULTRA_BASE_MODEL)).toBe('Q Ultra')
    expect(getOpenJawsTrainingModelDisplay(DEFAULT_Q_BASE_MODEL)).toBe(
      `Q · ${DEFAULT_Q_BASE_MODEL}`,
    )
  })

  it('upserts registry entries by run id', () => {
    const root = makeRoot()

    upsertQTrainingRegistryEntry(
      {
        runId: 'run-1',
        status: 'launched',
        pid: 123,
        launchedAt: '2026-04-11T00:00:00.000Z',
        outputDir: join(root, 'artifacts', 'q-runs', 'run-1'),
        trainFile: 'train.jsonl',
        evalFile: 'eval.jsonl',
        baseModel: DEFAULT_Q_BASE_MODEL,
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

    upsertQTrainingRegistryEntry(
      {
        runId: 'run-1',
        status: 'running',
        pid: 456,
        launchedAt: '2026-04-11T00:00:00.000Z',
        outputDir: join(root, 'artifacts', 'q-runs', 'run-1'),
        trainFile: 'train.jsonl',
        evalFile: 'eval.jsonl',
        baseModel: DEFAULT_Q_BASE_MODEL,
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

    const entries = readQTrainingRegistry(root)
    expect(entries).toHaveLength(1)
    expect(entries[0]?.status).toBe('running')
    expect(entries[0]?.pid).toBe(456)
  })

  it('reads the latest run snapshot and optional run-state file', async () => {
    const root = makeRoot()
    const outputDir = join(root, 'artifacts', 'q-runs', 'run-2')
    writeQTrainingRegistry(
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
          baseModel: DEFAULT_Q_BASE_MODEL,
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
            baseModel: DEFAULT_Q_BASE_MODEL,
            useCpu: true,
          },
          routeRequest: {
            route: 'immaculate',
            requestedAt: '2026-04-11T01:00:01.000Z',
            target: 'q-train',
            recommendedLayerId: 'ollama-reasoner-q-e4b',
            manifestPath: join(outputDir, 'route-request.json'),
            controlStatus: 200,
            controlAccepted: true,
            controlSummary: 'accepted',
            harnessSnapshot: {
              harnessUrl: 'http://127.0.0.1:8787',
              recommendedLayerId: 'ollama-reasoner-q-e4b',
              layerCount: 4,
              executionCount: 2,
              workerCount: 1,
              assignment: {
                workerId: 'worker-remote-a',
                workerLabel: 'gpu-a',
                hostLabel: 'box-a',
                executionProfile: 'remote',
                assignedAt: '2026-04-11T01:00:01.000Z',
                reason: 'remote-capable · layer ollama-reasoner-q-e4b',
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
    upsertQTrainingRouteQueueEntry(
      {
        runId: 'run-2',
        manifestPath: join(outputDir, 'route-request.json'),
        queuedAt: '2026-04-11T01:00:01.000Z',
        updatedAt: '2026-04-11T01:00:01.000Z',
        status: 'queued',
        assignmentAuthority: 'immaculate',
        target: 'q-train',
        recommendedLayerId: 'ollama-reasoner-q-e4b',
        security: {
          algorithm: 'hmac-sha256',
          payloadSha256: 'payload-digest',
          signature: 'signature',
          signedAt: '2026-04-11T01:00:01.000Z',
          secretSource: '~/.openjaws/q-route-secret',
        },
        assignment: {
          workerId: 'worker-remote-a',
          workerLabel: 'gpu-a',
          hostLabel: 'box-a',
          executionProfile: 'remote',
          source: 'immaculate',
          assignedAt: '2026-04-11T01:00:01.000Z',
          reason: 'remote-capable · layer ollama-reasoner-q-e4b',
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
          baseModel: DEFAULT_Q_BASE_MODEL,
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
            baseModel: DEFAULT_Q_BASE_MODEL,
            useCpu: true,
          },
          routeRequest: {
            route: 'immaculate',
            requestedAt: '2026-04-11T01:00:01.000Z',
            target: 'q-train',
            recommendedLayerId: 'ollama-reasoner-q-e4b',
            manifestPath: join(outputDir, 'route-request.json'),
            controlStatus: 200,
            controlAccepted: true,
            controlSummary: 'accepted',
            harnessSnapshot: {
              harnessUrl: 'http://127.0.0.1:8787',
              recommendedLayerId: 'ollama-reasoner-q-e4b',
              layerCount: 4,
              executionCount: 2,
              workerCount: 1,
              assignment: {
                workerId: 'worker-remote-a',
                workerLabel: 'gpu-a',
                hostLabel: 'box-a',
                executionProfile: 'remote',
                assignedAt: '2026-04-11T01:00:01.000Z',
                reason: 'remote-capable · layer ollama-reasoner-q-e4b',
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

    const snapshot = getLatestQTrainingSnapshot(root)
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
      'ollama-reasoner-q-e4b',
    )
    expect(snapshot?.state?.routeRequest?.integrity?.trainFile.sha256).toBe(
      'train-digest',
    )
    expect(snapshot?.routeQueue?.status).toBe('queued')
    expect(snapshot?.routeQueue?.assignment?.source).toBe('immaculate')
  })
})

describe('q route queue', () => {
  it('upserts queue entries and returns the next queued route', () => {
    const root = makeRoot()
    upsertQTrainingRouteQueueEntry(
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
    upsertQTrainingRouteQueueEntry(
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

    expect(getQTrainingRouteQueueEntry('run-a', root)?.status).toBe('queued')
    expect(getNextQueuedQTrainingRoute(root)?.runId).toBe('run-a')
  })

  it('claims queued routes exclusively and reclaims stale claims', () => {
    const root = makeRoot()
    upsertQTrainingRouteWorker(
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
    upsertQTrainingRouteWorker(
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
    upsertQTrainingRouteQueueEntry(
      {
        runId: 'run-a',
        manifestPath: join(root, 'run-a', 'route-request.json'),
        queuedAt: '2026-04-12T12:00:00.000Z',
        updatedAt: '2026-04-12T12:00:00.000Z',
        status: 'queued',
      },
      root,
    )
    upsertQTrainingRouteQueueEntry(
      {
        runId: 'run-b',
        manifestPath: join(root, 'run-b', 'route-request.json'),
        queuedAt: '2026-04-12T12:00:01.000Z',
        updatedAt: '2026-04-12T12:00:01.000Z',
        status: 'queued',
      },
      root,
    )

    const firstClaim = claimQTrainingRouteQueueEntry({
      runId: 'run-a',
      workerId: 'worker-a',
      root,
      claimedAt: '2026-04-12T12:00:02.000Z',
      claimTtlMs: 50,
    })
    const secondClaim = claimQTrainingRouteQueueEntry({
      runId: 'run-b',
      workerId: 'worker-a',
      root,
      claimedAt: '2026-04-12T12:00:02.010Z',
      claimTtlMs: 500,
    })
    const blockedClaim = claimQTrainingRouteQueueEntry({
      runId: 'run-a',
      workerId: 'worker-c',
      root,
      claimedAt: '2026-04-12T12:00:02.020Z',
      claimTtlMs: 50,
    })
    const recoveredClaim = claimQTrainingRouteQueueEntry({
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
      isQTrainingRouteQueueClaimExpired(
        recoveredClaim!,
        '2026-04-12T12:00:02.230Z',
      ),
    ).toBe(false)
  })

  it('updates, releases, and dispatches worker-owned claims', () => {
    const root = makeRoot()
    upsertQTrainingRouteQueueEntry(
      {
        runId: 'run-a',
        manifestPath: join(root, 'run-a', 'route-request.json'),
        queuedAt: '2026-04-12T13:00:00.000Z',
        updatedAt: '2026-04-12T13:00:00.000Z',
        status: 'queued',
      },
      root,
    )

    const claim = claimQTrainingRouteQueueEntry({
      runId: 'run-a',
      workerId: 'worker-a',
      root,
      claimedAt: '2026-04-12T13:00:01.000Z',
    })
    expect(claim?.status).toBe('claimed')

    const verified = updateQTrainingRouteQueueClaim({
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
        baseModel: DEFAULT_Q_BASE_MODEL,
        useCpu: true,
      },
    })
    expect(verified?.claim?.signatureVerified).toBe(true)
    expect(verified?.claim?.preflightDecision).toBe('allow_local')

    const released = releaseQTrainingRouteQueueClaim({
      runId: 'run-a',
      workerId: 'worker-a',
      root,
      updatedAt: '2026-04-12T13:00:03.000Z',
    })
    expect(released?.status).toBe('queued')
    expect(released?.claim).toBeNull()

    claimQTrainingRouteQueueEntry({
      runId: 'run-a',
      workerId: 'worker-a',
      root,
      claimedAt: '2026-04-12T13:00:04.000Z',
    })
    const dispatched = finalizeQTrainingRouteQueueDispatch({
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

    const completed = finalizeQTrainingRouteQueueCompletion({
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
    expect(getQTrainingRouteQueueStatusSummary(completed)).toBe('completed')
  })

  it('renews active claims and reaps only stale claims', () => {
    const root = makeRoot()
    upsertQTrainingRouteQueueEntry(
      {
        runId: 'run-live',
        manifestPath: join(root, 'run-live', 'route-request.json'),
        queuedAt: '2026-04-12T14:00:00.000Z',
        updatedAt: '2026-04-12T14:00:00.000Z',
        status: 'queued',
      },
      root,
    )
    upsertQTrainingRouteQueueEntry(
      {
        runId: 'run-stale',
        manifestPath: join(root, 'run-stale', 'route-request.json'),
        queuedAt: '2026-04-12T14:01:00.000Z',
        updatedAt: '2026-04-12T14:01:00.000Z',
        status: 'queued',
      },
      root,
    )

    claimQTrainingRouteQueueEntry({
      runId: 'run-live',
      workerId: 'worker-live',
      root,
      claimedAt: '2026-04-12T14:00:10.000Z',
      claimTtlMs: 1_000,
    })
    claimQTrainingRouteQueueEntry({
      runId: 'run-stale',
      workerId: 'worker-stale',
      root,
      claimedAt: '2026-04-12T14:00:10.000Z',
      claimTtlMs: 100,
    })

    const renewed = renewQTrainingRouteQueueClaim({
      runId: 'run-live',
      workerId: 'worker-live',
      root,
      renewedAt: '2026-04-12T14:00:10.500Z',
      claimTtlMs: 2_000,
    })
    const reaped = reapStaleQTrainingRouteQueueClaims({
      root,
      now: '2026-04-12T14:00:10.700Z',
    })
    const liveEntry = getQTrainingRouteQueueEntry('run-live', root)
    const staleEntry = getQTrainingRouteQueueEntry('run-stale', root)

    expect(renewed?.claim?.heartbeatAt).toBe('2026-04-12T14:00:10.500Z')
    expect(renewed?.claim?.leaseDurationMs).toBe(2_000)
    expect(liveEntry?.status).toBe('claimed')
    expect(staleEntry?.status).toBe('queued')
    expect(reaped.map(entry => entry.runId)).toContain('run-stale')
    expect(reaped.map(entry => entry.runId)).not.toContain('run-live')
  })

  it('selects the oldest dispatched remote result pending for a worker', () => {
    const root = makeRoot()
    upsertQTrainingRouteQueueEntry(
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
    upsertQTrainingRouteQueueEntry(
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
    upsertQTrainingRouteQueueEntry(
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

    const next = getNextQTrainingRoutePendingRemoteResult({
      workerId: 'worker-remote-a',
      root,
    })

    expect(isQTrainingRouteQueuePendingRemoteResult(next, 'worker-remote-a')).toBe(
      true,
    )
    expect(next?.runId).toBe('run-pending-1')
  })

  it('assigns remote-required routes to the best active worker and enforces that claim', () => {
    const root = makeRoot()
    upsertQTrainingRouteWorker(
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
        supportedBaseModels: [DEFAULT_Q_BASE_MODEL],
        preferredLayerIds: ['router-core'],
      },
      root,
    )
    upsertQTrainingRouteWorker(
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
        supportedBaseModels: [DEFAULT_Q_BASE_MODEL],
        preferredLayerIds: ['other-layer'],
      },
      root,
    )

    upsertQTrainingRouteQueueEntry(
      {
        runId: 'run-assigned',
        manifestPath: join(root, 'run-assigned', 'route-request.json'),
        queuedAt: '2026-04-12T16:00:05.000Z',
        updatedAt: '2026-04-12T16:00:05.000Z',
        status: 'queued',
        recommendedLayerId: 'router-core',
        baseModel: DEFAULT_Q_BASE_MODEL,
        useCpu: true,
        requestedExecutionDecision: 'remote_required',
      },
      root,
    )

    const assigned = getQTrainingRouteQueueEntry('run-assigned', root)
    const blockedClaim = claimNextQueuedQTrainingRoute({
      workerId: 'worker-remote-b',
      root,
      claimedAt: '2026-04-12T16:00:10.000Z',
    })
    const acceptedClaim = claimNextQueuedQTrainingRoute({
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
    upsertQTrainingRouteWorker(
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

    upsertQTrainingRouteQueueEntry(
      {
        runId: 'run-unmatched-worker',
        manifestPath: join(root, 'run-unmatched-worker', 'route-request.json'),
        queuedAt: '2026-04-12T16:10:05.000Z',
        updatedAt: '2026-04-12T16:10:05.000Z',
        status: 'queued',
        recommendedLayerId: 'router-core',
        baseModel: DEFAULT_Q_BASE_MODEL,
        useCpu: true,
        requestedExecutionDecision: 'remote_required',
      },
      root,
    )

    const entry = getQTrainingRouteQueueEntry('run-unmatched-worker', root)
    const claim = claimNextQueuedQTrainingRoute({
      workerId: 'worker-remote-empty',
      root,
      claimedAt: '2026-04-12T16:10:10.000Z',
    })

    expect(entry?.assignment).toBeUndefined()
    expect(claim).toBeNull()
  })

  it('preserves an immaculate assignment instead of rebalancing it locally', () => {
    const root = makeRoot()
    upsertQTrainingRouteQueueEntry(
      {
        runId: 'run-immaculate-assigned',
        manifestPath: join(root, 'run-immaculate-assigned', 'route-request.json'),
        queuedAt: '2026-04-12T16:30:00.000Z',
        updatedAt: '2026-04-12T16:30:00.000Z',
        status: 'queued',
        assignmentAuthority: 'immaculate',
        baseModel: DEFAULT_Q_BASE_MODEL,
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
    upsertQTrainingRouteWorker(
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
        supportedBaseModels: [DEFAULT_Q_BASE_MODEL],
        preferredLayerIds: ['router-core'],
      },
      root,
    )

    const entry = getQTrainingRouteQueueEntry('run-immaculate-assigned', root)

    expect(entry?.assignment?.workerId).toBe('worker-harness-a')
    expect(entry?.assignment?.source).toBe('immaculate')
    expect(entry?.assignmentAuthority).toBe('immaculate')
  })

  it('does not let an unassigned immaculate-authority route fall back to local claiming', () => {
    const root = makeRoot()
    upsertQTrainingRouteQueueEntry(
      {
        runId: 'run-immaculate-unassigned',
        manifestPath: join(root, 'run-immaculate-unassigned', 'route-request.json'),
        queuedAt: '2026-04-12T16:40:00.000Z',
        updatedAt: '2026-04-12T16:40:00.000Z',
        status: 'queued',
        assignmentAuthority: 'immaculate',
        baseModel: DEFAULT_Q_BASE_MODEL,
        requestedExecutionDecision: 'remote_required',
      },
      root,
    )
    upsertQTrainingRouteWorker(
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
        supportedBaseModels: [DEFAULT_Q_BASE_MODEL],
        preferredLayerIds: ['router-core'],
      },
      root,
    )

    const claim = claimNextQueuedQTrainingRoute({
      workerId: 'worker-local-b',
      root,
      claimedAt: '2026-04-12T16:40:02.000Z',
    })
    const entry = getQTrainingRouteQueueEntry('run-immaculate-unassigned', root)

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
    upsertQTrainingRouteQueueEntry(
      {
        runId: 'run-immaculate-manual',
        manifestPath,
        queuedAt: '2026-04-12T16:50:00.000Z',
        updatedAt: '2026-04-12T16:50:00.000Z',
        status: 'queued',
        assignmentAuthority: 'immaculate',
        baseModel: DEFAULT_Q_BASE_MODEL,
        requestedExecutionDecision: 'remote_required',
      },
      root,
    )

    const claim = claimQTrainingRouteQueueEntry({
      manifestPath,
      workerId: 'worker-manual',
      root,
      claimedAt: '2026-04-12T16:50:02.000Z',
    })
    const entry = getQTrainingRouteQueueEntry('run-immaculate-manual', root)

    expect(claim?.runId).toBe('run-immaculate-manual')
    expect(claim?.claim?.workerId).toBe('worker-manual')
    expect(entry?.status).toBe('claimed')
    expect(entry?.assignmentAuthority).toBe('immaculate')
    expect(entry?.assignment).toBeUndefined()
  })

  it('summarizes an unassigned immaculate-authority route as pending assignment', () => {
    const root = makeRoot()
    upsertQTrainingRouteQueueEntry(
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

    const entry = getQTrainingRouteQueueEntry('run-immaculate-summary', root)

    expect(getQTrainingRouteQueueStatusSummary(entry)).toBe('pending assignment')
  })

  it('builds a compact pending-assignment receipt from the latest routed snapshot', async () => {
    const root = makeRoot()
    const outputDir = join(root, 'artifacts', 'q-runs', 'run-route-receipt')
    writeQTrainingRegistry(
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
          baseModel: DEFAULT_Q_BASE_MODEL,
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
            target: 'q-train',
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
    upsertQTrainingRouteQueueEntry(
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
          baseModel: DEFAULT_Q_BASE_MODEL,
          trainFile: 'train.jsonl',
          evalFile: 'eval.jsonl',
          outputDir,
          runName: null,
          selectedTags: ['agentic'],
          selectedLanguages: ['python'],
          routeRequest: {
            route: 'immaculate',
            requestedAt: '2026-04-11T01:00:01.000Z',
            target: 'q-train',
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

    const receipt = buildQTrainingRouteReceipt({
      snapshot: getLatestQTrainingSnapshot(root),
      compact: true,
    })

    expect(receipt).toEqual({
      displayStatus: 'pending_assignment',
      text: 'Q pending · router-core · 2w · 0h · 1s · 1f',
      tone: 'warning',
    })
  })
})

describe('q route workers', () => {
  it('upserts and removes worker runtime sync statuses', () => {
    const root = makeRoot()
    upsertQTrainingRouteWorkerRuntimeStatus(
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
        supportedBaseModels: [DEFAULT_Q_BASE_MODEL],
        preferredLayerIds: ['router-core'],
      },
      root,
    )

    upsertQTrainingRouteWorkerRuntimeStatus(
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
        supportedBaseModels: [DEFAULT_Q_BASE_MODEL],
        preferredLayerIds: ['router-core'],
      },
      root,
    )

    const statuses = readQTrainingRouteWorkerRuntimeStatuses(root)
    const removed = removeQTrainingRouteWorkerRuntimeStatus(
      'worker-runtime-a',
      root,
    )

    expect(statuses).toHaveLength(1)
    expect(statuses[0]?.status).toBe('ready')
    expect(statuses[0]?.harnessUrl).toBe('http://127.0.0.1:8787')
    expect(removed?.workerId).toBe('worker-runtime-a')
    expect(readQTrainingRouteWorkerRuntimeStatuses(root)).toHaveLength(0)
  })

  it('registers workers, reaps stale workers, and clears orphaned assignments', () => {
    const root = makeRoot()
    upsertQTrainingRouteWorker(
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
        supportedBaseModels: [DEFAULT_Q_BASE_MODEL],
        preferredLayerIds: ['router-core'],
      },
      root,
    )
    upsertQTrainingRouteQueueEntry(
      {
        runId: 'run-worker-assignment',
        manifestPath: join(root, 'run-worker-assignment', 'route-request.json'),
        queuedAt: '2026-04-12T17:00:01.000Z',
        updatedAt: '2026-04-12T17:00:01.000Z',
        status: 'queued',
        recommendedLayerId: 'router-core',
        baseModel: DEFAULT_Q_BASE_MODEL,
        requestedExecutionDecision: 'remote_required',
      },
      root,
    )

    const beforeReap = getQTrainingRouteQueueEntry(
      'run-worker-assignment',
      root,
    )
    const registeredWorker = getQTrainingRouteWorker('worker-remote-a', root)
    const reaped = reapStaleQTrainingRouteWorkers({
      root,
      now: '2099-04-12T17:00:11.000Z',
    })
    const afterReap = getQTrainingRouteQueueEntry(
      'run-worker-assignment',
      root,
    )

    expect(registeredWorker?.workerLabel).toBe('gpu-a')
    expect(readQTrainingRouteWorkers(root)).toHaveLength(0)
    expect(beforeReap?.assignment?.workerId).toBe('worker-remote-a')
    expect(reaped).toHaveLength(0)
    expect(afterReap?.assignment).toBeNull()
  })

  it('removes a worker explicitly from the registry', () => {
    const root = makeRoot()
    upsertQTrainingRouteWorker(
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

    const removed = removeQTrainingRouteWorker('worker-local-a', root)

    expect(removed?.workerId).toBe('worker-local-a')
    expect(readQTrainingRouteWorkers(root)).toHaveLength(0)
  })
})

describe('evaluateQTrainingPreflight', () => {
  it('blocks when the train split is missing', () => {
    const root = makeRoot()
    const preflight = evaluateQTrainingPreflight({
      baseModel: DEFAULT_Q_BASE_MODEL,
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

    const preflight = evaluateQTrainingPreflight({
      baseModel: DEFAULT_Q_BASE_MODEL,
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

    const preflight = evaluateQTrainingPreflight({
      baseModel: Q_SMOKE_BASE_MODEL,
      trainFile,
      useCpu: true,
      modelBytes: 10 * 1024 ** 3,
      availableMemoryBytes: 16 * 1024 ** 3,
      totalMemoryBytes: 32 * 1024 ** 3,
    })

    expect(preflight.decision).toBe('allow_local')
    expect(preflight.reasonCode).toBe('ok')
  })

  it('does not reject PATH-based python commands before host preflight runs', () => {
    const root = makeRoot()
    const trainFile = join(root, 'train.jsonl')
    writeFileSync(trainFile, '{"messages":[]}\n', 'utf8')

    const preflight = evaluateQTrainingPreflight({
      baseModel: DEFAULT_Q_BASE_MODEL,
      trainFile,
      pythonPath: 'python',
      useCpu: true,
      modelBytes: 16 * 1024 ** 3,
      availableMemoryBytes: 8 * 1024 ** 3,
      totalMemoryBytes: 16 * 1024 ** 3,
    })

    expect(preflight.decision).toBe('remote_required')
    expect(preflight.reasonCode).toBe('insufficient_host_memory')
  })
})

describe('q route manifest security', () => {
  it('signs and verifies a staged route manifest', () => {
    const root = makeRoot()
    const manifestDir = join(root, 'artifacts', 'q-runs', 'run-route')
    mkdirSync(manifestDir, { recursive: true })

    const trainSource = join(root, 'train-source.jsonl')
    const evalSource = join(root, 'eval-source.jsonl')
    writeFileSync(trainSource, '{"messages":[{"role":"user","content":"hi"}]}\n')
    writeFileSync(evalSource, '{"messages":[{"role":"assistant","content":"ok"}]}\n')

    const stagedTrain = stageQTrainingRouteFile({
      sourcePath: trainSource,
      manifestDir,
      relativePath: join('bundle', 'train.jsonl'),
    })
    const stagedEval = stageQTrainingRouteFile({
      sourcePath: evalSource,
      manifestDir,
      relativePath: join('bundle', 'eval.jsonl'),
    })

    const manifest = buildQTrainingRouteManifest({
      runId: 'run-route',
      routeRequest: {
        route: 'immaculate',
        requestedAt: '2026-04-12T12:00:00.000Z',
        target: 'q-train',
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
        baseModel: DEFAULT_Q_BASE_MODEL,
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
        baseModel: DEFAULT_Q_BASE_MODEL,
        useCpu: true,
      },
      env: {
        OPENJAWS_Q_ROUTE_SECRET: 'test-route-secret',
      } as NodeJS.ProcessEnv,
    })

    const signature = verifyQTrainingRouteManifest(manifest, {
      secret: 'test-route-secret',
    })
    const integrity = verifyQTrainingRouteManifestIntegrity(
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
    const manifestDir = join(root, 'artifacts', 'q-runs', 'run-route-tamper')
    mkdirSync(manifestDir, { recursive: true })

    const trainSource = join(root, 'train-source.jsonl')
    writeFileSync(trainSource, '{"messages":[{"role":"user","content":"hi"}]}\n')

    const stagedTrain = stageQTrainingRouteFile({
      sourcePath: trainSource,
      manifestDir,
      relativePath: join('bundle', 'train.jsonl'),
    })

    const manifest = buildQTrainingRouteManifest({
      runId: 'run-route-tamper',
      routeRequest: {
        route: 'immaculate',
        requestedAt: '2026-04-12T12:05:00.000Z',
        target: 'q-train',
        manifestPath: join(manifestDir, 'route-request.json'),
        integrity: {
          algorithm: 'sha256',
          trainFile: stagedTrain,
          evalFile: null,
        },
      },
      training: {
        baseModel: DEFAULT_Q_BASE_MODEL,
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
        baseModel: DEFAULT_Q_BASE_MODEL,
        useCpu: true,
      },
      env: {
        OPENJAWS_Q_ROUTE_SECRET: 'test-route-secret',
      } as NodeJS.ProcessEnv,
    })

    manifest.training.selectedTags.push('security')
    const signature = verifyQTrainingRouteManifest(manifest, {
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
      'q-runs',
      'run-route-dispatch',
    )
    mkdirSync(manifestDir, { recursive: true })

    const trainSource = join(root, 'train-source.jsonl')
    const evalSource = join(root, 'eval-source.jsonl')
    writeFileSync(trainSource, '{"messages":[{"role":"user","content":"hi"}]}\n')
    writeFileSync(evalSource, '{"messages":[{"role":"assistant","content":"ok"}]}\n')

    const stagedTrain = stageQTrainingRouteFile({
      sourcePath: trainSource,
      manifestDir,
      relativePath: join('bundle', 'train.jsonl'),
    })
    const stagedEval = stageQTrainingRouteFile({
      sourcePath: evalSource,
      manifestDir,
      relativePath: join('bundle', 'eval.jsonl'),
    })

    const manifest = buildQTrainingRouteManifest({
      runId: 'run-route-dispatch',
      routeRequest: {
        route: 'immaculate',
        requestedAt: '2026-04-12T12:10:00.000Z',
        target: 'q-train',
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
        baseModel: DEFAULT_Q_BASE_MODEL,
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
        baseModel: DEFAULT_Q_BASE_MODEL,
        useCpu: true,
      },
      env: {
        OPENJAWS_Q_ROUTE_SECRET: 'test-route-secret',
      } as NodeJS.ProcessEnv,
    })

    const envelope = buildQTrainingRouteDispatchEnvelope({
      manifest,
      manifestPath: join(manifestDir, 'route-request.json'),
      manifestDir,
      workerId: 'worker-remote-a',
      executionMode: 'immaculate_routed',
      dispatchedAt: '2026-04-12T12:11:00.000Z',
      env: {
        OPENJAWS_Q_ROUTE_SECRET: 'test-route-secret',
      } as NodeJS.ProcessEnv,
    })

    const verification = verifyQTrainingRouteDispatchEnvelope(envelope, {
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
      'q-runs',
      'run-route-dispatch-tamper',
    )
    mkdirSync(manifestDir, { recursive: true })

    const trainSource = join(root, 'train-source.jsonl')
    writeFileSync(trainSource, '{"messages":[{"role":"user","content":"hi"}]}\n')

    const stagedTrain = stageQTrainingRouteFile({
      sourcePath: trainSource,
      manifestDir,
      relativePath: join('bundle', 'train.jsonl'),
    })

    const manifest = buildQTrainingRouteManifest({
      runId: 'run-route-dispatch-tamper',
      routeRequest: {
        route: 'immaculate',
        requestedAt: '2026-04-12T12:15:00.000Z',
        target: 'q-train',
        manifestPath: join(manifestDir, 'route-request.json'),
        integrity: {
          algorithm: 'sha256',
          trainFile: stagedTrain,
          evalFile: null,
        },
      },
      training: {
        baseModel: DEFAULT_Q_BASE_MODEL,
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
        baseModel: DEFAULT_Q_BASE_MODEL,
        useCpu: true,
      },
      env: {
        OPENJAWS_Q_ROUTE_SECRET: 'test-route-secret',
      } as NodeJS.ProcessEnv,
    })

    const envelope = buildQTrainingRouteDispatchEnvelope({
      manifest,
      manifestPath: join(manifestDir, 'route-request.json'),
      manifestDir,
      workerId: 'worker-remote-a',
      executionMode: 'immaculate_routed',
      dispatchedAt: '2026-04-12T12:16:00.000Z',
      env: {
        OPENJAWS_Q_ROUTE_SECRET: 'test-route-secret',
      } as NodeJS.ProcessEnv,
    })

    envelope.payload.files[0]!.contentBase64 = Buffer.from(
      '{"messages":[{"role":"user","content":"tampered"}]}\n',
      'utf8',
    ).toString('base64')

    const verification = verifyQTrainingRouteDispatchEnvelope(envelope, {
      secret: 'test-route-secret',
    })

    expect(verification.valid).toBe(false)
    expect(verification.reason).toBe('payload_mismatch')
  })

  it('builds and verifies a signed remote result envelope', () => {
    const envelope = buildQTrainingRouteResultEnvelope({
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
        base_model: DEFAULT_Q_BASE_MODEL,
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
        OPENJAWS_Q_ROUTE_SECRET: 'test-route-secret',
      } as NodeJS.ProcessEnv,
    })

    const verification = verifyQTrainingRouteResultEnvelope(envelope, {
      secret: 'test-route-secret',
    })

    expect(verification.valid).toBe(true)
    expect(verification.reason).toBe('ok')
    expect(envelope.payload.status).toBe('completed')
    expect(envelope.payload.executionId).toBe('remote-exec-2')
  })

  it('detects tampering in a signed remote result envelope', () => {
    const envelope = buildQTrainingRouteResultEnvelope({
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
        OPENJAWS_Q_ROUTE_SECRET: 'test-route-secret',
      } as NodeJS.ProcessEnv,
    })

    envelope.payload.summary = 'tampered'

    const verification = verifyQTrainingRouteResultEnvelope(envelope, {
      secret: 'test-route-secret',
    })

    expect(verification.valid).toBe(false)
    expect(verification.reason).toBe('payload_mismatch')
  })
})
