import { createHash, createHmac, randomBytes } from 'crypto'
import {
  existsSync,
  copyFileSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'fs'
import { homedir, freemem, totalmem } from 'os'
import { dirname, join, relative, resolve } from 'path'
import * as lockfile from './lockfile.js'

export type GemmaTrainingStatus =
  | 'launched'
  | 'initializing'
  | 'running'
  | 'completed'
  | 'failed'
  | 'route_requested'
  | 'remote_required'
  | 'preflight_blocked'

export type GemmaTrainingPreflightDecision =
  | 'allow_local'
  | 'remote_required'
  | 'preflight_blocked'

export type GemmaTrainingPreflight = {
  decision: GemmaTrainingPreflightDecision
  reasonCode:
    | 'ok'
    | 'missing_python'
    | 'missing_train_file'
    | 'insufficient_host_memory'
    | 'gpu_path_not_profiled'
  summary: string
  baseModel: string
  useCpu: boolean
  cachedModelPath?: string | null
  modelBytes?: number | null
  requiredAvailableMemoryBytes?: number | null
  observedAvailableMemoryBytes?: number | null
  observedTotalMemoryBytes?: number | null
}

export type GemmaTrainingExecutionMode =
  | 'local'
  | 'local_forced'
  | 'immaculate_route_requested'
  | 'immaculate_routed'
  | 'remote_required'
  | 'preflight_blocked'

export type GemmaTrainingFileIntegrity = {
  path: string
  bytes: number
  sha256: string
}

export type GemmaTrainingRouteIntegrity = {
  algorithm: 'sha256'
  trainFile: GemmaTrainingFileIntegrity
  evalFile?: GemmaTrainingFileIntegrity | null
}

export type GemmaTrainingRouteSecretSource =
  | 'OPENJAWS_GEMMA_ROUTE_SECRET'
  | '~/.openjaws/gemma-route-secret'

export type GemmaTrainingRouteSecurity = {
  algorithm: 'hmac-sha256'
  payloadSha256: string
  signature: string
  signedAt: string
  secretSource: GemmaTrainingRouteSecretSource
}

export type GemmaTrainingRouteDispatchTransport =
  | 'local_process'
  | 'remote_http'

export type GemmaTrainingRouteDispatchFile = {
  path: string
  bytes: number
  sha256: string
  contentBase64: string
}

export type GemmaTrainingRouteDispatchPayload = {
  runId: string
  manifestPath: string
  workerId: string
  executionMode: GemmaTrainingExecutionMode
  dispatchedAt: string
  manifest: GemmaTrainingRouteManifest
  files: GemmaTrainingRouteDispatchFile[]
}

export type GemmaTrainingRouteDispatchEnvelope = {
  payload: GemmaTrainingRouteDispatchPayload
  security: GemmaTrainingRouteSecurity | null
}

export type GemmaTrainingRouteResultStatus = Extract<
  GemmaTrainingStatus,
  'completed' | 'failed'
>

export type GemmaTrainingRouteResultPayload = {
  runId: string
  manifestPath: string
  workerId: string
  executionId: string | null
  executionMode: GemmaTrainingExecutionMode
  finishedAt: string
  status: GemmaTrainingRouteResultStatus
  summary: string | null
  stateUrl?: string | null
  runState: Partial<GemmaRunState> & {
    status: GemmaTrainingRouteResultStatus
    finishedAt: string
  }
  runSummary: Record<string, unknown> | null
  metricsSummary: Record<string, unknown> | null
}

export type GemmaTrainingRouteResultEnvelope = {
  payload: GemmaTrainingRouteResultPayload
  security: GemmaTrainingRouteSecurity | null
}

export type GemmaTrainingRouteRequest = {
  route: 'immaculate'
  requestedAt: string
  target?: string | null
  recommendedLayerId?: string | null
  manifestPath: string
  controlStatus?: number | null
  controlAccepted?: boolean | null
  controlSummary?: string | null
  harnessSnapshot?: {
    harnessUrl?: string | null
    recommendedLayerId?: string | null
    layerCount?: number | null
    executionCount?: number | null
    workerCount?: number | null
    healthyWorkerCount?: number | null
    staleWorkerCount?: number | null
    faultedWorkerCount?: number | null
    eligibleWorkerCount?: number | null
    blockedWorkerCount?: number | null
    assignment?: {
      workerId: string
      workerLabel?: string | null
      hostLabel?: string | null
      executionProfile: GemmaTrainingRouteWorkerExecutionProfile
      executionEndpoint?: string | null
      assignedAt: string
      reason: string
      score?: number
      healthStatus?: 'healthy' | 'stale' | 'faulted'
      healthSummary?: string | null
    } | null
  } | null
  integrity?: GemmaTrainingRouteIntegrity | null
  security?: GemmaTrainingRouteSecurity | null
}

export type GemmaTrainingRouteFailureStage =
  | 'status'
  | 'control'
  | 'assignment'
  | 'manifest'

export type GemmaTrainingRouteFailureCode =
  | 'harness_unreachable'
  | 'control_failed'
  | 'control_rejected'
  | 'assignment_failed'
  | 'manifest_failed'

export type GemmaTrainingRouteFailure = {
  route: 'immaculate'
  failedAt: string
  stage: GemmaTrainingRouteFailureStage
  code: GemmaTrainingRouteFailureCode
  summary: string
  detail?: string | null
  harnessUrl?: string | null
  recommendedLayerId?: string | null
  controlStatus?: number | null
  controlSummary?: string | null
}

export type GemmaTrainingRouteManifestTraining = {
  baseModel: string
  runName: string | null
  trainFile: string
  evalFile: string | null
  selectedTags: string[]
  selectedLanguages: string[]
  outputDir: string
  useCpu: boolean
  maxSteps?: number | null
  numTrainEpochs?: number | null
}

export type GemmaTrainingRouteManifest = {
  runId: string
  routeRequest: GemmaTrainingRouteRequest
  training: GemmaTrainingRouteManifestTraining
  preflight: GemmaTrainingPreflight
  security: GemmaTrainingRouteSecurity | null
}

export type GemmaTrainingRouteQueueStatus =
  | 'queued'
  | 'claimed'
  | 'dispatched'
  | 'completed'
  | 'failed'
  | 'rejected'

export type GemmaTrainingRouteQueueDisplayStatus =
  | GemmaTrainingRouteQueueStatus
  | 'pending_assignment'

export type GemmaTrainingRouteReceipt = {
  displayStatus: GemmaTrainingRouteQueueDisplayStatus
  text: string
  tone?: 'suggestion' | 'warning' | 'error' | 'success'
}

export type GemmaTrainingRouteQueueClaim = {
  workerId: string
  claimedAt: string
  heartbeatAt?: string | null
  leaseExpiresAt?: string | null
  leaseDurationMs?: number | null
  signatureVerified?: boolean | null
  integrityVerified?: boolean | null
  preflightDecision?: GemmaTrainingPreflightDecision | null
  preflightReasonCode?: GemmaTrainingPreflight['reasonCode'] | null
}

export type GemmaTrainingRouteQueueDispatch = {
  dispatchedAt: string
  executionMode: GemmaTrainingExecutionMode
  pid: number | null
  transport?: GemmaTrainingRouteDispatchTransport
  workerId?: string | null
  executionEndpoint?: string | null
  acknowledgedAt?: string | null
  remoteStatus?: number | null
  remoteAccepted?: boolean | null
  remoteExecutionId?: string | null
  remoteSummary?: string | null
  remoteStateUrl?: string | null
  resultReceivedAt?: string | null
  remoteCompletedAt?: string | null
  remoteCompletionStatus?: GemmaTrainingRouteResultStatus | null
  remoteCompletionSummary?: string | null
}

export type GemmaTrainingRouteWorkerExecutionProfile = 'local' | 'remote'

export type GemmaTrainingRouteWorkerRegistration = {
  workerId: string
  workerLabel?: string | null
  hostLabel?: string | null
  executionProfile: GemmaTrainingRouteWorkerExecutionProfile
  executionEndpoint?: string | null
  registeredAt: string
  heartbeatAt: string
  leaseExpiresAt: string
  leaseDurationMs: number
  watch: boolean
  allowHostRisk: boolean
  supportedBaseModels: string[]
  preferredLayerIds: string[]
}

export type GemmaTrainingRouteWorkerRuntimeState =
  | 'ready'
  | 'local_only'
  | 'register_failed'
  | 'heartbeat_failed'

export type GemmaTrainingRouteWorkerRuntimeEntry = {
  workerId: string
  workerLabel?: string | null
  hostLabel?: string | null
  executionProfile: GemmaTrainingRouteWorkerExecutionProfile
  status: GemmaTrainingRouteWorkerRuntimeState
  updatedAt: string
  summary: string
  detail?: string | null
  harnessUrl?: string | null
  supportedBaseModels: string[]
  preferredLayerIds: string[]
}

export type GemmaTrainingRouteQueueAssignment = {
  workerId: string
  workerLabel?: string | null
  hostLabel?: string | null
  executionProfile: GemmaTrainingRouteWorkerExecutionProfile
  executionEndpoint?: string | null
  source?: 'local' | 'immaculate'
  assignedAt: string
  reason: string
  score?: number
  healthStatus?: 'healthy' | 'stale' | 'faulted'
  healthSummary?: string | null
}

export type GemmaTrainingRouteQueueEntry = {
  runId: string
  manifestPath: string
  queuedAt: string
  updatedAt: string
  status: GemmaTrainingRouteQueueStatus
  assignmentAuthority?: 'local' | 'immaculate'
  target?: string | null
  recommendedLayerId?: string | null
  healthyWorkerCount?: number | null
  staleWorkerCount?: number | null
  faultedWorkerCount?: number | null
  eligibleWorkerCount?: number | null
  blockedWorkerCount?: number | null
  baseModel?: string | null
  useCpu?: boolean | null
  requestedExecutionDecision?: GemmaTrainingPreflightDecision | null
  security?: GemmaTrainingRouteSecurity | null
  assignment?: GemmaTrainingRouteQueueAssignment | null
  claim?: GemmaTrainingRouteQueueClaim | null
  dispatch?: GemmaTrainingRouteQueueDispatch | null
  rejectionReason?: string | null
}

export type GemmaTrainingRegistryEntry = {
  runId: string
  status: GemmaTrainingStatus
  executionMode?: GemmaTrainingExecutionMode
  pid: number | null
  launchedAt: string
  outputDir: string
  trainFile: string
  evalFile: string | null
  baseModel: string
  selectedTags: string[]
  selectedLanguages: string[]
  runName: string | null
  logFiles: {
    stdout: string
    stderr: string
  }
  runStatePath: string
  preflight?: GemmaTrainingPreflight | null
  routeRequest?: GemmaTrainingRouteRequest | null
  routeFailure?: GemmaTrainingRouteFailure | null
}

export type GemmaRunState = {
  status: GemmaTrainingStatus
  executionMode?: GemmaTrainingExecutionMode
  pid: number | null
  createdAt?: string | null
  startedAt?: string | null
  finishedAt?: string | null
  updatedAt?: string | null
  baseModel: string
  trainFile: string
  evalFile: string | null
  outputDir: string
  runName: string | null
  selectedTags: string[]
  selectedLanguages: string[]
  globalStep?: number | null
  maxSteps?: number | null
  trainSampleCount?: number | null
  evalSampleCount?: number | null
  epoch?: number | null
  loss?: number | null
  evalLoss?: number | null
  learningRate?: number | null
  lastCheckpointStep?: number | null
  error?: string | null
  preflight?: GemmaTrainingPreflight | null
  routeRequest?: GemmaTrainingRouteRequest | null
  routeFailure?: GemmaTrainingRouteFailure | null
  routeQueue?: GemmaTrainingRouteQueueEntry | null
  routeQueueDisplayStatus?: GemmaTrainingRouteQueueDisplayStatus | null
  routeQueueSummary?: string | null
}

const GIB = 1024 ** 3
const GEMMA_ROUTE_SECRET_FILE = join('.openjaws', 'gemma-route-secret')
const GEMMA_ROUTE_QUEUE_LOCK_FILE = '.route-queue.lock'
const DEFAULT_GEMMA_ROUTE_QUEUE_LEASE_MS = 45_000
const GEMMA_ROUTE_QUEUE_LOCK_OPTIONS = {
  realpath: false,
} as const
const GEMMA_ROUTE_QUEUE_LOCK_WAIT_MS = 25
const GEMMA_ROUTE_QUEUE_LOCK_TIMEOUT_MS = 2_500

function hashGemmaRoutePayload(payload: string): string {
  return createHash('sha256').update(payload).digest('hex')
}

function normalizeGemmaRouteRelativePath(path: string): string {
  return path.replaceAll('\\', '/')
}

function inferGemmaModelBytes(baseModel: string): number | null {
  const normalized = baseModel.toLowerCase()
  if (normalized.includes('gemma-4-e2b')) {
    return 10 * GIB
  }
  if (normalized.includes('gemma-4-e4b')) {
    return 16 * GIB
  }
  if (normalized.includes('gemma-4-26b')) {
    return 28 * GIB
  }
  if (normalized.includes('gemma-4-31b')) {
    return 33 * GIB
  }
  return null
}

function formatBytesCompact(bytes: number): string {
  const gib = bytes / GIB
  return `${gib.toFixed(gib >= 10 ? 0 : 1)} GiB`
}

function getGemmaCacheRepoDir(
  baseModel: string,
  homeDir: string = homedir(),
): string {
  return join(
    homeDir,
    '.cache',
    'huggingface',
    'hub',
    `models--${baseModel.replaceAll('/', '--')}`,
  )
}

export function getCachedGemmaModelInfo(
  baseModel: string,
  options?: {
    homeDir?: string
  },
): {
  modelPath: string | null
  modelBytes: number | null
} {
  const repoDir = getGemmaCacheRepoDir(baseModel, options?.homeDir)
  const snapshotsDir = join(repoDir, 'snapshots')
  if (!existsSync(snapshotsDir)) {
    return { modelPath: null, modelBytes: null }
  }

  const snapshotNames = readdirSync(snapshotsDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort()
    .reverse()

  for (const snapshotName of snapshotNames) {
    const snapshotDir = join(snapshotsDir, snapshotName)
    const directModel = join(snapshotDir, 'model.safetensors')
    if (existsSync(directModel)) {
      return {
        modelPath: directModel,
        modelBytes: statSync(directModel).size,
      }
    }

    const shardFiles = readdirSync(snapshotDir)
      .filter(name => /^model-\d{5}-of-\d{5}\.safetensors$/i.test(name))
      .map(name => join(snapshotDir, name))
      .filter(path => existsSync(path))

    if (shardFiles.length > 0) {
      return {
        modelPath: snapshotDir,
        modelBytes: shardFiles.reduce(
          (total, path) => total + statSync(path).size,
          0,
        ),
      }
    }
  }

  return { modelPath: null, modelBytes: null }
}

function estimateRequiredAvailableMemoryBytes(
  modelBytes: number,
  useCpu: boolean,
): number {
  if (!useCpu) {
    return modelBytes
  }
  return Math.ceil(modelBytes * 1.15 + 1.5 * GIB)
}

export function evaluateGemmaTrainingPreflight(options: {
  baseModel: string
  trainFile: string
  pythonPath?: string | null
  useCpu: boolean
  availableMemoryBytes?: number
  totalMemoryBytes?: number
  modelBytes?: number | null
  cachedModelPath?: string | null
  homeDir?: string
}): GemmaTrainingPreflight {
  if (options.pythonPath && !existsSync(options.pythonPath)) {
    return {
      decision: 'preflight_blocked',
      reasonCode: 'missing_python',
      summary: `Python runtime not found at ${options.pythonPath}`,
      baseModel: options.baseModel,
      useCpu: options.useCpu,
    }
  }

  if (!existsSync(options.trainFile)) {
    return {
      decision: 'preflight_blocked',
      reasonCode: 'missing_train_file',
      summary: `Training split not found at ${options.trainFile}`,
      baseModel: options.baseModel,
      useCpu: options.useCpu,
    }
  }

  const cachedModelInfo =
    options.cachedModelPath !== undefined || options.modelBytes !== undefined
      ? {
          modelPath: options.cachedModelPath ?? null,
          modelBytes: options.modelBytes ?? null,
        }
      : getCachedGemmaModelInfo(options.baseModel, {
          homeDir: options.homeDir,
        })
  const modelBytes =
    cachedModelInfo.modelBytes ?? inferGemmaModelBytes(options.baseModel)
  const observedAvailableMemoryBytes =
    options.availableMemoryBytes ?? freemem()
  const observedTotalMemoryBytes = options.totalMemoryBytes ?? totalmem()

  if (!options.useCpu) {
    return {
      decision: 'allow_local',
      reasonCode: 'gpu_path_not_profiled',
      summary: 'GPU launch path is not memory-profiled; local launch allowed',
      baseModel: options.baseModel,
      useCpu: options.useCpu,
      cachedModelPath: cachedModelInfo.modelPath,
      modelBytes,
      observedAvailableMemoryBytes,
      observedTotalMemoryBytes,
    }
  }

  if (modelBytes !== null) {
    const requiredAvailableMemoryBytes =
      estimateRequiredAvailableMemoryBytes(modelBytes, options.useCpu)
    if (
      observedAvailableMemoryBytes < requiredAvailableMemoryBytes ||
      observedTotalMemoryBytes < modelBytes
    ) {
      return {
        decision: 'remote_required',
        reasonCode: 'insufficient_host_memory',
        summary: `Local host memory too tight for ${options.baseModel}: available ${formatBytesCompact(observedAvailableMemoryBytes)} / total ${formatBytesCompact(observedTotalMemoryBytes)}; need about ${formatBytesCompact(requiredAvailableMemoryBytes)} available. Use a remote box or free memory first.`,
        baseModel: options.baseModel,
        useCpu: options.useCpu,
        cachedModelPath: cachedModelInfo.modelPath,
        modelBytes,
        requiredAvailableMemoryBytes,
        observedAvailableMemoryBytes,
        observedTotalMemoryBytes,
      }
    }

    return {
      decision: 'allow_local',
      reasonCode: 'ok',
      summary: `Local host memory looks sufficient for ${options.baseModel}: available ${formatBytesCompact(observedAvailableMemoryBytes)} / required about ${formatBytesCompact(requiredAvailableMemoryBytes)}.`,
      baseModel: options.baseModel,
      useCpu: options.useCpu,
      cachedModelPath: cachedModelInfo.modelPath,
      modelBytes,
      requiredAvailableMemoryBytes,
      observedAvailableMemoryBytes,
      observedTotalMemoryBytes,
    }
  }

  return {
    decision: 'allow_local',
    reasonCode: 'ok',
    summary: `Local preflight could not size ${options.baseModel}; launch allowed without a memory gate.`,
    baseModel: options.baseModel,
    useCpu: options.useCpu,
    cachedModelPath: cachedModelInfo.modelPath,
    modelBytes: null,
    observedAvailableMemoryBytes,
    observedTotalMemoryBytes,
  }
}

export function computeGemmaTrainingFileIntegrity(
  path: string,
): GemmaTrainingFileIntegrity {
  const content = readFileSync(path)
  return {
    path,
    bytes: content.byteLength,
    sha256: createHash('sha256').update(content).digest('hex'),
  }
}

export function relativizeGemmaTrainingFileIntegrity(
  integrity: GemmaTrainingFileIntegrity,
  rootDir: string,
): GemmaTrainingFileIntegrity {
  return {
    ...integrity,
    path: normalizeGemmaRouteRelativePath(relative(rootDir, integrity.path)),
  }
}

export function resolveGemmaTrainingRoutePath(
  manifestDir: string,
  routePath: string,
): string {
  return resolve(manifestDir, routePath)
}

export function stageGemmaTrainingRouteFile(args: {
  sourcePath: string
  manifestDir: string
  relativePath: string
}): GemmaTrainingFileIntegrity {
  const destinationPath = resolveGemmaTrainingRoutePath(
    args.manifestDir,
    args.relativePath,
  )
  mkdirSync(dirname(destinationPath), { recursive: true })
  copyFileSync(args.sourcePath, destinationPath)
  return relativizeGemmaTrainingFileIntegrity(
    computeGemmaTrainingFileIntegrity(destinationPath),
    args.manifestDir,
  )
}

export function getGemmaTrainingRouteSecret(options?: {
  homeDir?: string
  env?: NodeJS.ProcessEnv
  createIfMissing?: boolean
}): {
  secret: string
  source: GemmaTrainingRouteSecretSource
  path?: string
} | null {
  const env = options?.env ?? process.env
  const envSecret = env.OPENJAWS_GEMMA_ROUTE_SECRET?.trim()
  if (envSecret) {
    return {
      secret: envSecret,
      source: 'OPENJAWS_GEMMA_ROUTE_SECRET',
    }
  }

  const secretPath = join(options?.homeDir ?? homedir(), GEMMA_ROUTE_SECRET_FILE)
  if (existsSync(secretPath)) {
    const fileSecret = readFileSync(secretPath, 'utf8').trim()
    if (fileSecret) {
      return {
        secret: fileSecret,
        source: '~/.openjaws/gemma-route-secret',
        path: secretPath,
      }
    }
  }

  if (options?.createIfMissing === false) {
    return null
  }

  mkdirSync(dirname(secretPath), { recursive: true })
  const generatedSecret = randomBytes(32).toString('base64url')
  writeFileSync(secretPath, `${generatedSecret}\n`, 'utf8')
  return {
    secret: generatedSecret,
    source: '~/.openjaws/gemma-route-secret',
    path: secretPath,
  }
}

function buildGemmaTrainingRouteUnsignedPayload(args: {
  runId: string
  routeRequest: GemmaTrainingRouteRequest
  training: GemmaTrainingRouteManifestTraining
  preflight: GemmaTrainingPreflight
}): Omit<GemmaTrainingRouteManifest, 'security'> {
  return {
    runId: args.runId,
    routeRequest: {
      route: args.routeRequest.route,
      requestedAt: args.routeRequest.requestedAt,
      target: args.routeRequest.target ?? null,
      recommendedLayerId: args.routeRequest.recommendedLayerId ?? null,
      manifestPath: args.routeRequest.manifestPath,
      controlStatus: args.routeRequest.controlStatus ?? null,
      controlAccepted: args.routeRequest.controlAccepted ?? null,
      controlSummary: args.routeRequest.controlSummary ?? null,
      harnessSnapshot: args.routeRequest.harnessSnapshot ?? null,
      integrity: args.routeRequest.integrity ?? null,
    },
    training: {
      baseModel: args.training.baseModel,
      runName: args.training.runName,
      trainFile: args.training.trainFile,
      evalFile: args.training.evalFile,
      selectedTags: [...args.training.selectedTags],
      selectedLanguages: [...args.training.selectedLanguages],
      outputDir: args.training.outputDir,
      useCpu: args.training.useCpu,
      maxSteps: args.training.maxSteps ?? null,
      numTrainEpochs: args.training.numTrainEpochs ?? null,
    },
    preflight: {
      ...args.preflight,
    },
  }
}

function buildGemmaTrainingRouteDispatchFiles(args: {
  manifest: GemmaTrainingRouteManifest
  manifestDir: string
}): GemmaTrainingRouteDispatchFile[] {
  const files = [
    args.manifest.routeRequest.integrity?.trainFile.path ??
      args.manifest.training.trainFile,
    args.manifest.routeRequest.integrity?.evalFile?.path ??
      args.manifest.training.evalFile,
  ]
    .filter((path): path is string => Boolean(path))
    .map(path => normalizeGemmaRouteRelativePath(path))

  const uniquePaths = [...new Set(files)]
  return uniquePaths.map(path => {
    const absolutePath = resolveGemmaTrainingRoutePath(args.manifestDir, path)
    const content = readFileSync(absolutePath)
    return {
      path,
      bytes: content.byteLength,
      sha256: createHash('sha256').update(content).digest('hex'),
      contentBase64: content.toString('base64'),
    }
  })
}

function buildGemmaTrainingRouteDispatchUnsignedPayload(args: {
  manifest: GemmaTrainingRouteManifest
  manifestPath: string
  manifestDir: string
  workerId: string
  executionMode: GemmaTrainingExecutionMode
  dispatchedAt: string
}): GemmaTrainingRouteDispatchPayload {
  return {
    runId: args.manifest.runId,
    manifestPath: normalizeGemmaRouteRelativePath(
      relative(args.manifestDir, args.manifestPath),
    ),
    workerId: args.workerId,
    executionMode: args.executionMode,
    dispatchedAt: args.dispatchedAt,
    manifest: args.manifest,
    files: buildGemmaTrainingRouteDispatchFiles({
      manifest: args.manifest,
      manifestDir: args.manifestDir,
    }),
  }
}

function buildGemmaTrainingRouteResultUnsignedPayload(args: {
  runId: string
  manifestPath: string
  workerId: string
  executionId: string | null
  executionMode: GemmaTrainingExecutionMode
  finishedAt: string
  status: GemmaTrainingRouteResultStatus
  summary?: string | null
  stateUrl?: string | null
  runState: Partial<GemmaRunState> & {
    status: GemmaTrainingRouteResultStatus
    finishedAt: string
  }
  runSummary?: Record<string, unknown> | null
  metricsSummary?: Record<string, unknown> | null
}): GemmaTrainingRouteResultPayload {
  return {
    runId: args.runId,
    manifestPath: normalizeGemmaRouteRelativePath(args.manifestPath),
    workerId: args.workerId,
    executionId: args.executionId ?? null,
    executionMode: args.executionMode,
    finishedAt: args.finishedAt,
    status: args.status,
    summary: args.summary ?? null,
    stateUrl: args.stateUrl ?? null,
    runState: {
      ...args.runState,
      status: args.status,
      finishedAt: args.finishedAt,
    },
    runSummary: args.runSummary ?? null,
    metricsSummary: args.metricsSummary ?? null,
  }
}

export function buildGemmaTrainingRouteManifest(args: {
  runId: string
  routeRequest: GemmaTrainingRouteRequest
  training: GemmaTrainingRouteManifestTraining
  preflight: GemmaTrainingPreflight
  homeDir?: string
  env?: NodeJS.ProcessEnv
}): GemmaTrainingRouteManifest {
  const unsignedPayload = buildGemmaTrainingRouteUnsignedPayload(args)
  const payloadJson = JSON.stringify(unsignedPayload)
  const payloadSha256 = hashGemmaRoutePayload(payloadJson)
  const routeSecret = getGemmaTrainingRouteSecret({
    homeDir: args.homeDir,
    env: args.env,
    createIfMissing: true,
  })
  const security = routeSecret
    ? {
        algorithm: 'hmac-sha256' as const,
        payloadSha256,
        signature: createHmac('sha256', routeSecret.secret)
          .update(payloadJson)
          .digest('hex'),
        signedAt: args.routeRequest.requestedAt,
        secretSource: routeSecret.source,
      }
    : null
  return {
    ...unsignedPayload,
    security,
  }
}

export function buildGemmaTrainingRouteDispatchEnvelope(args: {
  manifest: GemmaTrainingRouteManifest
  manifestPath: string
  manifestDir: string
  workerId: string
  executionMode: GemmaTrainingExecutionMode
  dispatchedAt: string
  homeDir?: string
  env?: NodeJS.ProcessEnv
}): GemmaTrainingRouteDispatchEnvelope {
  const payload = buildGemmaTrainingRouteDispatchUnsignedPayload(args)
  const payloadJson = JSON.stringify(payload)
  const payloadSha256 = hashGemmaRoutePayload(payloadJson)
  const routeSecret = getGemmaTrainingRouteSecret({
    homeDir: args.homeDir,
    env: args.env,
    createIfMissing: true,
  })
  const security = routeSecret
    ? {
        algorithm: 'hmac-sha256' as const,
        payloadSha256,
        signature: createHmac('sha256', routeSecret.secret)
          .update(payloadJson)
          .digest('hex'),
        signedAt: args.dispatchedAt,
        secretSource: routeSecret.source,
      }
    : null
  return {
    payload,
    security,
  }
}

export function buildGemmaTrainingRouteResultEnvelope(args: {
  runId: string
  manifestPath: string
  workerId: string
  executionId: string | null
  executionMode: GemmaTrainingExecutionMode
  finishedAt: string
  status: GemmaTrainingRouteResultStatus
  summary?: string | null
  stateUrl?: string | null
  runState: Partial<GemmaRunState> & {
    status: GemmaTrainingRouteResultStatus
    finishedAt: string
  }
  runSummary?: Record<string, unknown> | null
  metricsSummary?: Record<string, unknown> | null
  homeDir?: string
  env?: NodeJS.ProcessEnv
}): GemmaTrainingRouteResultEnvelope {
  const payload = buildGemmaTrainingRouteResultUnsignedPayload(args)
  const payloadJson = JSON.stringify(payload)
  const payloadSha256 = hashGemmaRoutePayload(payloadJson)
  const routeSecret = getGemmaTrainingRouteSecret({
    homeDir: args.homeDir,
    env: args.env,
    createIfMissing: true,
  })
  const security = routeSecret
    ? {
        algorithm: 'hmac-sha256' as const,
        payloadSha256,
        signature: createHmac('sha256', routeSecret.secret)
          .update(payloadJson)
          .digest('hex'),
        signedAt: args.finishedAt,
        secretSource: routeSecret.source,
      }
    : null
  return {
    payload,
    security,
  }
}

export function verifyGemmaTrainingRouteManifest(
  manifest: GemmaTrainingRouteManifest,
  options?: {
    homeDir?: string
    env?: NodeJS.ProcessEnv
    secret?: string
  },
): {
  valid: boolean
  reason:
    | 'ok'
    | 'missing_security'
    | 'missing_secret'
    | 'payload_mismatch'
    | 'signature_mismatch'
  payloadSha256: string
  expectedPayloadSha256: string | null
  actualSignature: string | null
  expectedSignature: string | null
  secretSource?: GemmaTrainingRouteSecretSource
} {
  const unsignedPayload = buildGemmaTrainingRouteUnsignedPayload({
    runId: manifest.runId,
    routeRequest: manifest.routeRequest,
    training: manifest.training,
    preflight: manifest.preflight,
  })
  const payloadJson = JSON.stringify(unsignedPayload)
  const payloadSha256 = hashGemmaRoutePayload(payloadJson)
  if (!manifest.security) {
    return {
      valid: false,
      reason: 'missing_security',
      payloadSha256,
      expectedPayloadSha256: null,
      actualSignature: null,
      expectedSignature: null,
    }
  }
  if (payloadSha256 !== manifest.security.payloadSha256) {
    return {
      valid: false,
      reason: 'payload_mismatch',
      payloadSha256,
      expectedPayloadSha256: manifest.security.payloadSha256,
      actualSignature: manifest.security.signature,
      expectedSignature: null,
      secretSource: manifest.security.secretSource,
    }
  }
  const routeSecret =
    options?.secret
      ? {
          secret: options.secret,
          source: manifest.security.secretSource,
        }
      : getGemmaTrainingRouteSecret({
          homeDir: options?.homeDir,
          env: options?.env,
          createIfMissing: false,
        })
  if (!routeSecret) {
    return {
      valid: false,
      reason: 'missing_secret',
      payloadSha256,
      expectedPayloadSha256: manifest.security.payloadSha256,
      actualSignature: manifest.security.signature,
      expectedSignature: null,
      secretSource: manifest.security.secretSource,
    }
  }
  const expectedSignature = createHmac('sha256', routeSecret.secret)
    .update(payloadJson)
    .digest('hex')
  return {
    valid: expectedSignature === manifest.security.signature,
    reason:
      expectedSignature === manifest.security.signature
        ? 'ok'
        : 'signature_mismatch',
    payloadSha256,
    expectedPayloadSha256: manifest.security.payloadSha256,
    actualSignature: manifest.security.signature,
    expectedSignature,
    secretSource: routeSecret.source,
  }
}

export function verifyGemmaTrainingRouteDispatchEnvelope(
  envelope: GemmaTrainingRouteDispatchEnvelope,
  options?: {
    homeDir?: string
    env?: NodeJS.ProcessEnv
    secret?: string
  },
): {
  valid: boolean
  reason:
    | 'ok'
    | 'missing_security'
    | 'missing_secret'
    | 'payload_mismatch'
    | 'signature_mismatch'
    | 'file_sha256_mismatch'
    | 'manifest_integrity_mismatch'
  payloadSha256: string
  expectedPayloadSha256: string | null
  actualSignature: string | null
  expectedSignature: string | null
  fileMismatches: Array<{
    path: string
    expectedSha256: string
    actualSha256: string
  }>
  manifestMismatches: Array<{
    path: string
    expectedSha256: string
    actualSha256: string
  }>
  secretSource?: GemmaTrainingRouteSecretSource
} {
  const payloadJson = JSON.stringify(envelope.payload)
  const payloadSha256 = hashGemmaRoutePayload(payloadJson)
  if (!envelope.security) {
    return {
      valid: false,
      reason: 'missing_security',
      payloadSha256,
      expectedPayloadSha256: null,
      actualSignature: null,
      expectedSignature: null,
      fileMismatches: [],
      manifestMismatches: [],
    }
  }
  if (payloadSha256 !== envelope.security.payloadSha256) {
    return {
      valid: false,
      reason: 'payload_mismatch',
      payloadSha256,
      expectedPayloadSha256: envelope.security.payloadSha256,
      actualSignature: envelope.security.signature,
      expectedSignature: null,
      fileMismatches: [],
      manifestMismatches: [],
      secretSource: envelope.security.secretSource,
    }
  }
  const routeSecret =
    options?.secret
      ? {
          secret: options.secret,
          source: envelope.security.secretSource,
        }
      : getGemmaTrainingRouteSecret({
          homeDir: options?.homeDir,
          env: options?.env,
          createIfMissing: false,
        })
  if (!routeSecret) {
    return {
      valid: false,
      reason: 'missing_secret',
      payloadSha256,
      expectedPayloadSha256: envelope.security.payloadSha256,
      actualSignature: envelope.security.signature,
      expectedSignature: null,
      fileMismatches: [],
      manifestMismatches: [],
      secretSource: envelope.security.secretSource,
    }
  }
  const expectedSignature = createHmac('sha256', routeSecret.secret)
    .update(payloadJson)
    .digest('hex')
  if (expectedSignature !== envelope.security.signature) {
    return {
      valid: false,
      reason: 'signature_mismatch',
      payloadSha256,
      expectedPayloadSha256: envelope.security.payloadSha256,
      actualSignature: envelope.security.signature,
      expectedSignature,
      fileMismatches: [],
      manifestMismatches: [],
      secretSource: routeSecret.source,
    }
  }

  const fileMismatches = envelope.payload.files
    .map(file => {
      const actualSha256 = createHash('sha256')
        .update(Buffer.from(file.contentBase64, 'base64'))
        .digest('hex')
      return actualSha256 === file.sha256
        ? null
        : {
            path: file.path,
            expectedSha256: file.sha256,
            actualSha256,
          }
    })
    .filter(
      (
        mismatch,
      ): mismatch is {
        path: string
        expectedSha256: string
        actualSha256: string
      } => mismatch !== null,
    )
  if (fileMismatches.length > 0) {
    return {
      valid: false,
      reason: 'file_sha256_mismatch',
      payloadSha256,
      expectedPayloadSha256: envelope.security.payloadSha256,
      actualSignature: envelope.security.signature,
      expectedSignature,
      fileMismatches,
      manifestMismatches: [],
      secretSource: routeSecret.source,
    }
  }

  const manifestIntegrity = envelope.payload.manifest.routeRequest.integrity
  const manifestMismatches = [
    manifestIntegrity?.trainFile
      ? {
          path: normalizeGemmaRouteRelativePath(manifestIntegrity.trainFile.path),
          expectedSha256: manifestIntegrity.trainFile.sha256,
        }
      : null,
    manifestIntegrity?.evalFile
      ? {
          path: normalizeGemmaRouteRelativePath(manifestIntegrity.evalFile.path),
          expectedSha256: manifestIntegrity.evalFile.sha256,
        }
      : null,
  ]
    .filter(
      (
        expected,
      ): expected is {
        path: string
        expectedSha256: string
      } => expected !== null,
    )
    .map(expected => {
      const file = envelope.payload.files.find(
        candidate =>
          normalizeGemmaRouteRelativePath(candidate.path) === expected.path,
      )
      if (!file || file.sha256 !== expected.expectedSha256) {
        return {
          path: expected.path,
          expectedSha256: expected.expectedSha256,
          actualSha256: file?.sha256 ?? 'missing',
        }
      }
      return null
    })
    .filter(
      (
        mismatch,
      ): mismatch is {
        path: string
        expectedSha256: string
        actualSha256: string
      } => mismatch !== null,
    )
  if (manifestMismatches.length > 0) {
    return {
      valid: false,
      reason: 'manifest_integrity_mismatch',
      payloadSha256,
      expectedPayloadSha256: envelope.security.payloadSha256,
      actualSignature: envelope.security.signature,
      expectedSignature,
      fileMismatches: [],
      manifestMismatches,
      secretSource: routeSecret.source,
    }
  }

  return {
    valid: true,
    reason: 'ok',
    payloadSha256,
    expectedPayloadSha256: envelope.security.payloadSha256,
    actualSignature: envelope.security.signature,
    expectedSignature,
    fileMismatches: [],
    manifestMismatches: [],
    secretSource: routeSecret.source,
  }
}

export function verifyGemmaTrainingRouteResultEnvelope(
  envelope: GemmaTrainingRouteResultEnvelope,
  options?: {
    homeDir?: string
    env?: NodeJS.ProcessEnv
    secret?: string
  },
): {
  valid: boolean
  reason:
    | 'ok'
    | 'missing_security'
    | 'missing_secret'
    | 'payload_mismatch'
    | 'signature_mismatch'
  payloadSha256: string
  expectedPayloadSha256: string | null
  actualSignature: string | null
  expectedSignature: string | null
  secretSource?: GemmaTrainingRouteSecretSource
} {
  const payloadJson = JSON.stringify(envelope.payload)
  const payloadSha256 = hashGemmaRoutePayload(payloadJson)
  if (!envelope.security) {
    return {
      valid: false,
      reason: 'missing_security',
      payloadSha256,
      expectedPayloadSha256: null,
      actualSignature: null,
      expectedSignature: null,
    }
  }
  if (payloadSha256 !== envelope.security.payloadSha256) {
    return {
      valid: false,
      reason: 'payload_mismatch',
      payloadSha256,
      expectedPayloadSha256: envelope.security.payloadSha256,
      actualSignature: envelope.security.signature,
      expectedSignature: null,
      secretSource: envelope.security.secretSource,
    }
  }
  const routeSecret =
    options?.secret
      ? {
          secret: options.secret,
          source: envelope.security.secretSource,
        }
      : getGemmaTrainingRouteSecret({
          homeDir: options?.homeDir,
          env: options?.env,
          createIfMissing: false,
        })
  if (!routeSecret) {
    return {
      valid: false,
      reason: 'missing_secret',
      payloadSha256,
      expectedPayloadSha256: envelope.security.payloadSha256,
      actualSignature: envelope.security.signature,
      expectedSignature: null,
      secretSource: envelope.security.secretSource,
    }
  }
  const expectedSignature = createHmac('sha256', routeSecret.secret)
    .update(payloadJson)
    .digest('hex')
  return {
    valid: expectedSignature === envelope.security.signature,
    reason:
      expectedSignature === envelope.security.signature
        ? 'ok'
        : 'signature_mismatch',
    payloadSha256,
    expectedPayloadSha256: envelope.security.payloadSha256,
    actualSignature: envelope.security.signature,
    expectedSignature,
    secretSource: routeSecret.source,
  }
}

export function verifyGemmaTrainingRouteManifestIntegrity(
  manifest: GemmaTrainingRouteManifest,
  manifestDir: string,
): {
  valid: boolean
  trainPath: string
  trainActualSha256: string
  trainExpectedSha256: string
  evalPath: string | null
  evalActualSha256: string | null
  evalExpectedSha256: string | null
} {
  const trainPath = resolveGemmaTrainingRoutePath(
    manifestDir,
    manifest.routeRequest.integrity?.trainFile.path ?? manifest.training.trainFile,
  )
  const trainActualSha256 = computeGemmaTrainingFileIntegrity(trainPath).sha256
  const trainExpectedSha256 =
    manifest.routeRequest.integrity?.trainFile.sha256 ?? ''

  const evalIntegrity = manifest.routeRequest.integrity?.evalFile
  const evalPath = evalIntegrity
    ? resolveGemmaTrainingRoutePath(manifestDir, evalIntegrity.path)
    : null
  const evalActualSha256 = evalPath
    ? computeGemmaTrainingFileIntegrity(evalPath).sha256
    : null
  const evalExpectedSha256 = evalIntegrity?.sha256 ?? null

  return {
    valid:
      trainActualSha256 === trainExpectedSha256 &&
      (evalExpectedSha256 === null || evalActualSha256 === evalExpectedSha256),
    trainPath,
    trainActualSha256,
    trainExpectedSha256,
    evalPath,
    evalActualSha256,
    evalExpectedSha256,
  }
}

export function readGemmaTrainingRouteManifest(
  manifestPath: string,
): GemmaTrainingRouteManifest {
  return JSON.parse(readFileSync(manifestPath, 'utf8')) as GemmaTrainingRouteManifest
}

function readJsonIfExists<T>(path: string): T | null {
  if (!existsSync(path)) {
    return null
  }
  return JSON.parse(readFileSync(path, 'utf8')) as T
}

export function getGemmaTrainingRunsDir(root = process.cwd()): string {
  return resolve(root, 'artifacts', 'gemma4-runs')
}

export function getGemmaTrainingRegistryPath(root = process.cwd()): string {
  return join(getGemmaTrainingRunsDir(root), 'registry.json')
}

export function getGemmaTrainingRouteQueuePath(root = process.cwd()): string {
  return join(getGemmaTrainingRunsDir(root), 'route-queue.json')
}

export function getGemmaTrainingRouteWorkersPath(root = process.cwd()): string {
  return join(getGemmaTrainingRunsDir(root), 'route-workers.json')
}

export function getGemmaTrainingRouteWorkerRuntimePath(
  root = process.cwd(),
): string {
  return join(getGemmaTrainingRunsDir(root), 'route-worker-runtime.json')
}

function getGemmaTrainingRouteQueueLockPath(root = process.cwd()): string {
  return join(getGemmaTrainingRunsDir(root), GEMMA_ROUTE_QUEUE_LOCK_FILE)
}

function ensureGemmaTrainingRouteQueueLockFile(root = process.cwd()): string {
  const lockPath = getGemmaTrainingRouteQueueLockPath(root)
  mkdirSync(getGemmaTrainingRunsDir(root), { recursive: true })
  if (!existsSync(lockPath)) {
    writeFileSync(lockPath, '', 'utf8')
  }
  return lockPath
}

function withGemmaTrainingRouteQueueLock<T>(
  root: string,
  fn: () => T,
): T {
  const lockPath = ensureGemmaTrainingRouteQueueLockFile(root)
  const deadline = Date.now() + GEMMA_ROUTE_QUEUE_LOCK_TIMEOUT_MS

  while (true) {
    try {
      const release = lockfile.lockSync(lockPath, GEMMA_ROUTE_QUEUE_LOCK_OPTIONS)
      try {
        return fn()
      } finally {
        release()
      }
    } catch (error) {
      const code =
        typeof error === 'object' && error !== null && 'code' in error
          ? String((error as { code?: string }).code)
          : null
      if (code !== 'ELOCKED' || Date.now() >= deadline) {
        throw error
      }
      Atomics.wait(
        new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)),
        0,
        0,
        GEMMA_ROUTE_QUEUE_LOCK_WAIT_MS,
      )
    }
  }
}

