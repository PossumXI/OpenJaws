import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { execa } from 'execa'
import { getLatestQTrainingSnapshot } from '../src/utils/qTraining.js'
import { ensureQRouteSmokeBundleDir } from './q-route-smoke-fixture.js'

function makeRoot(): string {
  return mkdtempSync(join(tmpdir(), 'openjaws-q-route-failure-'))
}

async function main() {
  const repoRoot = process.cwd()
  const routeRoot = makeRoot()
  const bundleDir = ensureQRouteSmokeBundleDir(repoRoot)
  const harnessUrl = 'http://127.0.0.1:1'

  try {
    const launch = await execa(
      'bun',
      [
        'scripts/launch-q-train.ts',
        '--root',
        routeRoot,
        '--bundle-dir',
        bundleDir,
        '--run-name',
        'route-failure-live',
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
        env: {
          ...process.env,
          IMMACULATE_HARNESS_URL: harnessUrl,
        },
      },
    )

    const launchJson = JSON.parse(launch.stdout) as {
      runId: string
      status: string
      executionMode: string
      routeRequest?: unknown
      routeFailure?: {
        route?: string
        stage?: string
        code?: string
        harnessUrl?: string | null
        summary?: string | null
      } | null
    }
    const snapshot = getLatestQTrainingSnapshot(routeRoot)

    const ok =
      launch.exitCode === 0 &&
      launchJson.status === 'remote_required' &&
      launchJson.executionMode === 'remote_required' &&
      launchJson.routeRequest == null &&
      launchJson.routeFailure?.route === 'immaculate' &&
      launchJson.routeFailure.stage === 'status' &&
      launchJson.routeFailure.code === 'harness_unreachable' &&
      launchJson.routeFailure.harnessUrl === harnessUrl &&
      typeof launchJson.routeFailure.summary === 'string' &&
      snapshot?.state?.routeFailure?.code === 'harness_unreachable' &&
      snapshot?.state?.routeFailure?.harnessUrl === harnessUrl &&
      snapshot?.state?.status === 'remote_required'

    console.log(
      JSON.stringify(
        {
          status: ok ? 'passed' : 'failed',
          routeRoot,
          launchJson,
          snapshot,
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
