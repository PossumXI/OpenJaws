import { closeSync, existsSync, mkdirSync, openSync, writeFileSync } from 'fs'
import { spawn } from 'child_process'
import { join, resolve } from 'path'
import {
  DEFAULT_Q_BASE_MODEL,
  buildQTrainingPythonEnv,
  buildQTrainingRouteManifest,
  evaluateQTrainingPreflight,
  getOpenJawsTrainingModelLabel,
  peekQTrainingFastPathWindow,
  getQTrainingRouteQueueDisplayStatus,
  getQTrainingRouteQueueStatusSummary,
  getQTrainingRouteQueueEntry,
  getQTrainingRunsDir,
  type QTrainingExecutionMode,
  type QTrainingPreflight,
  type QTrainingRouteFailure,
  type QTrainingRouteQueueEntry,
  type QTrainingRouteRequest,
  type QTrainingStatus,
  stageQTrainingRouteFile,
  updateQTrainingFastPathWindow,
  upsertQTrainingRegistryEntry,
  upsertQTrainingRouteQueueEntry,
} from '../utils/qTraining.js'
import {
  assignImmaculateHarnessWorker,
  callImmaculateHarness,
  getImmaculateHarnessDeckReceipt,
  getImmaculateHarnessStatus,
  normalizeImmaculateObjective,
} from '../utils/immaculateHarness.js'
import {
  isQTransportFastPathSuppressed,
  shouldRequestImmaculateQRoute,
  summarizeQFastPathSuppression,
} from '../immaculate/policies.js'

export type QTrainLaunchCliOptions = {
  root: string | null
  bundleDir: string
  outputDir: string | null
  baseModel: string
  runName: string | null
  lineageId: string | null
  phaseId: string | null
  python: string
  tags: string[]
  languages: string[]
  useCpu: boolean
  maxSteps: number | null
  numTrainEpochs: number | null
  allowHostRisk: boolean
  routeMode: 'auto' | 'local' | 'immaculate'
}

export type ImmaculateQRouteAttempt = {
  routeRequest: QTrainingRouteRequest | null
  routeFailure: QTrainingRouteFailure | null
}

export type QTrainLaunchResult = {
  runId: string
  status: QTrainingStatus
  executionMode: QTrainingExecutionMode
  pid: number | null
  launchedAt: string
  outputDir: string
  trainFile: string
  evalFile: string | null
  stdoutLog: string
  stderrLog: string
  runStatePath: string
  root: string
  selectedTags: string[]
  selectedLanguages: string[]
  lineageId: string | null
  phaseId: string | null
  preflight: QTrainingPreflight
  routeRequest: QTrainingRouteRequest | null
  routeFailure: QTrainingRouteFailure | null
  routeQueue?: QTrainingRouteQueueEntry | null
  routeQueueDisplayStatus?: string
  routeQueueSummary?: string
}

export function buildQRouteTarget(args: {
  baseModel: string
  tags: string[]
  languages: string[]
  runName: string | null
}): string {
  const modelLabel = getOpenJawsTrainingModelLabel(args.baseModel)
  const parts = [
    'q-train',
    modelLabel,
    'opencheek agents',
    'openjaws tools',
    'immaculate harness',
    args.tags.length > 0 ? `tags ${args.tags.join(',')}` : null,
    args.languages.length > 0 ? `langs ${args.languages.join(',')}` : null,
    args.runName?.trim() ? `run ${args.runName.trim()}` : null,
  ].filter(Boolean)
  return normalizeImmaculateObjective(parts.join(' · '), 160) ?? 'q-train'
}

export function buildQRouteFailure(args: {
  stage: QTrainingRouteFailure['stage']
  code: QTrainingRouteFailure['code']
  summary: string
  detail?: string | null
  harnessUrl?: string | null
  recommendedLayerId?: string | null
  controlStatus?: number | null
  controlSummary?: string | null
  failedAt?: string
}): QTrainingRouteFailure {
  return {
    route: 'immaculate',
    failedAt: args.failedAt ?? new Date().toISOString(),
    stage: args.stage,
    code: args.code,
    summary: args.summary,
    detail: args.detail ?? null,
    harnessUrl: args.harnessUrl ?? null,
    recommendedLayerId: args.recommendedLayerId ?? null,
    controlStatus: args.controlStatus ?? null,
    controlSummary: args.controlSummary ?? null,
  }
}