function readGemmaTrainingRouteQueueUnlocked(
  root = process.cwd(),
): GemmaTrainingRouteQueueEntry[] {
  return readJsonIfExists<GemmaTrainingRouteQueueEntry[]>(
    getGemmaTrainingRouteQueuePath(root),
  ) ?? []
}

function readGemmaTrainingRouteWorkersUnlocked(
  root = process.cwd(),
): GemmaTrainingRouteWorkerRegistration[] {
  return readJsonIfExists<GemmaTrainingRouteWorkerRegistration[]>(
    getGemmaTrainingRouteWorkersPath(root),
  ) ?? []
}

function readGemmaTrainingRouteWorkerRuntimeUnlocked(
  root = process.cwd(),
): GemmaTrainingRouteWorkerRuntimeEntry[] {
  return readJsonIfExists<GemmaTrainingRouteWorkerRuntimeEntry[]>(
    getGemmaTrainingRouteWorkerRuntimePath(root),
  ) ?? []
}

function writeGemmaTrainingRouteQueueUnlocked(
  entries: GemmaTrainingRouteQueueEntry[],
  root = process.cwd(),
): void {
  const path = getGemmaTrainingRouteQueuePath(root)
  mkdirSync(getGemmaTrainingRunsDir(root), { recursive: true })
  writeFileSync(path, `${JSON.stringify(entries, null, 2)}\n`, 'utf8')
}

