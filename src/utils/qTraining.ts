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
import { dirname, isAbsolute, join, relative, resolve } from 'path'
import * as lockfile from './lockfile.js'

export type QTrainingStatus =
  | 'launched'
  | 'initializing'
  | 'running'
  | 'completed'
  | 'failed'
  | 'route_requested'
  | 'remote_required'
  | 'preflight_blocked'

export type QTrainingPreflightDecision =
  | 'allow_local'
  | 'remote_required'
  | 'preflight_blocked'

export type QTrainingPreflight = {
  decision: QTrainingPreflightDecision
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

export type QTrainingExecutionMode =
  | 'local'
  | 'local_forced'
  | 'immaculate_route_requested'
  | 'immaculate_routed'
  | 'remote_required'
  | 'preflight_blocked'

export type QTrainingFileIntegrity = {
  path: string
  bytes: number
  sha256: string
}

export type QTrainingRouteIntegrity = {
  algorithm: 'sha256'
  trainFile: QTrainingFileIntegrity
  evalFile?: QTrainingFileIntegrity | null
}

export type QTrainingRouteSecretSource =
  | 'OPENJAWS_Q_ROUTE_SECRET'
  | '~/.openjaws/q-route-secret'

export type QTrainingRouteSecurity = {
  algorithm: 'hmac-sha256'
  payloadSha256: string
  signature: string
  signedAt: string
  secretSource: QTrainingRouteSecretSource
}

export type QTrainingRouteDispatchTransport =
  | 'local_process'
  | 'remote_http'

export type QTrainingRouteDispatchFile = {
  path: string
  bytes: number
  sha256: string
  contentBase64: string
}

export type QTrainingRouteDispatchPayload = {
  runId: string
  manifestPath: string
  workerId: string
  executionMode: QTrainingExecutionMode
  dispatchedAt: string
  manifest: QTrainingRouteManifest
  files: QTrainingRouteDispatchFile[]
}

export type QTrainingRouteDispatchEnvelope = {
  payload: QTrainingRouteDispatchPayload
  security: QTrainingRouteSecurity | null
}

export type QTrainingRouteResultStatus = Extract<
  QTrainingStatus,
  'completed' | 'failed'
>

export type QTrainingRouteResultPayload = {
  runId: string
  manifestPath: string
  workerId: string
  executionId: string | null
  executionMode: QTrainingExecutionMode
  finishedAt: string
  status: QTrainingRouteResultStatus
  summary: string | null
  stateUrl?: string | null
  runState: Partial<QRunState> & {
    status: QTrainingRouteResultStatus
    finishedAt: string
  }
  runSummary: Record<string, unknown> | null
  metricsSummary: Record<string, unknown> | null
}

export type QTrainingRouteResultEnvelope = {
  payload: QTrainingRouteResultPayload
  security: QTrainingRouteSecurity | null
}

export type QTrainingRouteRequest = {
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
      executionProfile: QTrainingRouteWorkerExecutionProfile
      executionEndpoint?: string | null
      assignedAt: string
      reason: string
      score?: number
      healthStatus?: 'healthy' | 'stale' | 'faulted'
      healthSummary?: string | null
    } | null
  } | null
  integrity?: QTrainingRouteIntegrity | null
  security?: QTrainingRouteSecurity | null
}

export type QTrainingRouteFailureStage =
  | 'status'
  | 'control'
  | 'assignment'
  | 'manifest'

export type QTrainingRouteFailureCode =
  | 'harness_unreachable'
  | 'control_failed'
  | 'control_rejected'
  | 'assignment_failed'
  | 'manifest_failed'

export type QTrainingRouteFailure = {
  route: 'immaculate'
  failedAt: string
  stage: QTrainingRouteFailureStage
  code: QTrainingRouteFailureCode
  summary: string
  detail?: string | null
  harnessUrl?: string | null
  recommendedLayerId?: string | null
  controlStatus?: number | null
  controlSummary?: string | null
}

