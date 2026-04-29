import {
  buildImmaculateHarnessHeaders,
  getImmaculateHarnessConfig,
  getImmaculateHarnessWorkers,
} from '../src/utils/immaculateHarness.js'

type CliOptions = {
  controlPlaneUrl: string | null
  expectedNodeId: string | null
  authorizationToken: string | null
  maxObservedLatencyMs: number | null
  refreshIntervalMs: number | null
  leaseRefreshIntervalMs: number | null
}

function readArgValue(argv: string[], name: string): string | null {
  const index = argv.indexOf(name)
  if (index === -1 || !argv[index + 1]) {
    return null
  }
  return argv[index + 1]!.trim() || null
}

function readNumberArg(argv: string[], name: string): number | null {
  const raw = readArgValue(argv, name)
  if (!raw) {
    return null
  }
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

function firstEnv(...names: string[]): string | null {
  for (const name of names) {
    const value = process.env[name]?.trim()
    if (value) {
      return value
    }
  }
  return null
}

function firstNumberEnv(...names: string[]): number | null {
  const raw = firstEnv(...names)
  if (!raw) {
    return null
  }
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

function parseOptions(argv = process.argv.slice(2)): CliOptions {
  return {
    controlPlaneUrl:
      readArgValue(argv, '--control-plane-url') ??
      firstEnv(
        'IMMACULATE_REMOTE_CONTROL_PLANE_URL',
        'IMMACULATE_FEDERATION_PEER_URL',
        'Q_REMOTE_IMMACULATE_URL',
      ),
    expectedNodeId:
      readArgValue(argv, '--expected-node-id') ??
      firstEnv('IMMACULATE_FEDERATION_EXPECTED_NODE_ID'),
    authorizationToken:
      readArgValue(argv, '--authorization-token') ??
      firstEnv(
        'IMMACULATE_FEDERATION_AUTH_TOKEN',
        'IMMACULATE_REMOTE_AUTH_TOKEN',
      ),
    maxObservedLatencyMs:
      readNumberArg(argv, '--max-observed-latency-ms') ??
      firstNumberEnv('IMMACULATE_FEDERATION_MAX_OBSERVED_LATENCY_MS'),
    refreshIntervalMs: readNumberArg(argv, '--refresh-interval-ms'),
    leaseRefreshIntervalMs: readNumberArg(argv, '--lease-refresh-interval-ms'),
  }
}

function normalizeControlPlaneUrl(url: string): string {
  const parsed = new URL(url)
  parsed.pathname = parsed.pathname.replace(/\/+$/, '')
  parsed.search = ''
  parsed.hash = ''
  return parsed.toString().replace(/\/+$/, '')
}

async function main() {
  const options = parseOptions()
  if (!options.controlPlaneUrl) {
    console.error(
      JSON.stringify(
        {
          status: 'blocked',
          reason: 'missing_remote_control_plane_url',
          summary:
            'Set --control-plane-url or IMMACULATE_REMOTE_CONTROL_PLANE_URL to enroll a real remote Immaculate worker.',
        },
        null,
        2,
      ),
    )
    process.exit(2)
  }

  const harness = getImmaculateHarnessConfig()
  const body = {
    controlPlaneUrl: normalizeControlPlaneUrl(options.controlPlaneUrl),
    expectedNodeId: options.expectedNodeId ?? undefined,
    authorizationToken: options.authorizationToken ?? undefined,
    maxObservedLatencyMs: options.maxObservedLatencyMs ?? undefined,
    refreshIntervalMs: options.refreshIntervalMs ?? undefined,
    leaseRefreshIntervalMs: options.leaseRefreshIntervalMs ?? undefined,
  }
  const response = await fetch(
    `${harness.harnessUrl}/api/federation/peers/register`,
    {
      method: 'POST',
      headers: {
        ...buildImmaculateHarnessHeaders({
          action: 'register_worker',
          purpose: ['cognitive-registration', 'remote-worker-enrollment'],
          consentScope: 'system:intelligence',
        }),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  )
  const data = (await response.json().catch(() => null)) as Record<
    string,
    unknown
  > | null
  const workers = await getImmaculateHarnessWorkers().catch(() => null)
  const importedWorkers = Array.isArray(data?.importedWorkers)
    ? data.importedWorkers.length
    : 0
  const importedWorkerSummaries = Array.isArray(data?.importedWorkers)
    ? data.importedWorkers
        .filter(
          (worker): worker is Record<string, unknown> =>
            typeof worker === 'object' && worker !== null,
        )
        .map(worker => ({
          workerId: typeof worker.workerId === 'string' ? worker.workerId : null,
          executionProfile:
            typeof worker.executionProfile === 'string'
              ? worker.executionProfile
              : null,
          executionEndpointPresent:
            typeof worker.executionEndpoint === 'string' &&
            worker.executionEndpoint.length > 0,
          healthStatus:
            typeof worker.healthStatus === 'string' ? worker.healthStatus : null,
          assignmentEligible:
            typeof worker.assignmentEligible === 'boolean'
              ? worker.assignmentEligible
              : null,
          assignmentBlockedReason:
            typeof worker.assignmentBlockedReason === 'string'
              ? worker.assignmentBlockedReason
              : null,
        }))
    : []

  console.log(
    JSON.stringify(
      {
        status: response.ok ? 'accepted' : 'blocked',
        httpStatus: response.status,
        harnessUrl: harness.harnessUrl,
        controlPlaneUrl: body.controlPlaneUrl,
        expectedNodeId: options.expectedNodeId,
        authorizationTokenPresent: Boolean(options.authorizationToken),
        importedWorkers,
        workerCount: workers?.workerCount ?? null,
        healthyWorkerCount: workers?.healthyWorkerCount ?? null,
        eligibleWorkerCount: workers?.eligibleWorkerCount ?? null,
        blockedWorkerCount: workers?.blockedWorkerCount ?? null,
        importedWorkerSummaries,
        error: typeof data?.error === 'string' ? data.error : null,
        message: typeof data?.message === 'string' ? data.message : null,
      },
      null,
      2,
    ),
  )

  if (!response.ok || importedWorkers < 1 || (workers?.eligibleWorkerCount ?? 0) < 1) {
    process.exit(1)
  }
}

await main()