export function isQRouteFailureLike(
  value: unknown,
): value is QTrainingRouteFailure {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as QTrainingRouteFailure).failedAt === 'string' &&
      typeof (value as QTrainingRouteFailure).stage === 'string' &&
      typeof (value as QTrainingRouteFailure).code === 'string',
  )
}

function isTransportRouteFailure(
  failure: QTrainingRouteFailure | null | undefined,
): boolean {
  if (!failure) {
    return false
  }
  if (failure.code === 'fast_path_suppressed') {
    return false
  }
  const detail = `${failure.summary}\n${failure.detail ?? ''}`.toLowerCase()
  return [
    'unreachable',
    'timed out',
    'timeout',
    'transport',
    'network',
    'socket',
    'econn',
    'remote dispatch',
    'temporarily unavailable',
    '502',
    '503',
    '504',
  ].some(token => detail.includes(token))
}

export async function requestImmaculateQRoute(args: {
  root: string
  runId: string
  outputDir: string
  baseModel: string
  runName: string | null
  lineageId: string | null
  phaseId: string | null
  selectedTags: string[]
  selectedLanguages: string[]
  trainFile: string
  evalFile: string | null
  useCpu: boolean
  maxSteps: number | null
  numTrainEpochs: number | null
  preflight: QTrainingPreflight
}): Promise<ImmaculateQRouteAttempt> {
  const status = await getImmaculateHarnessStatus()
  if (!status.enabled || !status.reachable) {
    return {
      routeRequest: null,
      routeFailure: buildQRouteFailure({
        stage: 'status',
        code: 'harness_unreachable',
        summary: 'Immaculate route request failed: harness is unavailable.',
        detail: status.error ?? 'Immaculate harness is disabled or unreachable.',
        harnessUrl: status.harnessUrl,
      }),
    }
  }

  let deckReceipt = null
  try {
    deckReceipt = await getImmaculateHarnessDeckReceipt()
  } catch {
    deckReceipt = null
  }
  const target = buildQRouteTarget({
    baseModel: args.baseModel,
    tags: args.selectedTags,
    languages: args.selectedLanguages,
    runName: args.runName,
  })
  const requestedAt = new Date().toISOString()
  const manifestPath = join(args.outputDir, 'route-request.json')
  const stagedTrainIntegrity = stageQTrainingRouteFile({
    sourcePath: args.trainFile,
    manifestDir: args.outputDir,
    relativePath: join('bundle', 'train.jsonl'),
  })
  const stagedEvalIntegrity = args.evalFile
    ? stageQTrainingRouteFile({
        sourcePath: args.evalFile,
        manifestDir: args.outputDir,
        relativePath: join('bundle', 'eval.jsonl'),
      })
    : null
  const integrity = {
    algorithm: 'sha256' as const,
    trainFile: stagedTrainIntegrity,
    evalFile: stagedEvalIntegrity,
  }
  const controlResult = await callImmaculateHarness(
    {
      action: 'control',
      control: {
        action: 'pulse',
        target,
      },
    },
    { timeoutMs: 5_000 },
  ).catch(error => {
    const message = error instanceof Error ? error.message : String(error)
    return buildQRouteFailure({
      stage: 'control',
      code: 'control_failed',
      summary: 'Immaculate route request failed during control pulse.',
      detail: message,
      harnessUrl: status.harnessUrl,
      recommendedLayerId: deckReceipt?.recommendedLayerId ?? null,
    })
  })
  if (isQRouteFailureLike(controlResult)) {
    return {
      routeRequest: null,
      routeFailure: controlResult,
    }
  }
  let controlAccepted = false
  try {
    const parsed = JSON.parse(controlResult.json) as Record<string, unknown>
    controlAccepted = parsed.accepted === true
  } catch {
    controlAccepted = false
  }
  if (!controlAccepted) {
    return {
      routeRequest: null,
      routeFailure: buildQRouteFailure({
        stage: 'control',
        code: 'control_rejected',
        summary: 'Immaculate route request was rejected by control pulse.',
        detail:
          controlResult.summary ?? 'The harness rejected the route request.',
        harnessUrl: status.harnessUrl,
        recommendedLayerId: deckReceipt?.recommendedLayerId ?? null,
        controlStatus: controlResult.status,
        controlSummary: controlResult.summary,
      }),
    }
  }

  const assignmentResult = await assignImmaculateHarnessWorker({
    requestedExecutionDecision: args.preflight.decision,
    baseModel: args.baseModel,
    preferredLayerIds: deckReceipt?.recommendedLayerId
      ? [deckReceipt.recommendedLayerId]
      : [],
    recommendedLayerId: deckReceipt?.recommendedLayerId ?? null,
    target,
  }).catch(error => {
    const message = error instanceof Error ? error.message : String(error)
    return buildQRouteFailure({
      stage: 'assignment',
      code: 'assignment_failed',
      summary: 'Immaculate route worker assignment failed.',
      detail: message,
      harnessUrl: status.harnessUrl,
      recommendedLayerId: deckReceipt?.recommendedLayerId ?? null,
      controlStatus: controlResult.status,
      controlSummary: controlResult.summary,
    })
  })
  if (isQRouteFailureLike(assignmentResult)) {
    return {
      routeRequest: null,
      routeFailure: assignmentResult,
    }
  }
  const harnessAssignment = assignmentResult?.assignment ?? null
  const recommendedLayerId =
    assignmentResult?.recommendedLayerId ?? deckReceipt?.recommendedLayerId ?? null

  try {
    const routeRequest: QTrainingRouteRequest = {
      route: 'immaculate',
      requestedAt,
      target,
      recommendedLayerId,
      manifestPath,
      controlStatus: controlResult.status,
      controlAccepted,
      controlSummary: controlResult.summary,
      harnessSnapshot: {
        harnessUrl: status.harnessUrl,
        recommendedLayerId,
        layerCount: deckReceipt?.layerCount ?? null,
        executionCount: deckReceipt?.executionCount ?? null,
        workerCount:
          assignmentResult?.workerCount ?? assignmentResult?.workers.length ?? null,
        healthyWorkerCount: assignmentResult?.healthyWorkerCount ?? null,
        staleWorkerCount: assignmentResult?.staleWorkerCount ?? null,
        faultedWorkerCount: assignmentResult?.faultedWorkerCount ?? null,
        eligibleWorkerCount: assignmentResult?.eligibleWorkerCount ?? null,
        blockedWorkerCount: assignmentResult?.blockedWorkerCount ?? null,
        assignment: harnessAssignment
          ? {
              workerId: harnessAssignment.workerId,
              workerLabel: harnessAssignment.workerLabel ?? null,
              hostLabel: harnessAssignment.hostLabel ?? null,
              executionProfile: harnessAssignment.executionProfile,
              executionEndpoint: harnessAssignment.executionEndpoint ?? null,
              assignedAt: harnessAssignment.assignedAt,
              reason: harnessAssignment.reason,
              score: harnessAssignment.score,
              healthStatus: harnessAssignment.healthStatus,
              healthSummary: harnessAssignment.healthSummary ?? null,
            }
          : null,
      },
      integrity,
    }
    const manifest = buildQTrainingRouteManifest({
      runId: args.runId,
      routeRequest,
      training: {
        baseModel: args.baseModel,
        runName: args.runName,
        trainFile: stagedTrainIntegrity.path,
        evalFile: stagedEvalIntegrity?.path ?? null,
        selectedTags: args.selectedTags,
        selectedLanguages: args.selectedLanguages,
        outputDir: '.',
        useCpu: args.useCpu,
        lineageId: args.lineageId,
        phaseId: args.phaseId,
        maxSteps: args.maxSteps,
        numTrainEpochs: args.numTrainEpochs,
      },
      preflight: args.preflight,
    })
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
    upsertQTrainingRouteQueueEntry(
      {
        runId: args.runId,
        manifestPath,
        queuedAt: requestedAt,
        updatedAt: requestedAt,
        status: 'queued',
        assignmentAuthority: 'immaculate',
        target,
        recommendedLayerId,
        healthyWorkerCount: assignmentResult?.healthyWorkerCount ?? null,
        staleWorkerCount: assignmentResult?.staleWorkerCount ?? null,
        faultedWorkerCount: assignmentResult?.faultedWorkerCount ?? null,
        eligibleWorkerCount: assignmentResult?.eligibleWorkerCount ?? null,
        blockedWorkerCount: assignmentResult?.blockedWorkerCount ?? null,
        baseModel: args.baseModel,
        useCpu: args.useCpu,
        lineageId: args.lineageId,
        phaseId: args.phaseId,
        requestedExecutionDecision: args.preflight.decision,
        security: manifest.security,
        assignment: harnessAssignment
          ? {
              workerId: harnessAssignment.workerId,
              workerLabel: harnessAssignment.workerLabel ?? null,
              hostLabel: harnessAssignment.hostLabel ?? null,
              executionProfile: harnessAssignment.executionProfile,
              executionEndpoint: harnessAssignment.executionEndpoint ?? null,
              source: 'immaculate',
              assignedAt: harnessAssignment.assignedAt,
              reason: harnessAssignment.reason,
              score: harnessAssignment.score,
              healthStatus: harnessAssignment.healthStatus,
              healthSummary: harnessAssignment.healthSummary ?? null,
            }
          : null,
        claim: null,
        dispatch: null,
        rejectionReason: null,
      },
      args.root,
    )

    return {
      routeRequest: {
        ...manifest.routeRequest,
        security: manifest.security,
      },
      routeFailure: null,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      routeRequest: null,
      routeFailure: buildQRouteFailure({
        stage: 'manifest',
        code: 'manifest_failed',
        summary: 'Immaculate route request could not be recorded locally.',
        detail: message,
        harnessUrl: status.harnessUrl,
        recommendedLayerId,
        controlStatus: controlResult.status,
        controlSummary: controlResult.summary,
      }),
    }
  }
}

