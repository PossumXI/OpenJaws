import { mkdirSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { execa } from 'execa'
import {
  type QTrainingExecutionMode,
  type QTrainingHybridLaneKind,
  type QTrainingHybridLaneReceipt,
  type QTrainingHybridSessionReceipt,
  type QTrainingStatus,
  type QTrainingRouteQueueDisplayStatus,
  upsertQTrainingHybridSessionReceipt,
} from '../src/utils/qTraining.js'

type CliOptions = {
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

function parseOptionalInt(value: string | undefined): number | null {
  if (!value) {
    return null
  }
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : null
}

function parseOptionalFloat(value: string | undefined): number | null {
  if (!value) {
    return null
  }
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : null
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    root: process.cwd(),
    bundleDir: resolve(process.cwd(), 'data', 'sft', 'audited-v2'),
    outputDir: null,
    runName: null,
    lineageId: null,
    phaseId: null,
    localBaseModel: 'q-lite',
    immaculateBaseModel: 'q',
    tags: [],
    languages: [],
    localMaxSteps: 8,
    immaculateMaxSteps: 8,
    numTrainEpochs: 1,
    allowHostRisk: false,
    dryRun: false,
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--root' && argv[i + 1]) {
      options.root = resolve(argv[++i]!)
      continue
    }
    if (arg === '--bundle-dir' && argv[i + 1]) {
      options.bundleDir = resolve(argv[++i]!)
      continue
    }
    if ((arg === '--out-dir' || arg === '--output-dir') && argv[i + 1]) {
      options.outputDir = resolve(argv[++i]!)
      continue
    }
    if (arg === '--run-name' && argv[i + 1]) {
      options.runName = argv[++i]!
      continue
    }
    if (arg === '--lineage-id' && argv[i + 1]) {
      options.lineageId = argv[++i]!
      continue
    }
    if (arg === '--phase-id' && argv[i + 1]) {
      options.phaseId = argv[++i]!
      continue
    }
    if (arg === '--local-base-model' && argv[i + 1]) {
      options.localBaseModel = argv[++i]!
      continue
    }
    if (
      (arg === '--immaculate-base-model' || arg === '--cloud-base-model') &&
      argv[i + 1]
    ) {
      options.immaculateBaseModel = argv[++i]!
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
    if (arg === '--local-max-steps' && argv[i + 1]) {
      options.localMaxSteps = parseOptionalInt(argv[++i]!)
      continue
    }
    if (
      (arg === '--immaculate-max-steps' || arg === '--cloud-max-steps') &&
      argv[i + 1]
    ) {
      options.immaculateMaxSteps = parseOptionalInt(argv[++i]!)
      continue
    }
    if (arg === '--num-train-epochs' && argv[i + 1]) {
      options.numTrainEpochs = parseOptionalFloat(argv[++i]!)
      continue
    }
    if (arg === '--allow-host-risk') {
      options.allowHostRisk = true
      continue
    }
    if (arg === '--dry-run') {
      options.dryRun = true
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
      'Usage: bun scripts/run-q-hybrid-session.ts [options]',
      '',
      'Options:',
      '  --bundle-dir <path>          Audited bundle directory',
      '  --out-dir <path>             Output directory for the hybrid session receipt',
      '  --run-name <name>            Optional shared run name',
      '  --lineage-id <id>            Optional lineage ID shared across the session lanes',
      '  --phase-id <id>              Optional Agent Co-Work phase ID tied to this session',
      '  --local-base-model <model>   Base model for the local lane (default q-lite)',
      '  --immaculate-base-model <model> Base model for the Immaculate-routed lane (default q)',
      '  --cloud-base-model <model>   Deprecated alias for --immaculate-base-model',
      '  --tag <tag>                  Repeatable dataset tag filter',
      '  --language <lang>            Repeatable dataset language filter',
      '  --local-max-steps <n>        Max steps for the local lane',
      '  --immaculate-max-steps <n>   Max steps for the Immaculate-routed lane',
      '  --cloud-max-steps <n>        Deprecated alias for --immaculate-max-steps',
      '  --num-train-epochs <n>       Epoch count forwarded to both lanes',
      '  --allow-host-risk            Forward allow-host-risk to both launches',
      '  --dry-run                    Emit launch receipts without starting either lane',
      '  -h, --help                   Show this help',
    ].join('\n'),
  )
  process.exit(0)
}

function makeSessionId(): string {
  return `q-hybrid-${new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\..+/, '')}`
}

function buildLaunchArgs(args: {
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

async function runLaunch(root: string, args: string[]) {
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

function buildDryRunLaunch(args: {
  runId: string
  executionMode: QTrainingExecutionMode
  lineageId: string | null
  phaseId: string | null
  routeQueueDisplayStatus?: QTrainingRouteQueueDisplayStatus | null
  routeQueueSummary?: string | null
}) {
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
    } as Record<string, unknown>,
  }
}

function readParsedString(
  value: Record<string, unknown> | null,
  key: string,
): string | null {
  const candidate = value?.[key]
  return typeof candidate === 'string' ? candidate : null
}

function buildLaneReceipt(args: {
  lane: QTrainingHybridLaneKind
  baseModel: string
  outputDir: string
  lineageId: string | null
  phaseId: string | null
  launch: Awaited<ReturnType<typeof runLaunch>>
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

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const sessionId = makeSessionId()
  const lineageId = options.lineageId ?? sessionId
  const outputDir =
    options.outputDir ?? resolve(options.root, 'artifacts', 'q-hybrid-sessions', sessionId)
  mkdirSync(outputDir, { recursive: true })

  const localOutputDir = join(outputDir, 'local')
  const immaculateOutputDir = join(outputDir, 'immaculate')
  const localRunName = options.runName ?? `${sessionId}-local`
  const immaculateRunName = options.runName ?? `${sessionId}-immaculate`
  const localArgs = buildLaunchArgs({
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
  const immaculateArgs = buildLaunchArgs({
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

  const localLaunch = options.dryRun
    ? buildDryRunLaunch({
      runId: `${sessionId}-local`,
      executionMode: options.allowHostRisk ? 'local_forced' : 'local',
      lineageId,
      phaseId: options.phaseId,
    })
    : await runLaunch(options.root, localArgs)

  const immaculateLaunch = options.dryRun
    ? buildDryRunLaunch({
      runId: `${sessionId}-immaculate`,
      executionMode: 'immaculate_route_requested',
      lineageId,
      phaseId: options.phaseId,
      routeQueueDisplayStatus: 'queued',
      routeQueueSummary: 'dry run only',
      })
    : await runLaunch(options.root, immaculateArgs)

  const localLane = buildLaneReceipt({
    lane: 'local',
    baseModel: options.localBaseModel,
    outputDir: localOutputDir,
    lineageId,
    phaseId: options.phaseId,
    launch: localLaunch,
  })
  const immaculateLane = buildLaneReceipt({
    lane: 'immaculate',
    baseModel: options.immaculateBaseModel,
    outputDir: immaculateOutputDir,
    lineageId,
    phaseId: options.phaseId,
    launch: immaculateLaunch,
  })

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
          immaculateLane.status === 'route_requested'
        ? 'started'
        : localLaunch.exitCode === 0 && immaculateLaunch.exitCode === 0
          ? 'degraded'
          : 'failed',
    honestyBoundary:
      'This hybrid session coordinates a local Q lane and an Immaculate-routed Q lane under one receipt. It is not synchronous distributed training or automatic cloud provisioning on its own.',
  }

  const reportPath = join(outputDir, 'hybrid-session-report.json')
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  if (!options.dryRun) {
    upsertQTrainingHybridSessionReceipt(report, options.root)
  }

  console.log(
    JSON.stringify(
      {
        status:
          report.status === 'started' || report.status === 'dry_run'
            ? 'ok'
            : report.status === 'degraded'
              ? 'warning'
              : 'failed',
        sessionId,
        lineageId,
        phaseId: options.phaseId,
        reportPath,
        summary:
          report.status === 'dry_run'
            ? 'Hybrid Q session dry run completed.'
            : report.status === 'started'
            ? 'Hybrid Q session launched: local lane started and Immaculate lane submitted.'
            : report.status === 'degraded'
              ? `Hybrid Q session only partially launched. Local lane is ${localLane.status} and Immaculate lane is ${immaculateLane.status}.`
              : 'Hybrid Q session failed to launch cleanly.',
        localStatus:
          typeof localLaunch.parsed?.status === 'string'
            ? localLaunch.parsed.status
            : localLaunch.exitCode,
        immaculateStatus:
          typeof immaculateLaunch.parsed?.status === 'string'
            ? immaculateLaunch.parsed.status
            : immaculateLaunch.exitCode,
        cloudStatus:
          typeof immaculateLaunch.parsed?.status === 'string'
            ? immaculateLaunch.parsed.status
            : immaculateLaunch.exitCode,
      },
      null,
      2,
      ),
  )

  if (report.status !== 'started' && report.status !== 'dry_run') {
    process.exit(1)
  }
}

await main()
