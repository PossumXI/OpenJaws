import { existsSync, readFileSync, statSync, writeFileSync } from 'fs'
import { globSync } from 'glob'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

type CliOptions = {
  check: boolean
  outFile: string
  bridgeBenchReportPath: string
  soakReportPath: string
  terminalBenchReportPath: string
  terminalBenchSoakReportPath: string
  wandbReportPath: string
  terminalBenchSubmissionUrl: string | null
}

type BenchmarkSnapshot = {
  generatedAt: string
  source: string
  bridgeBench: {
    benchmarkId: string
    bestPack: string
    scorePercent: number
    summary: string
  }
  soak: {
    runId: string
    durationMinutes: number
    totalProbes: number
    successCount: number
    errorCount: number
    summary: string
  }
  terminalBench: {
    runId: string
    taskName: string
    scope: string
    status: string
    agent: string
    model: string
    outcome: string
    summary: string
    submissionUrl?: string
  }
  terminalBenchSoak: {
    runId: string
    taskName: string
    status: string
    cycleCount: number
    totalTrials: number
    executionErrorTrials: number
    benchmarkFailedTrials: number
    summary: string
  }
  wandb: {
    status: string
    enabled: boolean
    source: string
    summary: string
    url?: string
  }
}

type SnapshotDeps = {
  resolveLatestReceipt: typeof resolveLatestReceipt
  collectMatchingReceiptPaths: typeof collectMatchingReceiptPaths
  readJson: typeof readJson
}

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptDir, '..')

export function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    check: false,
    outFile: resolve(repoRoot, 'website', 'lib', 'benchmarkSnapshot.generated.json'),
    bridgeBenchReportPath: resolve(
      repoRoot,
      'artifacts',
      'q-bridgebench-live-20260415-nowandb',
      'bridgebench-report.json',
    ),
    soakReportPath: resolve(
      repoRoot,
      'artifacts',
      'q-soak-live-20260416',
      'q-soak-report.json',
    ),
    terminalBenchReportPath: resolve(
      repoRoot,
      'artifacts',
      'q-terminalbench-official-public-20260416-circuit-fibsqrt-v2',
      'terminalbench-report.json',
    ),
    terminalBenchSoakReportPath: resolve(
      repoRoot,
      'artifacts',
      'q-terminalbench-soak-live-20260417-circuit-fibsqrt-v3',
      'terminalbench-report.json',
    ),
    wandbReportPath: resolve(
      repoRoot,
      'artifacts',
      'q-bridgebench-live-20260415',
      'bridgebench-report.json',
    ),
    terminalBenchSubmissionUrl:
      'https://huggingface.co/datasets/harborframework/terminal-bench-2-leaderboard/discussions/141',
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--check') {
      options.check = true
      continue
    }
    if (arg === '--out-file' && argv[i + 1]) {
      options.outFile = resolve(argv[++i]!)
      continue
    }
    if (arg === '--bridgebench-report' && argv[i + 1]) {
      options.bridgeBenchReportPath = resolve(argv[++i]!)
      continue
    }
    if (arg === '--soak-report' && argv[i + 1]) {
      options.soakReportPath = resolve(argv[++i]!)
      continue
    }
    if (arg === '--terminalbench-report' && argv[i + 1]) {
      options.terminalBenchReportPath = resolve(argv[++i]!)
      continue
    }
    if (arg === '--terminalbench-soak-report' && argv[i + 1]) {
      options.terminalBenchSoakReportPath = resolve(argv[++i]!)
      continue
    }
    if (arg === '--wandb-report' && argv[i + 1]) {
      options.wandbReportPath = resolve(argv[++i]!)
      continue
    }
    if (arg === '--terminalbench-submission-url' && argv[i + 1]) {
      const value = argv[++i]!
      options.terminalBenchSubmissionUrl = value === 'none' ? null : value
      continue
    }
  }

  return options
}

export function normalizeGlobPattern(path: string): string {
  return path.replace(/\\/g, '/')
}

export function isValidExistingReceiptPath(path: string): boolean {
  if (typeof path !== 'string') {
    return false
  }
  const trimmed = path.trim()
  if (!trimmed || trimmed.includes('\0')) {
    return false
  }
  try {
    return existsSync(trimmed) && statSync(trimmed).isFile()
  } catch {
    return false
  }
}

export function resolveLatestReceipt(patterns: string[], fallbackPath: string): string {
  const matches = collectMatchingReceiptPaths(patterns)
  return matches[0] ?? fallbackPath
}