export function writeQLaunchState(args: {
  runId: string
  status: QTrainingStatus
  executionMode: QTrainingExecutionMode
  pid: number | null
  launchedAt: string
  outputDir: string
  trainFile: string
  evalFile: string | null
  baseModel: string
  runName: string | null
  selectedTags: string[]
  selectedLanguages: string[]
  lineageId: string | null
  phaseId: string | null
  maxSteps: number | null
  stdoutLog: string
  stderrLog: string
  runStatePath: string
  preflight: QTrainingPreflight | null
  routeRequest: QTrainingRouteRequest | null
  routeFailure?: QTrainingRouteFailure | null
  routeQueue?: QTrainingRouteQueueEntry | null
  root?: string
}): void {
  writeFileSync(
    args.runStatePath,
    `${JSON.stringify(
      {
        status: args.status,
        executionMode: args.executionMode,
        pid: args.pid,
        createdAt: args.launchedAt,
        updatedAt: args.launchedAt,
        baseModel: args.baseModel,
        trainFile: args.trainFile,
        evalFile: args.evalFile,
        outputDir: args.outputDir,
        runName: args.runName,
        selectedTags: args.selectedTags,
        selectedLanguages: args.selectedLanguages,
        lineageId: args.lineageId,
        phaseId: args.phaseId,
        maxSteps: args.maxSteps,
        preflight: args.preflight,
        routeRequest: args.routeRequest,
        routeFailure: args.routeFailure ?? null,
        routeQueue: args.routeQueue ?? null,
        routeQueueDisplayStatus: getQTrainingRouteQueueDisplayStatus(
          args.routeQueue ?? null,
        ),
        routeQueueSummary: getQTrainingRouteQueueStatusSummary(
          args.routeQueue ?? null,
        ),
      },
      null,
      2,
    )}\n`,
    'utf8',
  )
  upsertQTrainingRegistryEntry(
    {
      runId: args.runId,
      status: args.status,
      executionMode: args.executionMode,
      pid: args.pid,
      launchedAt: args.launchedAt,
      outputDir: args.outputDir,
      trainFile: args.trainFile,
      evalFile: args.evalFile,
      baseModel: args.baseModel,
      selectedTags: args.selectedTags,
      selectedLanguages: args.selectedLanguages,
      runName: args.runName,
      lineageId: args.lineageId,
      phaseId: args.phaseId,
      logFiles: {
        stdout: args.stdoutLog,
        stderr: args.stderrLog,
      },
      runStatePath: args.runStatePath,
      preflight: args.preflight,
      routeRequest: args.routeRequest,
      routeFailure: args.routeFailure ?? null,
    },
    args.root,
  )
}

