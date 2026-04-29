import { resolve } from 'path'
import {
  runQTrainingRouteWorker,
  type QRouteWorkerCliOptions,
} from '../src/q/routing.js'

type CliOptions = QRouteWorkerCliOptions

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    root: null,
    manifestPath: null,
    dryRun: false,
    allowHostRisk: false,
    python: null,
    workerId: `route-worker:${process.pid}`,
    workerLabel: null,
    hostLabel: null,
    executionProfile: 'local',
    executionEndpoint: null,
    baseModels: [],
    preferredLayers: [],
    claimTtlMs: null,
    heartbeatMs: null,
    watch: false,
    pollMs: 1_000,
    idleExitMs: null,
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
    if (arg === '--dry-run') {
      options.dryRun = true
      continue
    }
    if (arg === '--allow-host-risk') {
      options.allowHostRisk = true
      continue
    }
    if (arg === '--python' && argv[i + 1]) {
      options.python = argv[++i]!
      continue
    }
    if (arg === '--worker-id' && argv[i + 1]) {
      options.workerId = argv[++i]!
      continue
    }
    if (arg === '--worker-label' && argv[i + 1]) {
      options.workerLabel = argv[++i]!
      continue
    }
    if (arg === '--host-label' && argv[i + 1]) {
      options.hostLabel = argv[++i]!
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
    if (arg === '--base-model' && argv[i + 1]) {
      options.baseModels.push(argv[++i]!)
      continue
    }
    if (arg === '--layer' && argv[i + 1]) {
      options.preferredLayers.push(argv[++i]!)
      continue
    }
    if (arg === '--claim-ttl-ms' && argv[i + 1]) {
      const value = Number.parseInt(argv[++i]!, 10)
      options.claimTtlMs = Number.isFinite(value) ? value : null
      continue
    }
    if (arg === '--heartbeat-ms' && argv[i + 1]) {
      const value = Number.parseInt(argv[++i]!, 10)
      options.heartbeatMs = Number.isFinite(value) ? value : null
      continue
    }
    if (arg === '--poll-ms' && argv[i + 1]) {
      const value = Number.parseInt(argv[++i]!, 10)
      if (Number.isFinite(value) && value > 0) {
        options.pollMs = value
      }
      continue
    }
    if (arg === '--idle-exit-ms' && argv[i + 1]) {
      const value = Number.parseInt(argv[++i]!, 10)
      options.idleExitMs = Number.isFinite(value) ? value : null
      continue
    }
    if (arg === '--dispatch-delay-ms' && argv[i + 1]) {
      const value = Number.parseInt(argv[++i]!, 10)
      options.dispatchDelayMs = Number.isFinite(value) ? value : null
      continue
    }
    if (arg === '--watch') {
      options.watch = true
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
      'Usage: bun scripts/process-q-routes.ts [options]',
      '',
      'Options:',
      '  --root <path>             Root directory for registry/queue artifacts',
      '  --manifest <path>         Process a specific queued route manifest',
      '  --dry-run                 Verify/claim decision only; do not dispatch trainer',
      '  --allow-host-risk         Allow local dispatch on a tight host',
      '  --python <exe>            Python executable forwarded to dispatcher',
      '  --worker-id <id>          Worker identity recorded in queue claim metadata',
      '  --worker-label <label>    Optional operator-facing worker label',
      '  --host-label <label>      Optional host label shown in status/queue',
      '  --execution-profile <p>   local or remote worker profile',
      '  --execution-endpoint <u>  Required for remote workers registered with Immaculate',
      '  --base-model <model>      Repeatable base-model capability filter',
      '  --layer <id>              Repeatable preferred Immaculate layer',
      '  --claim-ttl-ms <n>        Override queue claim lease for this worker',
      '  --heartbeat-ms <n>        Renew the queue claim while dispatch runs',
      '  --watch                   Poll the queue until idle exit',
      '  --poll-ms <n>             Poll interval for --watch mode',
      '  --idle-exit-ms <n>        Exit watch mode after this long with no work',
      '  --dispatch-delay-ms <n>   Forward a pre-dispatch delay to the dispatcher (test seam)',
      '  -h, --help                Show this help',
    ].join('\n'),
  )
  process.exit(0)
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  let emittedPayload = false
  const outcome = await runQTrainingRouteWorker(options, payload => {
    emittedPayload = true
    console.log(JSON.stringify(payload, null, 2))
  })
  if (!emittedPayload) {
    console.log(JSON.stringify(outcome.payload, null, 2))
  }
  if (outcome.exitCode !== 0) {
    process.exit(outcome.exitCode)
  }
}

await main()
