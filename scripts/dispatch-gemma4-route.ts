import { closeSync, existsSync, openSync, writeFileSync } from 'fs'
import { spawn } from 'child_process'
import { dirname, join, resolve } from 'path'
import {
  buildGemmaTrainingRouteDispatchEnvelope,
  claimGemmaTrainingRouteQueueEntry,
  evaluateGemmaTrainingPreflight,
  finalizeGemmaTrainingRouteQueueDispatch,
  getGemmaTrainingRouteQueueDisplayStatus,
  getGemmaTrainingRouteQueueStatusSummary,
  getGemmaTrainingRouteQueueEntry,
  getLatestGemmaTrainingSnapshot,
  isGemmaTrainingRouteQueuePendingAssignment,
  releaseGemmaTrainingRouteQueueClaim,
  readGemmaTrainingRouteManifest,
  resolveGemmaTrainingRoutePath,
  upsertGemmaTrainingRegistryEntry,
  updateGemmaTrainingRouteQueueClaim,
  verifyGemmaTrainingRouteManifest,
  verifyGemmaTrainingRouteManifestIntegrity,
  type GemmaTrainingExecutionMode,
  type GemmaTrainingPreflight,
  type GemmaTrainingRouteDispatchTransport,
  type GemmaTrainingRouteManifest,
} from '../src/utils/gemmaTraining.js'

type CliOptions = {
  root: string | null
  manifestPath: string | null
  python: string
  dryRun: boolean
  allowHostRisk: boolean
  workerId: string
  executionProfile: 'local' | 'remote'
  executionEndpoint: string | null
  dispatchDelayMs: number | null
}

function parseArgs(argv: string[]): CliOptions {
  const venvPython = resolve(
    process.cwd(),
    '.venv-gemma4',
    'Scripts',
    'python.exe',
  )
  const options: CliOptions = {
    root: null,
    manifestPath: null,
    python: existsSync(venvPython) ? venvPython : 'python',
    dryRun: false,
    allowHostRisk: false,
    workerId: `local-dispatcher:${process.pid}`,
    executionProfile: 'local',
    executionEndpoint: null,
    dispatchDelayMs: null,
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--manifest' && argv[i + 1]) {
      options.manifestPath = resolve(argv[++i]!)
      continue
    }
    if (arg === '--root' && argv[i + 1]) {
      options.root = resolve(argv[++i]!)
      continue
    }
    if (arg === '--python' && argv[i + 1]) {
      options.python = argv[++i]!
      continue
    }
    if (arg === '--dry-run') {
      options.dryRun = true
      continue
    }
    if (arg === '--allow-host-risk') {
      options.allowHostRisk = true
      continue
    }
    if (arg === '--worker-id' && argv[i + 1]) {
      options.workerId = argv[++i]!
      continue
    }
    if (arg === '--execution-profile' && argv[i + 1]) {
      const value = argv[++i]!
      if (value === 'local' || value === 'remote') {
        options.executionProfile = value
        continue
      }
      throw new Error(`Unknown --execution-profile "${value}". Use local or remote.`)
    }
    if (arg === '--execution-endpoint' && argv[i + 1]) {
      options.executionEndpoint = argv[++i]!
      continue
    }
    if (arg === '--dispatch-delay-ms' && argv[i + 1]) {
      const value = Number.parseInt(argv[++i]!, 10)
      options.dispatchDelayMs = Number.isFinite(value) ? value : null
      continue
    }
    if (arg === '--help' || arg === '-h') {
      printHelpAndExit()
    }
  }

  return options
}

