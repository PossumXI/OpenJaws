import { resolve } from 'path'
import {
  resolveDeterministicSeed,
  resolveDefaultHarborCommand,
  resolveQPreflightRequirementsForBench,
  runQPreflightChecks,
  type QPreflightBenchName,
  type QPreflightRequirement,
} from '../src/q/preflight.js'

type CliOptions = {
  root: string
  bench: QPreflightBenchName
  requirements: QPreflightRequirement[]
  model: string | null
  preferDirectQ: boolean
  bundleDir: string | null
  python: string | null
  harborCommand: string | null
  timeoutMs: number
  seed: number
}

function parseOptionalInt(value: string | undefined): number | null {
  if (!value) {
    return null
  }
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : null
}

function parseRequirement(value: string): QPreflightRequirement | null {
  const normalized = value.trim().toLowerCase()
  const allowed = new Set<QPreflightRequirement>([
    'openjaws-binary',
    'oci-q-runtime',
    'openjaws-provider-preflight',
    'bundle-manifest',
    'python-runtime',
    'harbor',
    'docker',
    'clock-skew',
  ])
  return allowed.has(normalized as QPreflightRequirement)
    ? (normalized as QPreflightRequirement)
    : null
}

function parseBench(value: string | undefined): QPreflightBenchName {
  const normalized = value?.trim().toLowerCase()
  if (
    normalized === 'bridgebench' ||
    normalized === 'soak' ||
    normalized === 'terminalbench'
  ) {
    return normalized
  }
  return 'terminalbench'
}

function parseArgs(argv: string[]): CliOptions {
  const defaultBench = parseBench(process.env.OPENJAWS_Q_PREFLIGHT_BENCH)
  const options: CliOptions = {
    root: process.cwd(),
    bench: defaultBench,
    requirements: [...resolveQPreflightRequirementsForBench(defaultBench)],
    model: 'oci:Q',
    preferDirectQ: defaultBench === 'soak',
    bundleDir: null,
    python: null,
    harborCommand: resolveDefaultHarborCommand(),
    timeoutMs: 30_000,
    seed: resolveDeterministicSeed(),
  }

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    if (arg === '--root' && argv[index + 1]) {
      options.root = resolve(argv[++index]!)
      continue
    }
    if (arg === '--bench' && argv[index + 1]) {
      options.bench = parseBench(argv[++index]!)
      options.requirements = [...resolveQPreflightRequirementsForBench(options.bench)]
      options.model = options.model ?? 'oci:Q'
      options.preferDirectQ = options.bench === 'soak'
      continue
    }
    if (arg === '--requirement' && argv[index + 1]) {
      const requirement = parseRequirement(argv[++index]!)
      if (requirement && !options.requirements.includes(requirement)) {
        options.requirements.push(requirement)
      }
      continue
    }
    if (arg === '--model' && argv[index + 1]) {
      options.model = argv[++index]!
      continue
    }
    if (arg === '--prefer-direct-q') {
      options.preferDirectQ = true
      continue
    }
    if (arg === '--bundle-dir' && argv[index + 1]) {
      options.bundleDir = resolve(argv[++index]!)
      continue
    }
    if (arg === '--python' && argv[index + 1]) {
      options.python = argv[++index]!
      continue
    }
    if (arg === '--harbor' && argv[index + 1]) {
      options.harborCommand = argv[++index]!
      continue
    }
    if (arg === '--timeout-ms' && argv[index + 1]) {
      const parsed = parseOptionalInt(argv[++index]!)
      if (parsed !== null && parsed > 0) {
        options.timeoutMs = parsed
      }
      continue
    }
    if (arg === '--seed' && argv[index + 1]) {
      const parsed = parseOptionalInt(argv[++index]!)
      if (parsed !== null) {
        options.seed = resolveDeterministicSeed(parsed)
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
      'Usage: bun scripts/q-preflight.ts [options]',
      '',
      'Options:',
      '  --bench <name>           bridgebench | soak | terminalbench',
      '  --requirement <name>     Additional requirement: openjaws-binary | oci-q-runtime | openjaws-provider-preflight | bundle-manifest | python-runtime | harbor | docker | clock-skew',
      '  --model <name>           Provider model reference used for OCI/OpenJaws preflight',
      '  --prefer-direct-q        Force direct oci:Q probe selection',
      '  --bundle-dir <path>      Bundle directory for bundle-manifest checks',
      '  --python <command>       Python command for python-runtime checks',
      '  --harbor <command>       Harbor command for harbor checks',
      '  --timeout-ms <n>         Timeout per check (default 30000)',
      '  --seed <n>               Deterministic benchmark seed emitted with the result (default 42)',
      '  -h, --help               Show this help',
    ].join('\n'),
  )
  process.exit(0)
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const checks = await runQPreflightChecks({
    root: options.root,
    requirements: options.requirements,
    model: options.model,
    preferDirectQ: options.preferDirectQ,
    bundleDir: options.bundleDir,
    python: options.python,
    harborCommand: options.harborCommand,
    timeoutMs: options.timeoutMs,
    warnOnProviderFailure: options.bench === 'terminalbench',
  })
  const failed = checks.filter(check => check.status === 'failed').length
  const warnings = checks.filter(check => check.status === 'warning').length
  console.log(
    JSON.stringify(
      {
        status: failed > 0 ? 'failed' : warnings > 0 ? 'warning' : 'ok',
        bench: options.bench,
        seed: options.seed,
        checks,
      },
      null,
      2,
    ),
  )
  if (failed > 0) {
    process.exit(1)
  }
}

if (import.meta.main) {
  await main()
}