export async function launchQTrainingRun(
  options: QTrainLaunchCliOptions,
): Promise<QTrainLaunchResult> {
  const root = options.root ?? process.cwd()
  const runId = makeQTrainRunId()
  const outputDir = options.outputDir ?? resolve(getQTrainingRunsDir(root), runId)
  const trainFile = resolve(options.bundleDir, 'train.jsonl')
  const evalFile = resolve(options.bundleDir, 'eval.jsonl')
  const stdoutLog = join(outputDir, 'stdout.log')
  const stderrLog = join(outputDir, 'stderr.log')
  const runStatePath = join(outputDir, 'run-state.json')
  const evalFilePath = existsSync(evalFile) ? evalFile : null

  if (!existsSync(trainFile)) {
    throw new Error(
      `Missing training split at ${trainFile}. Run bun run prepare:sft or bun run audit:sft first.`,
    )
  }

  mkdirSync(outputDir, { recursive: true })
  const launchedAt = new Date().toISOString()
  const preflight = evaluateQTrainingPreflight({
    baseModel: options.baseModel,
    trainFile,
    pythonPath: options.python,
    useCpu: options.useCpu,
  })

  const forceLocalLaunch =
    options.allowHostRisk && preflight.decision === 'remote_required'
  const fastPathWindow = peekQTrainingFastPathWindow({ root })
  const fastPathSuppressed =
    isQTransportFastPathSuppressed(fastPathWindow) &&
    options.routeMode !== 'local'
  const wantsImmaculateRoute = shouldRequestImmaculateQRoute({
    preflightDecision: preflight.decision,
    routeMode: options.routeMode,
    forceLocalLaunch,
    fallbackWindow: fastPathWindow,
  })
  const routeAttempt = wantsImmaculateRoute
    ? await requestImmaculateQRoute({
        runId,
        outputDir,
        baseModel: options.baseModel,
        runName: options.runName,
        lineageId: options.lineageId,
        phaseId: options.phaseId,
        selectedTags: options.tags,
        selectedLanguages: options.languages,
        trainFile,
        evalFile: evalFilePath,
        useCpu: options.useCpu,
        maxSteps: options.maxSteps,
        numTrainEpochs: options.numTrainEpochs,
        preflight,
        root,
      })
    : {
        routeRequest: null,
        routeFailure: fastPathSuppressed
          ? buildQRouteFailure({
              stage: 'control',
              code: 'fast_path_suppressed',
              summary:
                'Immaculate fast path temporarily suppressed after recent transport failures.',
              detail: summarizeQFastPathSuppression({
                recentTransportFailureCount:
                  fastPathWindow.recentTransportFailureCount,
                windowMs: fastPathWindow.windowMs,
              }),
            })
          : null,
      }
  const routeRequest = routeAttempt.routeRequest
  const routeFailure = routeAttempt.routeFailure
  if (routeRequest) {
    updateQTrainingFastPathWindow({
      root,
      success: true,
      transportFailure: false,
    })
  } else if (isTransportRouteFailure(routeFailure)) {
    updateQTrainingFastPathWindow({
      root,
      success: false,
      transportFailure: true,
    })
  }
  const routeQueue = routeRequest
    ? getQTrainingRouteQueueEntry(runId, root)
    : null
  const routeQueueDisplayStatus = getQTrainingRouteQueueDisplayStatus(routeQueue)
  const routeQueueSummary = getQTrainingRouteQueueStatusSummary(routeQueue)

  if (routeRequest) {
    writeFileSync(
      stdoutLog,
      `${routeRequest.controlSummary ?? 'route requested'}\n`,
      'utf8',
    )
    writeFileSync(stderrLog, '', 'utf8')
    writeQLaunchState({
      runId,
      status: 'route_requested',
      executionMode: 'immaculate_route_requested',
      pid: null,
      launchedAt,
      outputDir,
      trainFile,
      evalFile: evalFilePath,
      baseModel: options.baseModel,
      runName: options.runName,
      selectedTags: options.tags,
      selectedLanguages: options.languages,
      lineageId: options.lineageId,
      phaseId: options.phaseId,
      maxSteps: options.maxSteps,
      stdoutLog,
      stderrLog,
      runStatePath,
      preflight,
      routeRequest,
      routeFailure: null,
      routeQueue,
      root,
    })
    return {
      runId,
      status: 'route_requested',
      executionMode: 'immaculate_route_requested',
      pid: null,
      launchedAt,
      outputDir,
      trainFile,
      evalFile: evalFilePath,
      stdoutLog,
      stderrLog,
      runStatePath,
      root,
      selectedTags: options.tags,
      selectedLanguages: options.languages,
      lineageId: options.lineageId,
      phaseId: options.phaseId,
      preflight,
      routeRequest,
      routeFailure: null,
      routeQueue,
      routeQueueDisplayStatus,
      routeQueueSummary,
    }
  }

  if (
    preflight.decision === 'preflight_blocked' ||
    (preflight.decision === 'remote_required' && !forceLocalLaunch)
  ) {
    const status: QTrainingStatus =
      preflight.decision === 'remote_required'
        ? 'remote_required'
        : 'preflight_blocked'
    const executionMode: QTrainingExecutionMode =
      preflight.decision === 'remote_required'
        ? 'remote_required'
        : 'preflight_blocked'
    writeFileSync(stdoutLog, '', 'utf8')
    const stderrLines = [
      routeFailure?.summary ?? null,
      routeFailure?.detail ?? null,
      preflight.summary,
    ].filter((value, index, values): value is string => {
      return Boolean(value) && values.indexOf(value) === index
    })
    writeFileSync(stderrLog, `${stderrLines.join('\n')}\n`, 'utf8')
    writeQLaunchState({
      runId,
      status,
      executionMode,
      pid: null,
      launchedAt,
      outputDir,
      trainFile,
      evalFile: evalFilePath,
      baseModel: options.baseModel,
      runName: options.runName,
      selectedTags: options.tags,
      selectedLanguages: options.languages,
      lineageId: options.lineageId,
      phaseId: options.phaseId,
      maxSteps: options.maxSteps,
      stdoutLog,
      stderrLog,
      runStatePath,
      preflight,
      routeRequest: null,
      routeFailure,
      root,
    })
    return {
      runId,
      status,
      executionMode,
      pid: null,
      launchedAt,
      outputDir,
      trainFile,
      evalFile: evalFilePath,
      stdoutLog,
      stderrLog,
      runStatePath,
      root,
      selectedTags: options.tags,
      selectedLanguages: options.languages,
      lineageId: options.lineageId,
      phaseId: options.phaseId,
      preflight,
      routeRequest: null,
      routeFailure,
    }
  }

  const stdoutFd = openSync(stdoutLog, 'a')
  const stderrFd = openSync(stderrLog, 'a')
  const args = buildPythonTrainArgs({
    trainFile,
    evalFile: evalFilePath,
    baseModel: options.baseModel,
    outputDir,
    runName: options.runName,
    lineageId: options.lineageId,
    phaseId: options.phaseId,
    useCpu: options.useCpu,
    maxSteps: options.maxSteps,
    numTrainEpochs: options.numTrainEpochs,
    tags: options.tags,
    languages: options.languages,
    executionMode: forceLocalLaunch ? 'local_forced' : 'local',
  })
  const child = (() => {
    try {
      return spawn(options.python, args, {
        cwd: process.cwd(),
        detached: true,
        env: buildQTrainingPythonEnv(process.env),
        stdio: ['ignore', stdoutFd, stderrFd],
        windowsHide: true,
      })
    } finally {
      closeSync(stdoutFd)
      closeSync(stderrFd)
    }
  })()
  child.unref()

  const executionMode: QTrainingExecutionMode = forceLocalLaunch
    ? 'local_forced'
    : 'local'
  writeQLaunchState({
    runId,
    status: 'launched',
    executionMode,
    pid: child.pid ?? null,
    launchedAt,
    outputDir,
    trainFile,
    evalFile: evalFilePath,
    baseModel: options.baseModel,
    selectedTags: options.tags,
    selectedLanguages: options.languages,
    runName: options.runName,
    lineageId: options.lineageId,
    phaseId: options.phaseId,
    maxSteps: options.maxSteps,
    stdoutLog,
    stderrLog,
    runStatePath,
    preflight,
    routeRequest: null,
    routeFailure: null,
    root,
  })
  return {
    runId,
    status: 'launched',
    executionMode,
    pid: child.pid ?? null,
    launchedAt,
    outputDir,
    trainFile,
    evalFile: evalFilePath,
    stdoutLog,
    stderrLog,
    runStatePath,
    root,
    selectedTags: options.tags,
    selectedLanguages: options.languages,
    lineageId: options.lineageId,
    phaseId: options.phaseId,
    preflight,
    routeRequest: null,
    routeFailure: null,
  }
}

