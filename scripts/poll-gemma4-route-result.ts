import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { dirname, join, resolve } from 'path'
import {
  finalizeGemmaTrainingRouteQueueCompletion,
  getGemmaTrainingRouteQueueDisplayStatus,
  getGemmaTrainingRouteQueueEntry,
  getGemmaTrainingRouteQueueStatusSummary,
  getLatestGemmaTrainingSnapshot,
  readGemmaRunState,
  readGemmaTrainingRegistry,
  readGemmaTrainingRouteManifest,
  resolveGemmaTrainingRoutePath,
  upsertGemmaTrainingRegistryEntry,
  verifyGemmaTrainingRouteResultEnvelope,
  type GemmaRunState,
  type GemmaTrainingRouteResultEnvelope,
} from '../src/utils/gemmaTraining.js'

type CliOptions = {
  root: string | null
  manifestPath: string | null
  stateUrl: string | null
  pollMs: number
  timeoutMs: number
}

export type GemmaTrainingRouteResultReconcileArgs = {
  root?: string | null
  manifestPath?: string | null
  stateUrl?: string | null
  pollMs?: number
  timeoutMs?: number
}

export type GemmaTrainingRouteResultReconcileOutcome = {
  runId: string
  status: 'completed' | 'failed' | 'pending'
  stateUrl: string
  verification?: ReturnType<typeof verifyGemmaTrainingRouteResultEnvelope>
  queueEntry?: ReturnType<typeof getGemmaTrainingRouteQueueEntry>
  runStatePath?: string
  routeQueueDisplayStatus?: ReturnType<typeof getGemmaTrainingRouteQueueDisplayStatus>
  routeQueueSummary?: string
  httpStatus?: number | null
  details?: unknown
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    root: null,
    manifestPath: null,
    stateUrl: null,
    pollMs: 1_000,
    timeoutMs: 60_000,
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--root' && argv[i + 1]) {
      options.root = resolve(argv[++i]!)
      continue
    }
    if (arg === '--manifest' && argv[i + 1]) {
      options.manifestPath = resolve(argv[++i]!)
      continue
    }
    if (arg === '--state-url' && argv[i + 1]) {
      options.stateUrl = argv[++i]!
      continue
    }
    if (arg === '--poll-ms' && argv[i + 1]) {
      const value = Number.parseInt(argv[++i]!, 10)
      options.pollMs = Number.isFinite(value) ? value : options.pollMs
      continue
    }
    if (arg === '--timeout-ms' && argv[i + 1]) {
      const value = Number.parseInt(argv[++i]!, 10)
      options.timeoutMs = Number.isFinite(value) ? value : options.timeoutMs
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
      'Usage: bun scripts/poll-gemma4-route-result.ts [options]',
      '',
      'Options:',
      '  --root <path>         Root directory for route artifacts',
      '  --manifest <path>     Route manifest to reconcile',
      '  --state-url <url>     Override remote state URL instead of queue metadata',
      '  --poll-ms <n>         Poll interval in milliseconds',
      '  --timeout-ms <n>      Total poll timeout in milliseconds',
      '  -h, --help            Show this help',
    ].join('\n'),
  )
  process.exit(0)
}

function resolveManifestPathFromLatest(root = process.cwd()): string | null {
  const latestSnapshot = getLatestGemmaTrainingSnapshot(root)
  const manifestPath = latestSnapshot?.state?.routeRequest?.manifestPath ?? null
  return manifestPath ? resolve(manifestPath) : null
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function writeJson(path: string, data: unknown): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
}

