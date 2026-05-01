import { closeSync, existsSync, openSync, writeFileSync } from 'fs'
import { spawn } from 'child_process'
import { isIP } from 'net'
import { dirname, join, resolve } from 'path'
import { execa } from 'execa'
import {
  buildQTrainingPythonEnv,
  buildQTrainingRouteDispatchEnvelope,
  claimNextQueuedQTrainingRoute,
  claimQTrainingRouteQueueEntry,
  evaluateQTrainingPreflight,
  finalizeQTrainingRouteQueueDispatch,
  finalizeQTrainingRouteQueueCompletion,
  getLatestQTrainingSnapshot,
  getNextQTrainingRoutePendingRemoteResult,
  peekQTrainingFastPathWindow,
  getQTrainingRouteQueueDisplayStatus,
  getQTrainingRouteQueueEntry,
  getQTrainingRouteQueueStatusSummary,
  isQTrainingRouteQueuePendingAssignment,
  readQRunState,
  readQTrainingRouteQueue,
  readQTrainingRegistry,
  readQTrainingRouteManifest,
  reapStaleQTrainingRouteQueueClaims,
  reapStaleQTrainingRouteWorkers,
  releaseQTrainingRouteQueueClaim,
  removeQTrainingRouteWorker,
  removeQTrainingRouteWorkerRuntimeStatus,
  renewQTrainingRouteQueueClaim,
  resolveQTrainingPythonCommand,
  resolveQTrainingRoutePath,
  type QRunState,
  type QTrainingExecutionMode,
  type QTrainingPreflight,
  type QTrainingRouteDispatchTransport,
  type QTrainingRouteManifest,
  type QTrainingRouteCognitiveAdmission,
  type QTrainingRouteQueueEntry,
  type QTrainingRouteResultEnvelope,
  type QTrainingRouteWorkerExecutionProfile,
  type QTrainingRouteWorkerRuntimeEntry,
  upsertQTrainingRegistryEntry,
  upsertQTrainingRouteWorker,
  upsertQTrainingRouteWorkerRuntimeStatus,
  updateQTrainingRouteQueueClaim,
  updateQTrainingFastPathWindow,
  verifyQTrainingRouteManifest,
  verifyQTrainingRouteManifestIntegrity,
  verifyQTrainingRouteResultEnvelope,
} from '../utils/qTraining.js'
import {
  getImmaculateHarnessStatus,
  heartbeatImmaculateHarnessWorker,
  registerImmaculateHarnessWorker,
  unregisterImmaculateHarnessWorker,
} from '../utils/immaculateHarness.js'
import {
  resolveQRouteDispatchTransport,
  resolveQWorkerLeaseDurationMs,
} from '../immaculate/policies.js'
import {
  DEFAULT_COGNITIVE_RUNTIME_POLICY,
  deriveMemoryUpdatesFromAssessment,
  evaluateCognitiveRuntimeAction,
  type CognitiveApproval,
  type CognitiveAuthorityScope,
  type CognitiveGoal,
  type CognitiveToolDefinition,
  type CognitiveToolRiskTier,
} from '../utils/cognitiveRuntime.js'

