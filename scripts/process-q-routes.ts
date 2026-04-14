import { existsSync } from 'fs'
import { execa } from 'execa'
import { resolve } from 'path'
import {
  claimQTrainingRouteQueueEntry,
  claimNextQueuedQTrainingRoute,
  getNextQTrainingRoutePendingRemoteResult,
  getQTrainingRouteQueueEntry,
  getQTrainingRouteQueueStatusSummary,
  isQTrainingRouteQueuePendingAssignment,
  removeQTrainingRouteWorkerRuntimeStatus,
  readQTrainingRouteQueue,
  removeQTrainingRouteWorker,
  reapStaleQTrainingRouteQueueClaims,
  reapStaleQTrainingRouteWorkers,
  readQTrainingRouteManifest,
  renewQTrainingRouteQueueClaim,
  type QTrainingRouteWorkerRuntimeEntry,
  type QTrainingRouteWorkerExecutionProfile,
  type QTrainingRouteQueueEntry,
  upsertQTrainingRouteWorkerRuntimeStatus,
  upsertQTrainingRouteWorker,
} from '../src/utils/qTraining.js'
import {
  getImmaculateHarnessStatus,
  heartbeatImmaculateHarnessWorker,
  registerImmaculateHarnessWorker,
  unregisterImmaculateHarnessWorker,
} from '../src/utils/immaculateHarness.js'
import { reconcileQTrainingRouteResult } from './poll-q-route-result.js'

type CliOptions = {
  root: string | null
  manifestPath: string | null
  dryRun: boolean
  allowHostRisk: boolean
  python: string | null
  workerId: string
  workerLabel: string | null
  hostLabel: string | null
  executionProfile: QTrainingRouteWorkerExecutionProfile
  executionEndpoint: string | null
  baseModels: string[]
  preferredLayers: string[]
  claimTtlMs: number | null
  heartbeatMs: number | null
  watch: boolean
  pollMs: number
  idleExitMs: number | null
  dispatchDelayMs: number | null
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    root: null,
    manifestPath: null,
    dryRun: false,
    allowHostRisk: false,
    python: null,
    workerId: `route-worker:${process.pid}`,
    workerLabel: null,
    hostLabel: null,
    executionProfile: 'local',
    executionEndpoint: null,
    baseModels: [],
    preferredLayers: [],
    claimTtlMs: null,
    heartbeatMs: null,
    watch: false,
    pollMs: 1_000,
    idleExitMs: null,
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
    if (arg === '--dry-run') {
      options.dryRun = true
      continue
    }
    if (arg === '--allow-host-risk') {
      options.allowHostRisk = true
      continue
    }
    if (arg === '--python' && argv[i + 1]) {
      options.python = argv[++i]!
      continue
    }
    if (arg === '--worker-id' && argv[i + 1]) {
      options.workerId = argv[++i]!
      continue
    }
    if (arg === '--worker-label' && argv[i + 1]) {
      options.workerLabel = argv[++i]!
      continue
    }
    if (arg === '--host-label' && argv[i + 1]) {
      options.hostLabel = argv[++i]!
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
    if (arg === '--base-model' && argv[i + 1]) {
      options.baseModels.push(argv[++i]!)
      continue
    }
    if (arg === '--layer' && argv[i + 1]) {
      options.preferredLayers.push(argv[++i]!)
      continue
    }
    if (arg === '--claim-ttl-ms' && argv[i + 1]) {
      const value = Number.parseInt(argv[++i]!, 10)
      options.claimTtlMs = Number.isFinite(value) ? value : null
      continue
    }
    if (arg === '--heartbeat-ms' && argv[i + 1]) {
      const value = Number.parseInt(argv[++i]!, 10)
      options.heartbeatMs = Number.isFinite(value) ? value : null
      continue
    }
    if (arg === '--poll-ms' && argv[i + 1]) {
      const value = Number.parseInt(argv[++i]!, 10)
      if (Number.isFinite(value) && value > 0) {
        options.pollMs = value
      }
      continue
    }
    if (arg === '--idle-exit-ms' && argv[i + 1]) {
      const value = Number.parseInt(argv[++i]!, 10)
      options.idleExitMs = Number.isFinite(value) ? value : null
      continue
    }
    if (arg === '--dispatch-delay-ms' && argv[i + 1]) {
      const value = Number.parseInt(argv[++i]!, 10)
      options.dispatchDelayMs = Number.isFinite(value) ? value : null
      continue
    }
    if (arg === '--watch') {
      options.watch = true
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
      'Usage: bun scripts/process-q-routes.ts [options]',
      '',
      'Options:',
      '  --root <path>             Root directory for registry/queue artifacts',
      '  --manifest <path>         Process a specific queued route manifest',
      '  --dry-run                 Verify/claim decision only; do not dispatch trainer',
      '  --allow-host-risk         Allow local dispatch on a tight host',
      '  --python <exe>            Python executable forwarded to dispatcher',
      '  --worker-id <id>          Worker identity recorded in queue claim metadata',
      '  --worker-label <label>    Optional operator-facing worker label',
      '  --host-label <label>      Optional host label shown in status/queue',
      '  --execution-profile <p>   local or remote worker profile',
      '  --execution-endpoint <u>  Required for remote workers registered with Immaculate',
      '  --base-model <model>      Repeatable base-model capability filter',
      '  --layer <id>              Repeatable preferred Immaculate layer',
      '  --claim-ttl-ms <n>        Override queue claim lease for this worker',
      '  --heartbeat-ms <n>        Renew the queue claim while dispatch runs',
      '  --watch                   Poll the queue until idle exit',
      '  --poll-ms <n>             Poll interval for --watch mode',
      '  --idle-exit-ms <n>        Exit watch mode after this long with no work',
      '  --dispatch-delay-ms <n>   Forward a pre-dispatch delay to the dispatcher (test seam)',
      '  -h, --help                Show this help',
    ].join('\n'),
  )
  process.exit(0)
}