export type QTrainingRouteManifestTraining = {
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

export type QTrainingRouteManifest = {
  runId: string
  routeRequest: QTrainingRouteRequest
  training: QTrainingRouteManifestTraining
  preflight: QTrainingPreflight
  security: QTrainingRouteSecurity | null
}

export type QTrainingRouteQueueStatus =
  | 'queued'
  | 'claimed'
  | 'dispatched'
  | 'completed'
  | 'failed'
  | 'rejected'

export type QTrainingRouteQueueDisplayStatus =
  | QTrainingRouteQueueStatus
  | 'pending_assignment'

export type QTrainingRouteReceipt = {
  displayStatus: QTrainingRouteQueueDisplayStatus
  text: string
  tone?: 'suggestion' | 'warning' | 'error' | 'success'
}

export type QTrainingRouteQueueClaim = {
  workerId: string
  claimedAt: string
  heartbeatAt?: string | null
  leaseExpiresAt?: string | null
  leaseDurationMs?: number | null
  signatureVerified?: boolean | null
  integrityVerified?: boolean | null
  preflightDecision?: QTrainingPreflightDecision | null
  preflightReasonCode?: QTrainingPreflight['reasonCode'] | null
}

export type QTrainingRouteQueueDispatch = {
  dispatchedAt: string
  executionMode: QTrainingExecutionMode
  pid: number | null
  transport?: QTrainingRouteDispatchTransport
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
  remoteCompletionStatus?: QTrainingRouteResultStatus | null
  remoteCompletionSummary?: string | null
}

export type QTrainingRouteWorkerExecutionProfile = 'local' | 'remote'

export type QTrainingRouteWorkerRegistration = {
  workerId: string
  workerLabel?: string | null
  hostLabel?: string | null
  executionProfile: QTrainingRouteWorkerExecutionProfile
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

export type QTrainingRouteWorkerRuntimeState =
  | 'ready'
  | 'local_only'
  | 'register_failed'
  | 'heartbeat_failed'

export type QTrainingRouteWorkerRuntimeEntry = {
  workerId: string
  workerLabel?: string | null
  hostLabel?: string | null
  executionProfile: QTrainingRouteWorkerExecutionProfile
  status: QTrainingRouteWorkerRuntimeState
  updatedAt: string
  summary: string
  detail?: string | null
  harnessUrl?: string | null
  supportedBaseModels: string[]
  preferredLayerIds: string[]
}

export type QTrainingRouteQueueAssignment = {
  workerId: string
  workerLabel?: string | null
  hostLabel?: string | null
  executionProfile: QTrainingRouteWorkerExecutionProfile
  executionEndpoint?: string | null
  source?: 'local' | 'immaculate'
  assignedAt: string
  reason: string
  score?: number
  healthStatus?: 'healthy' | 'stale' | 'faulted'
  healthSummary?: string | null
}

export type QTrainingRouteQueueEntry = {
  runId: string
  manifestPath: string
  queuedAt: string
  updatedAt: string
  status: QTrainingRouteQueueStatus
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
  requestedExecutionDecision?: QTrainingPreflightDecision | null
  security?: QTrainingRouteSecurity | null
  assignment?: QTrainingRouteQueueAssignment | null
  claim?: QTrainingRouteQueueClaim | null
  dispatch?: QTrainingRouteQueueDispatch | null
  rejectionReason?: string | null
}

export type QTrainingRegistryEntry = {
  runId: string
  status: QTrainingStatus
  executionMode?: QTrainingExecutionMode
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
  preflight?: QTrainingPreflight | null
  routeRequest?: QTrainingRouteRequest | null
  routeFailure?: QTrainingRouteFailure | null
}

export type QRunState = {
  status: QTrainingStatus
  executionMode?: QTrainingExecutionMode
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
  preflight?: QTrainingPreflight | null
  routeRequest?: QTrainingRouteRequest | null
  routeFailure?: QTrainingRouteFailure | null
  routeQueue?: QTrainingRouteQueueEntry | null
  routeQueueDisplayStatus?: QTrainingRouteQueueDisplayStatus | null
  routeQueueSummary?: string | null
}

const GIB = 1024 ** 3
const Q_ROUTE_SECRET_FILE = join('.openjaws', 'q-route-secret')
const Q_ROUTE_QUEUE_LOCK_FILE = '.route-queue.lock'
const DEFAULT_Q_ROUTE_QUEUE_LEASE_MS = 45_000
const Q_ROUTE_QUEUE_LOCK_OPTIONS = {
  realpath: false,
} as const
const Q_ROUTE_QUEUE_LOCK_WAIT_MS = 25
const Q_ROUTE_QUEUE_LOCK_TIMEOUT_MS = 2_500

const Q_UPSTREAM_MODEL_IDS = {
  lite: ['google/', 'ge', 'mma', '-4-E2B-it'].join(''),
  main: ['google/', 'ge', 'mma', '-4-E4B-it'].join(''),
  pro: ['google/', 'ge', 'mma', '-4-26b-it'].join(''),
  ultra: ['google/', 'ge', 'mma', '-4-31b-it'].join(''),
} as const

const Q_MODEL_MARKERS = {
  lite: ['ge', 'mma', '-4-e2b'].join(''),
  main: ['ge', 'mma', '-4-e4b'].join(''),
  pro: ['ge', 'mma', '-4-26b'].join(''),
  ultra: ['ge', 'mma', '-4-31b'].join(''),
} as const

export const DEFAULT_Q_BASE_MODEL = Q_UPSTREAM_MODEL_IDS.main
export const Q_SMOKE_BASE_MODEL = Q_UPSTREAM_MODEL_IDS.lite
export const Q_PRO_BASE_MODEL = Q_UPSTREAM_MODEL_IDS.pro
export const Q_ULTRA_BASE_MODEL = Q_UPSTREAM_MODEL_IDS.ultra

function normalizeQBaseModel(baseModel: string): string {
  const trimmed = baseModel.trim()
  const normalized = trimmed.toLowerCase()
  if (normalized === 'q' || normalized === 'q-main') {
    return DEFAULT_Q_BASE_MODEL
  }
  if (normalized === 'q-lite' || normalized === 'q lite') {
    return Q_UPSTREAM_MODEL_IDS.lite
  }
  if (normalized === 'q-pro' || normalized === 'q pro') {
    return Q_UPSTREAM_MODEL_IDS.pro
  }
  if (normalized === 'q-ultra' || normalized === 'q ultra') {
    return Q_UPSTREAM_MODEL_IDS.ultra
  }
  return trimmed
}

function hashQRoutePayload(payload: string): string {
  return createHash('sha256').update(payload).digest('hex')
}

function normalizeQRouteRelativePath(path: string): string {
  return path.replaceAll('\\', '/')
}

export function getOpenJawsTrainingModelLabel(baseModel: string): string {
  const normalized = normalizeQBaseModel(baseModel).toLowerCase()
  if (normalized.includes(Q_MODEL_MARKERS.lite)) {
    return 'Q Lite'
  }
  if (normalized.includes(Q_MODEL_MARKERS.main)) {
    return 'Q'
  }
  if (normalized.includes(Q_MODEL_MARKERS.pro)) {
    return 'Q Pro'
  }
  if (normalized.includes(Q_MODEL_MARKERS.ultra)) {
    return 'Q Ultra'
  }
  return baseModel
}

export function getOpenJawsTrainingModelDisplay(baseModel: string): string {
  const label = getOpenJawsTrainingModelLabel(baseModel)
  return label === baseModel ? baseModel : `${label} · ${baseModel}`
}

function inferQModelBytes(baseModel: string): number | null {
  const normalized = normalizeQBaseModel(baseModel).toLowerCase()
  if (normalized.includes(Q_MODEL_MARKERS.lite)) {
    return 10 * GIB
  }
  if (normalized.includes(Q_MODEL_MARKERS.main)) {
    return 16 * GIB
  }
  if (normalized.includes(Q_MODEL_MARKERS.pro)) {
    return 28 * GIB
  }
  if (normalized.includes(Q_MODEL_MARKERS.ultra)) {
    return 33 * GIB
  }
  return null
}

function formatBytesCompact(bytes: number): string {
  const gib = bytes / GIB
  return `${gib.toFixed(gib >= 10 ? 0 : 1)} GiB`
}

function getQCacheRepoDir(
  baseModel: string,
  homeDir: string = homedir(),
): string {
  const upstreamBaseModel = normalizeQBaseModel(baseModel)
  return join(
    homeDir,
    '.cache',
    'huggingface',
    'hub',
    `models--${upstreamBaseModel.replaceAll('/', '--')}`,
  )
}

export function getCachedQModelInfo(
  baseModel: string,
  options?: {
    homeDir?: string
  },
): {
  modelPath: string | null
  modelBytes: number | null
} {
  const repoDir = getQCacheRepoDir(baseModel, options?.homeDir)
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

export function evaluateQTrainingPreflight(options: {
  baseModel: string
  trainFile: string
  pythonPath?: string | null
  useCpu: boolean
  availableMemoryBytes?: number
  totalMemoryBytes?: number
  modelBytes?: number | null
  cachedModelPath?: string | null
  homeDir?: string
}): QTrainingPreflight {
  const modelDisplay = getOpenJawsTrainingModelDisplay(options.baseModel)
  const normalizedPythonPath = options.pythonPath?.trim() ?? null
  const pythonLooksLikeFilesystemPath =
    normalizedPythonPath !== null &&
    (isAbsolute(normalizedPythonPath) ||
      normalizedPythonPath.includes('/') ||
      normalizedPythonPath.includes('\\'))
  if (
    normalizedPythonPath &&
    pythonLooksLikeFilesystemPath &&
    !existsSync(normalizedPythonPath)
  ) {
    return {
      decision: 'preflight_blocked',
      reasonCode: 'missing_python',
      summary: `Python runtime not found at ${normalizedPythonPath}`,
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
      : getCachedQModelInfo(options.baseModel, {
          homeDir: options.homeDir,
        })
  const modelBytes =
    cachedModelInfo.modelBytes ?? inferQModelBytes(options.baseModel)
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
        summary: `Local host memory too tight for ${modelDisplay}: available ${formatBytesCompact(observedAvailableMemoryBytes)} / total ${formatBytesCompact(observedTotalMemoryBytes)}; need about ${formatBytesCompact(requiredAvailableMemoryBytes)} available. Use a remote box or free memory first.`,
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
      summary: `Local host memory looks sufficient for ${modelDisplay}: available ${formatBytesCompact(observedAvailableMemoryBytes)} / required about ${formatBytesCompact(requiredAvailableMemoryBytes)}.`,
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
    summary: `Local preflight could not size ${modelDisplay}; launch allowed without a memory gate.`,
    baseModel: options.baseModel,
    useCpu: options.useCpu,
    cachedModelPath: cachedModelInfo.modelPath,
    modelBytes: null,
    observedAvailableMemoryBytes,
    observedTotalMemoryBytes,
  }
}

export function computeQTrainingFileIntegrity(
  path: string,
): QTrainingFileIntegrity {
  const content = readFileSync(path)
  return {
    path,
    bytes: content.byteLength,
    sha256: createHash('sha256').update(content).digest('hex'),
  }
}

export function relativizeQTrainingFileIntegrity(
  integrity: QTrainingFileIntegrity,
  rootDir: string,
): QTrainingFileIntegrity {
  return {
    ...integrity,
    path: normalizeQRouteRelativePath(relative(rootDir, integrity.path)),
  }
}

export function resolveQTrainingRoutePath(
  manifestDir: string,
  routePath: string,
): string {
  return resolve(manifestDir, routePath)
}

export function stageQTrainingRouteFile(args: {
  sourcePath: string
  manifestDir: string
  relativePath: string
}): QTrainingFileIntegrity {
  const destinationPath = resolveQTrainingRoutePath(
    args.manifestDir,
    args.relativePath,
  )
  mkdirSync(dirname(destinationPath), { recursive: true })
  copyFileSync(args.sourcePath, destinationPath)
  return relativizeQTrainingFileIntegrity(
    computeQTrainingFileIntegrity(destinationPath),
    args.manifestDir,
  )
}

export function getQTrainingRouteSecret(options?: {
  homeDir?: string
  env?: NodeJS.ProcessEnv
  createIfMissing?: boolean
}): {
  secret: string
  source: QTrainingRouteSecretSource
  path?: string
} | null {
  const env = options?.env ?? process.env
  const envSecret = env.OPENJAWS_Q_ROUTE_SECRET?.trim()
  if (envSecret) {
    return {
      secret: envSecret,
      source: 'OPENJAWS_Q_ROUTE_SECRET',
    }
  }

  const secretPath = join(options?.homeDir ?? homedir(), Q_ROUTE_SECRET_FILE)
  if (existsSync(secretPath)) {
    const fileSecret = readFileSync(secretPath, 'utf8').trim()
    if (fileSecret) {
      return {
        secret: fileSecret,
        source: '~/.openjaws/q-route-secret',
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
    source: '~/.openjaws/q-route-secret',
    path: secretPath,
  }
}

function buildQTrainingRouteUnsignedPayload(args: {
  runId: string
  routeRequest: QTrainingRouteRequest
  training: QTrainingRouteManifestTraining
  preflight: QTrainingPreflight
}): Omit<QTrainingRouteManifest, 'security'> {
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

function buildQTrainingRouteDispatchFiles(args: {
  manifest: QTrainingRouteManifest
  manifestDir: string
}): QTrainingRouteDispatchFile[] {
  const files = [
    args.manifest.routeRequest.integrity?.trainFile.path ??
      args.manifest.training.trainFile,
    args.manifest.routeRequest.integrity?.evalFile?.path ??
      args.manifest.training.evalFile,
  ]
    .filter((path): path is string => Boolean(path))
    .map(path => normalizeQRouteRelativePath(path))

  const uniquePaths = [...new Set(files)]
  return uniquePaths.map(path => {
    const absolutePath = resolveQTrainingRoutePath(args.manifestDir, path)
    const content = readFileSync(absolutePath)
    return {
      path,
      bytes: content.byteLength,
      sha256: createHash('sha256').update(content).digest('hex'),
      contentBase64: content.toString('base64'),
    }
  })
}

function buildQTrainingRouteDispatchUnsignedPayload(args: {
  manifest: QTrainingRouteManifest
  manifestPath: string
  manifestDir: string
  workerId: string
  executionMode: QTrainingExecutionMode
  dispatchedAt: string
}): QTrainingRouteDispatchPayload {
  return {
    runId: args.manifest.runId,
    manifestPath: normalizeQRouteRelativePath(
      relative(args.manifestDir, args.manifestPath),
    ),
    workerId: args.workerId,
    executionMode: args.executionMode,
    dispatchedAt: args.dispatchedAt,
    manifest: args.manifest,
    files: buildQTrainingRouteDispatchFiles({
      manifest: args.manifest,
      manifestDir: args.manifestDir,
    }),
  }
}

function buildQTrainingRouteResultUnsignedPayload(args: {
  runId: string
  manifestPath: string
  workerId: string
  executionId: string | null
  executionMode: QTrainingExecutionMode
  finishedAt: string
  status: QTrainingRouteResultStatus
  summary?: string | null
  stateUrl?: string | null
  runState: Partial<QRunState> & {
    status: QTrainingRouteResultStatus
    finishedAt: string
  }
  runSummary?: Record<string, unknown> | null
  metricsSummary?: Record<string, unknown> | null
}): QTrainingRouteResultPayload {
  return {
    runId: args.runId,
    manifestPath: normalizeQRouteRelativePath(args.manifestPath),
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

export function buildQTrainingRouteManifest(args: {
  runId: string
  routeRequest: QTrainingRouteRequest
  training: QTrainingRouteManifestTraining
  preflight: QTrainingPreflight
  homeDir?: string
  env?: NodeJS.ProcessEnv
}): QTrainingRouteManifest {
  const unsignedPayload = buildQTrainingRouteUnsignedPayload(args)
  const payloadJson = JSON.stringify(unsignedPayload)
  const payloadSha256 = hashQRoutePayload(payloadJson)
  const routeSecret = getQTrainingRouteSecret({
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

export function buildQTrainingRouteDispatchEnvelope(args: {
  manifest: QTrainingRouteManifest
  manifestPath: string
  manifestDir: string
  workerId: string
  executionMode: QTrainingExecutionMode
  dispatchedAt: string
  homeDir?: string
  env?: NodeJS.ProcessEnv
}): QTrainingRouteDispatchEnvelope {
  const payload = buildQTrainingRouteDispatchUnsignedPayload(args)
  const payloadJson = JSON.stringify(payload)
  const payloadSha256 = hashQRoutePayload(payloadJson)
  const routeSecret = getQTrainingRouteSecret({
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

export function buildQTrainingRouteResultEnvelope(args: {
  runId: string
  manifestPath: string
  workerId: string
  executionId: string | null
  executionMode: QTrainingExecutionMode
  finishedAt: string
  status: QTrainingRouteResultStatus
  summary?: string | null
  stateUrl?: string | null
  runState: Partial<QRunState> & {
    status: QTrainingRouteResultStatus
    finishedAt: string
  }
  runSummary?: Record<string, unknown> | null
  metricsSummary?: Record<string, unknown> | null
  homeDir?: string
  env?: NodeJS.ProcessEnv
}): QTrainingRouteResultEnvelope {
  const payload = buildQTrainingRouteResultUnsignedPayload(args)
  const payloadJson = JSON.stringify(payload)
  const payloadSha256 = hashQRoutePayload(payloadJson)
  const routeSecret = getQTrainingRouteSecret({
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

export function verifyQTrainingRouteManifest(
  manifest: QTrainingRouteManifest,
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
  secretSource?: QTrainingRouteSecretSource
} {
  const unsignedPayload = buildQTrainingRouteUnsignedPayload({
    runId: manifest.runId,
    routeRequest: manifest.routeRequest,
    training: manifest.training,
    preflight: manifest.preflight,
  })
  const payloadJson = JSON.stringify(unsignedPayload)
  const payloadSha256 = hashQRoutePayload(payloadJson)
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
      : getQTrainingRouteSecret({
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

export function verifyQTrainingRouteDispatchEnvelope(
  envelope: QTrainingRouteDispatchEnvelope,
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
  secretSource?: QTrainingRouteSecretSource
} {
  const payloadJson = JSON.stringify(envelope.payload)
  const payloadSha256 = hashQRoutePayload(payloadJson)
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
      : getQTrainingRouteSecret({
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
          path: normalizeQRouteRelativePath(manifestIntegrity.trainFile.path),
          expectedSha256: manifestIntegrity.trainFile.sha256,
        }
      : null,
    manifestIntegrity?.evalFile
      ? {
          path: normalizeQRouteRelativePath(manifestIntegrity.evalFile.path),
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
          normalizeQRouteRelativePath(candidate.path) === expected.path,
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

export function verifyQTrainingRouteResultEnvelope(
  envelope: QTrainingRouteResultEnvelope,
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
  secretSource?: QTrainingRouteSecretSource
} {
  const payloadJson = JSON.stringify(envelope.payload)
  const payloadSha256 = hashQRoutePayload(payloadJson)
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
      : getQTrainingRouteSecret({
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

export function verifyQTrainingRouteManifestIntegrity(
  manifest: QTrainingRouteManifest,
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
  const trainPath = resolveQTrainingRoutePath(
    manifestDir,
    manifest.routeRequest.integrity?.trainFile.path ?? manifest.training.trainFile,
  )
  const trainActualSha256 = computeQTrainingFileIntegrity(trainPath).sha256
  const trainExpectedSha256 =
    manifest.routeRequest.integrity?.trainFile.sha256 ?? ''

  const evalIntegrity = manifest.routeRequest.integrity?.evalFile
  const evalPath = evalIntegrity
    ? resolveQTrainingRoutePath(manifestDir, evalIntegrity.path)
    : null
  const evalActualSha256 = evalPath
    ? computeQTrainingFileIntegrity(evalPath).sha256
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

export function readQTrainingRouteManifest(
  manifestPath: string,
): QTrainingRouteManifest {
  return JSON.parse(readFileSync(manifestPath, 'utf8')) as QTrainingRouteManifest
}

function readJsonIfExists<T>(path: string): T | null {
  if (!existsSync(path)) {
    return null
  }
  return JSON.parse(readFileSync(path, 'utf8')) as T
}

export function getQTrainingRunsDir(root = process.cwd()): string {
  return resolve(root, 'artifacts', 'q-runs')
}

export function getQTrainingRegistryPath(root = process.cwd()): string {
  return join(getQTrainingRunsDir(root), 'registry.json')
}

export function getQTrainingRouteQueuePath(root = process.cwd()): string {
  return join(getQTrainingRunsDir(root), 'route-queue.json')
}

export function getQTrainingRouteWorkersPath(root = process.cwd()): string {
  return join(getQTrainingRunsDir(root), 'route-workers.json')
}

export function getQTrainingRouteWorkerRuntimePath(
  root = process.cwd(),
): string {
  return join(getQTrainingRunsDir(root), 'route-worker-runtime.json')
}

function getQTrainingRouteQueueLockPath(root = process.cwd()): string {
  return join(getQTrainingRunsDir(root), Q_ROUTE_QUEUE_LOCK_FILE)
}

function ensureQTrainingRouteQueueLockFile(root = process.cwd()): string {
  const lockPath = getQTrainingRouteQueueLockPath(root)
  mkdirSync(getQTrainingRunsDir(root), { recursive: true })
  if (!existsSync(lockPath)) {
    writeFileSync(lockPath, '', 'utf8')
  }
  return lockPath
}

function withQTrainingRouteQueueLock<T>(
  root: string,
  fn: () => T,
): T {
  const lockPath = ensureQTrainingRouteQueueLockFile(root)
  const deadline = Date.now() + Q_ROUTE_QUEUE_LOCK_TIMEOUT_MS

  while (true) {
    try {
      const release = lockfile.lockSync(lockPath, Q_ROUTE_QUEUE_LOCK_OPTIONS)
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
        Q_ROUTE_QUEUE_LOCK_WAIT_MS,
      )
    }
  }
}

function readQTrainingRouteQueueUnlocked(
  root = process.cwd(),
): QTrainingRouteQueueEntry[] {
  return readJsonIfExists<QTrainingRouteQueueEntry[]>(
    getQTrainingRouteQueuePath(root),
  ) ?? []
}

function readQTrainingRouteWorkersUnlocked(
  root = process.cwd(),
): QTrainingRouteWorkerRegistration[] {
  return readJsonIfExists<QTrainingRouteWorkerRegistration[]>(
    getQTrainingRouteWorkersPath(root),
  ) ?? []
}

function readQTrainingRouteWorkerRuntimeUnlocked(
  root = process.cwd(),
): QTrainingRouteWorkerRuntimeEntry[] {
  return readJsonIfExists<QTrainingRouteWorkerRuntimeEntry[]>(
    getQTrainingRouteWorkerRuntimePath(root),
  ) ?? []
}

function writeQTrainingRouteQueueUnlocked(
  entries: QTrainingRouteQueueEntry[],
  root = process.cwd(),
): void {
  const path = getQTrainingRouteQueuePath(root)
  mkdirSync(getQTrainingRunsDir(root), { recursive: true })
  writeFileSync(path, `${JSON.stringify(entries, null, 2)}\n`, 'utf8')
}

function writeQTrainingRouteWorkersUnlocked(
  entries: QTrainingRouteWorkerRegistration[],
  root = process.cwd(),
): void {
  const path = getQTrainingRouteWorkersPath(root)
  mkdirSync(getQTrainingRunsDir(root), { recursive: true })
  writeFileSync(path, `${JSON.stringify(entries, null, 2)}\n`, 'utf8')
}

function writeQTrainingRouteWorkerRuntimeUnlocked(
  entries: QTrainingRouteWorkerRuntimeEntry[],
  root = process.cwd(),
): void {
  const path = getQTrainingRouteWorkerRuntimePath(root)
  mkdirSync(getQTrainingRunsDir(root), { recursive: true })
  writeFileSync(path, `${JSON.stringify(entries, null, 2)}\n`, 'utf8')
}

function sortQTrainingRouteQueueEntries(
  entries: QTrainingRouteQueueEntry[],
): QTrainingRouteQueueEntry[] {
  return [...entries].sort((left, right) =>
    left.queuedAt < right.queuedAt ? -1 : left.queuedAt > right.queuedAt ? 1 : 0,
  )
}

function sortQTrainingRouteWorkers(
  workers: QTrainingRouteWorkerRegistration[],
): QTrainingRouteWorkerRegistration[] {
  return [...workers].sort((left, right) =>
    left.workerId < right.workerId ? -1 : left.workerId > right.workerId ? 1 : 0,
  )
}

function sortQTrainingRouteWorkerRuntime(
  entries: QTrainingRouteWorkerRuntimeEntry[],
): QTrainingRouteWorkerRuntimeEntry[] {
  return [...entries].sort((left, right) =>
    left.workerId < right.workerId ? -1 : left.workerId > right.workerId ? 1 : 0,
  )
}

function addMsToIsoTimestamp(timestamp: string, ttlMs: number): string {
  return new Date(Date.parse(timestamp) + ttlMs).toISOString()
}

export function isQTrainingRouteQueueClaimExpired(
  entry: QTrainingRouteQueueEntry,
  now = new Date().toISOString(),
): boolean {
  return (
    entry.status === 'claimed' &&
    !entry.dispatch &&
    !!entry.claim?.leaseExpiresAt &&
    entry.claim.leaseExpiresAt <= now
  )
}

export function isQTrainingRouteQueuePendingAssignment(
  entry: QTrainingRouteQueueEntry | null | undefined,
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

export function isQTrainingRouteQueuePendingRemoteResult(
  entry: QTrainingRouteQueueEntry | null | undefined,
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

export function getQTrainingRouteQueueDisplayStatus(
  entry: QTrainingRouteQueueEntry | null | undefined,
): QTrainingRouteQueueDisplayStatus | null {
  if (!entry) {
    return null
  }
  if (isQTrainingRouteQueuePendingAssignment(entry)) {
    return 'pending_assignment'
  }
  return entry.status
}

export function getQTrainingRouteQueueStatusSummary(
  entry: QTrainingRouteQueueEntry | null | undefined,
): string {
  const displayStatus = getQTrainingRouteQueueDisplayStatus(entry)
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

function formatQTrainingWorkerCount(
  workerCount: number,
  compact: boolean,
): string {
  if (compact) {
    return `${workerCount}w`
  }
  return `${workerCount} worker${workerCount === 1 ? '' : 's'}`
}

export function buildQTrainingRouteReceipt(args?: {
  snapshot?: ReturnType<typeof getLatestQTrainingSnapshot> | null
  compact?: boolean
}): QTrainingRouteReceipt | null {
  const snapshot = args?.snapshot ?? getLatestQTrainingSnapshot()
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
    getQTrainingRouteQueueDisplayStatus(routeQueue) ?? 'queued'
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
      parts.push(formatQTrainingWorkerCount(workerCount, compact))
    }
  }

  switch (displayStatus) {
    case 'pending_assignment': {
      const parts = [compact ? 'Q pending' : 'Q pending assignment']
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
      const parts = [compact ? 'Q claimed' : 'Q route claimed']
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
      const parts = [compact ? 'Q routed' : 'Q route dispatched']
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
      const parts = [compact ? 'Q done' : 'Q route completed']
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
      const parts = [compact ? 'Q failed' : 'Q route failed']
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
        text: compact ? 'Q rejected' : 'Q route rejected',
        tone: 'error',
      }
    case 'queued': {
      const parts = [compact ? 'Q queued' : 'Q route queued']
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

export function isQTrainingRouteWorkerExpired(
  worker: QTrainingRouteWorkerRegistration,
  now = new Date().toISOString(),
): boolean {
  return worker.leaseExpiresAt <= now
}

function normalizeQTrainingRouteQueueClaims(
  entries: QTrainingRouteQueueEntry[],
  now = new Date().toISOString(),
): { entries: QTrainingRouteQueueEntry[]; changed: boolean } {
  let changed = false
  const normalized = entries.map(entry => {
    if (!isQTrainingRouteQueueClaimExpired(entry, now)) {
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

function normalizeQTrainingRouteWorkers(
  workers: QTrainingRouteWorkerRegistration[],
  now = new Date().toISOString(),
): { workers: QTrainingRouteWorkerRegistration[]; changed: boolean } {
  const normalized = workers.filter(worker => !isQTrainingRouteWorkerExpired(worker, now))
  return {
    workers: normalized,
    changed: normalized.length !== workers.length,
  }
}

function workerSupportsQBaseModel(
  worker: QTrainingRouteWorkerRegistration,
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

function selectQTrainingRouteWorker(
  entry: QTrainingRouteQueueEntry,
  workers: QTrainingRouteWorkerRegistration[],
): {
  worker: QTrainingRouteWorkerRegistration
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
      return workerSupportsQBaseModel(worker, entry.baseModel)
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

function rebalanceQTrainingRouteQueueAssignments(
  entries: QTrainingRouteQueueEntry[],
  workers: QTrainingRouteWorkerRegistration[],
  now = new Date().toISOString(),
): { entries: QTrainingRouteQueueEntry[]; changed: boolean } {
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
    const selection = selectQTrainingRouteWorker(entry, workers)
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
    const nextAssignment: QTrainingRouteQueueAssignment = {
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

export function reapStaleQTrainingRouteQueueClaims(args?: {
  root?: string
  now?: string
}): QTrainingRouteQueueEntry[] {
  const root = args?.root ?? process.cwd()
  const now = args?.now ?? new Date().toISOString()

  return withQTrainingRouteQueueLock(root, () => {
    const current = readQTrainingRouteQueueUnlocked(root)
    const normalized = normalizeQTrainingRouteQueueClaims(current, now)
    const workers = normalizeQTrainingRouteWorkers(
      readQTrainingRouteWorkersUnlocked(root),
      now,
    )
    const rebalanced = rebalanceQTrainingRouteQueueAssignments(
      normalized.entries,
      workers.workers,
      now,
    )
    if (workers.changed) {
      writeQTrainingRouteWorkersUnlocked(
        sortQTrainingRouteWorkers(workers.workers),
        root,
      )
    }
    if (normalized.changed || rebalanced.changed) {
      writeQTrainingRouteQueueUnlocked(
        sortQTrainingRouteQueueEntries(rebalanced.entries),
        root,
      )
    }
    return rebalanced.entries.filter(entry => entry.status === 'queued')
  })
}

export function readQTrainingRegistry(
  root = process.cwd(),
): QTrainingRegistryEntry[] {
  return readJsonIfExists<QTrainingRegistryEntry[]>(
    getQTrainingRegistryPath(root),
  ) ?? []
}

export function writeQTrainingRegistry(
  entries: QTrainingRegistryEntry[],
  root = process.cwd(),
): void {
  const path = getQTrainingRegistryPath(root)
  mkdirSync(getQTrainingRunsDir(root), { recursive: true })
  writeFileSync(path, `${JSON.stringify(entries, null, 2)}\n`, 'utf8')
}

export function readQTrainingRouteQueue(
  root = process.cwd(),
): QTrainingRouteQueueEntry[] {
  return readQTrainingRouteQueueUnlocked(root)
}

export function readQTrainingRouteWorkers(
  root = process.cwd(),
): QTrainingRouteWorkerRegistration[] {
  return withQTrainingRouteQueueLock(root, () => {
    const normalized = normalizeQTrainingRouteWorkers(
      readQTrainingRouteWorkersUnlocked(root),
    )
    if (normalized.changed) {
      writeQTrainingRouteWorkersUnlocked(
        sortQTrainingRouteWorkers(normalized.workers),
        root,
      )
    }
    return normalized.workers
  })
}

export function readQTrainingRouteWorkerRuntimeStatuses(
  root = process.cwd(),
): QTrainingRouteWorkerRuntimeEntry[] {
  return withQTrainingRouteQueueLock(root, () =>
    sortQTrainingRouteWorkerRuntime(
      readQTrainingRouteWorkerRuntimeUnlocked(root),
    ),
  )
}

export function writeQTrainingRouteQueue(
  entries: QTrainingRouteQueueEntry[],
  root = process.cwd(),
): void {
  writeQTrainingRouteQueueUnlocked(sortQTrainingRouteQueueEntries(entries), root)
}

export function upsertQTrainingRouteQueueEntry(
  entry: QTrainingRouteQueueEntry,
  root = process.cwd(),
): void {
  withQTrainingRouteQueueLock(root, () => {
    const existing = readQTrainingRouteQueueUnlocked(root)
    const updated = existing.filter(run => run.runId !== entry.runId)
    updated.push(entry)
    const workers = normalizeQTrainingRouteWorkers(
      readQTrainingRouteWorkersUnlocked(root),
    )
    const rebalanced = rebalanceQTrainingRouteQueueAssignments(
      updated,
      workers.workers,
    )
    if (workers.changed) {
      writeQTrainingRouteWorkersUnlocked(
        sortQTrainingRouteWorkers(workers.workers),
        root,
      )
    }
    writeQTrainingRouteQueueUnlocked(
      sortQTrainingRouteQueueEntries(rebalanced.entries),
      root,
    )
  })
}

export function upsertQTrainingRouteWorkerRuntimeStatus(
  entry: QTrainingRouteWorkerRuntimeEntry,
  root = process.cwd(),
): void {
  withQTrainingRouteQueueLock(root, () => {
    const existing = readQTrainingRouteWorkerRuntimeUnlocked(root)
    const updated = existing.filter(worker => worker.workerId !== entry.workerId)
    updated.push({
      ...entry,
      supportedBaseModels: [...new Set(entry.supportedBaseModels)],
      preferredLayerIds: [...new Set(entry.preferredLayerIds)],
    })
    writeQTrainingRouteWorkerRuntimeUnlocked(
      sortQTrainingRouteWorkerRuntime(updated),
      root,
    )
  })
}

export function removeQTrainingRouteWorkerRuntimeStatus(
  workerId: string,
  root = process.cwd(),
): QTrainingRouteWorkerRuntimeEntry | null {
  return withQTrainingRouteQueueLock(root, () => {
    const existing = readQTrainingRouteWorkerRuntimeUnlocked(root)
    const target = existing.find(worker => worker.workerId === workerId) ?? null
    if (!target) {
      return null
    }
    writeQTrainingRouteWorkerRuntimeUnlocked(
      sortQTrainingRouteWorkerRuntime(
        existing.filter(worker => worker.workerId !== workerId),
      ),
      root,
    )
    return target
  })
}

export function upsertQTrainingRouteWorker(
  worker: QTrainingRouteWorkerRegistration,
  root = process.cwd(),
): QTrainingRouteWorkerRegistration {
  return withQTrainingRouteQueueLock(root, () => {
    const now = worker.heartbeatAt
    const currentWorkers = normalizeQTrainingRouteWorkers(
      readQTrainingRouteWorkersUnlocked(root),
      now,
    )
    const existingWorker = currentWorkers.workers.find(
      entry => entry.workerId === worker.workerId,
    )
    const updatedWorker: QTrainingRouteWorkerRegistration = {
      ...worker,
      registeredAt: existingWorker?.registeredAt ?? worker.registeredAt,
      supportedBaseModels: [...new Set(worker.supportedBaseModels)],
      preferredLayerIds: [...new Set(worker.preferredLayerIds)],
    }
    const updatedWorkers = currentWorkers.workers
      .filter(entry => entry.workerId !== worker.workerId)
      .concat(updatedWorker)
    const queue = readQTrainingRouteQueueUnlocked(root)
    const rebalanced = rebalanceQTrainingRouteQueueAssignments(
      queue,
      updatedWorkers,
      now,
    )
    writeQTrainingRouteWorkersUnlocked(
      sortQTrainingRouteWorkers(updatedWorkers),
      root,
    )
    if (currentWorkers.changed || rebalanced.changed) {
      writeQTrainingRouteQueueUnlocked(
        sortQTrainingRouteQueueEntries(rebalanced.entries),
        root,
      )
    }
    return updatedWorker
  })
}

export function removeQTrainingRouteWorker(
  workerId: string,
  root = process.cwd(),
): QTrainingRouteWorkerRegistration | null {
  return withQTrainingRouteQueueLock(root, () => {
    const now = new Date().toISOString()
    const currentWorkers = normalizeQTrainingRouteWorkers(
      readQTrainingRouteWorkersUnlocked(root),
      now,
    )
    const target =
      currentWorkers.workers.find(worker => worker.workerId === workerId) ?? null
    if (!target) {
      if (currentWorkers.changed) {
        writeQTrainingRouteWorkersUnlocked(
          sortQTrainingRouteWorkers(currentWorkers.workers),
          root,
        )
      }
      return null
    }
    const updatedWorkers = currentWorkers.workers.filter(
      worker => worker.workerId !== workerId,
    )
    const queue = readQTrainingRouteQueueUnlocked(root)
    const rebalanced = rebalanceQTrainingRouteQueueAssignments(
      queue,
      updatedWorkers,
      now,
    )
    writeQTrainingRouteWorkersUnlocked(
      sortQTrainingRouteWorkers(updatedWorkers),
      root,
    )
    if (currentWorkers.changed || rebalanced.changed) {
      writeQTrainingRouteQueueUnlocked(
        sortQTrainingRouteQueueEntries(rebalanced.entries),
        root,
      )
    }
    return target
  })
}

export function getQTrainingRouteWorker(
  workerId: string,
  root = process.cwd(),
): QTrainingRouteWorkerRegistration | null {
  return readQTrainingRouteWorkers(root).find(worker => worker.workerId === workerId) ?? null
}

export function reapStaleQTrainingRouteWorkers(args?: {
  root?: string
  now?: string
}): QTrainingRouteWorkerRegistration[] {
  const root = args?.root ?? process.cwd()
  const now = args?.now ?? new Date().toISOString()
  return withQTrainingRouteQueueLock(root, () => {
    const currentWorkers = readQTrainingRouteWorkersUnlocked(root)
    const normalized = normalizeQTrainingRouteWorkers(currentWorkers, now)
    const queue = readQTrainingRouteQueueUnlocked(root)
    const rebalanced = rebalanceQTrainingRouteQueueAssignments(
      queue,
      normalized.workers,
      now,
    )
    if (normalized.changed) {
      writeQTrainingRouteWorkersUnlocked(
        sortQTrainingRouteWorkers(normalized.workers),
        root,
      )
    }
    if (normalized.changed || rebalanced.changed) {
      writeQTrainingRouteQueueUnlocked(
        sortQTrainingRouteQueueEntries(rebalanced.entries),
        root,
      )
    }
    return normalized.workers
  })
}

export function getQTrainingRouteQueueEntry(
  runId: string,
  root = process.cwd(),
): QTrainingRouteQueueEntry | null {
  return (
    readQTrainingRouteQueue(root).find(entry => entry.runId === runId) ?? null
  )
}

export function getNextQTrainingRoutePendingRemoteResult(args: {
  workerId?: string | null
  manifestPath?: string | null
  root?: string
}): QTrainingRouteQueueEntry | null {
  const root = args.root ?? process.cwd()
  const manifestPath = args.manifestPath ? resolve(args.manifestPath) : null
  const queue = readQTrainingRouteQueue(root)
    .filter(entry =>
      isQTrainingRouteQueuePendingRemoteResult(entry, args.workerId),
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

export function getNextQueuedQTrainingRoute(
  root = process.cwd(),
): QTrainingRouteQueueEntry | null {
  const queue = readQTrainingRouteQueue(root)
  const now = new Date().toISOString()
  return (
    queue.find(entry => entry.status === 'queued') ??
    queue.find(entry => isQTrainingRouteQueueClaimExpired(entry, now)) ??
    null
  )
}

export function claimQTrainingRouteQueueEntry(args: {
  workerId: string
  runId?: string | null
  manifestPath?: string | null
  claimTtlMs?: number
  root?: string
  claimedAt?: string
}): QTrainingRouteQueueEntry | null {
  const root = args.root ?? process.cwd()
  const claimedAt = args.claimedAt ?? new Date().toISOString()
  const claimTtlMs = args.claimTtlMs ?? DEFAULT_Q_ROUTE_QUEUE_LEASE_MS
  const explicitTarget = Boolean(args.runId || args.manifestPath)

  return withQTrainingRouteQueueLock(root, () => {
    const current = readQTrainingRouteQueueUnlocked(root)
    const normalized = normalizeQTrainingRouteQueueClaims(current, claimedAt)
    const workers = normalizeQTrainingRouteWorkers(
      readQTrainingRouteWorkersUnlocked(root),
      claimedAt,
    )
    const rebalanced = rebalanceQTrainingRouteQueueAssignments(
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
        writeQTrainingRouteWorkersUnlocked(
          sortQTrainingRouteWorkers(workers.workers),
          root,
        )
      }
      if (normalized.changed || rebalanced.changed) {
        writeQTrainingRouteQueueUnlocked(
          sortQTrainingRouteQueueEntries(queue),
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
        workerSupportsQBaseModel(claimant, target.baseModel)
      if (!claimantEligible) {
        if (workers.changed) {
          writeQTrainingRouteWorkersUnlocked(
            sortQTrainingRouteWorkers(workers.workers),
            root,
          )
        }
        if (normalized.changed || rebalanced.changed) {
          writeQTrainingRouteQueueUnlocked(
            sortQTrainingRouteQueueEntries(queue),
            root,
          )
        }
        return null
      }
    }

    if (
      target.status === 'claimed' &&
      target.claim?.workerId === args.workerId &&
      !isQTrainingRouteQueueClaimExpired(target, claimedAt)
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
      writeQTrainingRouteQueueUnlocked(
        sortQTrainingRouteQueueEntries(updated),
        root,
      )
      return reclaimed
    }

    if (
      target.assignmentAuthority === 'immaculate' &&
      !target.assignment?.workerId
    ) {
      if (explicitTarget) {
        const explicitlyClaimedEntry: QTrainingRouteQueueEntry = {
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
          writeQTrainingRouteWorkersUnlocked(
            sortQTrainingRouteWorkers(workers.workers),
            root,
          )
        }
        writeQTrainingRouteQueueUnlocked(
          sortQTrainingRouteQueueEntries(updated),
          root,
        )
        return explicitlyClaimedEntry
      }
      if (workers.changed) {
        writeQTrainingRouteWorkersUnlocked(
          sortQTrainingRouteWorkers(workers.workers),
          root,
        )
      }
      if (normalized.changed || rebalanced.changed) {
        writeQTrainingRouteQueueUnlocked(
          sortQTrainingRouteQueueEntries(queue),
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
        writeQTrainingRouteWorkersUnlocked(
          sortQTrainingRouteWorkers(workers.workers),
          root,
        )
      }
      if (normalized.changed || rebalanced.changed) {
        writeQTrainingRouteQueueUnlocked(
          sortQTrainingRouteQueueEntries(queue),
          root,
        )
      }
      return null
    }

    if (target.status !== 'queued') {
      if (workers.changed) {
        writeQTrainingRouteWorkersUnlocked(
          sortQTrainingRouteWorkers(workers.workers),
          root,
        )
      }
      if (normalized.changed || rebalanced.changed) {
        writeQTrainingRouteQueueUnlocked(
          sortQTrainingRouteQueueEntries(queue),
          root,
        )
      }
      return null
    }

    const claimedEntry: QTrainingRouteQueueEntry = {
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
      writeQTrainingRouteWorkersUnlocked(
        sortQTrainingRouteWorkers(workers.workers),
        root,
      )
    }
    writeQTrainingRouteQueueUnlocked(
      sortQTrainingRouteQueueEntries(updated),
      root,
    )
    return claimedEntry
  })
}

export function claimNextQueuedQTrainingRoute(args: {
  workerId: string
  claimTtlMs?: number
  root?: string
  claimedAt?: string
}): QTrainingRouteQueueEntry | null {
  return claimQTrainingRouteQueueEntry({
    workerId: args.workerId,
    claimTtlMs: args.claimTtlMs,
    root: args.root,
    claimedAt: args.claimedAt,
  })
}

export function updateQTrainingRouteQueueClaim(args: {
  runId: string
  workerId: string
  status: 'claimed' | 'rejected'
  preflight: QTrainingPreflight
  signatureVerified: boolean
  integrityVerified: boolean
  rejectionReason?: string | null
  claimTtlMs?: number
  root?: string
  updatedAt?: string
}): QTrainingRouteQueueEntry | null {
  const root = args.root ?? process.cwd()
  const updatedAt = args.updatedAt ?? new Date().toISOString()
  const claimTtlMs = args.claimTtlMs ?? DEFAULT_Q_ROUTE_QUEUE_LEASE_MS

  return withQTrainingRouteQueueLock(root, () => {
    const current = readQTrainingRouteQueueUnlocked(root)
    const normalized = normalizeQTrainingRouteQueueClaims(current, updatedAt)
    const target = normalized.entries.find(entry => entry.runId === args.runId)
    if (
      !target ||
      target.status !== 'claimed' ||
      target.claim?.workerId !== args.workerId
    ) {
      if (normalized.changed) {
        writeQTrainingRouteQueueUnlocked(
          sortQTrainingRouteQueueEntries(normalized.entries),
          root,
        )
      }
      return null
    }

    const updatedEntry: QTrainingRouteQueueEntry = {
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
    writeQTrainingRouteQueueUnlocked(
      sortQTrainingRouteQueueEntries(updated),
      root,
    )
    return updatedEntry
  })
}

export function releaseQTrainingRouteQueueClaim(args: {
  runId: string
  workerId: string
  root?: string
  updatedAt?: string
}): QTrainingRouteQueueEntry | null {
  const root = args.root ?? process.cwd()
  const updatedAt = args.updatedAt ?? new Date().toISOString()

  return withQTrainingRouteQueueLock(root, () => {
    const current = readQTrainingRouteQueueUnlocked(root)
    const normalized = normalizeQTrainingRouteQueueClaims(current, updatedAt)
    const target = normalized.entries.find(entry => entry.runId === args.runId)
    if (
      !target ||
      target.status !== 'claimed' ||
      target.claim?.workerId !== args.workerId
    ) {
      if (normalized.changed) {
        writeQTrainingRouteQueueUnlocked(
          sortQTrainingRouteQueueEntries(normalized.entries),
          root,
        )
      }
      return null
    }

    const updatedEntry: QTrainingRouteQueueEntry = {
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
    writeQTrainingRouteQueueUnlocked(
      sortQTrainingRouteQueueEntries(updated),
      root,
    )
    return updatedEntry
  })
}

export function renewQTrainingRouteQueueClaim(args: {
  runId: string
  workerId: string
  claimTtlMs?: number
  root?: string
  renewedAt?: string
}): QTrainingRouteQueueEntry | null {
  const root = args.root ?? process.cwd()
  const renewedAt = args.renewedAt ?? new Date().toISOString()
  const claimTtlMs = args.claimTtlMs ?? DEFAULT_Q_ROUTE_QUEUE_LEASE_MS

  return withQTrainingRouteQueueLock(root, () => {
    const current = readQTrainingRouteQueueUnlocked(root)
    const normalized = normalizeQTrainingRouteQueueClaims(current, renewedAt)
    const target = normalized.entries.find(entry => entry.runId === args.runId)
    if (
      !target ||
      target.status !== 'claimed' ||
      target.claim?.workerId !== args.workerId
    ) {
      if (normalized.changed) {
        writeQTrainingRouteQueueUnlocked(
          sortQTrainingRouteQueueEntries(normalized.entries),
          root,
        )
      }
      return null
    }

    const renewedEntry: QTrainingRouteQueueEntry = {
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
    writeQTrainingRouteQueueUnlocked(
      sortQTrainingRouteQueueEntries(updated),
      root,
    )
    return renewedEntry
  })
}

export function finalizeQTrainingRouteQueueDispatch(args: {
  runId: string
  workerId: string
  executionMode: QTrainingExecutionMode
  pid: number | null
  transport?: QTrainingRouteDispatchTransport
  executionEndpoint?: string | null
  acknowledgedAt?: string | null
  remoteStatus?: number | null
  remoteAccepted?: boolean | null
  remoteExecutionId?: string | null
  remoteSummary?: string | null
  remoteStateUrl?: string | null
  root?: string
  dispatchedAt?: string
}): QTrainingRouteQueueEntry | null {
  const root = args.root ?? process.cwd()
  const dispatchedAt = args.dispatchedAt ?? new Date().toISOString()

  return withQTrainingRouteQueueLock(root, () => {
    const current = readQTrainingRouteQueueUnlocked(root)
    const normalized = normalizeQTrainingRouteQueueClaims(current, dispatchedAt)
    const target = normalized.entries.find(entry => entry.runId === args.runId)
    if (
      !target ||
      target.status !== 'claimed' ||
      target.claim?.workerId !== args.workerId
    ) {
      if (normalized.changed) {
        writeQTrainingRouteQueueUnlocked(
          sortQTrainingRouteQueueEntries(normalized.entries),
          root,
        )
      }
      return null
    }

    const updatedEntry: QTrainingRouteQueueEntry = {
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
    writeQTrainingRouteQueueUnlocked(
      sortQTrainingRouteQueueEntries(updated),
      root,
    )
    return updatedEntry
  })
}

export function finalizeQTrainingRouteQueueCompletion(args: {
  runId: string
  workerId: string
  executionId?: string | null
  status: QTrainingRouteResultStatus
  summary?: string | null
  stateUrl?: string | null
  root?: string
  finishedAt?: string
}): QTrainingRouteQueueEntry | null {
  const root = args.root ?? process.cwd()
  const finishedAt = args.finishedAt ?? new Date().toISOString()

  return withQTrainingRouteQueueLock(root, () => {
    const current = readQTrainingRouteQueueUnlocked(root)
    const normalized = normalizeQTrainingRouteQueueClaims(current, finishedAt)
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
        writeQTrainingRouteQueueUnlocked(
          sortQTrainingRouteQueueEntries(normalized.entries),
          root,
        )
      }
      return null
    }

    const updatedEntry: QTrainingRouteQueueEntry = {
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
    writeQTrainingRouteQueueUnlocked(
      sortQTrainingRouteQueueEntries(updated),
      root,
    )
    return updatedEntry
  })
}

export function upsertQTrainingRegistryEntry(
  entry: QTrainingRegistryEntry,
  root = process.cwd(),
): void {
  const existing = readQTrainingRegistry(root)
  const updated = existing.filter(run => run.runId !== entry.runId)
  updated.push(entry)
  updated.sort((left, right) =>
    left.launchedAt < right.launchedAt ? -1 : left.launchedAt > right.launchedAt ? 1 : 0,
  )
  writeQTrainingRegistry(updated, root)
}

export function readQRunState(outputDir: string): QRunState | null {
  return readJsonIfExists<QRunState>(join(outputDir, 'run-state.json'))
}

export function getLatestQTrainingSnapshot(root = process.cwd()): {
  registry: QTrainingRegistryEntry
  state: QRunState | null
  routeQueue: QTrainingRouteQueueEntry | null
} | null {
  const runs = readQTrainingRegistry(root)
  const latest = runs.at(-1)
  if (!latest) {
    return null
  }
  return {
    registry: latest,
    state: readQRunState(latest.outputDir),
    routeQueue: getQTrainingRouteQueueEntry(latest.runId, root),
  }
}
