import { closeSync, existsSync, mkdirSync, openSync, writeFileSync } from 'fs'
import { resolve, join } from 'path'
import { spawn } from 'child_process'
import {
  buildGemmaTrainingRouteManifest,
  evaluateGemmaTrainingPreflight,
  getGemmaTrainingRouteQueueDisplayStatus,
  getGemmaTrainingRouteQueueStatusSummary,
  getGemmaTrainingRouteQueueEntry,
  getGemmaTrainingRunsDir,
  stageGemmaTrainingRouteFile,
  type GemmaTrainingExecutionMode,
  type GemmaTrainingRouteFailure,
  type GemmaTrainingPreflight,
  type GemmaTrainingRouteRequest,
  type GemmaTrainingStatus,
  upsertGemmaTrainingRouteQueueEntry,
  upsertGemmaTrainingRegistryEntry,
} from '../src/utils/gemmaTraining.js'
import {
  assignImmaculateHarnessWorker,
  callImmaculateHarness,
  getImmaculateHarnessDeckReceipt,
  getImmaculateHarnessStatus,
  normalizeImmaculateObjective,
} from '../src/utils/immaculateHarness.js'

type CliOptions = {
  root: string | null
  bundleDir: string
  outputDir: string | null
  baseModel: string
  runName: string | null
  python: string
  tags: string[]
  languages: string[]
  useCpu: boolean
  maxSteps: number | null
  numTrainEpochs: number | null
  allowHostRisk: boolean
  routeMode: 'auto' | 'local' | 'immaculate'
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
    bundleDir: resolve(process.cwd(), 'data', 'sft', 'audited-v2'),
    outputDir: null,
    baseModel: 'google/gemma-4-E4B-it',
    runName: null,
    python: existsSync(venvPython) ? venvPython : 'python',
    tags: [],
    languages: [],
    useCpu: true,
    maxSteps: null,
    numTrainEpochs: null,
    allowHostRisk: false,
    routeMode: 'auto',
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--bundle-dir' && argv[i + 1]) {
      options.bundleDir = resolve(argv[++i]!)
      continue
    }
    if (arg === '--root' && argv[i + 1]) {
      options.root = resolve(argv[++i]!)
      continue
    }
    if (arg === '--output-dir' && argv[i + 1]) {
      options.outputDir = resolve(argv[++i]!)
      continue
    }
    if (arg === '--base-model' && argv[i + 1]) {
      options.baseModel = argv[++i]!
      continue
    }
    if (arg === '--run-name' && argv[i + 1]) {
      options.runName = argv[++i]!
      continue
    }
    if (arg === '--python' && argv[i + 1]) {
      options.python = argv[++i]!
      continue
    }
    if (arg === '--tag' && argv[i + 1]) {
      options.tags.push(argv[++i]!)
      continue
    }
    if (arg === '--language' && argv[i + 1]) {
      options.languages.push(argv[++i]!)
      continue
    }
    if (arg === '--max-steps' && argv[i + 1]) {
      const value = Number.parseInt(argv[++i]!, 10)
      if (Number.isFinite(value)) {
        options.maxSteps = value
      }
      continue
    }
    if (arg === '--num-train-epochs' && argv[i + 1]) {
      const value = Number.parseFloat(argv[++i]!)
      if (Number.isFinite(value)) {
        options.numTrainEpochs = value
      }
      continue
    }
    if (arg === '--no-cpu') {
      options.useCpu = false
      continue
    }
    if (arg === '--allow-host-risk') {
      options.allowHostRisk = true
      continue
    }
    if (arg === '--route' && argv[i + 1]) {
      const value = argv[++i]!
      if (value === 'auto' || value === 'local' || value === 'immaculate') {
        options.routeMode = value
      } else {
        throw new Error(`Unknown --route mode "${value}". Use auto, local, or immaculate.`)
      }
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
      'Usage: bun scripts/launch-gemma4-train.ts [options]',
      '',
      'Options:',
      '  --root <path>              Root directory for registry/queue artifacts',
      '  --bundle-dir <path>        Prepared/audited dataset bundle directory',
      '  --output-dir <path>        Output run directory',
      '  --base-model <model>       Base Hugging Face model',
      '  --run-name <name>          Optional run name',
      '  --python <exe>             Python executable to use',
      '  --tag <tag>                Repeatable dataset tag filter',
      '  --language <lang>          Repeatable dataset language filter',
      '  --max-steps <n>            Optional trainer max steps',
      '  --num-train-epochs <n>     Optional trainer epochs',
      '  --no-cpu                   Disable --use-cpu',
      '  --route <mode>             Launch mode: auto, local, or immaculate (default: auto)',
      '  --allow-host-risk          Force a local launch when preflight says remote required',
      '  -h, --help                 Show this help',
    ].join('\n'),
  )
  process.exit(0)
}