function getWorkerLeaseDurationMs(options: CliOptions): number {
  return Math.max(
    options.claimTtlMs ?? 45_000,
    options.watch ? options.pollMs * 3 : 5_000,
  )
}

function validateWorkerOptions(options: CliOptions): void {
  if (
    options.executionProfile === 'remote' &&
    (!options.executionEndpoint || !options.executionEndpoint.trim())
  ) {
    throw new Error(
      'Remote Q route workers require --execution-endpoint so Immaculate can assign them safely.',
    )
  }
}

function upsertWorkerRegistration(
  options: CliOptions,
  heartbeatAt = new Date().toISOString(),
): void {
  const leaseDurationMs = getWorkerLeaseDurationMs(options)
  upsertQTrainingRouteWorker(
    {
      workerId: options.workerId,
      workerLabel: options.workerLabel,
      hostLabel: options.hostLabel,
      executionProfile: options.executionProfile,
      executionEndpoint:
        options.executionProfile === 'remote'
          ? options.executionEndpoint?.trim() || null
          : null,
      registeredAt: heartbeatAt,
      heartbeatAt,
      leaseExpiresAt: new Date(
        Date.parse(heartbeatAt) + leaseDurationMs,
      ).toISOString(),
      leaseDurationMs,
      watch: options.watch,
      allowHostRisk: options.allowHostRisk,
      supportedBaseModels: options.baseModels,
      preferredLayerIds: options.preferredLayers,
    },
    options.root ?? process.cwd(),
  )
}

type WorkerSyncResult = {
  ok: boolean
  runtime: QTrainingRouteWorkerRuntimeEntry
}