function writeGemmaTrainingRouteWorkersUnlocked(
  entries: GemmaTrainingRouteWorkerRegistration[],
  root = process.cwd(),
): void {
  const path = getGemmaTrainingRouteWorkersPath(root)
  mkdirSync(getGemmaTrainingRunsDir(root), { recursive: true })
  writeFileSync(path, `${JSON.stringify(entries, null, 2)}\n`, 'utf8')
}

function writeGemmaTrainingRouteWorkerRuntimeUnlocked(
  entries: GemmaTrainingRouteWorkerRuntimeEntry[],
  root = process.cwd(),
): void {
  const path = getGemmaTrainingRouteWorkerRuntimePath(root)
  mkdirSync(getGemmaTrainingRunsDir(root), { recursive: true })
  writeFileSync(path, `${JSON.stringify(entries, null, 2)}\n`, 'utf8')
}

function sortGemmaTrainingRouteQueueEntries(
  entries: GemmaTrainingRouteQueueEntry[],
): GemmaTrainingRouteQueueEntry[] {
  return [...entries].sort((left, right) =>
    left.queuedAt < right.queuedAt ? -1 : left.queuedAt > right.queuedAt ? 1 : 0,
  )
}

function sortGemmaTrainingRouteWorkers(
  workers: GemmaTrainingRouteWorkerRegistration[],
): GemmaTrainingRouteWorkerRegistration[] {
  return [...workers].sort((left, right) =>
    left.workerId < right.workerId ? -1 : left.workerId > right.workerId ? 1 : 0,
  )
}

