import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { execa } from 'execa'
import {
  computeQBridgeBenchScore,
  extractQBridgeBenchMetrics,
  getDefaultQBridgeBenchPacks,
  loadQBridgeBenchBundleManifest,
  Q_BRIDGEBENCH_PACKS,
  resolveQBridgeBenchPack,
  summarizeQBridgeBenchOutcome,
  type QBridgeBenchPack,
} from '../src/utils/bridgeBench.js'
import {
  DEFAULT_Q_BASE_MODEL,
  resolveQTrainingPythonCommand,
} from '../src/utils/qTraining.js'

type CliOptions = {
  root: string | null
  bundleDir: string
  outputDir: string | null
  baseModel: string
  adapterDir: string | null
  python: string
  packs: QBridgeBenchPack[]
  useCpu: boolean
  maxSeqLength: number
  maxTrainSamples: number | null
  maxEvalSamples: number | null
  timeoutMs: number
  runNamePrefix: string | null
  wandbProject: string | null
  wandbEntity: string | null
}

type PackStatus = 'evaluated' | 'skipped' | 'failed'

type PackResult = {
  pack: QBridgeBenchPack
  status: PackStatus
  summary: string
  outputDir: string
  evalSampleCount: number
  trainSampleCount: number
  command?: string
  exitCode?: number | null
  score: number | null
  metrics: ReturnType<typeof extractQBridgeBenchMetrics> | null
  runSummary?: Record<string, unknown> | null
  runState?: Record<string, unknown> | null
  stdoutTail?: string
  stderrTail?: string
}

function parsePack(value: string): QBridgeBenchPack | null {
  const normalized = value.trim().toLowerCase()
  return Q_BRIDGEBENCH_PACKS.find(pack => pack === normalized) ?? null
}

function parseOptionalInt(value: string | undefined): number | null {
  if (!value) {
    return null
  }
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : null
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    root: null,
    bundleDir: resolve(process.cwd(), 'data', 'sft', 'audited-v2'),
    outputDir: null,
    baseModel: DEFAULT_Q_BASE_MODEL,
    adapterDir: null,
    python: resolveQTrainingPythonCommand(process.cwd()),
    packs: [],
    useCpu: true,
    maxSeqLength: 512,
    maxTrainSamples: null,
    maxEvalSamples: null,
    timeoutMs: 1_800_000,
    runNamePrefix: 'q-bridgebench',
    wandbProject: null,
    wandbEntity: null,
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
    if (arg === '--out-dir' && argv[i + 1]) {
      options.outputDir = resolve(argv[++i]!)
      continue
    }
    if (arg === '--base-model' && argv[i + 1]) {
      options.baseModel = argv[++i]!
      continue
    }
    if (arg === '--adapter-dir' && argv[i + 1]) {
      options.adapterDir = resolve(argv[++i]!)
      continue
    }
    if (arg === '--python' && argv[i + 1]) {
      options.python = argv[++i]!
      continue
    }
    if (arg === '--pack' && argv[i + 1]) {
      const pack = parsePack(argv[++i]!)
      if (pack) {
        options.packs.push(pack)
      }
      continue
    }
    if (arg === '--use-cpu') {
      options.useCpu = true
      continue
    }
    if (arg === '--max-seq-length' && argv[i + 1]) {
      const parsed = parseOptionalInt(argv[++i]!)
      if (parsed !== null && parsed > 0) {
        options.maxSeqLength = parsed
      }
      continue
    }
    if (arg === '--max-train-samples' && argv[i + 1]) {
      options.maxTrainSamples = parseOptionalInt(argv[++i]!)
      continue
    }
    if (arg === '--max-eval-samples' && argv[i + 1]) {
      options.maxEvalSamples = parseOptionalInt(argv[++i]!)
      continue
    }
    if (arg === '--timeout-ms' && argv[i + 1]) {
      const parsed = parseOptionalInt(argv[++i]!)
      if (parsed !== null && parsed > 0) {
        options.timeoutMs = parsed
      }
      continue
    }
    if (arg === '--run-name-prefix' && argv[i + 1]) {
      options.runNamePrefix = argv[++i]!
      continue
    }
    if (arg === '--wandb-project' && argv[i + 1]) {
      options.wandbProject = argv[++i]!
      continue
    }
    if (arg === '--wandb-entity' && argv[i + 1]) {
      options.wandbEntity = argv[++i]!
      continue
    }
    if (arg === '--help' || arg === '-h') {
      printHelpAndExit()
    }
  }

  if (options.packs.length === 0) {
    options.packs = getDefaultQBridgeBenchPacks()
  }

  return options
}