export type QRouteDispatchCliOptions = {
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

export type QRouteWorkerCliOptions = {
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

export type RemoteDispatchAck = {
  accepted: boolean
  executionId: string | null
  summary: string | null
  stateUrl: string | null
  status: number
}

export type WorkerSyncResult = {
  ok: boolean
  runtime: QTrainingRouteWorkerRuntimeEntry
}

export type QTrainingRouteResultReconcileArgs = {
  root?: string | null
  manifestPath?: string | null
  stateUrl?: string | null
  pollMs?: number
  timeoutMs?: number
}

export type QTrainingRouteResultReconcileOutcome = {
  runId: string
  status: 'completed' | 'failed' | 'pending'
  stateUrl: string
  verification?: ReturnType<typeof verifyQTrainingRouteResultEnvelope>
  queueEntry?: ReturnType<typeof getQTrainingRouteQueueEntry>
  runStatePath?: string
  routeQueueDisplayStatus?: ReturnType<typeof getQTrainingRouteQueueDisplayStatus>
  routeQueueSummary?: string
  httpStatus?: number | null
  details?: unknown
}

export type QCliOutcome<T = unknown> = {
  exitCode: number
  payload: T
}

type RouteManifestSecurityVerification = ReturnType<
  typeof verifyQTrainingRouteManifest
>
type RouteManifestIntegrityVerification = ReturnType<
  typeof verifyQTrainingRouteManifestIntegrity
>

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function getQRouteCognitiveToolRiskTier(args: {
  dispatchTransport: QTrainingRouteDispatchTransport
  remoteExecution: boolean
}): CognitiveToolRiskTier {
  return args.dispatchTransport === 'remote_http' || args.remoteExecution ? 3 : 2
}

function buildQRouteCognitiveApprovals(args: {
  routeSecurity: RouteManifestSecurityVerification
  routeIntegrity: RouteManifestIntegrityVerification
  manifest: QTrainingRouteManifest
  now: string
}): CognitiveApproval[] {
  const approvals: CognitiveApproval[] = []
  if (args.routeSecurity.valid && args.routeIntegrity.valid) {
    approvals.push({
      kind: 'policy_governor',
      actorId: 'q-route-signed-manifest',
      approvedAt: args.now,
      summary: `manifest ${args.routeSecurity.payloadSha256}`,
    })
  }
  if (
    args.manifest.routeRequest.controlAccepted === true ||
    args.manifest.routeRequest.security?.signature
  ) {
    approvals.push({
      kind: 'ledger_recorder',
      actorId: 'q-route-ledger-receipt',
      approvedAt: args.now,
      summary: args.manifest.routeRequest.controlSummary ?? 'route receipt',
    })
  }
  return approvals
}

export function evaluateQRouteCognitiveAdmission(args: {
  manifest: QTrainingRouteManifest
  manifestPath: string
  workerId: string
  dispatchTransport: QTrainingRouteDispatchTransport
  remoteExecution: boolean
  routeSecurity: RouteManifestSecurityVerification
  routeIntegrity: RouteManifestIntegrityVerification
  preflight: QTrainingPreflight
  queueEntry: QTrainingRouteQueueEntry
  now?: string
}): QTrainingRouteCognitiveAdmission {
  const now = args.now ?? new Date().toISOString()
  const riskTier = getQRouteCognitiveToolRiskTier({
    dispatchTransport: args.dispatchTransport,
    remoteExecution: args.remoteExecution,
  })
  const authorityScope: CognitiveAuthorityScope =
    riskTier >= 3 ? 'external_communication' : 'workspace_write'
  const tool: CognitiveToolDefinition = {
    name: 'q.route.dispatch',
    summary:
      'Dispatch a signed Q route through the governed OpenJaws worker lane.',
    riskTier,
    authorityScopes: ['workspace_write', 'external_communication'],
    allowedActionKinds: ['execute'],
    allowedRoles: ['operator', 'executor'],
    requiredApprovals:
      riskTier >= 3
        ? ['policy_governor', 'ledger_recorder']
        : ['policy_governor'],
    requiresRollbackPlan: true,
    requiresLedgerRecord: true,
  }
  const confidenceParts = [
    args.routeSecurity.valid,
    args.routeIntegrity.valid,
    args.preflight.decision === 'allow_local' ||
      args.dispatchTransport === 'remote_http',
    args.queueEntry.status === 'claimed',
  ].filter(Boolean).length
  const confidence = confidenceParts / 4
  const goal: CognitiveGoal = {
    id: `q-route:${args.manifest.runId}`,
    objective: `Dispatch Q route ${args.manifest.runId} for ${args.manifest.training.baseModel}.`,
    owner: args.workerId,
    constraints: [
      'run only signed and integrity-verified route manifests',
      'release or reject the route claim on admission failure',
      'preserve route receipts for the operator ledger',
    ],
    authorityScope,
    successCriteria: [
      'route manifest is verified',
      'worker claim remains health-gated',
      'dispatch result is recorded in the route queue',
    ],
    allowedTools: [tool.name],
    rollbackPlan:
      'Reject or release the route queue claim before worker dispatch, then preserve the manifest and logs for operator review.',
    auditRequirements: [
      'route manifest verification',
      'route integrity verification',
      'queue claim record',
      'cognitive admission record',
    ],
    status: 'active',
    createdAt: now,
    roleAssignments: {
      planner: {
        id: 'q-route-planner',
        role: 'planner',
      },
      executor: {
        id: args.workerId,
        role: 'executor',
      },
      critic: {
        id: 'q-route-verifier',
        role: 'critic',
      },
      governor: {
        id: 'q-route-governor',
        role: 'policy_governor',
      },
      recorder: {
        id: 'q-route-ledger',
        role: 'ledger_recorder',
      },
    },
  }
  const decision = evaluateCognitiveRuntimeAction(
    {
      goal,
      actor: {
        id: args.workerId,
        role: 'executor',
      },
      actionKind: 'execute',
      tool,
      confidence,
      recentFailureCount:
        args.preflight.decision === 'preflight_blocked' ? 1 : 0,
      approvals: buildQRouteCognitiveApprovals({
        routeSecurity: args.routeSecurity,
        routeIntegrity: args.routeIntegrity,
        manifest: args.manifest,
        now,
      }),
      now,
    },
    DEFAULT_COGNITIVE_RUNTIME_POLICY,
  )
  const memoryUpdates = deriveMemoryUpdatesFromAssessment({
    goal,
    scorecard: decision.scorecardSeed,
    trace: decision.trace,
    now,
    stableFacts: [
      `Q route ${args.manifest.runId} targets ${args.manifest.training.baseModel}.`,
      `Dispatch transport ${args.dispatchTransport} was evaluated at risk tier ${riskTier}.`,
    ],
  })

  return {
    status: decision.status,
    goalId: decision.goalId,
    toolName: decision.toolName,
    riskTier: decision.riskTier,
    reasons: decision.reasons,
    requiredApprovals: decision.requiredApprovals,
    missingApprovals: decision.missingApprovals,
    delayMs: decision.delayMs,
    nextStep: decision.nextStep,
    pacingStatus: decision.pacing.status,
    pacingReasons: decision.pacing.reasons,
    scorecardStatus: decision.scorecardSeed.status,
    scorecardQuality: decision.scorecardSeed.qualityScore,
    scorecardMetrics: decision.scorecardSeed.metrics,
    trace: decision.trace,
    memoryUpdates,
    ledgerRecordId: decision.ledgerRecord.id,
  }
}

function isTrustedRouteExecutionHost(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase()
  if (!normalized) {
    return false
  }
  if (
    normalized === 'localhost' ||
    normalized === 'host.docker.internal' ||
    normalized.endsWith('.local') ||
    normalized === '::1'
  ) {
    return true
  }
  const ipVersion = isIP(normalized)
  if (ipVersion === 4) {
    const [a, b] = normalized.split('.').map(Number)
    return (
      a === 10 ||
      a === 127 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254)
    )
  }
  if (ipVersion === 6) {
    return (
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      normalized.startsWith('fe80:')
    )
  }
  return false
}

export function validateRemoteExecutionEndpoint(args: {
  endpoint: string
  allowHostRisk: boolean
}):
  | { ok: true; endpoint: string }
  | { ok: false; error: string } {
  const trimmed = args.endpoint.trim()
  if (!trimmed) {
    return {
      ok: false,
      error: 'remote execution endpoint missing',
    }
  }
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return {
      ok: false,
      error: `remote execution endpoint is invalid: ${trimmed}`,
    }
  }
  if (parsed.username || parsed.password) {
    return {
      ok: false,
      error: 'remote execution endpoint must not include URL credentials',
    }
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return {
      ok: false,
      error: `remote execution endpoint must use http or https, received ${parsed.protocol}`,
    }
  }
  if (
    parsed.protocol === 'http:' &&
    !args.allowHostRisk &&
    !isTrustedRouteExecutionHost(parsed.hostname)
  ) {
    return {
      ok: false,
      error:
        'remote execution endpoint must use https unless it targets a trusted local host or allow-host-risk is enabled',
    }
  }
  return {
    ok: true,
    endpoint: parsed.toString(),
  }
}

