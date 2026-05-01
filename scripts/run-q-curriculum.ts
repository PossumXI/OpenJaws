import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { execa } from 'execa'
import {
  getDefaultQBridgeBenchPacks,
  loadQBridgeBenchBundleManifest,
  Q_BRIDGEBENCH_PACKS,
  resolveQBridgeBenchPack,
  type QBridgeBenchPack,
} from '../src/utils/bridgeBench.js'
import {
  buildQTrainingPythonEnv,
  DEFAULT_Q_BASE_MODEL,
  resolveQTrainingPythonCommand,
} from '../src/utils/qTraining.js'
import { resolveWandbConfig } from '../src/utils/wandb.js'

type CliOptions = {
  root: string | null
  bundleDir: string
  outputDir: string | null
  baseModel: string
  lineageId: string | null
  phaseId: string | null
  python: string
  profiles: QBridgeBenchPack[]
  benchmarkPacks: QBridgeBenchPack[]
  useCpu: boolean
  maxSteps: number | null
  numTrainEpochs: number | null
  maxSeqLength: number
  maxTrainSamples: number | null
  maxEvalSamples: number | null
  timeoutMs: number
  benchmarkTimeoutMs: number
  skipBenchmark: boolean
  wandbProject: string | null
  wandbEntity: string | null
}