export function collectMatchingReceiptPaths(patterns: string[]): string[] {
  for (const pattern of patterns) {
    const matches = globSync(normalizeGlobPattern(pattern), {
      nodir: true,
      windowsPathsNoEscape: true,
    })
    const uniqueMatches = Array.from(new Set(matches)).filter(isValidExistingReceiptPath)
    if (uniqueMatches.length === 0) {
      continue
    }

    return uniqueMatches
      .map(path => ({
        path,
        mtimeMs: statSync(path).mtimeMs,
      }))
      .sort((a, b) => b.mtimeMs - a.mtimeMs || b.path.localeCompare(a.path))
      .map(entry => entry.path)
  }

  return []
}

export function resolveLatestPreferredReceipt<T>(
  patterns: string[],
  fallbackPath: string,
  collectPaths: (patterns: string[]) => string[],
  readJson: (path: string) => T,
  isPreferred: (receipt: T) => boolean,
): string {
  const matches = collectPaths(patterns)
  if (matches.length === 0) {
    return fallbackPath
  }

  for (const path of matches) {
    try {
      if (isPreferred(readJson(path))) {
        return path
      }
    } catch {
      // Skip unreadable or malformed receipts and keep walking older candidates.
    }
  }

  return matches[0] ?? fallbackPath
}

export function readJson<T>(path: string): T {
  if (!existsSync(path)) {
    throw new Error(`Required benchmark receipt not found: ${path}`)
  }
  return JSON.parse(readFileSync(path, 'utf8')) as T
}

export function formatNumber(value: number, digits = 2): number {
  return Number(value.toFixed(digits))
}

export function buildWandbSummary(wandb: {
  enabled?: boolean
  apiKeyPresent?: boolean
  summary?: string
  source?: string
  url?: string | null
}): BenchmarkSnapshot['wandb'] {
  const enabled = Boolean(wandb.enabled)
  const apiKeyPresent = Boolean(wandb.apiKeyPresent)
  const url = typeof wandb.url === 'string' && wandb.url.length > 0 ? wandb.url : undefined
  const source = typeof wandb.source === 'string' && wandb.source.length > 0 ? wandb.source : 'unknown'
  if (enabled && !apiKeyPresent) {
    return {
      status: 'auth missing',
      enabled: false,
      source,
      url,
      summary:
        'A live W&B project target was configured for this benchmark pass, but no local WANDB login/API key was available, so the receipts stayed local only.',
    }
  }
  return {
    status:
      typeof wandb.summary === 'string' && wandb.summary.length > 0
        ? wandb.summary
        : enabled
          ? 'enabled'
          : 'disabled',
    enabled,
    source,
    url,
    summary:
      typeof wandb.summary === 'string' && wandb.summary.length > 0
        ? wandb.summary
        : enabled
          ? 'Live W&B logging is enabled for this benchmark lane.'
          : 'W&B logging is disabled for this benchmark lane.',
  }
}