function printHelpAndExit(): never {
  console.log(
    [
      'Usage: bun scripts/q-bridgebench.ts [options]',
      '',
      'Options:',
      '  --bundle-dir <path>        Audited or prepared bundle directory with bundle-manifest.json',
      '  --out-dir <path>           Output directory for benchmark artifacts',
      '  --base-model <id>          Base Q model family label or upstream checkpoint',
      '  --adapter-dir <path>       Optional adapter directory to benchmark instead of the base model alone',
      '  --python <path>            Python runtime to use',
      '  --pack <name>              Benchmark pack: all, coding, agentic, security, general',
      '  --max-seq-length <n>       Sequence length cap passed to the trainer (default 512)',
      '  --max-train-samples <n>    Optional train-sample cap for each pack',
      '  --max-eval-samples <n>     Optional eval-sample cap for each pack',
      '  --timeout-ms <n>           Per-pack timeout in milliseconds',
      '  --run-name-prefix <text>   Optional run-name prefix written into each eval receipt',
      '  --wandb-project <name>     Optional W&B project for live benchmark receipts',
      '  --wandb-entity <name>      Optional W&B entity for live benchmark receipts',
      '  -h, --help                 Show this help',
    ].join('\n'),
  )
  process.exit(0)
}

function tailText(text: string, maxLines = 30, maxChars = 3000): string {
  const trimmed = text.trim()
  if (!trimmed) {
    return ''
  }
  const tailLines = trimmed.split(/\r?\n/).slice(-maxLines).join('\n')
  return tailLines.length > maxChars
    ? tailLines.slice(tailLines.length - maxChars)
    : tailLines
}

function readJsonIfExists(path: string): Record<string, unknown> | null {
  if (!existsSync(path)) {
    return null
  }
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
}

function buildPythonArgs(args: {
  pack: ReturnType<typeof resolveQBridgeBenchPack>
  outputDir: string
  options: CliOptions
}): string[] {
  const pythonArgs = [
    resolve(process.cwd(), 'training', 'q', 'train_lora.py'),
    '--train-file',
    args.pack.trainFile,
    '--eval-file',
    args.pack.evalFile,
    '--base-model',
    args.options.baseModel,
    '--output-dir',
    args.outputDir,
    '--eval-only',
    '--benchmark-pack',
    args.pack.pack,
    '--max-seq-length',
    String(args.options.maxSeqLength),
  ]

  if (args.options.adapterDir) {
    pythonArgs.push('--adapter-dir', args.options.adapterDir)
  }
  if (args.options.useCpu) {
    pythonArgs.push('--use-cpu')
  }
  if (args.options.maxTrainSamples !== null) {
    pythonArgs.push('--max-train-samples', String(args.options.maxTrainSamples))
  }
  if (args.options.maxEvalSamples !== null) {
    pythonArgs.push('--max-eval-samples', String(args.options.maxEvalSamples))
  }
  if (args.options.runNamePrefix) {
    pythonArgs.push('--run-name', `${args.options.runNamePrefix}-${args.pack.pack}`)
  }
  if (args.options.wandbProject) {
    pythonArgs.push('--wandb-project', args.options.wandbProject)
  }
  if (args.options.wandbEntity) {
    pythonArgs.push('--wandb-entity', args.options.wandbEntity)
  }

  return pythonArgs
}

