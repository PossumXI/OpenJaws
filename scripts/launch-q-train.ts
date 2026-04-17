import { resolve, join } from 'path'
import {
  DEFAULT_Q_BASE_MODEL,
  resolveQTrainingPythonCommand,
} from '../src/utils/qTraining.js'
import {
  launchQTrainingRun,
  type QTrainLaunchCliOptions,
} from '../src/q/trainLaunch.js'

type CliOptions = QTrainLaunchCliOptions

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    root: null,
    bundleDir: resolve(process.cwd(), 'data', 'sft', 'audited-v2'),
    outputDir: null,
    baseModel: DEFAULT_Q_BASE_MODEL,
    runName: null,
    lineageId: null,
    phaseId: null,
    python: resolveQTrainingPythonCommand(process.cwd()),
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
      'Usage: bun scripts/launch-q-train.ts [options]',
      '',
      'Options:',
      '  --root <path>              Root directory for registry/queue artifacts',
      '  --bundle-dir <path>        Prepared/audited dataset bundle directory',
      '  --output-dir <path>        Output run directory',
      '  --base-model <model>       Base Hugging Face model',
      '  --run-name <name>          Optional run name',
      '  --lineage-id <id>          Optional lineage ID shared across related Q runs',
      '  --phase-id <id>            Optional Agent Co-Work phase ID tied to this run',
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

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const result = await launchQTrainingRun(options)
  console.log(JSON.stringify(result, null, 2))
}

await main()