export function buildSnapshot(
  options: CliOptions,
  deps: SnapshotDeps = {
    resolveLatestReceipt,
    collectMatchingReceiptPaths,
    readJson,
  },
): BenchmarkSnapshot {
  const bridgeBenchReportPath = resolveLatestPreferredReceipt(
    [
      resolve(repoRoot, 'artifacts', 'q-bridgebench-live-*', 'bridgebench-report.json'),
      resolve(repoRoot, 'artifacts', 'q-bridgebench-*', 'bridgebench-report.json'),
    ],
    options.bridgeBenchReportPath,
    deps.collectMatchingReceiptPaths,
    deps.readJson,
    receipt =>
      typeof (receipt as { bestResult?: { score?: unknown } }).bestResult?.score ===
        'number' &&
      Number.isFinite((receipt as { bestResult?: { score?: number } }).bestResult?.score),
  )
  const soakReportPath = resolveLatestPreferredReceipt(
    [
      resolve(repoRoot, 'artifacts', 'q-soak-live-*', 'q-soak-report.json'),
      resolve(repoRoot, 'artifacts', 'q-soak-*', 'q-soak-report.json'),
    ],
    options.soakReportPath,
    deps.collectMatchingReceiptPaths,
    deps.readJson,
    receipt => {
      const summary = (receipt as {
        summary?: { successCount?: unknown; errorCount?: unknown }
      }).summary
      return (
        typeof summary?.successCount === 'number' &&
        summary.successCount > 0 &&
        typeof summary?.errorCount === 'number' &&
        summary.errorCount === 0
      )
    },
  )
  const terminalBenchReportPath = deps.resolveLatestReceipt(
    [
      resolve(repoRoot, 'artifacts', 'q-terminalbench-official-public-*', 'terminalbench-report.json'),
      resolve(repoRoot, 'artifacts', 'q-terminalbench-public-*', 'terminalbench-report.json'),
      resolve(repoRoot, 'artifacts', 'q-terminalbench-live-*', 'terminalbench-report.json'),
    ],
    options.terminalBenchReportPath,
  )
  const terminalBenchSoakReportPath = deps.resolveLatestReceipt(
    [
      resolve(repoRoot, 'artifacts', 'q-terminalbench-soak-live-*', 'terminalbench-report.json'),
      resolve(repoRoot, 'artifacts', 'q-terminalbench-soak-*', 'terminalbench-report.json'),
    ],
    options.terminalBenchSoakReportPath,
  )
  const wandbReportPath = resolveLatestPreferredReceipt(
    [resolve(repoRoot, 'artifacts', 'q-bridgebench-live-*', 'bridgebench-report.json')],
    options.wandbReportPath,
    deps.collectMatchingReceiptPaths,
    deps.readJson,
    receipt => {
      const wandb = (receipt as {
        wandb?: { enabled?: unknown; source?: unknown }
      }).wandb
      return (
        wandb?.enabled === true ||
        (typeof wandb?.source === 'string' && wandb.source !== 'none')
      )
    },
  )

  const bridgeBench = deps.readJson<{
    benchmarkId: string
    generatedAt: string
    bestResult?: { pack?: string; score?: number; summary?: string } | null
  }>(bridgeBenchReportPath)

  const soak = deps.readJson<{
    runId: string
    generatedAt: string
    durationMinutes: number
    summary: {
      totalProbes: number
      successCount: number
      errorCount: number
      byMode?: {
        openjaws?: { latencyMs?: { p95?: number } }
        'oci-q'?: { latencyMs?: { p95?: number } }
      }
    }
  }>(soakReportPath)

  const terminalBench = deps.readJson<{
    runId: string
    generatedAt: string
    officialSubmission?: boolean
    tasks?: Array<{ taskName?: string }>
    aggregate?: {
      totalTrials?: number
      executionErrorTrials?: number
      avgReward?: number
    }
    agent?: string
    model?: string
  }>(terminalBenchReportPath)
  const terminalBenchSoak = deps.readJson<{
    runId: string
    generatedAt: string
    status?: string
    tasks?: Array<{ taskName?: string }>
    cycles?: Array<unknown>
    aggregate?: {
      totalTrials?: number
      executionErrorTrials?: number
      benchmarkFailedTrials?: number
    }
  }>(terminalBenchSoakReportPath)

  const wandbReport = deps.readJson<{
    generatedAt: string
    wandb?: {
      enabled?: boolean
      apiKeyPresent?: boolean
      summary?: string
      source?: string
      url?: string | null
    }
  }>(wandbReportPath)

  const generatedAt = [
    bridgeBench.generatedAt,
    soak.generatedAt,
    terminalBench.generatedAt,
    terminalBenchSoak.generatedAt,
    wandbReport.generatedAt,
  ]
    .filter(value => typeof value === 'string' && value.length > 0)
    .sort()
    .at(-1) ?? new Date().toISOString()

  const openjawsP95 = soak.summary.byMode?.openjaws?.latencyMs?.p95
  const ociQP95 = soak.summary.byMode?.['oci-q']?.latencyMs?.p95
  const totalTrials = terminalBench.aggregate?.totalTrials ?? 0
  const avgReward = terminalBench.aggregate?.avgReward ?? 0
  const executionErrorTrials = terminalBench.aggregate?.executionErrorTrials ?? 0
  const taskName = terminalBench.tasks?.[0]?.taskName ?? 'unknown'
  const submissionUrl = options.terminalBenchSubmissionUrl ?? undefined
  const soakTaskName = terminalBenchSoak.tasks?.[0]?.taskName ?? 'unknown'
  const soakCycleCount = terminalBenchSoak.cycles?.length ?? 0
  const soakTotalTrials = terminalBenchSoak.aggregate?.totalTrials ?? 0
  const soakExecutionErrorTrials =
    terminalBenchSoak.aggregate?.executionErrorTrials ?? 0
  const soakBenchmarkFailedTrials =
    terminalBenchSoak.aggregate?.benchmarkFailedTrials ?? 0

  return {
    generatedAt,
    source: `Generated from benchmark receipts: ${bridgeBenchReportPath}, ${soakReportPath}, ${terminalBenchReportPath}, ${terminalBenchSoakReportPath}, and ${wandbReportPath}.`,
    bridgeBench: {
      benchmarkId: bridgeBench.benchmarkId,
      bestPack: bridgeBench.bestResult?.pack ?? 'unknown',
      scorePercent: formatNumber(bridgeBench.bestResult?.score ?? 0),
      summary:
        bridgeBench.bestResult?.summary ??
        'Local audited-pack eval over Q bundle slices.',
    },
    soak: {
      runId: soak.runId,
      durationMinutes: soak.durationMinutes,
      totalProbes: soak.summary.totalProbes,
      successCount: soak.summary.successCount,
      errorCount: soak.summary.errorCount,
      summary: `${soak.durationMinutes}-minute bounded soak. ${soak.summary.successCount}/${soak.summary.totalProbes} probes succeeded with ${soak.summary.errorCount} errors. OpenJaws p95 latency: ${openjawsP95 ?? 'n/a'} ms. Direct OCI-Q p95 latency: ${ociQP95 ?? 'n/a'} ms.`,
    },
    terminalBench: {
      runId: terminalBench.runId,
      taskName,
      scope: terminalBench.officialSubmission
        ? 'Official TerminalBench 2.0 public task'
        : 'TerminalBench task receipt',
      status: submissionUrl ? 'submitted' : executionErrorTrials > 0 ? 'completed_with_errors' : 'completed',
      agent: terminalBench.agent ?? 'unknown',
      model: terminalBench.model ?? 'unknown',
      outcome: `reward ${formatNumber(avgReward, 1).toFixed(1)} // ${totalTrials} trials`,
      summary: `OpenJaws ran ${taskName} on OCI Q with ${totalTrials} trials and ${executionErrorTrials} runtime errors. Mean reward: ${formatNumber(avgReward, 1).toFixed(1)}.${submissionUrl ? ' The official leaderboard submission discussion is linked here.' : ''}`,
      submissionUrl,
    },
    terminalBenchSoak: {
      runId: terminalBenchSoak.runId,
      taskName: soakTaskName,
      status:
        typeof terminalBenchSoak.status === 'string'
          ? terminalBenchSoak.status
          : 'unknown',
      cycleCount: soakCycleCount,
      totalTrials: soakTotalTrials,
      executionErrorTrials: soakExecutionErrorTrials,
      benchmarkFailedTrials: soakBenchmarkFailedTrials,
      summary: `Repeated TerminalBench soak over ${soakTaskName}. ${soakCycleCount} cycles produced ${soakTotalTrials} total trials, ${soakExecutionErrorTrials} runtime errors, and ${soakBenchmarkFailedTrials} benchmark-failing trials.`,
    },
    wandb: buildWandbSummary(wandbReport.wandb ?? {}),
  }
}

