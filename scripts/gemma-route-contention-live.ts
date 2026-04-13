import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  claimGemmaTrainingRouteQueueEntry,
  getGemmaTrainingRouteQueueEntry,
  upsertGemmaTrainingRouteWorker,
  upsertGemmaTrainingRouteQueueEntry,
} from '../src/utils/gemmaTraining.js'

function makeRoot(): string {
  return mkdtempSync(join(tmpdir(), 'openjaws-gemma-route-contention-'))
}

function seedQueuedRoute(root: string, runId: string, queuedAt: string): void {
  upsertGemmaTrainingRouteQueueEntry(
    {
      runId,
      manifestPath: join(root, runId, 'route-request.json'),
      queuedAt,
      updatedAt: queuedAt,
      status: 'queued',
      target: runId,
      recommendedLayerId: 'router-core',
    },
    root,
  )
}

async function main() {
  const root = makeRoot()
  try {
    upsertGemmaTrainingRouteWorker(
      {
        workerId: 'worker-a',
        executionProfile: 'local',
        registeredAt: '2026-04-12T14:00:00.000Z',
        heartbeatAt: '2026-04-12T14:00:00.000Z',
        leaseExpiresAt: '2026-04-12T14:05:00.000Z',
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
        registeredAt: '2026-04-12T14:00:00.000Z',
        heartbeatAt: '2026-04-12T14:00:00.000Z',
        leaseExpiresAt: '2026-04-12T14:05:00.000Z',
        leaseDurationMs: 300_000,
        watch: false,
        allowHostRisk: true,
        supportedBaseModels: ['*'],
        preferredLayerIds: [],
      },
      root,
    )

    seedQueuedRoute(root, 'run-a', '2026-04-12T14:00:00.000Z')
    seedQueuedRoute(root, 'run-b', '2026-04-12T14:00:01.000Z')

    const firstClaim = claimGemmaTrainingRouteQueueEntry({
      runId: 'run-a',
      workerId: 'worker-a',
      root,
      claimTtlMs: 50,
      claimedAt: '2026-04-12T14:00:02.000Z',
    })
    const secondClaim = claimGemmaTrainingRouteQueueEntry({
      runId: 'run-b',
      workerId: 'worker-b',
      root,
      claimTtlMs: 500,
      claimedAt: '2026-04-12T14:00:02.010Z',
    })
    const blockedClaim = claimGemmaTrainingRouteQueueEntry({
      runId: 'run-a',
      workerId: 'worker-c',
      root,
      claimTtlMs: 50,
      claimedAt: '2026-04-12T14:00:02.020Z',
    })
    const recoveredClaim = claimGemmaTrainingRouteQueueEntry({
      runId: 'run-a',
      workerId: 'worker-c',
      root,
      claimTtlMs: 50,
      claimedAt: '2026-04-12T14:00:02.250Z',
    })

    const finalRunA = getGemmaTrainingRouteQueueEntry('run-a', root)
    const finalRunB = getGemmaTrainingRouteQueueEntry('run-b', root)
    const ok =
      firstClaim?.runId === 'run-a' &&
      secondClaim?.runId === 'run-b' &&
      blockedClaim === null &&
      recoveredClaim?.runId === 'run-a' &&
      recoveredClaim.claim?.workerId === 'worker-c' &&
      finalRunA?.claim?.workerId === 'worker-c' &&
      finalRunA?.status === 'claimed' &&
      finalRunB?.claim?.workerId === 'worker-b' &&
      finalRunB?.status === 'claimed'

    console.log(
      JSON.stringify(
        {
          status: ok ? 'passed' : 'failed',
          root,
          firstClaim,
          secondClaim,
          blockedClaim,
          recoveredClaim,
          finalRunA,
          finalRunB,
        },
        null,
        2,
      ),
    )

    if (!ok) {
      process.exit(1)
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

await main()