export async function postRemoteDispatchEnvelope(args: {
  endpoint: string
  envelope: ReturnType<typeof buildQTrainingRouteDispatchEnvelope>
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
        typeof data?.summary === 'string' ? data.summary : text.trim() || null,
      stateUrl: typeof data?.stateUrl === 'string' ? data.stateUrl : null,
      status: response.status,
    }
  } finally {
    clearTimeout(timeout)
  }
}

export function resolveLatestQRouteManifestPath(root = process.cwd()): string | null {
  const latestSnapshot = getLatestQTrainingSnapshot(root)
  const manifestPath = latestSnapshot?.state?.routeRequest?.manifestPath ?? null
  return manifestPath ? resolve(manifestPath) : null
}

export function buildRouteDispatchPythonArgs(args: {
  manifestPath: string
  manifest: QTrainingRouteManifest
  manifestDir: string
  executionMode: QTrainingExecutionMode
}): string[] {
  const trainFile = resolveQTrainingRoutePath(
    args.manifestDir,
    args.manifest.training.trainFile,
  )
  const evalFile = args.manifest.training.evalFile
    ? resolveQTrainingRoutePath(args.manifestDir, args.manifest.training.evalFile)
    : null

  const pythonArgs = [
    resolve(process.cwd(), 'training', 'q', 'train_lora.py'),
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
  if (
    args.manifest.training.maxSteps !== null &&
    args.manifest.training.maxSteps !== undefined
  ) {
    pythonArgs.push('--max-steps', String(args.manifest.training.maxSteps))
  }
  if (
    args.manifest.training.numTrainEpochs !== null &&
    args.manifest.training.numTrainEpochs !== undefined
  ) {
    pythonArgs.push('--num-train-epochs', String(args.manifest.training.numTrainEpochs))
  }
  for (const tag of args.manifest.training.selectedTags) {
    pythonArgs.push('--tag', tag)
  }
  for (const language of args.manifest.training.selectedLanguages) {
    pythonArgs.push('--language', language)
  }
  return pythonArgs
}

export function writeDispatchState(args: {
  manifest: QTrainingRouteManifest
  manifestPath: string
  manifestDir: string
  launchedAt: string
  pid: number | null
  stdoutLog: string
  stderrLog: string
  executionMode: QTrainingExecutionMode
  preflight: QTrainingPreflight
  routeQueue: ReturnType<typeof getQTrainingRouteQueueEntry>
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
        trainFile: resolveQTrainingRoutePath(
          args.manifestDir,
          args.manifest.training.trainFile,
        ),
        evalFile: args.manifest.training.evalFile
          ? resolveQTrainingRoutePath(
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
        routeQueueDisplayStatus: getQTrainingRouteQueueDisplayStatus(
          args.routeQueue,
        ),
        routeQueueSummary: getQTrainingRouteQueueStatusSummary(args.routeQueue),
      },
      null,
      2,
    )}\n`,
    'utf8',
  )
  upsertQTrainingRegistryEntry(
    {
      runId: args.manifest.runId,
      status: 'launched',
      executionMode: args.executionMode,
      pid: args.pid,
      launchedAt: args.launchedAt,
      outputDir: args.manifestDir,
      trainFile: resolveQTrainingRoutePath(
        args.manifestDir,
        args.manifest.training.trainFile,
      ),
      evalFile: args.manifest.training.evalFile
        ? resolveQTrainingRoutePath(
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
    },
    args.root,
  )
}

export function getWorkerLeaseDurationMs(options: QRouteWorkerCliOptions): number {
  return resolveQWorkerLeaseDurationMs({
    claimTtlMs: options.claimTtlMs,
    watch: options.watch,
    pollMs: options.pollMs,
  })
}

export function validateWorkerOptions(options: QRouteWorkerCliOptions): void {
  if (
    options.executionProfile === 'remote' &&
    (!options.executionEndpoint || !options.executionEndpoint.trim())
  ) {
    throw new Error(
      'Remote Q route workers require --execution-endpoint so Immaculate can assign them safely.',
    )
  }
}

export function upsertWorkerRegistration(
  options: QRouteWorkerCliOptions,
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

export function buildWorkerRuntimeEntry(args: {
  options: QRouteWorkerCliOptions
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

export function writeWorkerRuntimeStatus(
  entry: QTrainingRouteWorkerRuntimeEntry,
  root = process.cwd(),
): QTrainingRouteWorkerRuntimeEntry {
  upsertQTrainingRouteWorkerRuntimeStatus(entry, root)
  return entry
}

export async function syncImmaculateWorkerRegistration(
  options: QRouteWorkerCliOptions,
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
    const message = error instanceof Error ? error.message : String(error)
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

export function resolveQueueTarget(
  options: QRouteWorkerCliOptions,
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

export function resolvePendingRemoteResultTarget(
  options: QRouteWorkerCliOptions,
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

export async function dispatchClaimedRoute(args: {
  options: QRouteWorkerCliOptions
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
        renewQTrainingRouteQueueClaim({
          runId: args.target.queueEntry.runId,
          workerId: args.options.workerId,
          claimTtlMs: args.options.claimTtlMs ?? undefined,
          root: args.options.root ?? process.cwd(),
          renewedAt: heartbeatAt,
        })
        const sync = await syncImmaculateWorkerRegistration(
          args.options,
          'heartbeat',
          heartbeatAt,
        )
        writeWorkerRuntimeStatus(sync.runtime, args.options.root ?? process.cwd())
        if (!sync.ok) {
          heartbeatFailure = sync.runtime
          if (heartbeat) {
            clearInterval(heartbeat)
            heartbeat = null
          }
          return
        }
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

export async function dispatchQTrainingRoute(
  options: QRouteDispatchCliOptions,
): Promise<QCliOutcome> {
  const root = options.root ?? process.cwd()
  const manifestPath = options.manifestPath ?? resolveLatestQRouteManifestPath(root)
  if (!manifestPath || !existsSync(manifestPath)) {
    throw new Error(
      `Route manifest not found${manifestPath ? ` at ${manifestPath}` : ''}.`,
    )
  }

  const manifest = readQTrainingRouteManifest(manifestPath)
  const manifestDir = dirname(manifestPath)
  const routeSecurity = verifyQTrainingRouteManifest(manifest)
  const routeIntegrity = verifyQTrainingRouteManifestIntegrity(
    manifest,
    manifestDir,
  )
  const claimedRoute = claimQTrainingRouteQueueEntry({
    runId: manifest.runId,
    manifestPath,
    workerId: options.workerId,
    root,
  })
  if (!claimedRoute) {
    const queueEntry = getQTrainingRouteQueueEntry(manifest.runId, root)
    const pendingAssignment = isQTrainingRouteQueuePendingAssignment(queueEntry)
    return {
      exitCode: 1,
      payload: {
        runId: manifest.runId,
        status: pendingAssignment
          ? 'pending_assignment'
          : 'claimed_by_other_worker',
        manifestPath,
        manifestDir,
        summary: pendingAssignment
          ? 'Q route is waiting for an Immaculate worker assignment.'
          : 'Q route manifest is already claimed by another worker or assigned elsewhere.',
        queueStatus: getQTrainingRouteQueueStatusSummary(queueEntry),
        queueEntry,
      },
    }
  }

  const trainFile = resolveQTrainingRoutePath(
    manifestDir,
    manifest.training.trainFile,
  )
  const localPreflight = evaluateQTrainingPreflight({
    baseModel: manifest.training.baseModel,
    trainFile,
    pythonPath: options.python,
    useCpu: manifest.training.useCpu,
  })
  const remoteExecution =
    options.executionProfile === 'remote' ||
    claimedRoute.assignment?.executionProfile === 'remote'
  const fastPathWindow = peekQTrainingFastPathWindow({ root })
  const rawExecutionEndpoint =
    options.executionEndpoint?.trim() ||
    claimedRoute.assignment?.executionEndpoint?.trim() ||
    null
  const executionEndpointValidation = rawExecutionEndpoint
    ? validateRemoteExecutionEndpoint({
        endpoint: rawExecutionEndpoint,
        allowHostRisk: options.allowHostRisk,
      })
    : null
  const executionEndpoint =
    executionEndpointValidation?.ok === true
      ? executionEndpointValidation.endpoint
      : null
  const dispatchTransport: QTrainingRouteDispatchTransport =
    resolveQRouteDispatchTransport({
      remoteExecution,
      executionEndpoint,
      fallbackWindow: fastPathWindow,
    })
  const claimedRouteDisplayStatus =
    getQTrainingRouteQueueDisplayStatus(claimedRoute)
  const claimedRouteSummary = getQTrainingRouteQueueStatusSummary(claimedRoute)
  const cognitiveAdmission = evaluateQRouteCognitiveAdmission({
    manifest,
    manifestPath,
    workerId: options.workerId,
    dispatchTransport,
    remoteExecution,
    routeSecurity,
    routeIntegrity,
    preflight: localPreflight,
    queueEntry: claimedRoute,
  })
  const cognitiveBlocked = cognitiveAdmission.status !== 'allow'

  const blocked =
    !routeSecurity.valid ||
    !routeIntegrity.valid ||
    (rawExecutionEndpoint !== null && executionEndpointValidation?.ok === false) ||
    (dispatchTransport === 'remote_http' && !executionEndpoint) ||
    (dispatchTransport === 'local_process' &&
      localPreflight.decision !== 'allow_local' &&
      !options.allowHostRisk) ||
    cognitiveBlocked
  updateQTrainingRouteQueueClaim({
    runId: manifest.runId,
    workerId: options.workerId,
    root,
    updatedAt: new Date().toISOString(),
    signatureVerified: routeSecurity.valid,
    integrityVerified: routeIntegrity.valid,
    cognitiveAdmission,
    preflight: localPreflight,
    status: blocked ? 'rejected' : 'claimed',
    rejectionReason: blocked
      ? [
          !routeSecurity.valid ? `signature ${routeSecurity.reason}` : null,
          !routeIntegrity.valid ? 'integrity mismatch' : null,
          executionEndpointValidation?.ok === false
            ? executionEndpointValidation.error
            : null,
          dispatchTransport === 'remote_http' && !executionEndpoint
            ? 'remote execution endpoint missing'
            : null,
          dispatchTransport === 'local_process' &&
          localPreflight.decision !== 'allow_local' &&
          !options.allowHostRisk
            ? `preflight ${localPreflight.decision}`
            : null,
          cognitiveBlocked
            ? `cognitive admission ${cognitiveAdmission.status}: ${cognitiveAdmission.reasons.join(' · ')}`
            : null,
        ]
          .filter(Boolean)
          .join(' · ')
      : null,
  })

  if (options.dryRun || blocked) {
    if (options.dryRun && !blocked) {
      releaseQTrainingRouteQueueClaim({
        runId: manifest.runId,
        workerId: options.workerId,
        root,
      })
    }
    return {
      exitCode: blocked ? 1 : 0,
      payload: {
        runId: manifest.runId,
        status: blocked ? 'blocked' : 'verified',
        blockedReason: blocked
          ? [
              !routeSecurity.valid ? `signature ${routeSecurity.reason}` : null,
              !routeIntegrity.valid ? 'integrity mismatch' : null,
              executionEndpointValidation?.ok === false
                ? executionEndpointValidation.error
                : null,
              dispatchTransport === 'remote_http' && !executionEndpoint
                ? 'remote execution endpoint missing'
                : null,
              dispatchTransport === 'local_process' &&
              localPreflight.decision !== 'allow_local' &&
              !options.allowHostRisk
                ? `preflight ${localPreflight.decision}`
                : null,
              cognitiveBlocked
                ? `cognitive admission ${cognitiveAdmission.status}: ${cognitiveAdmission.reasons.join(' · ')}`
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
        cognitiveAdmission,
        dispatchTransport,
        executionEndpoint,
        routeQueueDisplayStatus: claimedRouteDisplayStatus,
        routeQueueSummary: claimedRouteSummary,
      },
    }
  }

  const stdoutLog = join(manifestDir, 'route-dispatch.stdout.log')
  const stderrLog = join(manifestDir, 'route-dispatch.stderr.log')
  const launchedAt = new Date().toISOString()
  const executionMode: QTrainingExecutionMode = 'immaculate_routed'
  if (options.dispatchDelayMs && options.dispatchDelayMs > 0) {
    await sleep(options.dispatchDelayMs)
  }
  let pid: number | null = null
  let remoteAck: RemoteDispatchAck | null = null
  if (dispatchTransport === 'remote_http') {
    const envelope = buildQTrainingRouteDispatchEnvelope({
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
      updateQTrainingFastPathWindow({
        root,
        observedAt: launchedAt,
        success: false,
        transportFailure: true,
      })
      updateQTrainingRouteQueueClaim({
        runId: manifest.runId,
        workerId: options.workerId,
        root,
        updatedAt: launchedAt,
        status: 'rejected',
        signatureVerified: routeSecurity.valid,
        integrityVerified: routeIntegrity.valid,
        cognitiveAdmission,
        preflight: localPreflight,
        rejectionReason: `remote dispatch ${remoteAck.status}${
          remoteAck.summary ? ` · ${remoteAck.summary}` : ''
        }`,
      })
      return {
        exitCode: 1,
        payload: {
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
          cognitiveAdmission,
          dispatchTransport,
          executionEndpoint,
          remoteDispatch: remoteAck,
          routeQueueDisplayStatus: getQTrainingRouteQueueDisplayStatus(
            getQTrainingRouteQueueEntry(manifest.runId, root),
          ),
          routeQueueSummary: getQTrainingRouteQueueStatusSummary(
            getQTrainingRouteQueueEntry(manifest.runId, root),
          ),
        },
      }
    }
    updateQTrainingFastPathWindow({
      root,
      observedAt: launchedAt,
      success: true,
      transportFailure: false,
    })
  } else {
    const stdoutFd = openSync(stdoutLog, 'a')
    const stderrFd = openSync(stderrLog, 'a')
    const child = (() => {
      try {
        return spawn(
          options.python,
          buildRouteDispatchPythonArgs({
            manifestPath,
            manifest,
            manifestDir,
            executionMode,
          }),
          {
            cwd: process.cwd(),
            detached: true,
            env: buildQTrainingPythonEnv(process.env),
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
  finalizeQTrainingRouteQueueDispatch({
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
    routeQueue: getQTrainingRouteQueueEntry(manifest.runId, root),
    root,
  })

  return {
    exitCode: 0,
    payload: {
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
      cognitiveAdmission,
      dispatchTransport,
      executionEndpoint,
      remoteDispatch: remoteAck,
      routeQueueDisplayStatus: getQTrainingRouteQueueDisplayStatus(
        getQTrainingRouteQueueEntry(manifest.runId, root),
      ),
      routeQueueSummary: getQTrainingRouteQueueStatusSummary(
        getQTrainingRouteQueueEntry(manifest.runId, root),
      ),
    },
  }
}

export async function runQTrainingRouteWorker(
  options: QRouteWorkerCliOptions,
  onEvent: (payload: unknown) => void = () => {},
): Promise<QCliOutcome> {
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
    return {
      exitCode: 1,
      payload: {
        status: 'worker_register_failed',
        summary: registerSync.runtime.summary,
        workerId: options.workerId,
        harnessUrl: registerSync.runtime.harnessUrl ?? null,
        detail: registerSync.runtime.detail ?? null,
      },
    }
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
        return {
          exitCode: 1,
          payload: {
            status: 'worker_heartbeat_failed',
            summary: heartbeatSync.runtime.summary,
            workerId: options.workerId,
            harnessUrl: heartbeatSync.runtime.harnessUrl ?? null,
            detail: heartbeatSync.runtime.detail ?? null,
          },
        }
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
        onEvent(outcome)
        if (outcome.status === 'blocked') {
          return {
            exitCode: 1,
            payload: outcome,
          }
        }
        idleStartedAt = Date.now()
        if (options.manifestPath && !options.watch) {
          return {
            exitCode: outcome.status === 'pending' ? 1 : 0,
            payload: outcome,
          }
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
        const pendingAssignment =
          isQTrainingRouteQueuePendingAssignment(queueEntry)
        return {
          exitCode: 1,
          payload: {
            status: pendingAssignment ? 'pending_assignment' : 'blocked',
            summary: pendingAssignment
              ? 'Q route manifest is waiting for an Immaculate worker assignment.'
              : 'Q route manifest is already claimed by another worker or assigned elsewhere.',
            workerId: options.workerId,
            manifestPath: target.manifestPath,
            queueStatus: getQTrainingRouteQueueStatusSummary(queueEntry),
          },
        }
      }
      if (
        target.manifestPath &&
        target.queueEntry &&
        existsSync(target.manifestPath)
      ) {
        const outcome = await dispatchClaimedRoute({
          options,
          target: {
            manifestPath: target.manifestPath,
            queueEntry: target.queueEntry,
          },
        })

        onEvent(outcome)
        if (outcome.status !== 'processed') {
          if (outcome.workerRuntime) {
            preserveWorkerRuntimeStatus = true
          }
          return {
            exitCode: 1,
            payload: outcome,
          }
        }
        if (options.dryRun || !options.watch || options.manifestPath) {
          return {
            exitCode: 0,
            payload: outcome,
          }
        }
        idleStartedAt = Date.now()
        continue
      }

      if (!options.watch) {
        const pendingAssignments = readQTrainingRouteQueue(root).filter(entry =>
          isQTrainingRouteQueuePendingAssignment(entry),
        )
        if (pendingAssignments.length > 0) {
          return {
            exitCode: 0,
            payload: {
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
          }
        }
        return {
          exitCode: 0,
          payload: {
            status: 'idle',
            summary: 'No queued Q route manifests ready for processing.',
            workerId: options.workerId,
            manifestPath: target.manifestPath,
          },
        }
      }

      if (
        options.idleExitMs !== null &&
        Date.now() - idleStartedAt >= options.idleExitMs
      ) {
        return {
          exitCode: 0,
          payload: {
            status: 'idle',
            summary: 'Q route worker exited after the configured idle window.',
            workerId: options.workerId,
            idleExitMs: options.idleExitMs,
          },
        }
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

export async function reconcileRemoteResult(args: {
  options: QRouteWorkerCliOptions
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
  if (result.status === 'completed') {
    updateQTrainingFastPathWindow({
      root: args.options.root,
      success: true,
      transportFailure: false,
    })
  } else if (result.status === 'failed') {
    updateQTrainingFastPathWindow({
      root: args.options.root,
      success: false,
      transportFailure: true,
    })
  }

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
      getQTrainingRouteQueueEntry(
        args.target.queueEntry.runId,
        args.options.root ?? process.cwd(),
      ) ?? args.target.queueEntry,
    result,
  }
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function writeJson(path: string, data: unknown): void {
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
}

export function buildBaseRunState(args: {
  current: QRunState | null
  manifestDir: string
  manifest: ReturnType<typeof readQTrainingRouteManifest>
  status: 'completed' | 'failed'
  finishedAt: string
  executionMode: QRunState['executionMode']
  queueEntry: ReturnType<typeof getQTrainingRouteQueueEntry>
  runStatePatch: Partial<QRunState>
}): Record<string, unknown> {
  const trainFile =
    args.current?.trainFile ??
    resolveQTrainingRoutePath(args.manifestDir, args.manifest.training.trainFile)
  const evalFile =
    args.current?.evalFile ??
    (args.manifest.training.evalFile
      ? resolveQTrainingRoutePath(args.manifestDir, args.manifest.training.evalFile)
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
    lineageId: args.current?.lineageId ?? args.manifest.training.lineageId ?? null,
    phaseId: args.current?.phaseId ?? args.manifest.training.phaseId ?? null,
    selectedTags:
      args.current?.selectedTags ?? args.manifest.training.selectedTags,
    selectedLanguages:
      args.current?.selectedLanguages ?? args.manifest.training.selectedLanguages,
    routeRequest: args.current?.routeRequest ?? args.manifest.routeRequest,
    routeFailure: args.current?.routeFailure ?? null,
    routeQueue: args.queueEntry,
    routeQueueDisplayStatus: getQTrainingRouteQueueDisplayStatus(args.queueEntry),
    routeQueueSummary: getQTrainingRouteQueueStatusSummary(args.queueEntry),
  }
  if (args.status === 'completed' && !('error' in args.runStatePatch)) {
    nextRunState.error = null
  }
  return nextRunState
}

export async function fetchResultEnvelope(args: {
  stateUrl: string
  runId: string
  timeoutMs: number
  pollMs: number
}): Promise<{
  envelope: QTrainingRouteResultEnvelope | null
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
        await sleep(args.pollMs)
        continue
      }

      const envelope =
        isObjectRecord(parsed) &&
        isObjectRecord(parsed.payload) &&
        ('security' in parsed || 'payload' in parsed)
          ? (parsed as QTrainingRouteResultEnvelope)
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

export async function reconcileQTrainingRouteResult(
  args: QTrainingRouteResultReconcileArgs,
): Promise<QTrainingRouteResultReconcileOutcome> {
  const root = args.root ?? process.cwd()
  const manifestPath = args.manifestPath ?? resolveLatestQRouteManifestPath(root)
  if (!manifestPath || !existsSync(manifestPath)) {
    throw new Error(
      `Route manifest not found${manifestPath ? ` at ${manifestPath}` : ''}.`,
    )
  }

  const manifest = readQTrainingRouteManifest(manifestPath)
  const manifestDir = dirname(manifestPath)
  const queueEntry = getQTrainingRouteQueueEntry(manifest.runId, root)
  const stateUrl =
    args.stateUrl?.trim() || queueEntry?.dispatch?.remoteStateUrl?.trim() || null

  if (!queueEntry || queueEntry.status !== 'dispatched' || !queueEntry.dispatch) {
    throw new Error(`Q route ${manifest.runId} is not in a dispatched state.`)
  }
  if (!stateUrl) {
    throw new Error(`Q route ${manifest.runId} has no remote state URL.`)
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

  const verification = verifyQTrainingRouteResultEnvelope(polled.envelope)
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

  const finalizedQueue = finalizeQTrainingRouteQueueCompletion({
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

  const currentRunState = readQRunState(manifestDir)
  const nextRunState = buildBaseRunState({
    current: currentRunState,
    manifestDir,
    manifest,
    status: payload.status,
    finishedAt: payload.finishedAt,
    executionMode:
      currentRunState?.executionMode ?? payload.executionMode ?? 'immaculate_routed',
    queueEntry: finalizedQueue,
    runStatePatch: payload.runState,
  })
  writeJson(join(manifestDir, 'run-state.json'), nextRunState)

  const existingRegistry =
    readQTrainingRegistry(root).find(entry => entry.runId === manifest.runId) ??
    null
  upsertQTrainingRegistryEntry(
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
        resolveQTrainingRoutePath(manifestDir, manifest.training.trainFile),
      evalFile:
        existingRegistry?.evalFile ??
        (manifest.training.evalFile
          ? resolveQTrainingRoutePath(manifestDir, manifest.training.evalFile)
          : null),
      baseModel: existingRegistry?.baseModel ?? manifest.training.baseModel,
      selectedTags:
        existingRegistry?.selectedTags ?? manifest.training.selectedTags,
      selectedLanguages:
        existingRegistry?.selectedLanguages ?? manifest.training.selectedLanguages,
      runName: existingRegistry?.runName ?? manifest.training.runName,
      lineageId: existingRegistry?.lineageId ?? manifest.training.lineageId ?? null,
      phaseId: existingRegistry?.phaseId ?? manifest.training.phaseId ?? null,
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
    routeQueueDisplayStatus: getQTrainingRouteQueueDisplayStatus(finalizedQueue),
    routeQueueSummary: getQTrainingRouteQueueStatusSummary(finalizedQueue),
  }
}