export function writeIfChanged(path: string, content: string): boolean {
  if (existsSync(path)) {
    const current = readFileSync(path, 'utf8')
    if (current === content) {
      return false
    }
  }
  writeFileSync(path, content, 'utf8')
  return true
}

function isMissingReceiptError(error: unknown): error is Error {
  return error instanceof Error && error.message.startsWith('Required benchmark receipt not found:')
}

export function buildSnapshotForCheck(
  options: CliOptions,
  deps: SnapshotDeps = {
    resolveLatestReceipt,
    collectMatchingReceiptPaths,
    readJson,
  },
): BenchmarkSnapshot {
  try {
    return buildSnapshot(options, deps)
  } catch (error) {
    if (isMissingReceiptError(error) && existsSync(options.outFile)) {
      return deps.readJson<BenchmarkSnapshot>(options.outFile)
    }
    throw error
  }
}

export function main(): void {
  const options = parseArgs(process.argv.slice(2))
  const snapshot = options.check ? buildSnapshotForCheck(options) : buildSnapshot(options)
  const nextContent = `${JSON.stringify(snapshot, null, 2)}\n`

  if (options.check) {
    if (!existsSync(options.outFile)) {
      throw new Error(`Generated snapshot file does not exist: ${options.outFile}`)
    }
    const current = readFileSync(options.outFile, 'utf8')
    if (current !== nextContent) {
      throw new Error(
        `Benchmark snapshot drift detected in ${options.outFile}. Run bun run website:snapshot:generate.`,
      )
    }
    console.log(
      JSON.stringify(
        {
          status: 'ok',
          mode: 'check',
          outFile: options.outFile,
          generatedAt: snapshot.generatedAt,
        },
        null,
        2,
      ),
    )
    return
  }

  const changed = writeIfChanged(options.outFile, nextContent)
  console.log(
    JSON.stringify(
      {
        status: 'ok',
        mode: 'generate',
        outFile: options.outFile,
        changed,
        generatedAt: snapshot.generatedAt,
      },
      null,
      2,
    ),
  )
}

if (import.meta.main) {
  main()
}