function buildBaseRunState(args: {
  current: GemmaRunState | null
  manifestDir: string
  manifest: ReturnType<typeof readGemmaTrainingRouteManifest>
  status: 'completed' | 'failed'
  finishedAt: string
  executionMode: GemmaRunState['executionMode']
  queueEntry: ReturnType<typeof getGemmaTrainingRouteQueueEntry>
  runStatePatch: Partial<GemmaRunState>
}): Record<string, unknown> {
  const trainFile =
    args.current?.trainFile ??
    resolveGemmaTrainingRoutePath(
      args.manifestDir,
      args.manifest.training.trainFile,
    )
  const evalFile =
    args.current?.evalFile ??
    (args.manifest.training.evalFile
      ? resolveGemmaTrainingRoutePath(
          args.manifestDir,
          args.manifest.training.evalFile,
        )
      : null)
  const nextRunState: Record<string, unknown> = {
    ...(args.current ?? {}),
    ...args.runStatePatch,
    status: args.status,
    executionMode: args.executionMode,
    pid: args.current?.pid ?? null,
    updatedAt:
      typeof args.runStatePatch.updatedAt === 'string'
        ? args.runStatePatch.updatedAt
        : args.finishedAt,
    finishedAt: args.finishedAt,
    baseModel: args.current?.baseModel ?? args.manifest.training.baseModel,
    trainFile,
    evalFile,
    outputDir: args.manifestDir,
    runName: args.current?.runName ?? args.manifest.training.runName,
    selectedTags:
      args.current?.selectedTags ?? args.manifest.training.selectedTags,
    selectedLanguages:
      args.current?.selectedLanguages ?? args.manifest.training.selectedLanguages,
    routeRequest: args.current?.routeRequest ?? args.manifest.routeRequest,
    routeFailure: args.current?.routeFailure ?? null,
    routeQueue: args.queueEntry,
    routeQueueDisplayStatus: getGemmaTrainingRouteQueueDisplayStatus(
      args.queueEntry,
    ),
    routeQueueSummary: getGemmaTrainingRouteQueueStatusSummary(args.queueEntry),
  }
  if (args.status === 'completed' && !('error' in args.runStatePatch)) {
    nextRunState.error = null
  }
  return nextRunState
}

async function fetchResultEnvelope(args: {
  stateUrl: string
  runId: string
  timeoutMs: number
  pollMs: number
}): Promise<{
  envelope: GemmaTrainingRouteResultEnvelope | null
  statusCode: number | null
  body: unknown
}> {
  const startedAt = Date.now()

  while (Date.now() - startedAt < args.timeoutMs) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15_000)
    try {
      const response = await fetch(args.stateUrl, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'x-openjaws-route-run-id': args.runId,
        },
        signal: controller.signal,
      })
      const text = await response.text()
      let parsed: unknown = null
      try {
        parsed = text.trim() ? JSON.parse(text) : null
      } catch {
        parsed = text
      }

      if (response.status === 202 || response.status === 204) {
        await Bun.sleep(args.pollMs)
        continue
      }

      const envelope =
        isObjectRecord(parsed) &&
        isObjectRecord(parsed.payload) &&
        ('security' in parsed || 'payload' in parsed)
          ? (parsed as GemmaTrainingRouteResultEnvelope)
          : null

      if (!envelope) {
        return {
          envelope: null,
          statusCode: response.status,
          body: parsed,
        }
      }

      return {
        envelope,
        statusCode: response.status,
        body: parsed,
      }
    } finally {
      clearTimeout(timeout)
    }
  }

  return {
    envelope: null,
    statusCode: null,
    body: {
      summary: `Timed out after ${args.timeoutMs}ms waiting for remote result.`,
    },
  }
}

