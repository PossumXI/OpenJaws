import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { execa } from 'execa'
import {
  DEFAULT_Q_BASE_MODEL,
  readQTrainingRouteWorkerRuntimeStatuses,
} from '../src/utils/qTraining.js'

function makeRoot(): string {
  return mkdtempSync(join(tmpdir(), 'openjaws-q-worker-sync-failure-'))
}

async function main() {
  const repoRoot = process.cwd()
  const routeRoot = makeRoot()
  const workerId = 'route-worker:sync-failure-live'
  const harnessUrl = 'http://127.0.0.1:1'

  try {
    const worker = await execa(
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
        'gpu-sync-failure',
        '--host-label',
        'dead-harness-box',
        '--execution-profile',
        'remote',
        '--execution-endpoint',
        'https://dead-harness-box.example/execute',
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
        env: {
          ...process.env,
          IMMACULATE_HARNESS_URL: harnessUrl,
        },
      },
    )

    const workerJson = JSON.parse(worker.stdout) as {
      status: string
      summary?: string
      workerId?: string
      harnessUrl?: string | null
      detail?: string | null
    }
    const runtime = readQTrainingRouteWorkerRuntimeStatuses(routeRoot)
    const runtimeEntry = runtime.find(entry => entry.workerId === workerId) ?? null

    const ok =
      worker.exitCode === 1 &&
      workerJson.status === 'worker_register_failed' &&
      workerJson.workerId === workerId &&
      workerJson.harnessUrl === harnessUrl &&
      runtimeEntry?.status === 'register_failed' &&
      runtimeEntry?.harnessUrl === harnessUrl &&
      typeof runtimeEntry?.detail === 'string'

    console.log(
      JSON.stringify(
        {
          status: ok ? 'passed' : 'failed',
          routeRoot,
          workerJson,
          runtimeEntry,
        },
        null,
        2,
      ),
    )

    if (!ok) {
      process.exit(1)
    }
  } finally {
    rmSync(routeRoot, { recursive: true, force: true })
  }
}

await main()