function sortGemmaTrainingRouteWorkerRuntime(
  entries: GemmaTrainingRouteWorkerRuntimeEntry[],
): GemmaTrainingRouteWorkerRuntimeEntry[] {
  return [...entries].sort((left, right) =>
    left.workerId < right.workerId ? -1 : left.workerId > right.workerId ? 1 : 0,
  )
}

function addMsToIsoTimestamp(timestamp: string, ttlMs: number): string {
  return new Date(Date.parse(timestamp) + ttlMs).toISOString()
}

export function isGemmaTrainingRouteQueueClaimExpired(
  entry: GemmaTrainingRouteQueueEntry,
  now = new Date().toISOString(),
): boolean {
  return (
    entry.status === 'claimed' &&
    !entry.dispatch &&
    !!entry.claim?.leaseExpiresAt &&
    entry.claim.leaseExpiresAt <= now
  )
}

export function isGemmaTrainingRouteQueuePendingAssignment(
  entry: GemmaTrainingRouteQueueEntry | null | undefined,
): boolean {
  return Boolean(
    entry &&
      entry.status === 'queued' &&
      entry.assignmentAuthority === 'immaculate' &&
      !entry.assignment?.workerId &&
      !entry.claim?.workerId &&
      !entry.dispatch,
  )
}

