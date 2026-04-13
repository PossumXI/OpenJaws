import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { execa } from 'execa'
import {
  getImmaculateHarnessStatus,
  getImmaculateHarnessWorkers,
  registerImmaculateHarnessWorker,
  unregisterImmaculateHarnessWorker,
} from '../src/utils/immaculateHarness.js'
import {
  getGemmaTrainingRouteQueueEntry,
  readGemmaTrainingRouteWorkers,
} from '../src/utils/gemmaTraining.js'

function makeRoot(): string {
  return mkdtempSync(join(tmpdir(), 'openjaws-gemma-route-worker-'))
}

async function waitForWorker(
  workerId: string,
  predicate?: (
    worker: NonNullable<
      Awaited<ReturnType<typeof getImmaculateHarnessWorkers>>
    >['workers'][number],
  ) => boolean,
  timeoutMs = 15_000,
): Promise<Awaited<ReturnType<typeof getImmaculateHarnessWorkers>>> {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const catalog = await getImmaculateHarnessWorkers().catch(() => null)
    if (
      catalog?.workers.some(
        worker =>
          worker.workerId === workerId &&
          (predicate ? predicate(worker) : true),
      )
    ) {
      return catalog
    }
    await Bun.sleep(250)
  }
  return null
}

async function main() {
  const repoRoot = process.cwd()
  const routeRoot = makeRoot()
  const runSuffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
  const workerId = `route-worker:assignment-live-${runSuffix}`
  const workerLabel = `gpu-assignment-live-${runSuffix}`
  const hostLabel = 'remote-gpu-box'
  const executionEndpoint = 'https://remote-gpu-box.example/execute'
  const staleWorkerId = `route-worker:assignment-stale-${runSuffix}`
  const faultedWorkerId = `route-worker:assignment-faulted-${runSuffix}`
  const bundleDir = resolve(repoRoot, 'data', 'sft', 'audited-v2')
  const harnessStatus = await getImmaculateHarnessStatus().catch(() => null)

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
      'scripts/process-gemma4-routes.ts',
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
      'google/gemma-4-E4B-it',
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
    const staleHeartbeatAt = new Date(Date.now() - 50_000).toISOString()
    await registerImmaculateHarnessWorker({
      workerId: staleWorkerId,
      workerLabel: 'gpu-assignment-stale',
      hostLabel: 'remote-gpu-stale',
      executionProfile: 'remote',
      executionEndpoint: 'https://remote-gpu-stale.example/execute',
      registeredAt: staleHeartbeatAt,
      heartbeatAt: staleHeartbeatAt,
      leaseDurationMs: 60_000,
      watch: false,
      allowHostRisk: true,
      supportedBaseModels: ['google/gemma-4-E4B-it'],
      preferredLayerIds: ['router-core'],
    })
    await registerImmaculateHarnessWorker({
      workerId: faultedWorkerId,
      workerLabel: 'gpu-assignment-faulted',
      hostLabel: 'remote-gpu-faulted',
      executionProfile: 'remote',
      registeredAt: new Date().toISOString(),
      heartbeatAt: new Date().toISOString(),
      leaseDurationMs: 45_000,
      watch: false,
      allowHostRisk: true,
      supportedBaseModels: ['google/gemma-4-E4B-it'],
      preferredLayerIds: ['router-core'],
    })
    const harnessWorkersBeforeLaunch = await waitForWorker(
      workerId,
      worker =>
        worker.healthStatus === 'healthy' && worker.assignmentEligible === true,
    )
    const localWorkersBeforeLaunch = readGemmaTrainingRouteWorkers(routeRoot)

    const launch = await execa(
      'bun',
      [
        'scripts/launch-gemma4-train.ts',
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
    }
    const queueEntry = getGemmaTrainingRouteQueueEntry(launchJson.runId, routeRoot)
    const workerResult = await workerProcess
    const harnessWorkersAfter = await getImmaculateHarnessWorkers().catch(() => null)
    const staleWorker =
      harnessWorkersBeforeLaunch?.workers.find(worker => worker.workerId === staleWorkerId) ?? null
    const faultedWorker =
      harnessWorkersBeforeLaunch?.workers.find(worker => worker.workerId === faultedWorkerId) ?? null

    const ok =
      harnessWorkersBeforeLaunch?.workers.some(
        worker =>
          worker.workerId === workerId &&
          worker.executionProfile === 'remote' &&
          worker.healthStatus === 'healthy' &&
          worker.assignmentEligible === true,
      ) === true &&
      staleWorker?.healthStatus === 'stale' &&
      staleWorker.assignmentEligible === false &&
      faultedWorker?.healthStatus === 'faulted' &&
      faultedWorker.assignmentEligible === false &&
      harnessWorkersBeforeLaunch?.healthyWorkerCount === 1 &&
      harnessWorkersBeforeLaunch?.staleWorkerCount === 1 &&
      harnessWorkersBeforeLaunch?.faultedWorkerCount === 1 &&
      harnessWorkersBeforeLaunch?.eligibleWorkerCount === 1 &&
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
      workerResult.exitCode === 0 &&
      harnessWorkersAfter?.workers.some(worker => worker.workerId === workerId) === false

    console.log(
      JSON.stringify(
        {
          status: ok ? 'passed' : 'failed',
          routeRoot,
          harnessStatus,
          harnessWorkersBeforeLaunch,
          localWorkersBeforeLaunch,
          launchJson,
          queueEntry,
          workerResult: {
            exitCode: workerResult.exitCode,
            stdout: workerResult.stdout,
            stderr: workerResult.stderr,
          },
          harnessWorkersAfter,
        },
        null,
        2,
      ),
    )

    if (!ok) {
      process.exit(1)
    }
  } finally {
    await unregisterImmaculateHarnessWorker(staleWorkerId).catch(() => null)
    await unregisterImmaculateHarnessWorker(faultedWorkerId).catch(() => null)
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
