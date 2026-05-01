import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { execa } from 'execa'
import {
  getImmaculateHarnessStatus,
  getImmaculateHarnessWorkers,
} from '../src/utils/immaculateHarness.js'
import {
  DEFAULT_Q_BASE_MODEL,
  getQTrainingRouteQueueEntry,
  readQTrainingRouteWorkers,
} from '../src/utils/qTraining.js'
import { ensureQRouteSmokeBundleDir } from './q-route-smoke-fixture.js'

function makeRoot(): string {
  return mkdtempSync(join(tmpdir(), 'openjaws-q-route-worker-'))
}

async function waitForLocalWorker(
  root: string,
  workerId: string,
  timeoutMs = 5_000,
): Promise<ReturnType<typeof readQTrainingRouteWorkers>> {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const workers = readQTrainingRouteWorkers(root)
    if (workers.some(worker => worker.workerId === workerId)) {
      return workers
    }
    await Bun.sleep(100)
  }
  return []
}

async function main() {
  const repoRoot = process.cwd()
  const routeRoot = makeRoot()
  const runSuffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
  const workerId = `route-worker:assignment-live-${runSuffix}`
  const workerLabel = `gpu-assignment-live-${runSuffix}`
  const hostLabel = 'remote-gpu-box'
  const executionEndpoint = 'https://remote-gpu-box.example/execute'
  const bundleDir = ensureQRouteSmokeBundleDir(repoRoot)
  const harnessStatus = await getImmaculateHarnessStatus().catch(() => null)
  const isRunWorker = (workerIdToCheck: string): boolean =>
    workerIdToCheck.includes(runSuffix)

  if (!harnessStatus?.enabled || !harnessStatus.reachable) {
    console.error(
      JSON.stringify(
        {
          status: 'failed',
          summary: 'Immaculate harness is not reachable for worker assignment smoke.',
          harnessStatus,
        },
        null,
        2,
      ),
    )
    process.exit(1)
  }

  const workerProcess = execa(
    'bun',
    [
      'scripts/process-q-routes.ts',
      '--root',
      routeRoot,
      '--watch',
      '--dry-run',
      '--worker-id',
      workerId,
      '--worker-label',
      workerLabel,
      '--host-label',
      hostLabel,
      '--execution-profile',
      'remote',
      '--execution-endpoint',
      executionEndpoint,
      '--base-model',
      DEFAULT_Q_BASE_MODEL,
      '--layer',
      'router-core',
      '--idle-exit-ms',
      '5000',
      '--poll-ms',
      '250',
    ],
    {
      cwd: repoRoot,
      reject: false,
      windowsHide: true,
    },
  )

  try {
    const localWorkersBeforeLaunch = await waitForLocalWorker(routeRoot, workerId)
    const harnessWorkersBeforeLaunch = await getImmaculateHarnessWorkers().catch(() => null)

    const launch = await execa(
      'bun',
      [
        'scripts/launch-q-train.ts',
        '--root',
        routeRoot,
        '--bundle-dir',
        bundleDir,
        '--run-name',
        'worker-assignment-live',
        '--tag',
        'agentic',
        '--max-steps',
        '1',
        '--route',
        'immaculate',
      ],
      {
        cwd: repoRoot,
        reject: false,
        windowsHide: true,
      },
    )

    const launchJson = JSON.parse(launch.stdout) as {
      runId: string
      status: string
      routeRequest?: {
        controlAccepted?: boolean
        harnessSnapshot?: {
          assignment?: {
            workerId?: string
          } | null
        } | null
      } | null
      routeQueue?: {
        assignment?: {
          workerId?: string
          executionProfile?: string
          hostLabel?: string | null
          source?: string | null
        } | null
      } | null
      routeQueueDisplayStatus?: string | null
      routeQueueSummary?: string | null
    }
    const queueEntry = getQTrainingRouteQueueEntry(launchJson.runId, routeRoot)
    const workerResult = await workerProcess
    const harnessWorkersAfter = await getImmaculateHarnessWorkers().catch(() => null)
    const relevantWorkersBeforeLaunch =
      harnessWorkersBeforeLaunch?.workers.filter(worker =>
        isRunWorker(worker.workerId),
      ) ?? []
    const relevantWorkersAfter =
      harnessWorkersAfter?.workers.filter(worker => isRunWorker(worker.workerId)) ??
      []
    const assignedWorker =
      relevantWorkersBeforeLaunch.find(
        worker =>
          worker.workerId === workerId &&
          worker.executionProfile === 'remote' &&
          worker.healthStatus === 'healthy' &&
          worker.assignmentEligible === true,
      ) ?? null
    const blockedWorker =
      relevantWorkersBeforeLaunch.find(
        worker =>
          worker.workerId === workerId &&
          worker.executionProfile === 'remote' &&
          worker.healthStatus === 'faulted' &&
          worker.assignmentEligible === false &&
          worker.assignmentBlockedReason === 'unverified federation worker',
      ) ?? null
    const noVisibleWorker =
      relevantWorkersBeforeLaunch.length === 0 &&
      localWorkersBeforeLaunch.some(
        worker =>
          worker.workerId === workerId &&
          worker.executionProfile === 'remote',
      )
    const healthyWorkerCount = relevantWorkersBeforeLaunch.filter(
      worker => worker.healthStatus === 'healthy',
    ).length
    const faultedWorkerCount = relevantWorkersBeforeLaunch.filter(
      worker => worker.healthStatus === 'faulted',
    ).length
    const eligibleWorkerCount = relevantWorkersBeforeLaunch.filter(
      worker => worker.assignmentEligible === true,
    ).length
    const snapshotWorkerCount =
      launchJson.routeRequest?.harnessSnapshot?.workerCount ??
      launchJson.routeQueue?.blockedWorkerCount ??
      0
    const snapshotFaultedWorkerCount =
      launchJson.routeRequest?.harnessSnapshot?.faultedWorkerCount ??
      launchJson.routeQueue?.faultedWorkerCount ??
      0
    const snapshotEligibleWorkerCount =
      launchJson.routeRequest?.harnessSnapshot?.eligibleWorkerCount ??
      launchJson.routeQueue?.eligibleWorkerCount ??
      0
    const snapshotBlockedWorkerCount =
      launchJson.routeRequest?.harnessSnapshot?.blockedWorkerCount ??
      launchJson.routeQueue?.blockedWorkerCount ??
      0

    const assignedMode =
      assignedWorker !== null &&
      healthyWorkerCount >= 1 &&
      eligibleWorkerCount >= 1 &&
      localWorkersBeforeLaunch.some(
        worker =>
          worker.workerId === workerId &&
          worker.executionProfile === 'remote',
      ) &&
      launch.exitCode === 0 &&
      launchJson.status === 'route_requested' &&
      launchJson.routeRequest?.controlAccepted === true &&
      launchJson.routeRequest?.harnessSnapshot?.assignment?.workerId === workerId &&
      launchJson.routeQueue?.assignment?.workerId === workerId &&
      launchJson.routeQueue?.assignment?.executionProfile === 'remote' &&
      launchJson.routeQueue?.assignment?.hostLabel === hostLabel &&
      launchJson.routeQueue?.assignment?.source === 'immaculate' &&
      queueEntry?.assignment?.workerId === workerId &&
      queueEntry.assignment?.source === 'immaculate' &&
      workerResult.exitCode === 0
    const blockedMode =
      localWorkersBeforeLaunch.some(
        worker =>
          worker.workerId === workerId &&
          worker.executionProfile === 'remote',
      ) &&
      (blockedWorker !== null || noVisibleWorker || snapshotBlockedWorkerCount >= 1) &&
      snapshotEligibleWorkerCount === 0 &&
      localWorkersBeforeLaunch.some(
        worker =>
          worker.workerId === workerId &&
          worker.executionProfile === 'remote',
      ) &&
      launch.exitCode === 0 &&
      launchJson.status === 'route_requested' &&
      launchJson.routeRequest?.controlAccepted === true &&
      launchJson.routeRequest?.harnessSnapshot?.assignment === null &&
      snapshotWorkerCount >= 0 &&
      snapshotFaultedWorkerCount >= faultedWorkerCount &&
      launchJson.routeQueue?.assignment === null &&
      launchJson.routeQueueDisplayStatus === 'pending_assignment' &&
      launchJson.routeQueueSummary === 'pending assignment' &&
      queueEntry?.status === 'queued' &&
      queueEntry?.assignment === null &&
      queueEntry?.claim === null &&
      queueEntry?.dispatch === null &&
      workerResult.exitCode === 0 &&
      workerResult.stdout.includes('"status": "idle"')
    const ok = assignedMode || blockedMode

    console.log(
      JSON.stringify(
        {
          status: ok ? 'passed' : 'failed',
          mode: assignedMode
            ? 'verified_assignment'
            : blockedMode
              ? blockedWorker !== null || snapshotBlockedWorkerCount >= 1
                ? 'blocked_unverified_worker'
                : 'pending_assignment_no_visible_worker'
              : 'unknown',
          routeRoot,
          harnessStatus,
          harnessWorkersBeforeLaunch,
          relevantWorkersBeforeLaunch,
          localWorkersBeforeLaunch,
          launchJson,
          queueEntry,
          workerResult: {
            exitCode: workerResult.exitCode,
            stdout: workerResult.stdout,
            stderr: workerResult.stderr,
          },
          harnessWorkersAfter,
          relevantWorkersAfter,
        },
        null,
        2,
      ),
    )

    if (!ok) {
      process.exit(1)
    }
  } finally {
    if (workerProcess.pid) {
      await execa(
        'taskkill',
        ['/PID', String(workerProcess.pid), '/T', '/F'],
        {
          reject: false,
          windowsHide: true,
        },
      )
    }
    rmSync(routeRoot, { recursive: true, force: true })
  }
}

await main()