export function isGemmaTrainingRouteQueuePendingRemoteResult(
  entry: GemmaTrainingRouteQueueEntry | null | undefined,
  workerId?: string | null,
): boolean {
  if (
    !entry ||
    entry.status !== 'dispatched' ||
    entry.dispatch?.transport !== 'remote_http' ||
    !entry.dispatch.remoteStateUrl ||
    !!entry.dispatch.remoteCompletionStatus
  ) {
    return false
  }
  if (!workerId) {
    return true
  }
  return (
    entry.dispatch.workerId === workerId || entry.assignment?.workerId === workerId
  )
}

export function getGemmaTrainingRouteQueueDisplayStatus(
  entry: GemmaTrainingRouteQueueEntry | null | undefined,
): GemmaTrainingRouteQueueDisplayStatus | null {
  if (!entry) {
    return null
  }
  if (isGemmaTrainingRouteQueuePendingAssignment(entry)) {
    return 'pending_assignment'
  }
  return entry.status
}

export function getGemmaTrainingRouteQueueStatusSummary(
  entry: GemmaTrainingRouteQueueEntry | null | undefined,
): string {
  const displayStatus = getGemmaTrainingRouteQueueDisplayStatus(entry)
  switch (displayStatus) {
    case 'pending_assignment':
      return 'pending assignment'
    case 'claimed':
      return 'claimed'
    case 'dispatched':
      return 'dispatched'
    case 'completed':
      return 'completed'
    case 'failed':
      return 'failed'
    case 'rejected':
      return 'rejected'
    case 'queued':
      return 'queued'
    default:
      return 'unknown'
  }
}

function formatGemmaTrainingWorkerCount(
  workerCount: number,
  compact: boolean,
): string {
  if (compact) {
    return `${workerCount}w`
  }
  return `${workerCount} worker${workerCount === 1 ? '' : 's'}`
}

export function buildGemmaTrainingRouteReceipt(args?: {
  snapshot?: ReturnType<typeof getLatestGemmaTrainingSnapshot> | null
  compact?: boolean
}): GemmaTrainingRouteReceipt | null {
  const snapshot = args?.snapshot ?? getLatestGemmaTrainingSnapshot()
  const compact = args?.compact === true
  if (!snapshot) {
    return null
  }

  const state = snapshot.state
  const routeQueue = state?.routeQueue ?? snapshot.routeQueue
  const routeRequest = state?.routeRequest ?? snapshot.registry.routeRequest ?? null
  if (!routeQueue && !routeRequest) {
    return null
  }

  const displayStatus =
    getGemmaTrainingRouteQueueDisplayStatus(routeQueue) ?? 'queued'
  const recommendedLayerId =
    routeQueue?.recommendedLayerId ?? routeRequest?.recommendedLayerId ?? null
  const workerCount = routeRequest?.harnessSnapshot?.workerCount ?? null
  const healthyWorkerCount =
    routeQueue?.healthyWorkerCount ??
    routeRequest?.harnessSnapshot?.healthyWorkerCount ??
    null
  const staleWorkerCount =
    routeQueue?.staleWorkerCount ??
    routeRequest?.harnessSnapshot?.staleWorkerCount ??
    null
  const faultedWorkerCount =
    routeQueue?.faultedWorkerCount ??
    routeRequest?.harnessSnapshot?.faultedWorkerCount ??
    null
  const assignedWorker =
    routeQueue?.assignment?.workerLabel ??
    routeQueue?.assignment?.workerId ??
    routeQueue?.claim?.workerId ??
    null

  const pushLayer = (parts: string[]) => {
    if (recommendedLayerId) {
      parts.push(compact ? recommendedLayerId : `layer ${recommendedLayerId}`)
    }
  }

  const pushWorkers = (parts: string[]) => {
    if (typeof workerCount === 'number') {
      parts.push(formatGemmaTrainingWorkerCount(workerCount, compact))
    }
  }

  switch (displayStatus) {
    case 'pending_assignment': {
      const parts = [compact ? 'gemma pending' : 'gemma pending assignment']
      pushLayer(parts)
      pushWorkers(parts)
      if (typeof healthyWorkerCount === 'number') {
        parts.push(compact ? `${healthyWorkerCount}h` : `${healthyWorkerCount} healthy`)
      }
      if (typeof staleWorkerCount === 'number' && staleWorkerCount > 0) {
        parts.push(compact ? `${staleWorkerCount}s` : `${staleWorkerCount} stale`)
      }
      if (typeof faultedWorkerCount === 'number' && faultedWorkerCount > 0) {
        parts.push(compact ? `${faultedWorkerCount}f` : `${faultedWorkerCount} faulted`)
      }
      return {
        displayStatus,
        text: parts.join(' · '),
        tone: 'warning',
      }
    }
    case 'claimed': {
      const parts = [compact ? 'gemma claimed' : 'gemma route claimed']
      if (assignedWorker) {
        parts.push(assignedWorker)
      }
      pushLayer(parts)
      return {
        displayStatus,
        text: parts.join(' · '),
        tone: 'suggestion',
      }
    }
    case 'dispatched': {
      const parts = [compact ? 'gemma routed' : 'gemma route dispatched']
      if (assignedWorker) {
        parts.push(assignedWorker)
      }
      if (routeQueue?.dispatch?.transport === 'remote_http') {
        parts.push(compact ? 'remote' : 'remote ack')
      }
      return {
        displayStatus,
        text: parts.join(' · '),
        tone: 'success',
      }
    }
    case 'completed': {
      const parts = [compact ? 'gemma done' : 'gemma route completed']
      if (assignedWorker) {
        parts.push(assignedWorker)
      }
      if (routeQueue?.dispatch?.remoteCompletionSummary) {
        parts.push(routeQueue.dispatch.remoteCompletionSummary)
      }
      return {
        displayStatus,
        text: parts.join(' · '),
        tone: 'success',
      }
    }
    case 'failed': {
      const parts = [compact ? 'gemma failed' : 'gemma route failed']
      if (assignedWorker) {
        parts.push(assignedWorker)
      }
      if (routeQueue?.dispatch?.remoteCompletionSummary) {
        parts.push(routeQueue.dispatch.remoteCompletionSummary)
      }
      return {
        displayStatus,
        text: parts.join(' · '),
        tone: 'error',
      }
    }
    case 'rejected':
      return {
        displayStatus,
        text: compact ? 'gemma rejected' : 'gemma route rejected',
        tone: 'error',
      }
    case 'queued': {
      const parts = [compact ? 'gemma queued' : 'gemma route queued']
      pushLayer(parts)
      return {
        displayStatus,
        text: parts.join(' · '),
        tone: 'suggestion',
      }
    }
    default:
      return null
  }
}

export function isGemmaTrainingRouteWorkerExpired(
  worker: GemmaTrainingRouteWorkerRegistration,
  now = new Date().toISOString(),
): boolean {
  return worker.leaseExpiresAt <= now
}

function normalizeGemmaTrainingRouteQueueClaims(
  entries: GemmaTrainingRouteQueueEntry[],
  now = new Date().toISOString(),
): { entries: GemmaTrainingRouteQueueEntry[]; changed: boolean } {
  let changed = false
  const normalized = entries.map(entry => {
    if (!isGemmaTrainingRouteQueueClaimExpired(entry, now)) {
      return entry
    }
    changed = true
    return {
      ...entry,
      status: 'queued' as const,
      updatedAt: now,
      claim: null,
      dispatch: null,
      rejectionReason: null,
    }
  })
  return {
    entries: normalized,
    changed,
  }
}

function normalizeGemmaTrainingRouteWorkers(
  workers: GemmaTrainingRouteWorkerRegistration[],
  now = new Date().toISOString(),
): { workers: GemmaTrainingRouteWorkerRegistration[]; changed: boolean } {
  const normalized = workers.filter(worker => !isGemmaTrainingRouteWorkerExpired(worker, now))
  return {
    workers: normalized,
    changed: normalized.length !== workers.length,
  }
}

function workerSupportsGemmaBaseModel(
  worker: GemmaTrainingRouteWorkerRegistration,
  baseModel?: string | null,
): boolean {
  if (!baseModel) {
    return true
  }
  if (worker.supportedBaseModels.length === 0) {
    return false
  }
  const normalizedBaseModel = baseModel.toLowerCase()
  return worker.supportedBaseModels.some(model => {
    const normalized = model.trim().toLowerCase()
    return normalized === '*' || normalized === normalizedBaseModel
  })
}