function printHelpAndExit(): never {
  console.log(
    [
      'Usage: bun scripts/dispatch-gemma4-route.ts [options]',
      '',
      'Options:',
      '  --root <path>             Root directory for registry/queue artifacts',
      '  --manifest <path>         Route manifest to verify and dispatch',
      '  --python <exe>            Python executable to use',
      '  --dry-run                 Verify and preflight only; do not spawn trainer',
      '  --allow-host-risk         Allow local dispatch when current host still fails memory preflight',
      '  --worker-id <id>          Identifier written into queue claim metadata',
      '  --execution-profile <p>   local or remote worker profile',
      '  --execution-endpoint <u>  Remote execution endpoint used for signed HTTP dispatch',
      '  --dispatch-delay-ms <n>   Wait before spawn to exercise worker lease renewal',
      '  -h, --help                Show this help',
    ].join('\n'),
  )
  process.exit(0)
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

type RemoteDispatchAck = {
  accepted: boolean
  executionId: string | null
  summary: string | null
  stateUrl: string | null
  status: number
}

async function postRemoteDispatchEnvelope(args: {
  endpoint: string
  envelope: ReturnType<typeof buildGemmaTrainingRouteDispatchEnvelope>
}): Promise<RemoteDispatchAck> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20_000)
  try {
    const response = await fetch(args.endpoint, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'x-openjaws-route-run-id': args.envelope.payload.runId,
        'x-openjaws-route-payload-sha256':
          args.envelope.security?.payloadSha256 ?? '',
        'x-openjaws-route-signature': args.envelope.security?.signature ?? '',
      },
      body: JSON.stringify(args.envelope),
      signal: controller.signal,
    })
    const text = await response.text()
    let data: Record<string, unknown> | null = null
    try {
      const parsed = JSON.parse(text)
      data =
        typeof parsed === 'object' && parsed !== null
          ? (parsed as Record<string, unknown>)
          : null
    } catch {
      data = null
    }
    const accepted = data?.accepted === true
    return {
      accepted,
      executionId:
        typeof data?.executionId === 'string' ? data.executionId : null,
      summary:
        typeof data?.summary === 'string'
          ? data.summary
          : text.trim() || null,
      stateUrl: typeof data?.stateUrl === 'string' ? data.stateUrl : null,
      status: response.status,
    }
  } finally {
    clearTimeout(timeout)
  }
}

function resolveManifestPathFromLatest(root = process.cwd()): string | null {
  const latestSnapshot = getLatestGemmaTrainingSnapshot(root)
  const manifestPath = latestSnapshot?.state?.routeRequest?.manifestPath ?? null
  return manifestPath ? resolve(manifestPath) : null
}

function buildPythonArgs(args: {
  manifestPath: string
  manifest: GemmaTrainingRouteManifest
  manifestDir: string
  executionMode: GemmaTrainingExecutionMode
}): string[] {
  const trainFile = resolveGemmaTrainingRoutePath(
    args.manifestDir,
    args.manifest.training.trainFile,
  )
  const evalFile = args.manifest.training.evalFile
    ? resolveGemmaTrainingRoutePath(
        args.manifestDir,
        args.manifest.training.evalFile,
      )
    : null

  const pythonArgs = [
    resolve(process.cwd(), 'training', 'gemma4', 'train_lora.py'),
    '--train-file',
    trainFile,
    '--base-model',
    args.manifest.training.baseModel,
    '--output-dir',
    args.manifestDir,
    '--route-manifest',
    args.manifestPath,
    '--execution-mode',
    args.executionMode,
  ]

  if (evalFile) {
    pythonArgs.push('--eval-file', evalFile)
  }
  if (args.manifest.training.runName) {
    pythonArgs.push('--run-name', args.manifest.training.runName)
  }
  if (args.manifest.training.useCpu) {
    pythonArgs.push('--use-cpu')
  }
  if (args.manifest.training.maxSteps !== null && args.manifest.training.maxSteps !== undefined) {
    pythonArgs.push('--max-steps', String(args.manifest.training.maxSteps))
  }
  if (
    args.manifest.training.numTrainEpochs !== null &&
    args.manifest.training.numTrainEpochs !== undefined
  ) {
    pythonArgs.push(
      '--num-train-epochs',
      String(args.manifest.training.numTrainEpochs),
    )
  }
  for (const tag of args.manifest.training.selectedTags) {
    pythonArgs.push('--tag', tag)
  }
  for (const language of args.manifest.training.selectedLanguages) {
    pythonArgs.push('--language', language)
  }
  return pythonArgs
}