export function buildPythonTrainArgs(args: {
  trainFile: string
  evalFile: string | null
  baseModel: string
  outputDir: string
  runName: string | null
  lineageId?: string | null
  phaseId?: string | null
  useCpu: boolean
  maxSteps: number | null
  numTrainEpochs: number | null
  tags: string[]
  languages: string[]
  routeManifestPath?: string | null
  executionMode?: QTrainingExecutionMode | null
}): string[] {
  const pythonArgs = [
    resolve(process.cwd(), 'training', 'q', 'train_lora.py'),
    '--train-file',
    args.trainFile,
    '--base-model',
    args.baseModel,
    '--output-dir',
    args.outputDir,
  ]

  if (args.evalFile) {
    pythonArgs.push('--eval-file', args.evalFile)
  }
  if (args.runName) {
    pythonArgs.push('--run-name', args.runName)
  }
  if (args.lineageId) {
    pythonArgs.push('--lineage-id', args.lineageId)
  }
  if (args.phaseId) {
    pythonArgs.push('--phase-id', args.phaseId)
  }
  if (args.useCpu) {
    pythonArgs.push('--use-cpu')
  }
  if (args.maxSteps !== null) {
    pythonArgs.push('--max-steps', String(args.maxSteps))
  }
  if (args.numTrainEpochs !== null) {
    pythonArgs.push('--num-train-epochs', String(args.numTrainEpochs))
  }
  if (args.routeManifestPath) {
    pythonArgs.push('--route-manifest', args.routeManifestPath)
  }
  if (args.executionMode) {
    pythonArgs.push('--execution-mode', args.executionMode)
  }
  for (const tag of args.tags) {
    pythonArgs.push('--tag', tag)
  }
  for (const language of args.languages) {
    pythonArgs.push('--language', language)
  }
  return pythonArgs
}

export function makeQTrainRunId(): string {
  const iso = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '')
  return `q-${iso}-${Math.random().toString(16).slice(2, 8)}`
}

export { DEFAULT_Q_BASE_MODEL }