function makeRunId(): string {
  const iso = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '')
  return `gemma4-${iso}-${Math.random().toString(16).slice(2, 8)}`
}

function buildGemmaRouteTarget(args: {
  baseModel: string
  tags: string[]
  languages: string[]
  runName: string | null
}): string {
  const parts = [
    'gemma-train',
    args.baseModel,
    'opencheek agents',
    'openjaws tools',
    'immaculate harness',
    args.tags.length > 0 ? `tags ${args.tags.join(',')}` : null,
    args.languages.length > 0 ? `langs ${args.languages.join(',')}` : null,
    args.runName?.trim() ? `run ${args.runName.trim()}` : null,
  ].filter(Boolean)
  return normalizeImmaculateObjective(parts.join(' · '), 160) ?? 'gemma-train'
}

function buildGemmaRouteFailure(args: {
  stage: GemmaTrainingRouteFailure['stage']
  code: GemmaTrainingRouteFailure['code']
  summary: string
  detail?: string | null
  harnessUrl?: string | null
  recommendedLayerId?: string | null
  controlStatus?: number | null
  controlSummary?: string | null
  failedAt?: string
}): GemmaTrainingRouteFailure {
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

type ImmaculateGemmaRouteAttempt = {
  routeRequest: GemmaTrainingRouteRequest | null
  routeFailure: GemmaTrainingRouteFailure | null
}

function isGemmaRouteFailureLike(
  value: unknown,
): value is GemmaTrainingRouteFailure {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as GemmaTrainingRouteFailure).failedAt === 'string' &&
      typeof (value as GemmaTrainingRouteFailure).stage === 'string' &&
      typeof (value as GemmaTrainingRouteFailure).code === 'string',
  )
}