function buildWorkerRuntimeEntry(args: {
  options: CliOptions
  updatedAt?: string
  status: QTrainingRouteWorkerRuntimeEntry['status']
  summary: string
  detail?: string | null
  harnessUrl?: string | null
}): QTrainingRouteWorkerRuntimeEntry {
  return {
    workerId: args.options.workerId,
    workerLabel: args.options.workerLabel,
    hostLabel: args.options.hostLabel,
    executionProfile: args.options.executionProfile,
    status: args.status,
    updatedAt: args.updatedAt ?? new Date().toISOString(),
    summary: args.summary,
    detail: args.detail ?? null,
    harnessUrl: args.harnessUrl ?? null,
    supportedBaseModels: args.options.baseModels,
    preferredLayerIds: args.options.preferredLayers,
  }
}

function writeWorkerRuntimeStatus(
  entry: QTrainingRouteWorkerRuntimeEntry,
  root = process.cwd(),
): QTrainingRouteWorkerRuntimeEntry {
  upsertQTrainingRouteWorkerRuntimeStatus(entry, root)
  return entry
}

async function syncImmaculateWorkerRegistration(
  options: CliOptions,
  mode: 'register' | 'heartbeat',
  heartbeatAt = new Date().toISOString(),
): Promise<WorkerSyncResult> {
  const status = await getImmaculateHarnessStatus()
  if (!status.enabled) {
    return {
      ok: true,
      runtime: buildWorkerRuntimeEntry({
        options,
        updatedAt: heartbeatAt,
        status: 'local_only',
        summary: 'Immaculate harness disabled; worker is running local-only.',
        harnessUrl: status.harnessUrl,
      }),
    }
  }
  if (!status.reachable) {
    return {
      ok: false,
      runtime: buildWorkerRuntimeEntry({
        options,
        updatedAt: heartbeatAt,
        status: mode === 'register' ? 'register_failed' : 'heartbeat_failed',
        summary:
          mode === 'register'
            ? 'Immaculate worker registration failed: harness is unavailable.'
            : 'Immaculate worker heartbeat failed: harness is unavailable.',
        detail: status.error ?? 'Immaculate harness is unreachable.',
        harnessUrl: status.harnessUrl,
      }),
    }
  }

  const payload = {
    workerId: options.workerId,
    workerLabel: options.workerLabel,
    hostLabel: options.hostLabel,
    executionProfile: options.executionProfile,
    executionEndpoint:
      options.executionProfile === 'remote'
        ? options.executionEndpoint?.trim() || null
        : null,
    registeredAt: heartbeatAt,
    heartbeatAt,
    leaseDurationMs: getWorkerLeaseDurationMs(options),
    watch: options.watch,
    allowHostRisk: options.allowHostRisk,
    supportedBaseModels: options.baseModels,
    preferredLayerIds: options.preferredLayers,
  }

  try {
    if (mode === 'register') {
      await registerImmaculateHarnessWorker(payload)
      return {
        ok: true,
        runtime: buildWorkerRuntimeEntry({
          options,
          updatedAt: heartbeatAt,
          status: 'ready',
          summary: 'Immaculate worker registered and synchronized.',
          harnessUrl: status.harnessUrl,
        }),
      }
    }

    try {
      await heartbeatImmaculateHarnessWorker(payload)
    } catch {
      await registerImmaculateHarnessWorker(payload)
    }
    return {
      ok: true,
      runtime: buildWorkerRuntimeEntry({
        options,
        updatedAt: heartbeatAt,
        status: 'ready',
        summary: 'Immaculate worker heartbeat synchronized.',
        harnessUrl: status.harnessUrl,
      }),
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error)
    return {
      ok: false,
      runtime: buildWorkerRuntimeEntry({
        options,
        updatedAt: heartbeatAt,
        status: mode === 'register' ? 'register_failed' : 'heartbeat_failed',
        summary:
          mode === 'register'
            ? 'Immaculate worker registration failed.'
            : 'Immaculate worker heartbeat failed.',
        detail: message,
        harnessUrl: status.harnessUrl,
      }),
    }
  }
}