function writeDispatchState(args: {
  manifest: GemmaTrainingRouteManifest
  manifestPath: string
  manifestDir: string
  launchedAt: string
  pid: number | null
  stdoutLog: string
  stderrLog: string
  executionMode: GemmaTrainingExecutionMode
  preflight: GemmaTrainingPreflight
  routeQueue: ReturnType<typeof getGemmaTrainingRouteQueueEntry>
  root?: string
}): void {
  const routeRequest = {
    ...args.manifest.routeRequest,
    security: args.manifest.security,
  }
  const runStatePath = join(args.manifestDir, 'run-state.json')
  writeFileSync(
    runStatePath,
    `${JSON.stringify(
      {
        status: 'launched',
        executionMode: args.executionMode,
        pid: args.pid,
        createdAt: args.launchedAt,
        updatedAt: args.launchedAt,
        baseModel: args.manifest.training.baseModel,
        trainFile: resolveGemmaTrainingRoutePath(
          args.manifestDir,
          args.manifest.training.trainFile,
        ),
        evalFile: args.manifest.training.evalFile
          ? resolveGemmaTrainingRoutePath(
              args.manifestDir,
              args.manifest.training.evalFile,
            )
          : null,
        outputDir: args.manifestDir,
        runName: args.manifest.training.runName,
        selectedTags: args.manifest.training.selectedTags,
        selectedLanguages: args.manifest.training.selectedLanguages,
        routeManifestPath: args.manifestPath,
        maxSteps: args.manifest.training.maxSteps ?? null,
        preflight: args.preflight,
        routeRequest,
        routeQueue: args.routeQueue,
        routeQueueDisplayStatus: getGemmaTrainingRouteQueueDisplayStatus(
          args.routeQueue,
        ),
        routeQueueSummary: getGemmaTrainingRouteQueueStatusSummary(
          args.routeQueue,
        ),
      },
      null,
      2,
    )}\n`,
    'utf8',
  )
  upsertGemmaTrainingRegistryEntry({
    runId: args.manifest.runId,
    status: 'launched',
    executionMode: args.executionMode,
    pid: args.pid,
    launchedAt: args.launchedAt,
    outputDir: args.manifestDir,
    trainFile: resolveGemmaTrainingRoutePath(
      args.manifestDir,
      args.manifest.training.trainFile,
    ),
    evalFile: args.manifest.training.evalFile
      ? resolveGemmaTrainingRoutePath(
          args.manifestDir,
          args.manifest.training.evalFile,
        )
      : null,
    baseModel: args.manifest.training.baseModel,
    selectedTags: args.manifest.training.selectedTags,
    selectedLanguages: args.manifest.training.selectedLanguages,
    runName: args.manifest.training.runName,
    logFiles: {
      stdout: args.stdoutLog,
      stderr: args.stderrLog,
    },
    runStatePath,
    preflight: args.preflight,
    routeRequest,
  }, args.root)
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const root = options.root ?? process.cwd()
  const manifestPath = options.manifestPath ?? resolveManifestPathFromLatest(root)
  if (!manifestPath || !existsSync(manifestPath)) {
    throw new Error(
      `Route manifest not found${manifestPath ? ` at ${manifestPath}` : ''}.`,
    )
  }

  const manifest = readGemmaTrainingRouteManifest(manifestPath)
  const manifestDir = dirname(manifestPath)
  const routeSecurity = verifyGemmaTrainingRouteManifest(manifest)
  const routeIntegrity = verifyGemmaTrainingRouteManifestIntegrity(
    manifest,
    manifestDir,
  )
  const claimedRoute = claimGemmaTrainingRouteQueueEntry({
    runId: manifest.runId,
    manifestPath,
    workerId: options.workerId,
    root,
  })
  if (!claimedRoute) {
    const queueEntry = getGemmaTrainingRouteQueueEntry(manifest.runId, root)
    const pendingAssignment = isGemmaTrainingRouteQueuePendingAssignment(queueEntry)
    console.log(
      JSON.stringify(
        {
          runId: manifest.runId,
          status: pendingAssignment ? 'pending_assignment' : 'claimed_by_other_worker',
          manifestPath,
          manifestDir,
          summary: pendingAssignment
            ? 'Gemma route is waiting for an Immaculate worker assignment.'
            : 'Gemma route manifest is already claimed by another worker or assigned elsewhere.',
          queueStatus: getGemmaTrainingRouteQueueStatusSummary(queueEntry),
          queueEntry,
        },
        null,
        2,
      ),
    )
    process.exit(1)
  }

  const trainFile = resolveGemmaTrainingRoutePath(
    manifestDir,
    manifest.training.trainFile,
  )
  const localPreflight = evaluateGemmaTrainingPreflight({
    baseModel: manifest.training.baseModel,
    trainFile,
    pythonPath: options.python,
    useCpu: manifest.training.useCpu,
  })
  const remoteExecution =
    options.executionProfile === 'remote' ||
    claimedRoute.assignment?.executionProfile === 'remote'
  const executionEndpoint =
    options.executionEndpoint?.trim() ||
    claimedRoute.assignment?.executionEndpoint?.trim() ||
    null
  const dispatchTransport: GemmaTrainingRouteDispatchTransport =
    remoteExecution && executionEndpoint ? 'remote_http' : 'local_process'
  const claimedRouteDisplayStatus =
    getGemmaTrainingRouteQueueDisplayStatus(claimedRoute)
  const claimedRouteSummary =
    getGemmaTrainingRouteQueueStatusSummary(claimedRoute)

  const blocked =
    !routeSecurity.valid ||
    !routeIntegrity.valid ||
    (remoteExecution && !executionEndpoint) ||
    (!remoteExecution &&
      localPreflight.decision !== 'allow_local' &&
      !options.allowHostRisk)
  updateGemmaTrainingRouteQueueClaim({
    runId: manifest.runId,
    workerId: options.workerId,
    root,
    updatedAt: new Date().toISOString(),
    signatureVerified: routeSecurity.valid,
    integrityVerified: routeIntegrity.valid,
    preflight: localPreflight,
    status: blocked ? 'rejected' : 'claimed',
    rejectionReason: blocked
      ? [
          !routeSecurity.valid ? `signature ${routeSecurity.reason}` : null,
          !routeIntegrity.valid ? 'integrity mismatch' : null,
          remoteExecution && !executionEndpoint
            ? 'remote execution endpoint missing'
            : null,
          localPreflight.decision !== 'allow_local' && !options.allowHostRisk
            ? `preflight ${localPreflight.decision}`
            : null,
        ]
          .filter(Boolean)
          .join(' · ')
      : null,
  })

  if (options.dryRun || blocked) {
    if (options.dryRun && !blocked) {
      releaseGemmaTrainingRouteQueueClaim({
        runId: manifest.runId,
        workerId: options.workerId,
        root,
      })
    }
    console.log(
      JSON.stringify(
        {
          runId: manifest.runId,
          status: blocked ? 'blocked' : 'verified',
          blockedReason: blocked
            ? [
                !routeSecurity.valid ? `signature ${routeSecurity.reason}` : null,
                !routeIntegrity.valid ? 'integrity mismatch' : null,
                remoteExecution && !executionEndpoint
                  ? 'remote execution endpoint missing'
                  : null,
                !remoteExecution &&
                localPreflight.decision !== 'allow_local' &&
                !options.allowHostRisk
                  ? `preflight ${localPreflight.decision}`
                  : null,
              ]
                .filter(Boolean)
                .join(' · ')
            : null,
          manifestPath,
          manifestDir,
          routeSecurity,
          routeIntegrity,
          preflight: localPreflight,
          dispatchTransport,
          executionEndpoint,
          routeQueueDisplayStatus: claimedRouteDisplayStatus,
          routeQueueSummary: claimedRouteSummary,
        },
        null,
        2,
      ),
    )
    if (blocked) {
      process.exit(1)
    }
    return
  }

  const stdoutLog = join(manifestDir, 'route-dispatch.stdout.log')
  const stderrLog = join(manifestDir, 'route-dispatch.stderr.log')
  const launchedAt = new Date().toISOString()
  const executionMode: GemmaTrainingExecutionMode = 'immaculate_routed'
  if (options.dispatchDelayMs && options.dispatchDelayMs > 0) {
    await sleep(options.dispatchDelayMs)
  }
  let pid: number | null = null
  let remoteAck: RemoteDispatchAck | null = null
  if (dispatchTransport === 'remote_http') {
    const envelope = buildGemmaTrainingRouteDispatchEnvelope({
      manifest,
      manifestPath,
      manifestDir,
      workerId: options.workerId,
      executionMode,
      dispatchedAt: launchedAt,
    })
    remoteAck = await postRemoteDispatchEnvelope({
      endpoint: executionEndpoint!,
      envelope,
    })
    if (!remoteAck.accepted || remoteAck.status >= 400) {
      updateGemmaTrainingRouteQueueClaim({
        runId: manifest.runId,
        workerId: options.workerId,
        root,
        updatedAt: launchedAt,
        status: 'rejected',
        signatureVerified: routeSecurity.valid,
        integrityVerified: routeIntegrity.valid,
        preflight: localPreflight,
        rejectionReason: `remote dispatch ${remoteAck.status}${
          remoteAck.summary ? ` · ${remoteAck.summary}` : ''
        }`,
      })
      console.log(
        JSON.stringify(
          {
            runId: manifest.runId,
            status: 'blocked',
            blockedReason: `remote dispatch ${remoteAck.status}${
              remoteAck.summary ? ` · ${remoteAck.summary}` : ''
            }`,
            manifestPath,
            manifestDir,
            routeSecurity,
            routeIntegrity,
            preflight: localPreflight,
            dispatchTransport,
            executionEndpoint,
            remoteDispatch: remoteAck,
            routeQueueDisplayStatus: getGemmaTrainingRouteQueueDisplayStatus(
              getGemmaTrainingRouteQueueEntry(manifest.runId, root),
            ),
            routeQueueSummary: getGemmaTrainingRouteQueueStatusSummary(
              getGemmaTrainingRouteQueueEntry(manifest.runId, root),
            ),
          },
          null,
          2,
        ),
      )
      process.exit(1)
    }
  } else {
    const stdoutFd = openSync(stdoutLog, 'a')
    const stderrFd = openSync(stderrLog, 'a')
    const child = (() => {
      try {
        return spawn(
          options.python,
          buildPythonArgs({
            manifestPath,
            manifest,
            manifestDir,
            executionMode,
          }),
          {
            cwd: process.cwd(),
            detached: true,
            stdio: ['ignore', stdoutFd, stderrFd],
            windowsHide: true,
          },
        )
      } finally {
        closeSync(stdoutFd)
        closeSync(stderrFd)
      }
    })()
    child.unref()
    pid = child.pid ?? null
  }
  finalizeGemmaTrainingRouteQueueDispatch({
    runId: manifest.runId,
    workerId: options.workerId,
    root,
    dispatchedAt: launchedAt,
    executionMode,
    pid,
    transport: dispatchTransport,
    executionEndpoint,
    acknowledgedAt: remoteAck ? launchedAt : null,
    remoteStatus: remoteAck?.status ?? null,
    remoteAccepted: remoteAck?.accepted ?? null,
    remoteExecutionId: remoteAck?.executionId ?? null,
    remoteSummary: remoteAck?.summary ?? null,
    remoteStateUrl: remoteAck?.stateUrl ?? null,
  })

  writeDispatchState({
    manifest,
    manifestPath,
    manifestDir,
    launchedAt,
    pid,
    stdoutLog,
    stderrLog,
    executionMode,
    preflight: localPreflight,
    routeQueue: getGemmaTrainingRouteQueueEntry(manifest.runId, root),
    root,
  })

  console.log(
    JSON.stringify(
      {
        runId: manifest.runId,
        status: 'launched',
        executionMode,
        pid,
        manifestPath,
        manifestDir,
        stdoutLog,
        stderrLog,
        routeSecurity,
        routeIntegrity,
        preflight: localPreflight,
        dispatchTransport,
        executionEndpoint,
        remoteDispatch: remoteAck,
        routeQueueDisplayStatus: getGemmaTrainingRouteQueueDisplayStatus(
          getGemmaTrainingRouteQueueEntry(manifest.runId, root),
        ),
        routeQueueSummary: getGemmaTrainingRouteQueueStatusSummary(
          getGemmaTrainingRouteQueueEntry(manifest.runId, root),
        ),
      },
      null,
      2,
    ),
  )
}

await main()