async function requestImmaculateGemmaRoute(args: {
  root: string
  runId: string
  outputDir: string
  baseModel: string
  runName: string | null
  selectedTags: string[]
  selectedLanguages: string[]
  trainFile: string
  evalFile: string | null
  useCpu: boolean
  maxSteps: number | null
  numTrainEpochs: number | null
  preflight: GemmaTrainingPreflight
}): Promise<ImmaculateGemmaRouteAttempt> {
  const status = await getImmaculateHarnessStatus()
  if (!status.enabled || !status.reachable) {
    return {
      routeRequest: null,
      routeFailure: buildGemmaRouteFailure({
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
  const target = buildGemmaRouteTarget({
    baseModel: args.baseModel,
    tags: args.selectedTags,
    languages: args.selectedLanguages,
    runName: args.runName,
  })
  const requestedAt = new Date().toISOString()
  const manifestPath = join(args.outputDir, 'route-request.json')
  const stagedTrainIntegrity = stageGemmaTrainingRouteFile({
    sourcePath: args.trainFile,
    manifestDir: args.outputDir,
    relativePath: join('bundle', 'train.jsonl'),
  })
  const stagedEvalIntegrity = args.evalFile
    ? stageGemmaTrainingRouteFile({
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
    const message =
      error instanceof Error ? error.message : String(error)
    return buildGemmaRouteFailure({
      stage: 'control',
      code: 'control_failed',
      summary: 'Immaculate route request failed during control pulse.',
      detail: message,
      harnessUrl: status.harnessUrl,
      recommendedLayerId: deckReceipt?.recommendedLayerId ?? null,
    })
  })
  if (isGemmaRouteFailureLike(controlResult)) {
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
      routeFailure: buildGemmaRouteFailure({
        stage: 'control',
        code: 'control_rejected',
        summary: 'Immaculate route request was rejected by control pulse.',
        detail: controlResult.summary ?? 'The harness rejected the route request.',
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
    const message =
      error instanceof Error ? error.message : String(error)
    return buildGemmaRouteFailure({
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
  if (isGemmaRouteFailureLike(assignmentResult)) {
    return {
      routeRequest: null,
      routeFailure: assignmentResult,
    }
  }
  const harnessAssignment = assignmentResult?.assignment ?? null
  const recommendedLayerId =
    assignmentResult?.recommendedLayerId ?? deckReceipt?.recommendedLayerId ?? null

  try {
    const routeRequest: GemmaTrainingRouteRequest = {
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
        workerCount: assignmentResult?.workerCount ?? assignmentResult?.workers.length ?? null,
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
    const manifest = buildGemmaTrainingRouteManifest({
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
        maxSteps: args.maxSteps,
        numTrainEpochs: args.numTrainEpochs,
      },
      preflight: args.preflight,
    })
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
    upsertGemmaTrainingRouteQueueEntry({
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
    }, args.root)

    return {
      routeRequest: {
        ...manifest.routeRequest,
        security: manifest.security,
      },
      routeFailure: null,
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error)
    return {
      routeRequest: null,
      routeFailure: buildGemmaRouteFailure({
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

function writeGemmaLaunchState(args: {
  runId: string
  status: GemmaTrainingStatus
  executionMode: GemmaTrainingExecutionMode
  pid: number | null
  launchedAt: string
  outputDir: string
  trainFile: string
  evalFile: string | null
  baseModel: string
  runName: string | null
  selectedTags: string[]
  selectedLanguages: string[]
  maxSteps: number | null
  stdoutLog: string
  stderrLog: string
  runStatePath: string
  preflight: GemmaTrainingPreflight | null
  routeRequest: GemmaTrainingRouteRequest | null
  routeFailure?: GemmaTrainingRouteFailure | null
  routeQueue?: ReturnType<typeof getGemmaTrainingRouteQueueEntry> | null
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
        maxSteps: args.maxSteps,
        preflight: args.preflight,
        routeRequest: args.routeRequest,
        routeFailure: args.routeFailure ?? null,
        routeQueue: args.routeQueue ?? null,
        routeQueueDisplayStatus: getGemmaTrainingRouteQueueDisplayStatus(
          args.routeQueue ?? null,
        ),
        routeQueueSummary: getGemmaTrainingRouteQueueStatusSummary(
          args.routeQueue ?? null,
        ),
      },
      null,
      2,
    )}\n`,
    'utf8',
  )
  upsertGemmaTrainingRegistryEntry({
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
    logFiles: {
      stdout: args.stdoutLog,
      stderr: args.stderrLog,
    },
    runStatePath: args.runStatePath,
    preflight: args.preflight,
    routeRequest: args.routeRequest,
    routeFailure: args.routeFailure ?? null,
  }, args.root)
}

function buildPythonTrainArgs(args: {
  trainFile: string
  evalFile: string | null
  baseModel: string
  outputDir: string
  runName: string | null
  useCpu: boolean
  maxSteps: number | null
  numTrainEpochs: number | null
  tags: string[]
  languages: string[]
  routeManifestPath?: string | null
  executionMode?: GemmaTrainingExecutionMode | null
}): string[] {
  const pythonArgs = [
    resolve(process.cwd(), 'training', 'gemma4', 'train_lora.py'),
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

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const root = options.root ?? process.cwd()
  const runId = makeRunId()
  const outputDir =
    options.outputDir ?? resolve(getGemmaTrainingRunsDir(root), runId)
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
  const preflight = evaluateGemmaTrainingPreflight({
    baseModel: options.baseModel,
    trainFile,
    pythonPath: options.python,
    useCpu: options.useCpu,
  })

  const forceLocalLaunch =
    options.allowHostRisk && preflight.decision === 'remote_required'
  const wantsImmaculateRoute =
    preflight.decision === 'remote_required' &&
    !forceLocalLaunch &&
    options.routeMode !== 'local'
  const routeAttempt = wantsImmaculateRoute
    ? await requestImmaculateGemmaRoute({
        runId,
        outputDir,
        baseModel: options.baseModel,
        runName: options.runName,
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
    : { routeRequest: null, routeFailure: null }
  const routeRequest = routeAttempt.routeRequest
  const routeFailure = routeAttempt.routeFailure
  const routeQueue = routeRequest
    ? getGemmaTrainingRouteQueueEntry(runId, root)
    : null
  const routeQueueDisplayStatus = getGemmaTrainingRouteQueueDisplayStatus(routeQueue)
  const routeQueueSummary = getGemmaTrainingRouteQueueStatusSummary(routeQueue)

  if (routeRequest) {
    writeFileSync(stdoutLog, `${routeRequest.controlSummary ?? 'route requested'}\n`, 'utf8')
    writeFileSync(stderrLog, '', 'utf8')
    writeGemmaLaunchState({
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
    console.log(
      JSON.stringify(
        {
          runId,
          status: 'route_requested',
          executionMode: 'immaculate_route_requested',
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
          preflight,
          routeRequest,
          routeFailure: null,
          routeQueue,
          routeQueueDisplayStatus,
          routeQueueSummary,
        },
        null,
        2,
      ),
    )
    return
  }

  if (preflight.decision === 'preflight_blocked' || (preflight.decision === 'remote_required' && !forceLocalLaunch)) {
    const status: GemmaTrainingStatus =
      preflight.decision === 'remote_required'
        ? 'remote_required'
        : 'preflight_blocked'
    const executionMode: GemmaTrainingExecutionMode =
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
    writeGemmaLaunchState({
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
      maxSteps: options.maxSteps,
      stdoutLog,
      stderrLog,
      runStatePath,
      preflight,
      routeRequest: null,
      routeFailure,
      root,
    })
    console.log(
      JSON.stringify(
        {
          runId,
          status,
          executionMode,
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
          preflight,
          routeRequest: null,
          routeFailure,
        },
        null,
        2,
      ),
    )
    return
  }

  const stdoutFd = openSync(stdoutLog, 'a')
  const stderrFd = openSync(stderrLog, 'a')

  const args = buildPythonTrainArgs({
    trainFile,
    evalFile: evalFilePath,
    baseModel: options.baseModel,
    outputDir,
    runName: options.runName,
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
        stdio: ['ignore', stdoutFd, stderrFd],
        windowsHide: true,
      })
    } finally {
      closeSync(stdoutFd)
      closeSync(stderrFd)
    }
  })()
  child.unref()

  const executionMode: GemmaTrainingExecutionMode = forceLocalLaunch
    ? 'local_forced'
    : 'local'
  writeGemmaLaunchState({
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
    maxSteps: options.maxSteps,
    stdoutLog,
    stderrLog,
    runStatePath,
    preflight,
    routeRequest: null,
    routeFailure: null,
    root,
  })

  console.log(
    JSON.stringify(
      {
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
        preflight,
        routeRequest: null,
        routeFailure: null,
      },
      null,
      2,
    ),
  )
}

await main()