type CurriculumProfileResult = {
  profile: QBridgeBenchPack
  status: 'trained' | 'skipped' | 'failed'
  summary: string
  trainOutputDir: string
  wandbSummary?: string | null
  benchmarkReportPath?: string | null
  trainCommand?: string
  trainExitCode?: number | null
  benchmarkSummary?: string | null
  benchmarkBestPack?: string | null
  benchmarkBestScore?: number | null
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

function parseOptionalFloat(value: string | undefined): number | null {
  if (!value) {
    return null
  }
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : null
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    root: null,
    bundleDir: resolve(process.cwd(), 'data', 'sft', 'audited-v2'),
    outputDir: null,
    baseModel: DEFAULT_Q_BASE_MODEL,
    lineageId: null,
    phaseId: null,
    python: resolveQTrainingPythonCommand(process.cwd()),
    profiles: [],
    benchmarkPacks: [],
    useCpu: true,
    maxSteps: 8,
    numTrainEpochs: 1,
    maxSeqLength: 512,
    maxTrainSamples: null,
    maxEvalSamples: null,
    timeoutMs: 1_800_000,
    benchmarkTimeoutMs: 1_800_000,
    skipBenchmark: false,
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
    if (arg === '--lineage-id' && argv[i + 1]) {
      options.lineageId = argv[++i]!
      continue
    }
    if (arg === '--phase-id' && argv[i + 1]) {
      options.phaseId = argv[++i]!
      continue
    }
    if (arg === '--python' && argv[i + 1]) {
      options.python = argv[++i]!
      continue
    }
    if (arg === '--profile' && argv[i + 1]) {
      const pack = parsePack(argv[++i]!)
      if (pack) {
        options.profiles.push(pack)
      }
      continue
    }
    if (arg === '--benchmark-pack' && argv[i + 1]) {
      const pack = parsePack(argv[++i]!)
      if (pack) {
        options.benchmarkPacks.push(pack)
      }
      continue
    }
    if (arg === '--use-cpu') {
      options.useCpu = true
      continue
    }
    if (arg === '--max-steps' && argv[i + 1]) {
      options.maxSteps = parseOptionalInt(argv[++i]!)
      continue
    }
    if (arg === '--num-train-epochs' && argv[i + 1]) {
      options.numTrainEpochs = parseOptionalFloat(argv[++i]!)
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
    if (arg === '--benchmark-timeout-ms' && argv[i + 1]) {
      const parsed = parseOptionalInt(argv[++i]!)
      if (parsed !== null && parsed > 0) {
        options.benchmarkTimeoutMs = parsed
      }
      continue
    }
    if (arg === '--skip-benchmark') {
      options.skipBenchmark = true
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

  if (options.profiles.length === 0) {
    options.profiles = ['coding', 'agentic', 'security']
  }
  if (options.benchmarkPacks.length === 0) {
    options.benchmarkPacks = getDefaultQBridgeBenchPacks()
  }

  return options
}

function printHelpAndExit(): never {
  console.log(
    [
      'Usage: bun scripts/run-q-curriculum.ts [options]',
      '',
      'Options:',
      '  --bundle-dir <path>          Audited bundle directory',
      '  --out-dir <path>             Output directory for curriculum artifacts',
      '  --base-model <id>            Base Q model family label or upstream checkpoint',
      '  --lineage-id <id>            Optional lineage ID shared across the curriculum lanes',
      '  --phase-id <id>              Optional Agent Co-Work phase ID tied to this curriculum',
      '  --python <path>              Python runtime to use',
      '  --profile <name>             Training profile: coding, agentic, security, general',
      '  --benchmark-pack <name>      Pack to benchmark after each training run',
      '  --max-steps <n>              Optional max-step cap for each specialization run',
      '  --num-train-epochs <n>       Optional train epochs for each specialization run',
      '  --max-seq-length <n>         Sequence length cap for training and eval runs',
      '  --max-train-samples <n>      Optional train-sample cap per run',
      '  --max-eval-samples <n>       Optional eval-sample cap per run and benchmark pack',
      '  --timeout-ms <n>             Per-profile train timeout in milliseconds',
      '  --benchmark-timeout-ms <n>   Per-profile BridgeBench timeout in milliseconds',
      '  --skip-benchmark             Train only; do not run BridgeBench after training',
      '  --wandb-project <name>       Optional W&B project for live run receipts',
      '  --wandb-entity <name>        Optional W&B entity for live run receipts',
      '  -h, --help                   Show this help',
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

function makeCurriculumId(): string {
  return `q-curriculum-${new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\..+/, '')}`
}

function buildTrainArgs(args: {
  trainFile: string
  evalFile: string | null
  profile: QBridgeBenchPack
  outputDir: string
  lineageId: string | null
  phaseId: string | null
  options: CliOptions
  wandb: ReturnType<typeof resolveWandbConfig>
}): string[] {
  const pythonArgs = [
    resolve(process.cwd(), 'training', 'q', 'train_lora.py'),
    '--train-file',
    args.trainFile,
    '--base-model',
    args.options.baseModel,
    '--output-dir',
    args.outputDir,
    '--curriculum-profile',
    args.profile,
    '--run-name',
    `q-curriculum-${args.profile}`,
    '--max-seq-length',
    String(args.options.maxSeqLength),
  ]
  if (args.lineageId) {
    pythonArgs.push('--lineage-id', args.lineageId)
  }
  if (args.phaseId) {
    pythonArgs.push('--phase-id', args.phaseId)
  }

  if (args.evalFile) {
    pythonArgs.push('--eval-file', args.evalFile)
  }
  if (args.options.useCpu) {
    pythonArgs.push('--use-cpu')
  }
  if (args.options.maxSteps !== null) {
    pythonArgs.push('--max-steps', String(args.options.maxSteps))
  }
  if (args.options.numTrainEpochs !== null) {
    pythonArgs.push('--num-train-epochs', String(args.options.numTrainEpochs))
  }
  if (args.options.maxTrainSamples !== null) {
    pythonArgs.push('--max-train-samples', String(args.options.maxTrainSamples))
  }
  if (args.options.maxEvalSamples !== null) {
    pythonArgs.push('--max-eval-samples', String(args.options.maxEvalSamples))
  }
  pythonArgs.push('--tag', args.profile)
  if (args.wandb.project) {
    pythonArgs.push('--wandb-project', args.wandb.project)
  }
  if (args.wandb.entity) {
    pythonArgs.push('--wandb-entity', args.wandb.entity)
  }

  return pythonArgs
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const root = options.root ?? process.cwd()
  const curriculumId = makeCurriculumId()
  const lineageId = options.lineageId ?? curriculumId
  const outputDir =
    options.outputDir ?? resolve(root, 'artifacts', 'q-curriculum', curriculumId)
  mkdirSync(outputDir, { recursive: true })
  const wandb = resolveWandbConfig({
    project: options.wandbProject,
    entity: options.wandbEntity,
  })

  const manifest = loadQBridgeBenchBundleManifest(options.bundleDir)
  const results: CurriculumProfileResult[] = []

  for (const profile of options.profiles) {
    if (profile === 'all') {
      continue
    }
    const pack = resolveQBridgeBenchPack({
      bundleDir: options.bundleDir,
      manifest,
      pack: profile,
    })
    const profileDir = join(outputDir, profile)
    const trainOutputDir = join(profileDir, 'train')
    mkdirSync(trainOutputDir, { recursive: true })

    if (pack.splitCounts.train === 0) {
      results.push({
        profile,
        status: 'skipped',
        summary: `${pack.label} curriculum run skipped because it has no train samples.`,
        trainOutputDir,
        wandbSummary: wandb.summary,
      })
      continue
    }

    const trainArgs = buildTrainArgs({
      trainFile: pack.trainFile,
      evalFile: pack.splitCounts.eval > 0 ? pack.evalFile : null,
      profile,
      outputDir: trainOutputDir,
      lineageId,
      phaseId: options.phaseId,
      options,
      wandb,
    })
    const trainResult = await execa(options.python, trainArgs, {
      cwd: root,
      env: buildQTrainingPythonEnv(),
      reject: false,
      timeout: options.timeoutMs,
      windowsHide: true,
    })

    if (trainResult.exitCode !== 0) {
      results.push({
        profile,
        status: 'failed',
        summary: `${pack.label} curriculum training failed.`,
        trainOutputDir,
        wandbSummary: wandb.summary,
        trainCommand: [options.python, ...trainArgs].join(' '),
        trainExitCode: trainResult.exitCode,
        stdoutTail: tailText(trainResult.stdout),
        stderrTail: tailText(trainResult.stderr),
      })
      continue
    }

    let benchmarkReportPath: string | null = null
    let benchmarkSummary: string | null = null
    let benchmarkBestPack: string | null = null
    let benchmarkBestScore: number | null = null

    if (!options.skipBenchmark) {
      const benchmarkOutDir = join(profileDir, 'bridgebench')
      const benchmarkArgs = [
        'scripts/q-bridgebench.ts',
        '--bundle-dir',
        options.bundleDir,
        '--out-dir',
        benchmarkOutDir,
        '--base-model',
        options.baseModel,
        '--lineage-id',
        lineageId,
        '--adapter-dir',
        trainOutputDir,
        '--python',
        options.python,
        '--max-seq-length',
        String(options.maxSeqLength),
        '--timeout-ms',
        String(options.benchmarkTimeoutMs),
      ]
      if (options.phaseId) {
        benchmarkArgs.push('--phase-id', options.phaseId)
      }
      if (options.maxTrainSamples !== null) {
        benchmarkArgs.push('--max-train-samples', String(options.maxTrainSamples))
      }
      if (options.maxEvalSamples !== null) {
        benchmarkArgs.push('--max-eval-samples', String(options.maxEvalSamples))
      }
      for (const packName of options.benchmarkPacks) {
        benchmarkArgs.push('--pack', packName)
      }
      if (wandb.project) {
        benchmarkArgs.push('--wandb-project', wandb.project)
      }
      if (wandb.entity) {
        benchmarkArgs.push('--wandb-entity', wandb.entity)
      }

      const benchmarkResult = await execa('bun', benchmarkArgs, {
        cwd: root,
        reject: false,
        timeout: options.benchmarkTimeoutMs,
        windowsHide: true,
      })
      if (benchmarkResult.exitCode === 0) {
        const benchmarkJson = JSON.parse(benchmarkResult.stdout) as Record<string, unknown>
        benchmarkReportPath =
          typeof benchmarkJson.reportPath === 'string'
            ? benchmarkJson.reportPath
            : join(benchmarkOutDir, 'bridgebench-report.json')
        benchmarkSummary =
          typeof benchmarkJson.summary === 'string' ? benchmarkJson.summary : null
        const benchmarkReport = readJsonIfExists(benchmarkReportPath)
        const bestResult =
          benchmarkReport && typeof benchmarkReport.bestResult === 'object'
            ? (benchmarkReport.bestResult as Record<string, unknown>)
            : null
        benchmarkBestPack =
          bestResult && typeof bestResult.pack === 'string' ? bestResult.pack : null
        benchmarkBestScore =
          bestResult && typeof bestResult.score === 'number'
            ? bestResult.score
            : null
      } else {
        benchmarkSummary = `${pack.label} BridgeBench follow-up failed.`
      }
    }

    results.push({
      profile,
      status: 'trained',
      summary: `${pack.label} curriculum run completed.`,
      trainOutputDir,
      wandbSummary: wandb.summary,
      benchmarkReportPath,
      trainCommand: [options.python, ...trainArgs].join(' '),
      trainExitCode: trainResult.exitCode,
      benchmarkSummary,
      benchmarkBestPack,
      benchmarkBestScore,
      stdoutTail: tailText(trainResult.stdout),
      stderrTail: tailText(trainResult.stderr),
    })
  }

  const report = {
    curriculumId,
    generatedAt: new Date().toISOString(),
    bundleDir: options.bundleDir,
    outputDir,
    baseModel: options.baseModel,
    lineageId,
    phaseId: options.phaseId,
    python: options.python,
    profiles: options.profiles,
    benchmarkPacks: options.benchmarkPacks,
    maxSteps: options.maxSteps,
    numTrainEpochs: options.numTrainEpochs,
    maxSeqLength: options.maxSeqLength,
    maxTrainSamples: options.maxTrainSamples,
    maxEvalSamples: options.maxEvalSamples,
    wandb,
    results,
    honestyBoundary:
      'These curriculum runs compare audited OpenJaws packs locally. They are useful for specialization direction, but they are not a public benchmark claim on their own.',
  }
  const reportPath = join(outputDir, 'curriculum-report.json')
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

  console.log(
    JSON.stringify(
      {
        status: 'ok',
        curriculumId,
        reportPath,
        summary: `Q curriculum completed across ${results.length} profile lane${results.length === 1 ? '' : 's'}.`,
        results: results.map(result => ({
          profile: result.profile,
          status: result.status,
          summary: result.summary,
          benchmarkBestPack: result.benchmarkBestPack,
          benchmarkBestScore: result.benchmarkBestScore,
        })),
      },
      null,
      2,
    ),
  )
}

await main()