function selectGemmaTrainingRouteWorker(
  entry: GemmaTrainingRouteQueueEntry,
  workers: GemmaTrainingRouteWorkerRegistration[],
): {
  worker: GemmaTrainingRouteWorkerRegistration
  reason: string
} | null {
  const scored = workers
    .filter(worker => {
      if (
        entry.requestedExecutionDecision === 'remote_required' &&
        worker.executionProfile !== 'remote'
      ) {
        return false
      }
      return workerSupportsGemmaBaseModel(worker, entry.baseModel)
    })
    .map(worker => {
      let score = 0
      const reasons: string[] = []
      if (
        entry.requestedExecutionDecision === 'remote_required' &&
        worker.executionProfile === 'remote'
      ) {
        score += 4
        reasons.push('remote-capable')
      }
      if (
        entry.recommendedLayerId &&
        worker.preferredLayerIds.includes(entry.recommendedLayerId)
      ) {
        score += 6
        reasons.push(`layer ${entry.recommendedLayerId}`)
      }
      if (entry.baseModel && worker.supportedBaseModels.length > 0) {
        score += 2
        reasons.push(`model ${entry.baseModel}`)
      }
      if (worker.watch) {
        score += 1
        reasons.push('watch')
      }
      return {
        worker,
        score,
        reason:
          reasons.join(' · ') ||
          (worker.executionProfile === 'remote' ? 'remote-ready' : 'eligible'),
      }
    })
    .sort((left, right) => {
      if (left.score !== right.score) {
        return right.score - left.score
      }
      if (left.worker.heartbeatAt !== right.worker.heartbeatAt) {
        return left.worker.heartbeatAt > right.worker.heartbeatAt ? -1 : 1
      }
      return left.worker.workerId < right.worker.workerId ? -1 : 1
    })

  const winner = scored[0]
  if (!winner) {
    return null
  }
  return {
    worker: winner.worker,
    reason: winner.reason,
  }
}

function rebalanceGemmaTrainingRouteQueueAssignments(
  entries: GemmaTrainingRouteQueueEntry[],
  workers: GemmaTrainingRouteWorkerRegistration[],
  now = new Date().toISOString(),
): { entries: GemmaTrainingRouteQueueEntry[]; changed: boolean } {
  let changed = false
  const updated = entries.map(entry => {
    if (entry.status !== 'queued') {
      return entry
    }
    if (
      entry.assignmentAuthority === 'immaculate' ||
      entry.assignment?.source === 'immaculate'
    ) {
      return entry
    }
    const selection = selectGemmaTrainingRouteWorker(entry, workers)
    if (!selection) {
      if (!entry.assignment) {
        return entry
      }
      changed = true
      return {
        ...entry,
        updatedAt: now,
        assignment: null,
      }
    }
    const nextAssignment: GemmaTrainingRouteQueueAssignment = {
      workerId: selection.worker.workerId,
      workerLabel: selection.worker.workerLabel ?? null,
      hostLabel: selection.worker.hostLabel ?? null,
      executionProfile: selection.worker.executionProfile,
      executionEndpoint: selection.worker.executionEndpoint ?? null,
      source: 'local',
      assignedAt:
        entry.assignment?.workerId === selection.worker.workerId
          ? entry.assignment.assignedAt
          : now,
      reason: selection.reason,
    }
    const assignmentChanged =
      entry.assignment?.workerId !== nextAssignment.workerId ||
      entry.assignment?.reason !== nextAssignment.reason ||
      entry.assignment?.workerLabel !== nextAssignment.workerLabel ||
      entry.assignment?.hostLabel !== nextAssignment.hostLabel ||
      entry.assignment?.executionProfile !== nextAssignment.executionProfile ||
      entry.assignment?.executionEndpoint !== nextAssignment.executionEndpoint ||
      entry.assignment?.source !== nextAssignment.source
    if (!assignmentChanged) {
      return entry
    }
    changed = true
    return {
      ...entry,
      updatedAt: now,
      assignment: nextAssignment,
    }
  })
  return {
    entries: updated,
    changed,
  }
}

export function reapStaleGemmaTrainingRouteQueueClaims(args?: {
  root?: string
  now?: string
}): GemmaTrainingRouteQueueEntry[] {
  const root = args?.root ?? process.cwd()
  const now = args?.now ?? new Date().toISOString()

  return withGemmaTrainingRouteQueueLock(root, () => {
    const current = readGemmaTrainingRouteQueueUnlocked(root)
    const normalized = normalizeGemmaTrainingRouteQueueClaims(current, now)
    const workers = normalizeGemmaTrainingRouteWorkers(
      readGemmaTrainingRouteWorkersUnlocked(root),
      now,
    )
    const rebalanced = rebalanceGemmaTrainingRouteQueueAssignments(
      normalized.entries,
      workers.workers,
      now,
    )
    if (workers.changed) {
      writeGemmaTrainingRouteWorkersUnlocked(
        sortGemmaTrainingRouteWorkers(workers.workers),
        root,
      )
    }
    if (normalized.changed || rebalanced.changed) {
      writeGemmaTrainingRouteQueueUnlocked(
        sortGemmaTrainingRouteQueueEntries(rebalanced.entries),
        root,
      )
    }
    return rebalanced.entries.filter(entry => entry.status === 'queued')
  })
}

export function readGemmaTrainingRegistry(
  root = process.cwd(),
): GemmaTrainingRegistryEntry[] {
  return readJsonIfExists<GemmaTrainingRegistryEntry[]>(
    getGemmaTrainingRegistryPath(root),
  ) ?? []
}

export function writeGemmaTrainingRegistry(
  entries: GemmaTrainingRegistryEntry[],
  root = process.cwd(),
): void {
  const path = getGemmaTrainingRegistryPath(root)
  mkdirSync(getGemmaTrainingRunsDir(root), { recursive: true })
  writeFileSync(path, `${JSON.stringify(entries, null, 2)}\n`, 'utf8')
}

export function readGemmaTrainingRouteQueue(
  root = process.cwd(),
): GemmaTrainingRouteQueueEntry[] {
  return readGemmaTrainingRouteQueueUnlocked(root)
}

export function readGemmaTrainingRouteWorkers(
  root = process.cwd(),
): GemmaTrainingRouteWorkerRegistration[] {
  return withGemmaTrainingRouteQueueLock(root, () => {
    const normalized = normalizeGemmaTrainingRouteWorkers(
      readGemmaTrainingRouteWorkersUnlocked(root),
    )
    if (normalized.changed) {
      writeGemmaTrainingRouteWorkersUnlocked(
        sortGemmaTrainingRouteWorkers(normalized.workers),
        root,
      )
    }
    return normalized.workers
  })
}

export function readGemmaTrainingRouteWorkerRuntimeStatuses(
  root = process.cwd(),
): GemmaTrainingRouteWorkerRuntimeEntry[] {
  return withGemmaTrainingRouteQueueLock(root, () =>
    sortGemmaTrainingRouteWorkerRuntime(
      readGemmaTrainingRouteWorkerRuntimeUnlocked(root),
    ),
  )
}

export function writeGemmaTrainingRouteQueue(
  entries: GemmaTrainingRouteQueueEntry[],
  root = process.cwd(),
): void {
  writeGemmaTrainingRouteQueueUnlocked(sortGemmaTrainingRouteQueueEntries(entries), root)
}

export function upsertGemmaTrainingRouteQueueEntry(
  entry: GemmaTrainingRouteQueueEntry,
  root = process.cwd(),
): void {
  withGemmaTrainingRouteQueueLock(root, () => {
    const existing = readGemmaTrainingRouteQueueUnlocked(root)
    const updated = existing.filter(run => run.runId !== entry.runId)
    updated.push(entry)
    const workers = normalizeGemmaTrainingRouteWorkers(
      readGemmaTrainingRouteWorkersUnlocked(root),
    )
    const rebalanced = rebalanceGemmaTrainingRouteQueueAssignments(
      updated,
      workers.workers,
    )
    if (workers.changed) {
      writeGemmaTrainingRouteWorkersUnlocked(
        sortGemmaTrainingRouteWorkers(workers.workers),
        root,
      )
    }
    writeGemmaTrainingRouteQueueUnlocked(
      sortGemmaTrainingRouteQueueEntries(rebalanced.entries),
      root,
    )
  })
}

export function upsertGemmaTrainingRouteWorkerRuntimeStatus(
  entry: GemmaTrainingRouteWorkerRuntimeEntry,
  root = process.cwd(),
): void {
  withGemmaTrainingRouteQueueLock(root, () => {
    const existing = readGemmaTrainingRouteWorkerRuntimeUnlocked(root)
    const updated = existing.filter(worker => worker.workerId !== entry.workerId)
    updated.push({
      ...entry,
      supportedBaseModels: [...new Set(entry.supportedBaseModels)],
      preferredLayerIds: [...new Set(entry.preferredLayerIds)],
    })
    writeGemmaTrainingRouteWorkerRuntimeUnlocked(
      sortGemmaTrainingRouteWorkerRuntime(updated),
      root,
    )
  })
}

export function removeGemmaTrainingRouteWorkerRuntimeStatus(
  workerId: string,
  root = process.cwd(),
): GemmaTrainingRouteWorkerRuntimeEntry | null {
  return withGemmaTrainingRouteQueueLock(root, () => {
    const existing = readGemmaTrainingRouteWorkerRuntimeUnlocked(root)
    const target = existing.find(worker => worker.workerId === workerId) ?? null
    if (!target) {
      return null
    }
    writeGemmaTrainingRouteWorkerRuntimeUnlocked(
      sortGemmaTrainingRouteWorkerRuntime(
        existing.filter(worker => worker.workerId !== workerId),
      ),
      root,
    )
    return target
  })
}

export function upsertGemmaTrainingRouteWorker(
  worker: GemmaTrainingRouteWorkerRegistration,
  root = process.cwd(),
): GemmaTrainingRouteWorkerRegistration {
  return withGemmaTrainingRouteQueueLock(root, () => {
    const now = worker.heartbeatAt
    const currentWorkers = normalizeGemmaTrainingRouteWorkers(
      readGemmaTrainingRouteWorkersUnlocked(root),
      now,
    )
    const existingWorker = currentWorkers.workers.find(
      entry => entry.workerId === worker.workerId,
    )
    const updatedWorker: GemmaTrainingRouteWorkerRegistration = {
      ...worker,
      registeredAt: existingWorker?.registeredAt ?? worker.registeredAt,
      supportedBaseModels: [...new Set(worker.supportedBaseModels)],
      preferredLayerIds: [...new Set(worker.preferredLayerIds)],
    }
    const updatedWorkers = currentWorkers.workers
      .filter(entry => entry.workerId !== worker.workerId)
      .concat(updatedWorker)
    const queue = readGemmaTrainingRouteQueueUnlocked(root)
    const rebalanced = rebalanceGemmaTrainingRouteQueueAssignments(
      queue,
      updatedWorkers,
      now,
    )
    writeGemmaTrainingRouteWorkersUnlocked(
      sortGemmaTrainingRouteWorkers(updatedWorkers),
      root,
    )
    if (currentWorkers.changed || rebalanced.changed) {
      writeGemmaTrainingRouteQueueUnlocked(
        sortGemmaTrainingRouteQueueEntries(rebalanced.entries),
        root,
      )
    }
    return updatedWorker
  })
}

export function removeGemmaTrainingRouteWorker(
  workerId: string,
  root = process.cwd(),
): GemmaTrainingRouteWorkerRegistration | null {
  return withGemmaTrainingRouteQueueLock(root, () => {
    const now = new Date().toISOString()
    const currentWorkers = normalizeGemmaTrainingRouteWorkers(
      readGemmaTrainingRouteWorkersUnlocked(root),
      now,
    )
    const target =
      currentWorkers.workers.find(worker => worker.workerId === workerId) ?? null
    if (!target) {
      if (currentWorkers.changed) {
        writeGemmaTrainingRouteWorkersUnlocked(
          sortGemmaTrainingRouteWorkers(currentWorkers.workers),
          root,
        )
      }
      return null
    }
    const updatedWorkers = currentWorkers.workers.filter(
      worker => worker.workerId !== workerId,
    )
    const queue = readGemmaTrainingRouteQueueUnlocked(root)
    const rebalanced = rebalanceGemmaTrainingRouteQueueAssignments(
      queue,
      updatedWorkers,
      now,
    )
    writeGemmaTrainingRouteWorkersUnlocked(
      sortGemmaTrainingRouteWorkers(updatedWorkers),
      root,
    )
    if (currentWorkers.changed || rebalanced.changed) {
      writeGemmaTrainingRouteQueueUnlocked(
        sortGemmaTrainingRouteQueueEntries(rebalanced.entries),
        root,
      )
    }
    return target
  })
}