function resolveQueueTarget(
  options: CliOptions,
): { manifestPath: string | null; queueEntry: QTrainingRouteQueueEntry | null } {
  const root = options.root ?? process.cwd()
  if (options.manifestPath) {
    const queueEntry = claimQTrainingRouteQueueEntry({
      manifestPath: options.manifestPath,
      workerId: options.workerId,
      claimTtlMs: options.claimTtlMs ?? undefined,
      root,
    })
    return {
      manifestPath: queueEntry?.manifestPath ?? options.manifestPath,
      queueEntry,
    }
  }
  const queueEntry = claimNextQueuedQTrainingRoute({
    workerId: options.workerId,
    claimTtlMs: options.claimTtlMs ?? undefined,
    root,
  })
  return {
    manifestPath: queueEntry?.manifestPath ?? null,
    queueEntry,
  }
}

function resolvePendingRemoteResultTarget(
  options: CliOptions,
): { manifestPath: string | null; queueEntry: QTrainingRouteQueueEntry | null } {
  const root = options.root ?? process.cwd()
  const queueEntry = getNextQTrainingRoutePendingRemoteResult({
    workerId: options.workerId,
    manifestPath: options.manifestPath,
    root,
  })
  return {
    manifestPath: queueEntry?.manifestPath ?? options.manifestPath ?? null,
    queueEntry,
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function dispatchClaimedRoute(args: {
  options: CliOptions
  target: { manifestPath: string; queueEntry: QTrainingRouteQueueEntry }
}): Promise<{
  status: 'processed' | 'blocked'
  workerId: string
  manifestPath: string
  queueEntry: QTrainingRouteQueueEntry
  dispatch: unknown
  workerRuntime?: QTrainingRouteWorkerRuntimeEntry | null
}> {
  let heartbeat: ReturnType<typeof setInterval> | null = null
  let heartbeatFailure: QTrainingRouteWorkerRuntimeEntry | null = null
  if (
    args.options.heartbeatMs &&
    args.options.heartbeatMs > 0 &&
    args.target.queueEntry.runId
  ) {
    heartbeat = setInterval(() => {
      void (async () => {
        const heartbeatAt = new Date().toISOString()
        const sync = await syncImmaculateWorkerRegistration(
          args.options,
          'heartbeat',
          heartbeatAt,
        )
        writeWorkerRuntimeStatus(
          sync.runtime,
          args.options.root ?? process.cwd(),
        )
        if (!sync.ok) {
          heartbeatFailure = sync.runtime
          if (heartbeat) {
            clearInterval(heartbeat)
            heartbeat = null
          }
          return
        }
        renewQTrainingRouteQueueClaim({
          runId: args.target.queueEntry.runId,
          workerId: args.options.workerId,
          claimTtlMs: args.options.claimTtlMs ?? undefined,
          root: args.options.root ?? process.cwd(),
          renewedAt: heartbeatAt,
        })
        upsertWorkerRegistration(args.options, heartbeatAt)
      })()
    }, args.options.heartbeatMs)
  }

  try {
    const dispatchArgs = [
      'scripts/dispatch-q-route.ts',
      '--manifest',
      args.target.manifestPath,
      ...(args.options.root ? ['--root', args.options.root] : []),
      '--worker-id',
      args.options.workerId,
      '--execution-profile',
      args.options.executionProfile,
      ...(args.options.executionEndpoint
        ? ['--execution-endpoint', args.options.executionEndpoint]
        : []),
      ...(args.options.dryRun ? ['--dry-run'] : []),
      ...(args.options.allowHostRisk ? ['--allow-host-risk'] : []),
      ...(args.options.python ? ['--python', args.options.python] : []),
      ...(args.options.dispatchDelayMs
        ? ['--dispatch-delay-ms', String(args.options.dispatchDelayMs)]
        : []),
    ]
    const result = await execa('bun', dispatchArgs, {
      cwd: process.cwd(),
      reject: false,
      windowsHide: true,
    })

    let parsed: unknown = null
    try {
      parsed = JSON.parse(result.stdout)
    } catch {
      parsed = {
        stdout: result.stdout,
        stderr: result.stderr,
      }
    }

    return {
      status:
        result.exitCode === 0 && !heartbeatFailure ? 'processed' : 'blocked',
      workerId: args.options.workerId,
      manifestPath: args.target.manifestPath,
      queueEntry: args.target.queueEntry,
      dispatch: parsed,
      workerRuntime: heartbeatFailure,
    }
  } finally {
    if (heartbeat) {
      clearInterval(heartbeat)
    }
  }
}

async function reconcileRemoteResult(args: {
  options: CliOptions
  target: { manifestPath: string; queueEntry: QTrainingRouteQueueEntry }
}): Promise<
  | {
      status: 'processed'
      workerId: string
      manifestPath: string
      queueEntry: QTrainingRouteQueueEntry
      result: Awaited<ReturnType<typeof reconcileQTrainingRouteResult>>
    }
  | {
      status: 'pending' | 'blocked'
      workerId: string
      manifestPath: string
      queueEntry: QTrainingRouteQueueEntry
      result: Awaited<ReturnType<typeof reconcileQTrainingRouteResult>>
    }
> {
  const result = await reconcileQTrainingRouteResult({
    root: args.options.root,
    manifestPath: args.target.manifestPath,
    stateUrl: args.target.queueEntry.dispatch?.remoteStateUrl ?? null,
    pollMs: args.options.pollMs,
    timeoutMs: Math.max(args.options.pollMs * 2, 15_000),
  })

  return {
    status:
      result.status === 'pending'
        ? 'pending'
        : result.status === 'failed' ||
            result.routeQueueDisplayStatus === 'failed'
          ? 'blocked'
          : 'processed',
    workerId: args.options.workerId,
    manifestPath: args.target.manifestPath,
    queueEntry:
      getQTrainingRouteQueueEntry(args.target.queueEntry.runId, args.options.root ?? process.cwd()) ??
      args.target.queueEntry,
    result,
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  validateWorkerOptions(options)
  const root = options.root ?? process.cwd()
  let idleStartedAt = Date.now()
  let preserveWorkerRuntimeStatus = false
  upsertWorkerRegistration(options)
  const registerSync = await syncImmaculateWorkerRegistration(
    options,
    'register',
  )
  writeWorkerRuntimeStatus(registerSync.runtime, root)
  if (!registerSync.ok) {
    preserveWorkerRuntimeStatus = true
    console.log(
      JSON.stringify(
        {
          status: 'worker_register_failed',
          summary: registerSync.runtime.summary,
          workerId: options.workerId,
          harnessUrl: registerSync.runtime.harnessUrl ?? null,
          detail: registerSync.runtime.detail ?? null,
        },
        null,
        2,
      ),
    )
    process.exitCode = 1
    return
  }

  try {
    while (true) {
      reapStaleQTrainingRouteWorkers({ root })
      reapStaleQTrainingRouteQueueClaims({ root })
      const heartbeatAt = new Date().toISOString()
      upsertWorkerRegistration(options, heartbeatAt)
      const heartbeatSync = await syncImmaculateWorkerRegistration(
        options,
        'heartbeat',
        heartbeatAt,
      )
      writeWorkerRuntimeStatus(heartbeatSync.runtime, root)
      if (!heartbeatSync.ok) {
        preserveWorkerRuntimeStatus = true
        console.log(
          JSON.stringify(
            {
              status: 'worker_heartbeat_failed',
              summary: heartbeatSync.runtime.summary,
              workerId: options.workerId,
              harnessUrl: heartbeatSync.runtime.harnessUrl ?? null,
              detail: heartbeatSync.runtime.detail ?? null,
            },
            null,
            2,
          ),
        )
        process.exitCode = 1
        return
      }
      const pendingRemoteResult = resolvePendingRemoteResultTarget(options)
      if (
        pendingRemoteResult.manifestPath &&
        pendingRemoteResult.queueEntry &&
        existsSync(pendingRemoteResult.manifestPath)
      ) {
        const outcome = await reconcileRemoteResult({
          options,
          target: {
            manifestPath: pendingRemoteResult.manifestPath,
            queueEntry: pendingRemoteResult.queueEntry,
          },
        })
        console.log(JSON.stringify(outcome, null, 2))
        if (outcome.status === 'blocked') {
          process.exitCode = 1
          return
        }
        idleStartedAt = Date.now()
        if (options.manifestPath && !options.watch) {
          if (outcome.status === 'pending') {
            process.exitCode = 1
          }
          return
        }
        if (outcome.status === 'pending') {
          await sleep(options.pollMs)
        }
        continue
      }
      const target = resolveQueueTarget(options)
      if (options.manifestPath && target.manifestPath && !target.queueEntry) {
        const manifest = readQTrainingRouteManifest(target.manifestPath)
        const queueEntry = getQTrainingRouteQueueEntry(manifest.runId, root)
        const pendingAssignment = isQTrainingRouteQueuePendingAssignment(queueEntry)
        console.log(
          JSON.stringify(
            {
              status: pendingAssignment ? 'pending_assignment' : 'blocked',
              summary: pendingAssignment
                ? 'Q route manifest is waiting for an Immaculate worker assignment.'
                : 'Q route manifest is already claimed by another worker or assigned elsewhere.',
              workerId: options.workerId,
              manifestPath: target.manifestPath,
              queueStatus: getQTrainingRouteQueueStatusSummary(queueEntry),
            },
            null,
            2,
          ),
        )
        process.exitCode = 1
        return
      }
      if (target.manifestPath && target.queueEntry && existsSync(target.manifestPath)) {
        const outcome = await dispatchClaimedRoute({
          options,
          target: {
            manifestPath: target.manifestPath,
            queueEntry: target.queueEntry,
          },
        })

        console.log(JSON.stringify(outcome, null, 2))
        if (outcome.status !== 'processed') {
          if (outcome.workerRuntime) {
            preserveWorkerRuntimeStatus = true
          }
          process.exitCode = 1
          return
        }
        if (options.dryRun || !options.watch || options.manifestPath) {
          return
        }
        idleStartedAt = Date.now()
        continue
      }

      if (!options.watch) {
        const pendingAssignments = readQTrainingRouteQueue(root).filter(entry =>
          isQTrainingRouteQueuePendingAssignment(entry),
        )
        if (pendingAssignments.length > 0) {
          console.log(
            JSON.stringify(
              {
                status: 'pending_assignment',
                summary:
                  pendingAssignments.length === 1
                    ? '1 Q route is queued but waiting for an Immaculate worker assignment.'
                    : `${pendingAssignments.length} Q routes are queued but waiting for Immaculate worker assignment.`,
                workerId: options.workerId,
                pendingAssignments: pendingAssignments.map(entry => ({
                  runId: entry.runId,
                  manifestPath: entry.manifestPath,
                  target: entry.target ?? null,
                  recommendedLayerId: entry.recommendedLayerId ?? null,
                  queueStatus: getQTrainingRouteQueueStatusSummary(entry),
                })),
              },
              null,
              2,
            ),
          )
          return
        }
        console.log(
          JSON.stringify(
            {
              status: 'idle',
              summary: 'No queued Q route manifests ready for processing.',
              workerId: options.workerId,
              manifestPath: target.manifestPath,
            },
            null,
            2,
          ),
        )
        return
      }

      if (options.idleExitMs !== null && Date.now() - idleStartedAt >= options.idleExitMs) {
        console.log(
          JSON.stringify(
            {
              status: 'idle',
              summary: 'Q route worker exited after the configured idle window.',
              workerId: options.workerId,
              idleExitMs: options.idleExitMs,
            },
            null,
            2,
          ),
        )
        return
      }

      await sleep(options.pollMs)
    }
  } finally {
    removeQTrainingRouteWorker(options.workerId, root)
    await unregisterImmaculateHarnessWorker(options.workerId).catch(() => null)
    if (!preserveWorkerRuntimeStatus) {
      removeQTrainingRouteWorkerRuntimeStatus(options.workerId, root)
    }
  }
}

await main()