export async function reconcileGemmaTrainingRouteResult(
  args: GemmaTrainingRouteResultReconcileArgs,
): Promise<GemmaTrainingRouteResultReconcileOutcome> {
  const root = args.root ?? process.cwd()
  const manifestPath =
    args.manifestPath ?? resolveManifestPathFromLatest(root)
  if (!manifestPath || !existsSync(manifestPath)) {
    throw new Error(
      `Route manifest not found${manifestPath ? ` at ${manifestPath}` : ''}.`,
    )
  }

  const manifest = readGemmaTrainingRouteManifest(manifestPath)
  const manifestDir = dirname(manifestPath)
  const queueEntry = getGemmaTrainingRouteQueueEntry(manifest.runId, root)
  const stateUrl =
    args.stateUrl?.trim() ||
    queueEntry?.dispatch?.remoteStateUrl?.trim() ||
    null

  if (!queueEntry || queueEntry.status !== 'dispatched' || !queueEntry.dispatch) {
    throw new Error(`Gemma route ${manifest.runId} is not in a dispatched state.`)
  }
  if (!stateUrl) {
    throw new Error(`Gemma route ${manifest.runId} has no remote state URL.`)
  }

  const polled = await fetchResultEnvelope({
    stateUrl,
    runId: manifest.runId,
    timeoutMs: args.timeoutMs ?? 60_000,
    pollMs: args.pollMs ?? 1_000,
  })

  if (!polled.envelope) {
    return {
      runId: manifest.runId,
      status: 'pending',
      stateUrl,
      httpStatus: polled.statusCode,
      details: polled.body,
    }
  }

  const verification = verifyGemmaTrainingRouteResultEnvelope(polled.envelope)
  const payload = polled.envelope.payload
  const workerId = queueEntry.dispatch.workerId ?? payload.workerId

  if (
    !verification.valid ||
    payload.runId !== manifest.runId ||
    payload.workerId !== workerId ||
    (queueEntry.dispatch.remoteExecutionId &&
      payload.executionId &&
      queueEntry.dispatch.remoteExecutionId !== payload.executionId)
  ) {
    return {
      runId: manifest.runId,
      status: 'failed',
      stateUrl,
      verification,
      queueEntry: queueEntry ?? undefined,
      details: {
        payload,
        summary: 'Remote result verification failed.',
      },
    }
  }

  if (payload.runSummary) {
    writeJson(join(manifestDir, 'run-summary.json'), payload.runSummary)
  }
  if (payload.metricsSummary) {
    writeJson(join(manifestDir, 'metrics-summary.json'), payload.metricsSummary)
  }

  const finalizedQueue = finalizeGemmaTrainingRouteQueueCompletion({
    runId: manifest.runId,
    workerId,
    executionId: payload.executionId,
    status: payload.status,
    summary: payload.summary,
    stateUrl: payload.stateUrl ?? stateUrl,
    root,
    finishedAt: payload.finishedAt,
  })
  if (!finalizedQueue) {
    throw new Error(
      `Unable to finalize route queue completion for ${manifest.runId}.`,
    )
  }

  const currentRunState = readGemmaRunState(manifestDir)
  const nextRunState = buildBaseRunState({
    current: currentRunState,
    manifestDir,
    manifest,
    status: payload.status,
    finishedAt: payload.finishedAt,
    executionMode:
      currentRunState?.executionMode ??
      payload.executionMode ??
      'immaculate_routed',
    queueEntry: finalizedQueue,
    runStatePatch: payload.runState,
  })
  writeJson(join(manifestDir, 'run-state.json'), nextRunState)

  const existingRegistry =
    readGemmaTrainingRegistry(root).find(entry => entry.runId === manifest.runId) ??
    null
  upsertGemmaTrainingRegistryEntry(
    {
      runId: manifest.runId,
      status: payload.status,
      executionMode:
        existingRegistry?.executionMode ??
        payload.executionMode ??
        'immaculate_routed',
      pid: existingRegistry?.pid ?? null,
      launchedAt:
        existingRegistry?.launchedAt ??
        currentRunState?.createdAt ??
        currentRunState?.startedAt ??
        payload.finishedAt,
      outputDir: manifestDir,
      trainFile:
        existingRegistry?.trainFile ??
        resolveGemmaTrainingRoutePath(manifestDir, manifest.training.trainFile),
      evalFile:
        existingRegistry?.evalFile ??
        (manifest.training.evalFile
          ? resolveGemmaTrainingRoutePath(
              manifestDir,
              manifest.training.evalFile,
            )
          : null),
      baseModel: existingRegistry?.baseModel ?? manifest.training.baseModel,
      selectedTags:
        existingRegistry?.selectedTags ?? manifest.training.selectedTags,
      selectedLanguages:
        existingRegistry?.selectedLanguages ??
        manifest.training.selectedLanguages,
      runName: existingRegistry?.runName ?? manifest.training.runName,
      logFiles:
        existingRegistry?.logFiles ?? {
          stdout: join(manifestDir, 'route-dispatch.stdout.log'),
          stderr: join(manifestDir, 'route-dispatch.stderr.log'),
        },
      runStatePath: join(manifestDir, 'run-state.json'),
      preflight: existingRegistry?.preflight ?? manifest.preflight,
      routeRequest: existingRegistry?.routeRequest ?? manifest.routeRequest,
      routeFailure: null,
    },
    root,
  )

  return {
    runId: manifest.runId,
    status: payload.status,
    stateUrl,
    verification,
    queueEntry: finalizedQueue ?? undefined,
    runStatePath: join(manifestDir, 'run-state.json'),
    routeQueueDisplayStatus: getGemmaTrainingRouteQueueDisplayStatus(
      finalizedQueue,
    ),
    routeQueueSummary: getGemmaTrainingRouteQueueStatusSummary(finalizedQueue),
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const result = await reconcileGemmaTrainingRouteResult({
    root: options.root,
    manifestPath: options.manifestPath,
    stateUrl: options.stateUrl,
    pollMs: options.pollMs,
    timeoutMs: options.timeoutMs,
  })
  console.log(JSON.stringify(result, null, 2))
  if (result.status === 'pending') {
    process.exit(1)
  }
}

if (import.meta.main) {
  await main()
}
