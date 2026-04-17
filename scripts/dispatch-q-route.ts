import { resolve } from 'path'
import { resolveQTrainingPythonCommand } from '../src/utils/qTraining.js'
import {
  dispatchQTrainingRoute,
  type QRouteDispatchCliOptions,
} from '../src/q/routing.js'

type CliOptions = QRouteDispatchCliOptions

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    root: null,
    manifestPath: null,
    python: resolveQTrainingPythonCommand(process.cwd()),
    dryRun: false,
    allowHostRisk: false,
    workerId: `local-dispatcher:${process.pid}`,
    executionProfile: 'local',
    executionEndpoint: null,
    dispatchDelayMs: null,
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--manifest' && argv[i + 1]) {
      options.manifestPath = resolve(argv[++i]!)
      continue
    }
    if (arg === '--root' && argv[i + 1]) {
      options.root = resolve(argv[++i]!)
      continue
    }
    if (arg === '--python' && argv[i + 1]) {
      options.python = argv[++i]!
      continue
    }
    if (arg === '--dry-run') {
      options.dryRun = true
      continue
    }
    if (arg === '--allow-host-risk') {
      options.allowHostRisk = true
      continue
    }
    if (arg === '--worker-id' && argv[i + 1]) {
      options.workerId = argv[++i]!
      continue
    }
    if (arg === '--execution-profile' && argv[i + 1]) {
      const value = argv[++i]!
      if (value === 'local' || value === 'remote') {
        options.executionProfile = value
        continue
      }
      throw new Error(`Unknown --execution-profile "${value}". Use local or remote.`)
    }
    if (arg === '--execution-endpoint' && argv[i + 1]) {
      options.executionEndpoint = argv[++i]!
      continue
    }
    if (arg === '--dispatch-delay-ms' && argv[i + 1]) {
      const value = Number.parseInt(argv[++i]!, 10)
      options.dispatchDelayMs = Number.isFinite(value) ? value : null
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
      'Usage: bun scripts/dispatch-q-route.ts [options]',
      '',
      'Options:',
      '  --root <path>             Root directory for registry/queue artifacts',
      '  --manifest <path>         Route manifest to verify and dispatch',
      '  --python <exe>            Python executable to use',
      '  --dry-run                 Verify and preflight only; do not spawn trainer',
      '  --allow-host-risk         Allow local dispatch when current host still fails memory preflight',
      '  --worker-id <id>          Identifier written into queue claim metadata',
      '  --execution-profile <p>   local or remote worker profile',
      '  --execution-endpoint <u>  Remote execution endpoint used for signed HTTP dispatch',
      '  --dispatch-delay-ms <n>   Wait before spawn to exercise worker lease renewal',
      '  -h, --help                Show this help',
    ].join('\n'),
  )
  process.exit(0)
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const outcome = await dispatchQTrainingRoute(options)
  console.log(JSON.stringify(outcome.payload, null, 2))
  if (outcome.exitCode !== 0) {
    process.exit(outcome.exitCode)
  }
}

await main()