function makeBenchmarkId(): string {
  return `q-bridgebench-${new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\..+/, '')}`
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const root = options.root ?? process.cwd()
  const benchmarkId = makeBenchmarkId()
  const outputDir =
    options.outputDir ?? resolve(root, 'artifacts', 'bridgebench', benchmarkId)
  mkdirSync(outputDir, { recursive: true })

  const manifest = loadQBridgeBenchBundleManifest(options.bundleDir)
  const packResults: PackResult[] = []

  for (const packName of options.packs) {
    const pack = resolveQBridgeBenchPack({
      bundleDir: options.bundleDir,
      manifest,
      pack: packName,
    })
    const packOutputDir = join(outputDir, pack.pack)
    mkdirSync(packOutputDir, { recursive: true })

    if (!existsSync(pack.evalFile) || pack.splitCounts.eval === 0) {
      packResults.push({
        pack: pack.pack,
        status: 'skipped',
        summary: `${pack.label} pack skipped because it has no eval samples.`,
        outputDir: packOutputDir,
        evalSampleCount: pack.splitCounts.eval,
        trainSampleCount: pack.splitCounts.train,
        score: null,
        metrics: null,
      })
      continue
    }

    const pythonArgs = buildPythonArgs({
      pack,
      outputDir: packOutputDir,
      options,
    })
    const result = await execa(options.python, pythonArgs, {
      cwd: root,
      reject: false,
      timeout: options.timeoutMs,
      windowsHide: true,
    })

    if (result.exitCode !== 0) {
      packResults.push({
        pack: pack.pack,
        status: 'failed',
        summary: `${pack.label} pack benchmark failed.`,
        outputDir: packOutputDir,
        evalSampleCount: pack.splitCounts.eval,
        trainSampleCount: pack.splitCounts.train,
        command: [options.python, ...pythonArgs].join(' '),
        exitCode: result.exitCode,
        score: null,
        metrics: null,
        stdoutTail: tailText(result.stdout),
        stderrTail: tailText(result.stderr),
      })
      continue
    }

    const metricsSummary = readJsonIfExists(join(packOutputDir, 'metrics-summary.json'))
    const runSummary = readJsonIfExists(join(packOutputDir, 'run-summary.json'))
    const runState = readJsonIfExists(join(packOutputDir, 'run-state.json'))
    const metrics = extractQBridgeBenchMetrics(metricsSummary)
    const score = computeQBridgeBenchScore(metrics)
    writeFileSync(
      join(packOutputDir, 'reward.json'),
      `${JSON.stringify(
        {
          accuracy: metrics.evalMeanTokenAccuracy,
        },
        null,
        2,
      )}\n`,
      'utf8',
    )
    writeFileSync(
      join(packOutputDir, 'reward-details.json'),
      `${JSON.stringify(
        {
          pack: pack.pack,
          summary: summarizeQBridgeBenchOutcome({
            pack,
            metrics,
            score,
          }),
          scorePercent: score,
          evalSampleCount: pack.splitCounts.eval,
          trainSampleCount: pack.splitCounts.train,
          metrics,
          runSummary,
          runState,
        },
        null,
        2,
      )}\n`,
      'utf8',
    )

    packResults.push({
      pack: pack.pack,
      status: 'evaluated',
      summary: summarizeQBridgeBenchOutcome({
        pack,
        metrics,
        score,
      }),
      outputDir: packOutputDir,
      evalSampleCount: pack.splitCounts.eval,
      trainSampleCount: pack.splitCounts.train,
      command: [options.python, ...pythonArgs].join(' '),
      exitCode: result.exitCode,
      score,
      metrics,
      runSummary,
      runState,
      stdoutTail: tailText(result.stdout),
      stderrTail: tailText(result.stderr),
    })
  }

  const evaluated = packResults.filter(
    result => result.status === 'evaluated',
  )
  const bestResult =
    evaluated
      .filter(result => result.score !== null)
      .sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity))[0] ?? null

  const report = {
    benchmarkId,
    generatedAt: new Date().toISOString(),
    bundleDir: options.bundleDir,
    bundleManifestPath: resolve(options.bundleDir, 'bundle-manifest.json'),
    outputDir,
    baseModel: options.baseModel,
    adapterDir: options.adapterDir,
    python: options.python,
    packs: options.packs,
    maxSeqLength: options.maxSeqLength,
    maxTrainSamples: options.maxTrainSamples,
    maxEvalSamples: options.maxEvalSamples,
    runNamePrefix: options.runNamePrefix,
    scoreMetric: 'eval_mean_token_accuracy_percent',
    results: packResults,
    bestResult: bestResult
      ? {
          pack: bestResult.pack,
          score: bestResult.score,
          summary: bestResult.summary,
        }
      : null,
    honestyBoundary:
      'This is a local Q benchmark over audited OpenJaws packs. It is useful for in-repo comparison, but it is not the public Immaculate benchmark source of truth.',
  }
  const reportPath = join(outputDir, 'bridgebench-report.json')
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  writeFileSync(
    join(outputDir, 'reward.json'),
    `${JSON.stringify(
      Object.fromEntries(
        packResults
          .filter(
            result =>
              result.status === 'evaluated' &&
              result.metrics?.evalMeanTokenAccuracy !== null,
          )
          .map(result => [
            result.pack,
            result.metrics?.evalMeanTokenAccuracy ?? null,
          ]),
      ),
      null,
      2,
    )}\n`,
    'utf8',
  )
  writeFileSync(
    join(outputDir, 'reward-details.json'),
    `${JSON.stringify(
      {
        benchmarkId,
        scoreMetric: 'eval_mean_token_accuracy',
        results: packResults.map(result => ({
          pack: result.pack,
          status: result.status,
          summary: result.summary,
          score: result.score,
          metrics: result.metrics,
          outputDir: result.outputDir,
        })),
      },
      null,
      2,
    )}\n`,
    'utf8',
  )

  console.log(
    JSON.stringify(
      {
        status: 'ok',
        benchmarkId,
        reportPath,
        summary: bestResult
          ? `Q BridgeBench completed. Best pack: ${bestResult.pack} (${bestResult.score?.toFixed(2) ?? 'n/a'}).`
          : 'Q BridgeBench completed without an evaluated pack result.',
        results: packResults.map(result => ({
          pack: result.pack,
          status: result.status,
          summary: result.summary,
          score: result.score,
          outputDir: result.outputDir,
        })),
      },
      null,
      2,
    ),
  )
}

await main()
