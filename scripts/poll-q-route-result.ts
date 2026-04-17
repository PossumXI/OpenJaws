import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { dirname, join, resolve } from 'path'
import {
  finalizeQTrainingRouteQueueCompletion,
  getQTrainingRouteQueueDisplayStatus,
  getQTrainingRouteQueueEntry,
  getQTrainingRouteQueueStatusSummary,
  getLatestQTrainingSnapshot,
  readQRunState,
  readQTrainingRegistry,
  readQTrainingRouteManifest,
  resolveQTrainingRoutePath,
  upsertQTrainingRegistryEntry,
  verifyQTrainingRouteResultEnvelope,
  type QRunState,
  type QTrainingRouteResultEnvelope,
} from '../src/utils/qTraining.js'
import {
  buildBaseRunState,
  fetchResultEnvelope,
  reconcileQTrainingRouteResult,
  resolveLatestQRouteManifestPath,
  writeJson,
  type QTrainingRouteResultReconcileArgs,
  type QTrainingRouteResultReconcileOutcome,
} from '../src/q/routing.js'

type CliOptions = {
  root: string | null
  manifestPath: string | null
  stateUrl: string | null
  pollMs: number
  timeoutMs: number
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    root: null,
    manifestPath: null,
    stateUrl: null,
    pollMs: 1_000,
    timeoutMs: 60_000,
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--root' && argv[i + 1]) {
      options.root = resolve(argv[++i]!)
      continue
    }
    if (arg === '--manifest' && argv[i + 1]) {
      options.manifestPath = resolve(argv[++i]!)
      continue
    }
    if (arg === '--state-url' && argv[i + 1]) {
      options.stateUrl = argv[++i]!
      continue
    }
    if (arg === '--poll-ms' && argv[i + 1]) {
      const value = Number.parseInt(argv[++i]!, 10)
      options.pollMs = Number.isFinite(value) ? value : options.pollMs
      continue
    }
    if (arg === '--timeout-ms' && argv[i + 1]) {
      const value = Number.parseInt(argv[++i]!, 10)
      options.timeoutMs = Number.isFinite(value) ? value : options.timeoutMs
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
      'Usage: bun scripts/poll-q-route-result.ts [options]',
      '',
      'Options:',
      '  --root <path>         Root directory for route artifacts',
      '  --manifest <path>     Route manifest to reconcile',
      '  --state-url <url>     Override remote state URL instead of queue metadata',
      '  --poll-ms <n>         Poll interval in milliseconds',
      '  --timeout-ms <n>      Total poll timeout in milliseconds',
      '  -h, --help            Show this help',
    ].join('\n'),
  )
  process.exit(0)
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const result = await reconcileQTrainingRouteResult({
    root: options.root,
    manifestPath: options.manifestPath,
    stateUrl: options.stateUrl,
    pollMs: options.pollMs,
    timeoutMs: options.timeoutMs,
  })
  console.log(JSON.stringify(result, null, 2))
  if (result.status === 'pending') {
    process.exit(1)
  }
}

if (import.meta.main) {
  await main()
}
