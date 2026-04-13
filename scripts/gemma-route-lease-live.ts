import { mkdtempSync, rmSync } from 'fs'
import { execa } from 'execa'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  claimGemmaTrainingRouteQueueEntry,
  getGemmaTrainingRouteQueueEntry,
  reapStaleGemmaTrainingRouteQueueClaims,
  upsertGemmaTrainingRouteQueueEntry,
} from '../src/utils/gemmaTraining.js'

function makeRoot(): string {
  return mkdtempSync(join(tmpdir(), 'openjaws-gemma-route-lease-'))
}

function toMillis(timestamp: string | null | undefined): number | null {
  if (!timestamp) {
    return null
  }
  const value = Date.parse(timestamp)
  return Number.isFinite(value) ? value : null
}

async function main() {
  const launch = await execa(
    'bun',
    [
      'scripts/launch-gemma4-train.ts',
      '--bundle-dir',
      'data\\sft\\audited-v2',
      '--run-name',
      'lease-live',
      '--tag',
      'agentic',
      '--max-steps',
      '1',
    ],
    {
      cwd: process.cwd(),
      windowsHide: true,
    },
  )
  const launchJson = JSON.parse(launch.stdout) as {
    runId: string
    status: string
    runStatePath: string
    routeRequest?: {
      manifestPath: string
    }
  }
  const manifestPath = launchJson.routeRequest?.manifestPath
  if (!manifestPath) {
    throw new Error('Launcher did not return a route manifest path')
  }

  const worker = await execa(
    'bun',
    [
      'scripts/process-gemma4-routes.ts',
      '--manifest',
      manifestPath,
      '--allow-host-risk',
      '--worker-id',
      'route-worker:lease-live',
      '--claim-ttl-ms',
      '250',
      '--heartbeat-ms',
      '100',
      '--dispatch-delay-ms',
      '500',
    ],
    {
      cwd: process.cwd(),
      windowsHide: true,
    },
  )
  const workerJson = JSON.parse(worker.stdout) as {
    status: string
    workerId: string
    queueEntry: {
      claim?: {
        claimedAt?: string | null
      } | null
    } | null
    dispatch: {
      status?: string
      pid?: number | null
    }
  }

  const runState = JSON.parse(
    await Bun.file(launchJson.runStatePath).text(),
  ) as {
    executionMode?: string
    routeQueue?: {
      status?: string
      claim?: {
        workerId?: string | null
        claimedAt?: string | null
        heartbeatAt?: string | null
        leaseExpiresAt?: string | null
      } | null
    } | null
    pid?: number | null
  }

  if (runState.pid) {
    try {
      process.kill(runState.pid, 'SIGKILL')
    } catch {}
  }

  const leaseRoot = makeRoot()
  try {
    upsertGemmaTrainingRouteQueueEntry(
      {
        runId: 'stale-run',
        manifestPath: join(leaseRoot, 'stale-run', 'route-request.json'),
        queuedAt: '2026-04-12T15:00:00.000Z',
        updatedAt: '2026-04-12T15:00:00.000Z',
        status: 'queued',
      },
      leaseRoot,
    )
    claimGemmaTrainingRouteQueueEntry({
      runId: 'stale-run',
      workerId: 'route-worker:stale',
      root: leaseRoot,
      claimedAt: '2026-04-12T15:00:10.000Z',
      claimTtlMs: 100,
    })
    reapStaleGemmaTrainingRouteQueueClaims({
      root: leaseRoot,
      now: '2026-04-12T15:00:10.300Z',
    })
    const staleEntry = getGemmaTrainingRouteQueueEntry('stale-run', leaseRoot)

    const claimedAt = toMillis(
      workerJson.queueEntry?.claim?.claimedAt ?? runState.routeQueue?.claim?.claimedAt,
    )
    const heartbeatAt = toMillis(runState.routeQueue?.claim?.heartbeatAt)
    const leaseExpiresAt = toMillis(runState.routeQueue?.claim?.leaseExpiresAt)
    const renewed =
      claimedAt !== null &&
      heartbeatAt !== null &&
      leaseExpiresAt !== null &&
      heartbeatAt > claimedAt &&
      leaseExpiresAt > claimedAt + 250

    const ok =
      launchJson.status === 'route_requested' &&
      workerJson.status === 'processed' &&
      workerJson.dispatch?.status === 'launched' &&
      runState.executionMode === 'immaculate_routed' &&
      runState.routeQueue?.status === 'dispatched' &&
      runState.routeQueue?.claim?.workerId === 'route-worker:lease-live' &&
      renewed &&
      staleEntry?.status === 'queued'

    console.log(
      JSON.stringify(
        {
          status: ok ? 'passed' : 'failed',
          launchStatus: launchJson.status,
          workerStatus: workerJson.status,
          dispatchStatus: workerJson.dispatch?.status ?? null,
          executionMode: runState.executionMode ?? null,
          routeQueue: runState.routeQueue ?? null,
          renewed,
          staleEntry,
        },
        null,
        2,
      ),
    )

    if (!ok) {
      process.exit(1)
    }
  } finally {
    rmSync(leaseRoot, { recursive: true, force: true })
  }
}

await main()
