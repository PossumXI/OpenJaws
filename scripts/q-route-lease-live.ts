import { mkdtempSync, rmSync } from 'fs'
import { execa } from 'execa'
import { tmpdir } from 'os'
import { join } from 'path'
import { ensureQRouteSmokeBundleDir } from './q-route-smoke-fixture.js'
import {
  claimQTrainingRouteQueueEntry,
  getQTrainingRouteQueueEntry,
  reapStaleQTrainingRouteQueueClaims,
  upsertQTrainingRouteQueueEntry,
} from '../src/utils/qTraining.js'

const LEASE_TTL_MS = 1_000
const HEARTBEAT_MS = 100
const DISPATCH_DELAY_MS = 500

function makeRoot(): string {
  return mkdtempSync(join(tmpdir(), 'openjaws-q-route-lease-'))
}

function toMillis(timestamp: string | null | undefined): number | null {
  if (!timestamp) {
    return null
  }
  const value = Date.parse(timestamp)
  return Number.isFinite(value) ? value : null
}

type LeaseRunState = {
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

async function readLeaseRunState(path: string): Promise<LeaseRunState> {
  return JSON.parse(await Bun.file(path).text()) as LeaseRunState
}

async function waitForLeaseRunState(args: {
  path: string
  workerId: string
  timeoutMs?: number
  pollMs?: number
}): Promise<LeaseRunState> {
  const timeoutMs = args.timeoutMs ?? 5_000
  const pollMs = args.pollMs ?? 100
  const startedAt = Date.now()
  let latest = await readLeaseRunState(args.path)

  while (Date.now() - startedAt < timeoutMs) {
    if (
      latest.executionMode === 'immaculate_routed' &&
      latest.routeQueue?.status === 'dispatched' &&
      latest.routeQueue?.claim?.workerId === args.workerId
    ) {
      return latest
    }
    await Bun.sleep(pollMs)
    latest = await readLeaseRunState(args.path)
  }

  return latest
}

async function main() {
  const bundleDir = ensureQRouteSmokeBundleDir()
  const launch = await execa(
    'bun',
    [
      'scripts/launch-q-train.ts',
      '--bundle-dir',
      bundleDir,
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
      'scripts/process-q-routes.ts',
      '--manifest',
      manifestPath,
      '--allow-host-risk',
      '--worker-id',
      'route-worker:lease-live',
      '--claim-ttl-ms',
      String(LEASE_TTL_MS),
      '--heartbeat-ms',
      String(HEARTBEAT_MS),
      '--dispatch-delay-ms',
      String(DISPATCH_DELAY_MS),
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

  const runState = await waitForLeaseRunState({
    path: launchJson.runStatePath,
    workerId: 'route-worker:lease-live',
  })

  if (runState.pid) {
    try {
      process.kill(runState.pid, 'SIGKILL')
    } catch {}
  }

  const leaseRoot = makeRoot()
  try {
    upsertQTrainingRouteQueueEntry(
      {
        runId: 'stale-run',
        manifestPath: join(leaseRoot, 'stale-run', 'route-request.json'),
        queuedAt: '2026-04-12T15:00:00.000Z',
        updatedAt: '2026-04-12T15:00:00.000Z',
        status: 'queued',
      },
      leaseRoot,
    )
    claimQTrainingRouteQueueEntry({
      runId: 'stale-run',
      workerId: 'route-worker:stale',
      root: leaseRoot,
      claimedAt: '2026-04-12T15:00:10.000Z',
      claimTtlMs: 100,
    })
    reapStaleQTrainingRouteQueueClaims({
      root: leaseRoot,
      now: '2026-04-12T15:00:10.300Z',
    })
    const staleEntry = getQTrainingRouteQueueEntry('stale-run', leaseRoot)

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
      leaseExpiresAt > claimedAt + LEASE_TTL_MS

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