export function getGemmaTrainingRouteWorker(
  workerId: string,
  root = process.cwd(),
): GemmaTrainingRouteWorkerRegistration | null {
  return readGemmaTrainingRouteWorkers(root).find(worker => worker.workerId === workerId) ?? null
}

export function reapStaleGemmaTrainingRouteWorkers(args?: {
  root?: string
  now?: string
}): GemmaTrainingRouteWorkerRegistration[] {
  const root = args?.root ?? process.cwd()
  const now = args?.now ?? new Date().toISOString()
  return withGemmaTrainingRouteQueueLock(root, () => {
    const currentWorkers = readGemmaTrainingRouteWorkersUnlocked(root)
    const normalized = normalizeGemmaTrainingRouteWorkers(currentWorkers, now)
    const queue = readGemmaTrainingRouteQueueUnlocked(root)
    const rebalanced = rebalanceGemmaTrainingRouteQueueAssignments(
      queue,
      normalized.workers,
      now,
    )
    if (normalized.changed) {
      writeGemmaTrainingRouteWorkersUnlocked(
        sortGemmaTrainingRouteWorkers(normalized.workers),
        root,
      )
    }
    if (normalized.changed || rebalanced.changed) {
      writeGemmaTrainingRouteQueueUnlocked(
        sortGemmaTrainingRouteQueueEntries(rebalanced.entries),
        root,
      )
    }
    return normalized.workers
  })
}

export function getGemmaTrainingRouteQueueEntry(
  runId: string,
  root = process.cwd(),
): GemmaTrainingRouteQueueEntry | null {
  return (
    readGemmaTrainingRouteQueue(root).find(entry => entry.runId === runId) ?? null
  )
}

export function getNextGemmaTrainingRoutePendingRemoteResult(args: {
  workerId?: string | null
  manifestPath?: string | null
  root?: string
}): GemmaTrainingRouteQueueEntry | null {
  const root = args.root ?? process.cwd()
  const manifestPath = args.manifestPath ? resolve(args.manifestPath) : null
  const queue = readGemmaTrainingRouteQueue(root)
    .filter(entry =>
      isGemmaTrainingRouteQueuePendingRemoteResult(entry, args.workerId),
    )
    .filter(entry => !manifestPath || resolve(entry.manifestPath) === manifestPath)
    .sort((left, right) => {
      const leftTime =
        left.dispatch?.dispatchedAt ?? left.updatedAt ?? left.queuedAt
      const rightTime =
        right.dispatch?.dispatchedAt ?? right.updatedAt ?? right.queuedAt
      return leftTime < rightTime ? -1 : leftTime > rightTime ? 1 : 0
    })
  return queue[0] ?? null
}

export function getNextQueuedGemmaTrainingRoute(
  root = process.cwd(),
): GemmaTrainingRouteQueueEntry | null {
  const queue = readGemmaTrainingRouteQueue(root)
  const now = new Date().toISOString()
  return (
    queue.find(entry => entry.status === 'queued') ??
    queue.find(entry => isGemmaTrainingRouteQueueClaimExpired(entry, now)) ??
    null
  )
}

export function claimGemmaTrainingRouteQueueEntry(args: {
  workerId: string
  runId?: string | null
  manifestPath?: string | null
  claimTtlMs?: number
  root?: string
  claimedAt?: string
}): GemmaTrainingRouteQueueEntry | null {
  const root = args.root ?? process.cwd()
  const claimedAt = args.claimedAt ?? new Date().toISOString()
  const claimTtlMs = args.claimTtlMs ?? DEFAULT_GEMMA_ROUTE_QUEUE_LEASE_MS
  const explicitTarget = Boolean(args.runId || args.manifestPath)

  return withGemmaTrainingRouteQueueLock(root, () => {
    const current = readGemmaTrainingRouteQueueUnlocked(root)
    const normalized = normalizeGemmaTrainingRouteQueueClaims(current, claimedAt)
    const workers = normalizeGemmaTrainingRouteWorkers(
      readGemmaTrainingRouteWorkersUnlocked(root),
      claimedAt,
    )
    const rebalanced = rebalanceGemmaTrainingRouteQueueAssignments(
      normalized.entries,
      workers.workers,
      claimedAt,
    )
    const queue = rebalanced.entries
    const target = args.runId || args.manifestPath
      ? queue.find(entry => {
        if (args.runId) {
          return entry.runId === args.runId
        }
        if (args.manifestPath) {
          return resolve(entry.manifestPath) === resolve(args.manifestPath)
        }
        return false
      })
      : queue.find(
          entry =>
            entry.status === 'queued' &&
            entry.assignment?.workerId === args.workerId,
        ) ??
        queue.find(
          entry =>
            entry.status === 'queued' &&
            entry.assignmentAuthority !== 'immaculate' &&
            !entry.assignment?.workerId,
        )
    const claimant =
      workers.workers.find(worker => worker.workerId === args.workerId) ?? null

    if (!target) {
      if (workers.changed) {
        writeGemmaTrainingRouteWorkersUnlocked(
          sortGemmaTrainingRouteWorkers(workers.workers),
          root,
        )
      }
      if (normalized.changed || rebalanced.changed) {
        writeGemmaTrainingRouteQueueUnlocked(
          sortGemmaTrainingRouteQueueEntries(queue),
          root,
        )
      }
      return null
    }

    if (!explicitTarget) {
      const claimantEligible =
        claimant &&
        (target.requestedExecutionDecision !== 'remote_required' ||
          claimant.executionProfile === 'remote') &&
        workerSupportsGemmaBaseModel(claimant, target.baseModel)
      if (!claimantEligible) {
        if (workers.changed) {
          writeGemmaTrainingRouteWorkersUnlocked(
            sortGemmaTrainingRouteWorkers(workers.workers),
            root,
          )
        }
        if (normalized.changed || rebalanced.changed) {
          writeGemmaTrainingRouteQueueUnlocked(
            sortGemmaTrainingRouteQueueEntries(queue),
            root,
          )
        }
        return null
      }
    }

    if (
      target.status === 'claimed' &&
      target.claim?.workerId === args.workerId &&
      !isGemmaTrainingRouteQueueClaimExpired(target, claimedAt)
    ) {
      const reclaimed = {
        ...target,
        updatedAt: claimedAt,
        claim: {
          ...target.claim,
          workerId: args.workerId,
          claimedAt: target.claim?.claimedAt ?? claimedAt,
          heartbeatAt: claimedAt,
          leaseExpiresAt: addMsToIsoTimestamp(claimedAt, claimTtlMs),
          leaseDurationMs: claimTtlMs,
        },
      }
      const updated = queue.map(entry =>
        entry.runId === reclaimed.runId ? reclaimed : entry,
      )
      writeGemmaTrainingRouteQueueUnlocked(
        sortGemmaTrainingRouteQueueEntries(updated),
        root,
      )
      return reclaimed
    }

    if (
      target.assignmentAuthority === 'immaculate' &&
      !target.assignment?.workerId
    ) {
      if (explicitTarget) {
        const explicitlyClaimedEntry: GemmaTrainingRouteQueueEntry = {
          ...target,
          status: 'claimed',
          updatedAt: claimedAt,
          rejectionReason: null,
          claim: {
            workerId: args.workerId,
            claimedAt,
            heartbeatAt: claimedAt,
            leaseExpiresAt: addMsToIsoTimestamp(claimedAt, claimTtlMs),
            leaseDurationMs: claimTtlMs,
            signatureVerified: null,
            integrityVerified: null,
            preflightDecision: null,
            preflightReasonCode: null,
          },
          dispatch: null,
        }
        const updated = queue.map(entry =>
          entry.runId === explicitlyClaimedEntry.runId
            ? explicitlyClaimedEntry
            : entry,
        )
        if (workers.changed) {
          writeGemmaTrainingRouteWorkersUnlocked(
            sortGemmaTrainingRouteWorkers(workers.workers),
            root,
          )
        }
        writeGemmaTrainingRouteQueueUnlocked(
          sortGemmaTrainingRouteQueueEntries(updated),
          root,
        )
        return explicitlyClaimedEntry
      }
      if (workers.changed) {
        writeGemmaTrainingRouteWorkersUnlocked(
          sortGemmaTrainingRouteWorkers(workers.workers),
          root,
        )
      }
      if (normalized.changed || rebalanced.changed) {
        writeGemmaTrainingRouteQueueUnlocked(
          sortGemmaTrainingRouteQueueEntries(queue),
          root,
        )
      }
      return null
    }

    if (
      target.assignment?.workerId &&
      target.assignment.workerId !== args.workerId
    ) {
      if (workers.changed) {
        writeGemmaTrainingRouteWorkersUnlocked(
          sortGemmaTrainingRouteWorkers(workers.workers),
          root,
        )
      }
      if (normalized.changed || rebalanced.changed) {
        writeGemmaTrainingRouteQueueUnlocked(
          sortGemmaTrainingRouteQueueEntries(queue),
          root,
        )
      }
      return null
    }

    if (target.status !== 'queued') {
      if (workers.changed) {
        writeGemmaTrainingRouteWorkersUnlocked(
          sortGemmaTrainingRouteWorkers(workers.workers),
          root,
        )
      }
      if (normalized.changed || rebalanced.changed) {
        writeGemmaTrainingRouteQueueUnlocked(
          sortGemmaTrainingRouteQueueEntries(queue),
          root,
        )
      }
      return null
    }

    const claimedEntry: GemmaTrainingRouteQueueEntry = {
      ...target,
      status: 'claimed',
      updatedAt: claimedAt,
      rejectionReason: null,
      claim: {
        workerId: args.workerId,
        claimedAt,
        heartbeatAt: claimedAt,
        leaseExpiresAt: addMsToIsoTimestamp(claimedAt, claimTtlMs),
        leaseDurationMs: claimTtlMs,
        signatureVerified: null,
        integrityVerified: null,
        preflightDecision: null,
        preflightReasonCode: null,
      },
      dispatch: null,
    }
    const updated = queue.map(entry =>
      entry.runId === claimedEntry.runId ? claimedEntry : entry,
    )
    if (workers.changed) {
      writeGemmaTrainingRouteWorkersUnlocked(
        sortGemmaTrainingRouteWorkers(workers.workers),
        root,
      )
    }
    writeGemmaTrainingRouteQueueUnlocked(
      sortGemmaTrainingRouteQueueEntries(updated),
      root,
    )
    return claimedEntry
  })
}

export function claimNextQueuedGemmaTrainingRoute(args: {
  workerId: string
  claimTtlMs?: number
  root?: string
  claimedAt?: string
}): GemmaTrainingRouteQueueEntry | null {
  return claimGemmaTrainingRouteQueueEntry({
    workerId: args.workerId,
    claimTtlMs: args.claimTtlMs,
    root: args.root,
    claimedAt: args.claimedAt,
  })
}

