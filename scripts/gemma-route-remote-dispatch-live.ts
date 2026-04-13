import { mkdtempSync, rmSync } from 'fs'
import { readFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { execa } from 'execa'
import {
  getImmaculateHarnessStatus,
  getImmaculateHarnessWorkers,
} from '../src/utils/immaculateHarness.js'
import {
  buildGemmaTrainingRouteResultEnvelope,
  getGemmaTrainingRouteQueueEntry,
  type GemmaTrainingRouteDispatchEnvelope,
  verifyGemmaTrainingRouteDispatchEnvelope,
} from '../src/utils/gemmaTraining.js'

function makeRoot(): string {
  return mkdtempSync(join(tmpdir(), 'openjaws-gemma-route-remote-dispatch-'))
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T
}

async function waitForWorker(
  workerId: string,
  timeoutMs = 15_000,
): Promise<Awaited<ReturnType<typeof getImmaculateHarnessWorkers>>> {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const catalog = await getImmaculateHarnessWorkers().catch(() => null)
    if (
      catalog?.workers.some(
        worker =>
          worker.workerId === workerId &&
          worker.healthStatus === 'healthy' &&
          worker.assignmentEligible === true,
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
  const workerId = `route-worker:remote-dispatch-${runSuffix}`
  const workerLabel = `gpu-remote-dispatch-${runSuffix}`
  const hostLabel = 'remote-http-gpu-box'
  const executionId = `remote-exec-${runSuffix}`
  const bundleDir = resolve(repoRoot, 'data', 'sft', 'audited-v2')
  const harnessStatus = await getImmaculateHarnessStatus().catch(() => null)

  if (!harnessStatus?.enabled || !harnessStatus.reachable) {
    console.error(
      JSON.stringify(
        {
          status: 'failed',
          summary: 'Immaculate harness is not reachable for remote dispatch smoke.',
          harnessStatus,
        },
        null,
        2,
      ),
    )
    process.exit(1)
  }

  const receivedRequests: Array<{
    headers: {
      signature: string | null
      payloadSha256: string | null
      runId: string | null
    }
    envelope: GemmaTrainingRouteDispatchEnvelope
    verification: ReturnType<typeof verifyGemmaTrainingRouteDispatchEnvelope>
  }> = []
  let stateRequests = 0
  let stateUrl = ''

  const server = Bun.serve({
    port: 0,
    idleTimeout: 30,
    fetch: async request => {
      const url = new URL(request.url)
      if (request.method === 'POST' && url.pathname === '/execute') {
        const envelope =
          (await request.json()) as GemmaTrainingRouteDispatchEnvelope
        const verification = verifyGemmaTrainingRouteDispatchEnvelope(envelope)
        receivedRequests.push({
          headers: {
            signature: request.headers.get('x-openjaws-route-signature'),
            payloadSha256: request.headers.get('x-openjaws-route-payload-sha256'),
            runId: request.headers.get('x-openjaws-route-run-id'),
          },
          envelope,
          verification,
        })
        if (!verification.valid) {
          return Response.json(
            {
              accepted: false,
              summary: `invalid envelope ${verification.reason}`,
            },
            { status: 401 },
          )
        }
        stateUrl = `http://127.0.0.1:${server.port}/state/${executionId}`
        return Response.json(
          {
            accepted: true,
            executionId,
            summary: 'remote dispatch acknowledged',
            stateUrl,
          },
          { status: 202 },
        )
      }

      if (request.method === 'GET' && url.pathname === `/state/${executionId}`) {
        stateRequests += 1
        const requestLog = receivedRequests[0] ?? null
        if (!requestLog?.verification.valid) {
          return Response.json(
            {
              summary: 'dispatch envelope missing',
            },
            { status: 404 },
          )
        }

        const dispatchedAt = requestLog.envelope.payload.dispatchedAt
        const finishedAt = new Date(
          Date.parse(dispatchedAt) + 15_000,
        ).toISOString()
        const resultEnvelope = buildGemmaTrainingRouteResultEnvelope({
          runId: requestLog.envelope.payload.runId,
          manifestPath: requestLog.envelope.payload.manifestPath,
          workerId,
          executionId,
          executionMode: 'immaculate_routed',
          finishedAt,
          status: 'completed',
          summary: 'remote dispatch verified',
          stateUrl,
          runState: {
            status: 'completed',
            finishedAt,
            updatedAt: finishedAt,
            globalStep: 1,
            epoch: 1,
            loss: 1.11,
            evalLoss: 0.87,
          },
          runSummary: {
            base_model:
              requestLog.envelope.payload.manifest.training.baseModel,
            train_file:
              requestLog.envelope.payload.manifest.training.trainFile,
            eval_file:
              requestLog.envelope.payload.manifest.training.evalFile,
            output_dir:
              requestLog.envelope.payload.manifest.training.outputDir,
            selected_tags:
              requestLog.envelope.payload.manifest.training.selectedTags,
            selected_languages:
              requestLog.envelope.payload.manifest.training.selectedLanguages,
            run_name:
              requestLog.envelope.payload.manifest.training.runName,
          },
          metricsSummary: {
            latest_train_metrics: {
              loss: 1.11,
              learning_rate: 0.0001,
            },
            latest_eval_metrics: {
              eval_loss: 0.87,
            },
            log_history: [
              {
                loss: 1.11,
                step: 1,
              },
              {
                eval_loss: 0.87,
                step: 1,
              },
            ],
          },
        })
        return Response.json(resultEnvelope, { status: 200 })
      }

      return new Response('not found', { status: 404 })
    },
  })

  const executionEndpoint = `http://127.0.0.1:${server.port}/execute`
  const workerProcess = execa(
    'bun',
    [
      'scripts/process-gemma4-routes.ts',
      '--root',
      routeRoot,
      '--worker-id',
      workerId,
      '--worker-label',
      workerLabel,
      '--host-label',
      hostLabel,
      '--watch',
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
    const harnessWorkersBeforeLaunch = await waitForWorker(workerId)
    const launch = await execa(
      'bun',
      [
        'scripts/launch-gemma4-train.ts',
        '--root',
        routeRoot,
        '--bundle-dir',
        bundleDir,
        '--run-name',
        'remote-dispatch-live',
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
      runStatePath: string
      routeQueue?: {
        assignment?: {
          workerId?: string
          executionEndpoint?: string | null
        } | null
      } | null
    }
    const workerResult = await workerProcess
    const queueEntry = getGemmaTrainingRouteQueueEntry(launchJson.runId, routeRoot)
    const runState = await readJson<Record<string, unknown>>(launchJson.runStatePath)
    const requestLog = receivedRequests[0] ?? null
    const routeQueueFromState =
      typeof runState.routeQueue === 'object' && runState.routeQueue !== null
        ? (runState.routeQueue as Record<string, unknown>)
        : null
    const routeDispatchFromState =
      routeQueueFromState &&
      typeof routeQueueFromState.dispatch === 'object' &&
      routeQueueFromState.dispatch !== null
        ? (routeQueueFromState.dispatch as Record<string, unknown>)
        : null

    const ok =
      harnessWorkersBeforeLaunch?.workers.some(
        worker =>
          worker.workerId === workerId &&
          worker.executionEndpoint === executionEndpoint &&
          worker.healthStatus === 'healthy' &&
          worker.assignmentEligible === true,
      ) === true &&
      launch.exitCode === 0 &&
      launchJson.status === 'route_requested' &&
      launchJson.routeQueue?.assignment?.workerId === workerId &&
      launchJson.routeQueue?.assignment?.executionEndpoint === executionEndpoint &&
      requestLog?.verification.valid === true &&
      requestLog.headers.signature === requestLog.envelope.security?.signature &&
      requestLog.headers.payloadSha256 ===
        requestLog.envelope.security?.payloadSha256 &&
      requestLog.headers.runId === launchJson.runId &&
      requestLog.envelope.payload.workerId === workerId &&
      requestLog.envelope.payload.manifest.runId === launchJson.runId &&
      requestLog.envelope.payload.files.length >= 1 &&
      stateRequests >= 1 &&
      queueEntry?.status === 'completed' &&
      queueEntry.dispatch?.transport === 'remote_http' &&
      queueEntry.dispatch?.remoteAccepted === true &&
      queueEntry.dispatch?.remoteStatus === 202 &&
      queueEntry.dispatch?.remoteExecutionId === executionId &&
      queueEntry.dispatch?.remoteSummary === 'remote dispatch acknowledged' &&
      queueEntry.dispatch?.remoteStateUrl === stateUrl &&
      queueEntry.dispatch?.remoteCompletionStatus === 'completed' &&
      queueEntry.dispatch?.remoteCompletionSummary === 'remote dispatch verified' &&
      queueEntry.dispatch?.executionEndpoint === executionEndpoint &&
      workerResult.exitCode === 0 &&
      workerResult.stdout.includes('"status": "processed"') &&
      workerResult.stdout.includes('"status": "completed"') &&
      routeDispatchFromState?.transport === 'remote_http' &&
      routeDispatchFromState?.remoteAccepted === true &&
      routeDispatchFromState?.remoteExecutionId === executionId &&
      routeDispatchFromState?.remoteStateUrl === stateUrl &&
      routeDispatchFromState?.remoteCompletionStatus === 'completed'

    console.log(
      JSON.stringify(
        {
          status: ok ? 'passed' : 'failed',
          routeRoot,
          executionEndpoint,
          harnessStatus,
          harnessWorkersBeforeLaunch,
          launchJson,
          requestLog,
          stateRequests,
          queueEntry,
          routeDispatchFromState,
          workerResult: {
            exitCode: workerResult.exitCode,
            stdout: workerResult.stdout,
            stderr: workerResult.stderr,
          },
        },
        null,
        2,
      ),
    )

    if (!ok) {
      process.exit(1)
    }
  } finally {
    server.stop(true)
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
