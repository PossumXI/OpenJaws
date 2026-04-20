import { execa } from 'execa'
import { mkdirSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import {
  computeQTrainingFastPathWindow,
  peekQTrainingFastPathWindow,
  type QTrainingExecutionMode,
  type QTrainingHybridFallbackWindow,
  type QTrainingHybridLaneKind,
  type QTrainingHybridLaneReceipt,
  type QTrainingHybridSessionReceipt,
  type QTrainingRouteQueueDisplayStatus,
  type QTrainingStatus,
  upsertQTrainingHybridSessionReceipt,
} from '../utils/qTraining.js'
import { Q_FAST_PATH_POLICY } from '../immaculate/policies.js'

export type QHybridCliOptions = {
  root: string
  bundleDir: string
  outputDir: string | null
  runName: string | null
  lineageId: string | null
  phaseId: string | null
  localBaseModel: string
  immaculateBaseModel: string
  tags: string[]
  languages: string[]
  localMaxSteps: number | null
  immaculateMaxSteps: number | null
  numTrainEpochs: number | null
  allowHostRisk: boolean
  dryRun: boolean
}

export type QLaunchResult = {
  exitCode: number | null
  stdout: string
  stderr: string
  parsed: Record<string, unknown> | null
}

export type QHybridSessionResult = {
  report: QTrainingHybridSessionReceipt
  reportPath: string
}

export type QHybridFallbackHistory = {
  failureTimestamps: string[]
  lastSuccessAt: string | null
}

export const Q_HYBRID_FALLBACK_FAILURE_THRESHOLD =
  Q_FAST_PATH_POLICY.failureThreshold
export const Q_HYBRID_FALLBACK_WINDOW_MS = Q_FAST_PATH_POLICY.windowMs

export function makeHybridSessionId(): string {
  return `q-hybrid-${new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\..+/, '')}`
}

export function buildHybridLaunchArgs(args: {
  bundleDir: string
  outputDir: string
  runName: string
  lineageId: string | null
  phaseId: string | null
  baseModel: string
  route: 'local' | 'immaculate'
  maxSteps: number | null
  numTrainEpochs: number | null
  tags: string[]
  languages: string[]
  allowHostRisk: boolean
}): string[] {
  const launchArgs = [
    'scripts/launch-q-train.ts',
    '--bundle-dir',
    args.bundleDir,
    '--output-dir',
    args.outputDir,
    '--run-name',
    args.runName,
    '--base-model',
    args.baseModel,
    '--route',
    args.route,
  ]
  if (args.lineageId) {
    launchArgs.push('--lineage-id', args.lineageId)
  }
  if (args.phaseId) {
    launchArgs.push('--phase-id', args.phaseId)
  }

  if (args.maxSteps !== null) {
    launchArgs.push('--max-steps', String(args.maxSteps))
  }
  if (args.numTrainEpochs !== null) {
    launchArgs.push('--num-train-epochs', String(args.numTrainEpochs))
  }
  if (args.allowHostRisk) {
    launchArgs.push('--allow-host-risk')
  }
  for (const tag of args.tags) {
    launchArgs.push('--tag', tag)
  }
  for (const language of args.languages) {
    launchArgs.push('--language', language)
  }

  return launchArgs
}

export async function runQLaunch(
  root: string,
  args: string[],
): Promise<QLaunchResult> {
  const result = await execa('bun', args, {
    cwd: root,
    reject: false,
    windowsHide: true,
    timeout: 900_000,
  })

  const jsonText = result.stdout.trim()
  let parsed: Record<string, unknown> | null = null
  if (jsonText) {
    try {
      parsed = JSON.parse(jsonText) as Record<string, unknown>
    } catch {
      parsed = null
    }
  }

  return {
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    parsed,
  }
}

export function buildDryRunLaunch(args: {
  runId: string
  executionMode: QTrainingExecutionMode
  lineageId: string | null
  phaseId: string | null
  routeQueueDisplayStatus?: QTrainingRouteQueueDisplayStatus | null
  routeQueueSummary?: string | null
}): QLaunchResult {
  return {
    exitCode: 0,
    stdout: '',
    stderr: '',
    parsed: {
      status: 'dry_run',
      executionMode: args.executionMode,
      runId: args.runId,
      lineageId: args.lineageId,
      phaseId: args.phaseId,
      runStatePath: null,
      routeQueueDisplayStatus: args.routeQueueDisplayStatus ?? null,
      routeQueueSummary: args.routeQueueSummary ?? null,
    },
  }
}

export function readParsedString(
  value: Record<string, unknown> | null,
  key: string,
): string | null {
  const candidate = value?.[key]
  return typeof candidate === 'string' ? candidate : null
}

export function buildHybridLaneReceipt(args: {
  lane: QTrainingHybridLaneKind
  baseModel: string
  outputDir: string
  lineageId: string | null
  phaseId: string | null
  launch: QLaunchResult
}): QTrainingHybridLaneReceipt {
  const parsedStatus = readParsedString(args.launch.parsed, 'status')
  const parsedExecutionMode = readParsedString(args.launch.parsed, 'executionMode')
  const parsedRunId = readParsedString(args.launch.parsed, 'runId')
  const parsedRunStatePath = readParsedString(args.launch.parsed, 'runStatePath')
  const parsedRouteQueueDisplayStatus = readParsedString(
    args.launch.parsed,
    'routeQueueDisplayStatus',
  )
  const parsedRouteQueueSummary = readParsedString(
    args.launch.parsed,
    'routeQueueSummary',
  )

  return {
    lane: args.lane,
    runId: parsedRunId,
    baseModel: args.baseModel,
    outputDir: args.outputDir,
    runStatePath: parsedRunStatePath,
    lineageId: args.lineageId,
    phaseId: args.phaseId,
    status:
      args.launch.exitCode === 0 && parsedStatus
        ? (parsedStatus as QTrainingStatus)
        : 'failed',
    executionMode: parsedExecutionMode as QTrainingExecutionMode | null,
    routeQueueDisplayStatus:
      parsedRouteQueueDisplayStatus as QTrainingRouteQueueDisplayStatus | null,
    routeQueueSummary: parsedRouteQueueSummary,
    stderr: args.launch.stderr.trim() || null,
  }
}

export function isHybridTransportFailure(
  lane: Pick<
    QTrainingHybridLaneReceipt,
    'status' | 'stderr' | 'routeQueueSummary' | 'routeQueueDisplayStatus'
  >,
): boolean {
  if (
    lane.routeQueueDisplayStatus &&
    ['queued', 'pending_assignment', 'claimed', 'dispatched', 'completed'].includes(
      lane.routeQueueDisplayStatus,
    )
  ) {
    return false
  }
  if (lane.status === 'route_requested') {
    return false
  }
  const summary = `${lane.stderr ?? ''}\n${lane.routeQueueSummary ?? ''}`.toLowerCase()
  return [
    'transport',
    'remote dispatch',
    'remote http',
    'connection reset',
    'econn',
    'socket',
    'timed out',
    'timeout',
    'unreachable',
    '503',
    '502',
    '504',
    'temporarily unavailable',
    'network',
    'harness is unavailable',
  ].some(token => summary.includes(token))
}

export function computeHybridFallbackWindow(args: {
  history: QHybridFallbackHistory
  nowIso: string
  transportFailed: boolean
  success: boolean
  threshold?: number
  windowMs?: number
}): {
  history: QHybridFallbackHistory
  fallbackWindow: QTrainingHybridFallbackWindow
} {
  return computeQTrainingFastPathWindow({
    history: args.history,
    observedAt: args.nowIso,
    transportFailure: args.transportFailed,
    success: args.success,
    threshold: args.threshold,
    windowMs: args.windowMs,
  })
}

export async function runQHybridSession(
  options: QHybridCliOptions,
): Promise<QHybridSessionResult> {
  const sessionId = makeHybridSessionId()
  const lineageId = options.lineageId ?? sessionId
  const outputDir =
    options.outputDir ??
    resolve(options.root, 'artifacts', 'q-hybrid-sessions', sessionId)
  mkdirSync(outputDir, { recursive: true })

  const localOutputDir = join(outputDir, 'local')
  const immaculateOutputDir = join(outputDir, 'immaculate')
  const localRunName = options.runName ?? `${sessionId}-local`
  const immaculateRunName = options.runName ?? `${sessionId}-immaculate`
  const localArgs = buildHybridLaunchArgs({
    bundleDir: options.bundleDir,
    outputDir: localOutputDir,
    runName: localRunName,
    lineageId,
    phaseId: options.phaseId,
    baseModel: options.localBaseModel,
    route: 'local',
    maxSteps: options.localMaxSteps,
    numTrainEpochs: options.numTrainEpochs,
    tags: options.tags,
    languages: options.languages,
    allowHostRisk: options.allowHostRisk,
  })
  const immaculateArgs = buildHybridLaunchArgs({
    bundleDir: options.bundleDir,
    outputDir: immaculateOutputDir,
    runName: immaculateRunName,
    lineageId,
    phaseId: options.phaseId,
    baseModel: options.immaculateBaseModel,
    route: 'immaculate',
    maxSteps: options.immaculateMaxSteps,
    numTrainEpochs: options.numTrainEpochs,
    tags: options.tags,
    languages: options.languages,
    allowHostRisk: false,
  })

  const localLaunch: QLaunchResult = options.dryRun
    ? buildDryRunLaunch({
        runId: `${sessionId}-local`,
        executionMode: options.allowHostRisk ? 'local_forced' : 'local',
        lineageId,
        phaseId: options.phaseId,
      })
    : await runQLaunch(options.root, localArgs)

  const immaculateLaunch: QLaunchResult = options.dryRun
    ? buildDryRunLaunch({
        runId: `${sessionId}-immaculate`,
        executionMode: 'immaculate_route_requested',
        lineageId,
        phaseId: options.phaseId,
        routeQueueDisplayStatus: 'queued',
        routeQueueSummary: 'dry run only',
      })
    : await runQLaunch(options.root, immaculateArgs)

  const localLane = buildHybridLaneReceipt({
    lane: 'local',
    baseModel: options.localBaseModel,
    outputDir: localOutputDir,
    lineageId,
    phaseId: options.phaseId,
    launch: localLaunch,
  })
  const immaculateLane = buildHybridLaneReceipt({
    lane: 'immaculate',
    baseModel: options.immaculateBaseModel,
    outputDir: immaculateOutputDir,
    lineageId,
    phaseId: options.phaseId,
    launch: immaculateLaunch,
  })
  const fallbackWindow = options.dryRun
    ? null
    : peekQTrainingFastPathWindow({ root: options.root })
  const holdingFastPath =
    localLane.status === 'launched' &&
    fallbackWindow !== null &&
    !fallbackWindow.active &&
    fallbackWindow.recentTransportFailureCount > 0 &&
    isHybridTransportFailure(immaculateLane)

  const report: QTrainingHybridSessionReceipt = {
    sessionId,
    generatedAt: new Date().toISOString(),
    outputDir,
    bundleDir: options.bundleDir,
    lineageId,
    phaseId: options.phaseId,
    localBaseModel: options.localBaseModel,
    immaculateBaseModel: options.immaculateBaseModel,
    cloudBaseModel: options.immaculateBaseModel,
    tags: options.tags,
    languages: options.languages,
    localLane,
    immaculateLane,
    cloudLane: {
      ...immaculateLane,
      lane: 'cloud',
    },
    status: options.dryRun
      ? 'dry_run'
      : localLane.status === 'launched' &&
            (immaculateLane.status === 'route_requested' || holdingFastPath)
        ? 'started'
        : localLane.status === 'launched'
          ? 'degraded'
        : localLaunch.exitCode === 0 && immaculateLaunch.exitCode === 0
          ? 'degraded'
          : 'failed',
    fallbackWindow,
    honestyBoundary:
      'This hybrid session coordinates a local Q lane and an Immaculate-routed Q lane under one receipt. It is not synchronous distributed training or automatic cloud provisioning on its own.',
  }

  const reportPath = join(outputDir, 'hybrid-session-report.json')
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  if (!options.dryRun) {
    upsertQTrainingHybridSessionReceipt(report, options.root)
  }

  return {
    report,
    reportPath,
  }
}