export function updateGemmaTrainingRouteQueueClaim(args: {
  runId: string
  workerId: string
  status: 'claimed' | 'rejected'
  preflight: GemmaTrainingPreflight
  signatureVerified: boolean
  integrityVerified: boolean
  rejectionReason?: string | null
  claimTtlMs?: number
  root?: string
  updatedAt?: string
}): GemmaTrainingRouteQueueEntry | null {
  const root = args.root ?? process.cwd()
  const updatedAt = args.updatedAt ?? new Date().toISOString()
  const claimTtlMs = args.claimTtlMs ?? DEFAULT_GEMMA_ROUTE_QUEUE_LEASE_MS

  return withGemmaTrainingRouteQueueLock(root, () => {
    const current = readGemmaTrainingRouteQueueUnlocked(root)
    const normalized = normalizeGemmaTrainingRouteQueueClaims(current, updatedAt)
    const target = normalized.entries.find(entry => entry.runId === args.runId)
    if (
      !target ||
      target.status !== 'claimed' ||
      target.claim?.workerId !== args.workerId
    ) {
      if (normalized.changed) {
        writeGemmaTrainingRouteQueueUnlocked(
          sortGemmaTrainingRouteQueueEntries(normalized.entries),
          root,
        )
      }
      return null
    }

    const updatedEntry: GemmaTrainingRouteQueueEntry = {
      ...target,
      status: args.status,
      updatedAt,
      rejectionReason:
        args.status === 'rejected' ? args.rejectionReason ?? null : null,
      dispatch: args.status === 'rejected' ? null : target.dispatch ?? null,
      claim: {
        workerId: args.workerId,
        claimedAt: target.claim?.claimedAt ?? updatedAt,
        heartbeatAt: updatedAt,
        leaseExpiresAt:
          args.status === 'claimed'
            ? addMsToIsoTimestamp(updatedAt, claimTtlMs)
            : target.claim?.leaseExpiresAt ?? null,
        leaseDurationMs:
          args.status === 'claimed'
            ? claimTtlMs
            : target.claim?.leaseDurationMs ?? null,
        signatureVerified: args.signatureVerified,
        integrityVerified: args.integrityVerified,
        preflightDecision: args.preflight.decision,
        preflightReasonCode: args.preflight.reasonCode,
      },
    }
    const updated = normalized.entries.map(entry =>
      entry.runId === updatedEntry.runId ? updatedEntry : entry,
    )
    writeGemmaTrainingRouteQueueUnlocked(
      sortGemmaTrainingRouteQueueEntries(updated),
      root,
    )
    return updatedEntry
  })
}

export function releaseGemmaTrainingRouteQueueClaim(args: {
  runId: string
  workerId: string
  root?: string
  updatedAt?: string
}): GemmaTrainingRouteQueueEntry | null {
  const root = args.root ?? process.cwd()
  const updatedAt = args.updatedAt ?? new Date().toISOString()

  return withGemmaTrainingRouteQueueLock(root, () => {
    const current = readGemmaTrainingRouteQueueUnlocked(root)
    const normalized = normalizeGemmaTrainingRouteQueueClaims(current, updatedAt)
    const target = normalized.entries.find(entry => entry.runId === args.runId)
    if (
      !target ||
      target.status !== 'claimed' ||
      target.claim?.workerId !== args.workerId
    ) {
      if (normalized.changed) {
        writeGemmaTrainingRouteQueueUnlocked(
          sortGemmaTrainingRouteQueueEntries(normalized.entries),
          root,
        )
      }
      return null
    }

    const updatedEntry: GemmaTrainingRouteQueueEntry = {
      ...target,
      status: 'queued',
      updatedAt,
      claim: null,
      dispatch: null,
      rejectionReason: null,
    }
    const updated = normalized.entries.map(entry =>
      entry.runId === updatedEntry.runId ? updatedEntry : entry,
    )
    writeGemmaTrainingRouteQueueUnlocked(
      sortGemmaTrainingRouteQueueEntries(updated),
      root,
    )
    return updatedEntry
  })
}

export function renewGemmaTrainingRouteQueueClaim(args: {
  runId: string
  workerId: string
  claimTtlMs?: number
  root?: string
  renewedAt?: string
}): GemmaTrainingRouteQueueEntry | null {
  const root = args.root ?? process.cwd()
  const renewedAt = args.renewedAt ?? new Date().toISOString()
  const claimTtlMs = args.claimTtlMs ?? DEFAULT_GEMMA_ROUTE_QUEUE_LEASE_MS

  return withGemmaTrainingRouteQueueLock(root, () => {
    const current = readGemmaTrainingRouteQueueUnlocked(root)
    const normalized = normalizeGemmaTrainingRouteQueueClaims(current, renewedAt)
    const target = normalized.entries.find(entry => entry.runId === args.runId)
    if (
      !target ||
      target.status !== 'claimed' ||
      target.claim?.workerId !== args.workerId
    ) {
      if (normalized.changed) {
        writeGemmaTrainingRouteQueueUnlocked(
          sortGemmaTrainingRouteQueueEntries(normalized.entries),
          root,
        )
      }
      return null
    }

    const renewedEntry: GemmaTrainingRouteQueueEntry = {
      ...target,
      updatedAt: renewedAt,
      claim: {
        ...target.claim,
        workerId: args.workerId,
        claimedAt: target.claim?.claimedAt ?? renewedAt,
        heartbeatAt: renewedAt,
        leaseExpiresAt: addMsToIsoTimestamp(renewedAt, claimTtlMs),
        leaseDurationMs: claimTtlMs,
      },
    }
    const updated = normalized.entries.map(entry =>
      entry.runId === renewedEntry.runId ? renewedEntry : entry,
    )
    writeGemmaTrainingRouteQueueUnlocked(
      sortGemmaTrainingRouteQueueEntries(updated),
      root,
    )
    return renewedEntry
  })
}

export function finalizeGemmaTrainingRouteQueueDispatch(args: {
  runId: string
  workerId: string
  executionMode: GemmaTrainingExecutionMode
  pid: number | null
  transport?: GemmaTrainingRouteDispatchTransport
  executionEndpoint?: string | null
  acknowledgedAt?: string | null
  remoteStatus?: number | null
  remoteAccepted?: boolean | null
  remoteExecutionId?: string | null
  remoteSummary?: string | null
  remoteStateUrl?: string | null
  root?: string
  dispatchedAt?: string
}): GemmaTrainingRouteQueueEntry | null {
  const root = args.root ?? process.cwd()
  const dispatchedAt = args.dispatchedAt ?? new Date().toISOString()

  return withGemmaTrainingRouteQueueLock(root, () => {
    const current = readGemmaTrainingRouteQueueUnlocked(root)
    const normalized = normalizeGemmaTrainingRouteQueueClaims(current, dispatchedAt)
    const target = normalized.entries.find(entry => entry.runId === args.runId)
    if (
      !target ||
      target.status !== 'claimed' ||
      target.claim?.workerId !== args.workerId
    ) {
      if (normalized.changed) {
        writeGemmaTrainingRouteQueueUnlocked(
          sortGemmaTrainingRouteQueueEntries(normalized.entries),
          root,
        )
      }
      return null
    }

    const updatedEntry: GemmaTrainingRouteQueueEntry = {
      ...target,
      status: 'dispatched',
      updatedAt: dispatchedAt,
      rejectionReason: null,
      claim: {
        ...target.claim,
        workerId: args.workerId,
        heartbeatAt: dispatchedAt,
      },
      dispatch: {
        dispatchedAt,
        executionMode: args.executionMode,
        pid: args.pid,
        transport: args.transport ?? 'local_process',
        workerId: args.workerId,
        executionEndpoint:
          args.executionEndpoint ?? target.assignment?.executionEndpoint ?? null,
        acknowledgedAt: args.acknowledgedAt ?? null,
        remoteStatus: args.remoteStatus ?? null,
        remoteAccepted: args.remoteAccepted ?? null,
        remoteExecutionId: args.remoteExecutionId ?? null,
        remoteSummary: args.remoteSummary ?? null,
        remoteStateUrl: args.remoteStateUrl ?? null,
        resultReceivedAt: null,
        remoteCompletedAt: null,
        remoteCompletionStatus: null,
        remoteCompletionSummary: null,
      },
    }
    const updated = normalized.entries.map(entry =>
      entry.runId === updatedEntry.runId ? updatedEntry : entry,
    )
    writeGemmaTrainingRouteQueueUnlocked(
      sortGemmaTrainingRouteQueueEntries(updated),
      root,
    )
    return updatedEntry
  })
}

export function finalizeGemmaTrainingRouteQueueCompletion(args: {
  runId: string
  workerId: string
  executionId?: string | null
  status: GemmaTrainingRouteResultStatus
  summary?: string | null
  stateUrl?: string | null
  root?: string
  finishedAt?: string
}): GemmaTrainingRouteQueueEntry | null {
  const root = args.root ?? process.cwd()
  const finishedAt = args.finishedAt ?? new Date().toISOString()

  return withGemmaTrainingRouteQueueLock(root, () => {
    const current = readGemmaTrainingRouteQueueUnlocked(root)
    const normalized = normalizeGemmaTrainingRouteQueueClaims(current, finishedAt)
    const target = normalized.entries.find(entry => entry.runId === args.runId)
    if (
      !target ||
      target.status !== 'dispatched' ||
      target.dispatch?.workerId !== args.workerId ||
      (args.executionId &&
        target.dispatch?.remoteExecutionId &&
        target.dispatch.remoteExecutionId !== args.executionId)
    ) {
      if (normalized.changed) {
        writeGemmaTrainingRouteQueueUnlocked(
          sortGemmaTrainingRouteQueueEntries(normalized.entries),
          root,
        )
      }
      return null
    }

    const updatedEntry: GemmaTrainingRouteQueueEntry = {
      ...target,
      status: args.status,
      updatedAt: finishedAt,
      claim: null,
      rejectionReason: args.status === 'failed' ? args.summary ?? null : null,
      dispatch: {
        ...target.dispatch,
        workerId: args.workerId,
        remoteStateUrl: args.stateUrl ?? target.dispatch?.remoteStateUrl ?? null,
        resultReceivedAt: finishedAt,
        remoteCompletedAt: finishedAt,
        remoteCompletionStatus: args.status,
        remoteCompletionSummary: args.summary ?? null,
      },
    }
    const updated = normalized.entries.map(entry =>
      entry.runId === updatedEntry.runId ? updatedEntry : entry,
    )
    writeGemmaTrainingRouteQueueUnlocked(
      sortGemmaTrainingRouteQueueEntries(updated),
      root,
    )
    return updatedEntry
  })
}

export function upsertGemmaTrainingRegistryEntry(
  entry: GemmaTrainingRegistryEntry,
  root = process.cwd(),
): void {
  const existing = readGemmaTrainingRegistry(root)
  const updated = existing.filter(run => run.runId !== entry.runId)
  updated.push(entry)
  updated.sort((left, right) =>
    left.launchedAt < right.launchedAt ? -1 : left.launchedAt > right.launchedAt ? 1 : 0,
  )
  writeGemmaTrainingRegistry(updated, root)
}

export function readGemmaRunState(outputDir: string): GemmaRunState | null {
  return readJsonIfExists<GemmaRunState>(join(outputDir, 'run-state.json'))
}

export function getLatestGemmaTrainingSnapshot(root = process.cwd()): {
  registry: GemmaTrainingRegistryEntry
  state: GemmaRunState | null
  routeQueue: GemmaTrainingRouteQueueEntry | null
} | null {
  const runs = readGemmaTrainingRegistry(root)
  const latest = runs.at(-1)
  if (!latest) {
    return null
  }
  return {
    registry: latest,
    state: readGemmaRunState(latest.outputDir),
    routeQueue: getGemmaTrainingRouteQueueEntry(latest.runId, root),
  }
}
