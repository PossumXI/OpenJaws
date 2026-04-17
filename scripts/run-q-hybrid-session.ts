import { resolve } from 'path'
import {
  runQHybridSession,
  type QHybridCliOptions,
} from '../src/q/hybrid.js'

type CliOptions = QHybridCliOptions

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

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const { report, reportPath } = await runQHybridSession(options)

  console.log(
    JSON.stringify(
      {
        status:
          report.status === 'started' || report.status === 'dry_run'
            ? 'ok'
            : report.status === 'degraded'
              ? 'warning'
              : 'failed',
        sessionId: report.sessionId,
        lineageId: report.lineageId,
        phaseId: report.phaseId,
        reportPath,
        summary:
          report.status === 'dry_run'
            ? 'Hybrid Q session dry run completed.'
            : report.status === 'started'
              ? 'Hybrid Q session launched: local lane started and Immaculate lane submitted.'
              : report.status === 'degraded'
                ? `Hybrid Q session only partially launched. Local lane is ${report.localLane.status} and Immaculate lane is ${report.immaculateLane.status}.`
                : 'Hybrid Q session failed to launch cleanly.',
        localStatus: report.localLane.status,
        immaculateStatus: report.immaculateLane.status,
        cloudStatus: report.cloudLane.status,
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
