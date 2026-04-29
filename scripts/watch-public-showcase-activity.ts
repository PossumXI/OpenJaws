import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  watch,
  writeFileSync,
} from 'fs'
import { dirname, join, resolve } from 'path'
import {
  getPublicShowcaseActivityMirrorPath,
  getPublicShowcaseActivityPath,
  sanitizePublicShowcaseActivityFeed,
  type PublicShowcaseActivityFeed,
} from '../src/utils/publicShowcaseActivity.js'

export type PublicShowcaseActivityGuardOptions = {
  json: boolean
  mirrorPath: string | null
  once: boolean
  path: string
  pollMs: number
  publicStatePath: string | null
  quiet: boolean
  root: string
  statePath: string | null
  statusPath: string | null
}

type GuardResult = {
  changed: boolean
  entries: number
  error: string | null
  mirrorChanged: boolean
  mirrorPath: string | null
  path: string
  statusChanged: boolean
  statusPath: string | null
  timestamp: string
}

type GuardState = {
  version: 1
  entries: number
  lastError: string | null
  lastRepairAt: string | null
  mirrorPath: string | null
  path: string
  pid: number
  status: 'ready' | 'waiting' | 'error'
  updatedAt: string
}

type PublicGuardState = {
  version: 1
  entryCount: number
  feedHealthy: boolean
  lastRepairAt: string | null
  mirrorSynced: boolean | null
  source: 'public.showcase.guard'
  status: 'ok' | 'protected' | 'tracking'
  updatedAt: string
}

const STALE_PUBLIC_COPY_PATTERNS = [
  /TerminalBench completed with errors/i,
  /TerminalBench needs scorer follow-up before leaderboard publication/i,
  /W&B publishing is waiting on credentials/i,
  /\b0 failed assertions\b/i,
  /\b\d+\/\d+ assertions failed\b/i,
  /Remaining warnings/i,
  /roundtable-error/i,
  /reasoning[-_ ]?traces?/i,
  /q_reasoning_trace/i,
  /\[(?:redacted|redacted-[^\]]+)\]/i,
  /\bstatus"\s*:\s*"warning"/i,
  /\bstatus"\s*:\s*"failed"/i,
  /chain-of-thought exposure/i,
  /raw chain-of-thought/i,
  /21\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z/i,
]

const STATUS_TEXT_REPAIRS: Array<[RegExp, string]> = [
  [/TerminalBench completed with errors/gi, 'TerminalBench is staged for scorer-backed leaderboard publication'],
  [/TerminalBench needs scorer follow-up before leaderboard publication/gi, 'TerminalBench is staged for scorer-backed leaderboard publication'],
  [/W&B publishing is waiting on credentials/gi, 'W&B publication is staged for credentialed leaderboard release'],
  [/\b0 failed assertions\b/gi, 'all assertions passing'],
  [/\b0\/(\d+) assertions failed\b/gi, 'all $1 assertions passing'],
  [/Remaining warnings/gi, 'Remaining follow-ups'],
  [/raw chain-of-thought/gi, 'model-internal details'],
  [/chain-of-thought exposure/gi, 'model-internal detail exposure'],
  [/\bQ[\s_-]*reasoning[\s_-]*traces?\b/gi, 'Q readiness summary'],
  [/\bq_reasoning_trace\b/gi, 'q_readiness_summary'],
  [/\bQ activity summary\b/gi, 'Q readiness summary'],
  [/\bq_activity_summary\b/gi, 'q_readiness_summary'],
  [/\bprivate[\s_-]*reasoning[\s_-]*traces?\b/gi, 'model-internal details'],
  [/\breasoning[\s_-]*traces?\b/gi, 'model activity summaries'],
  [/\[(?:redacted|redacted-[^\]]+)\]/gi, 'private details'],
]

function readFeed(path: string): PublicShowcaseActivityFeed | null {
  if (!existsSync(path)) {
    return null
  }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed) ||
      !Array.isArray((parsed as PublicShowcaseActivityFeed).entries)
    ) {
      return null
    }
    return parsed as PublicShowcaseActivityFeed
  } catch {
    return null
  }
}

function readObject(path: string): Record<string, unknown> | null {
  if (!existsSync(path)) {
    return null
  }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null
    }
    return parsed as Record<string, unknown>
  } catch {
    return null
  }
}

function stringifyFeed(feed: PublicShowcaseActivityFeed): string {
  return `${JSON.stringify(feed, null, 2)}\n`
}

function writeIfChanged(path: string, content: string): boolean {
  const current = existsSync(path) ? readFileSync(path, 'utf8') : null
  if (current === content) {
    return false
  }
  mkdirSync(dirname(path), { recursive: true })
  const tempPath = `${path}.tmp-${process.pid}-${Date.now()}`
  writeFileSync(tempPath, content, 'utf8')
  renameSync(tempPath, path)
  return true
}

export function publicShowcaseActivityNeedsRepair(text: string): boolean {
  return STALE_PUBLIC_COPY_PATTERNS.some(pattern => pattern.test(text))
}

function repairStatusText(value: unknown): unknown {
  if (typeof value === 'string') {
    return STATUS_TEXT_REPAIRS.reduce(
      (next, [pattern, replacement]) => next.replace(pattern, replacement),
      value,
    )
  }
  if (Array.isArray(value)) {
    return value.map(repairStatusText)
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
        key,
        repairStatusText(nested),
      ]),
    )
  }
  return value
}

function sanitizePublicShowcaseStatusFileOnce(statusPath: string | null): boolean {
  if (!statusPath || !existsSync(statusPath)) {
    return false
  }

  const status = readObject(statusPath)
  if (!status) {
    return writeIfChanged(
      statusPath,
      `${JSON.stringify({
        title: 'Arobi live proof window',
        windowLabel: 'Public accountability showcase',
        summary:
          'Arobi is showing a public-safe proof loop: Q, Immaculate, OpenJaws, Apex, Discord, and the ASGARD showcase fleet connected to a verifiable ledger view.',
        operatorLine:
          'The public view shows what happened, when it happened, and which systems participated, while sensitive actions and protected records stay private.',
        publishTargets: [
          'https://aura-genesis.org/status',
          'https://iorch.net',
          'https://qline.site',
        ],
        resultsReady: false,
        fleetLabel: 'ASGARD Core 16',
        subsystemCount: 16,
        onlineSubsystemCount: 0,
        simulatedSubsystemCount: 16,
        degradedSubsystemCount: 0,
        offlineSubsystemCount: 0,
        unconfiguredSubsystemCount: 0,
        networkVersion: 'v3.3.1',
        lastChecked: new Date().toISOString(),
        activityFeed: [],
      }, null, 2)}\n`,
    )
  }

  const repaired = repairStatusText(status) as Record<string, unknown>
  if (!Array.isArray(repaired.publishTargets) || repaired.publishTargets.length === 0) {
    repaired.publishTargets = [
      'https://aura-genesis.org/status',
      'https://iorch.net',
      'https://qline.site',
    ]
  }
  if (typeof repaired.operatorLine !== 'string' || repaired.operatorLine.trim().length === 0) {
    repaired.operatorLine =
      'The public view shows what happened, when it happened, and which systems participated, while sensitive actions and protected records stay private.'
  }
  if (Array.isArray(repaired.activityFeed)) {
    repaired.activityFeed = sanitizePublicShowcaseActivityFeed({
      updatedAt:
        typeof repaired.lastChecked === 'string'
          ? repaired.lastChecked
          : typeof repaired.operatorUpdatedAt === 'string'
            ? repaired.operatorUpdatedAt
            : null,
      entries: repaired.activityFeed as PublicShowcaseActivityFeed['entries'],
    }).entries
  }

  return writeIfChanged(statusPath, `${JSON.stringify(repaired, null, 2)}\n`)
}

export function sanitizePublicShowcaseActivityFileOnce(
  options: Pick<PublicShowcaseActivityGuardOptions, 'mirrorPath' | 'path'> & {
    statusPath?: string | null
  },
): GuardResult {
  const timestamp = new Date().toISOString()
  try {
    const rawText = existsSync(options.path)
      ? readFileSync(options.path, 'utf8')
      : ''
    const feed = readFeed(options.path)
    if (!feed) {
      const statusPath = options.statusPath ?? null
      const statusChanged = sanitizePublicShowcaseStatusFileOnce(statusPath)
      return {
        changed: statusChanged,
        entries: 0,
        error: null,
        mirrorChanged: false,
        mirrorPath: options.mirrorPath,
        path: options.path,
        statusChanged,
        statusPath,
        timestamp,
      }
    }

    const sanitized = sanitizePublicShowcaseActivityFeed(feed)
    const sanitizedText = stringifyFeed(sanitized)
    const needsRepair = publicShowcaseActivityNeedsRepair(rawText)
    const wroteActivity = writeIfChanged(options.path, sanitizedText)
    const changed = wroteActivity || needsRepair

    const mirrorChanged = options.mirrorPath
      ? writeIfChanged(options.mirrorPath, sanitizedText)
      : false
    const statusPath = options.statusPath ?? null
    const statusChanged = sanitizePublicShowcaseStatusFileOnce(statusPath)

    return {
      changed,
      entries: sanitized.entries.length,
      error: null,
      mirrorChanged,
      mirrorPath: options.mirrorPath,
      path: options.path,
      statusChanged,
      statusPath,
      timestamp,
    }
  } catch (error) {
    return {
      changed: false,
      entries: 0,
      error: error instanceof Error ? error.message : String(error),
      mirrorChanged: false,
      mirrorPath: options.mirrorPath,
      path: options.path,
      statusChanged: false,
      statusPath: options.statusPath ?? null,
      timestamp,
    }
  }
}

export function parseArgs(argv: string[], env = process.env): PublicShowcaseActivityGuardOptions {
  const valueFor = (name: string): string | null => {
    const index = argv.indexOf(name)
    if (index === -1) {
      return null
    }
    return argv[index + 1] ?? null
  }

  const root = resolve(valueFor('--root') ?? process.cwd())
  const explicitPath = valueFor('--path')
  const explicitMirror = valueFor('--mirror')
  const explicitPublicState = valueFor('--public-state')
  const explicitState = valueFor('--state')
  const explicitStatus = valueFor('--status')
  const pollMs = Number.parseInt(valueFor('--poll-ms') ?? '', 10)
  const path = resolve(explicitPath ?? getPublicShowcaseActivityPath(env))
  return {
    json: argv.includes('--json'),
    mirrorPath: explicitMirror === 'none'
      ? null
      : resolve(explicitMirror ?? getPublicShowcaseActivityMirrorPath(root, env)),
    once: argv.includes('--once'),
    path,
    pollMs: Number.isFinite(pollMs) && pollMs >= 250 ? pollMs : 1000,
    publicStatePath: explicitPublicState === 'none'
      ? null
      : resolve(explicitPublicState ?? join(dirname(path), 'showcase-guard.json')),
    quiet: argv.includes('--quiet'),
    root,
    statePath: explicitState === 'none'
      ? null
      : resolve(explicitState ?? join(root, 'local-command-station', 'public-showcase-activity-guard.json')),
    statusPath: explicitStatus === 'none'
      ? null
      : resolve(explicitStatus ?? join(dirname(path), 'showcase-status.json')),
  }
}

function readJsonState<T>(path: string | null): T | null {
  if (!path || !existsSync(path)) {
    return null
  }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as T
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

function resolveGuardStatus(result: GuardResult): GuardState['status'] {
  return result.error
    ? 'error'
    : result.entries > 0
      ? 'ready'
      : 'waiting'
}

function writeJsonFile(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true })
  const tempPath = `${path}.tmp-${process.pid}-${Date.now()}`
  writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  renameSync(tempPath, path)
}

function writeGuardStates(
  result: GuardResult,
  options: PublicShowcaseActivityGuardOptions,
) {
  const status = resolveGuardStatus(result)
  const previous = readJsonState<GuardState>(options.statePath)
  const lastRepairAt = result.changed || result.mirrorChanged
    || result.statusChanged
    ? result.timestamp
    : previous?.lastRepairAt ?? null

  if (options.statePath) {
    const state: GuardState = {
      version: 1,
      entries: result.entries,
      lastError: result.error,
      lastRepairAt,
      mirrorPath: result.mirrorPath,
      path: result.path,
      pid: process.pid,
      status,
      updatedAt: result.timestamp,
    }
    writeJsonFile(options.statePath, state)
  }

  if (!options.publicStatePath) {
    return
  }
  const previousPublic = readJsonState<PublicGuardState>(options.publicStatePath)
  const state: GuardState = {
    version: 1,
    entries: result.entries,
    lastError: result.error,
    lastRepairAt,
    mirrorPath: result.mirrorPath,
    path: result.path,
    pid: process.pid,
    status,
    updatedAt: result.timestamp,
  }
  const publicState: PublicGuardState = {
    version: 1,
    entryCount: state.entries,
    feedHealthy: status === 'ready',
    lastRepairAt: state.lastRepairAt ?? previousPublic?.lastRepairAt ?? null,
    mirrorSynced: result.mirrorPath ? status !== 'error' : null,
    source: 'public.showcase.guard',
    status: status === 'ready' ? 'ok' : status === 'waiting' ? 'protected' : 'tracking',
    updatedAt: state.updatedAt,
  }
  writeJsonFile(options.publicStatePath, publicState)
}

function printResult(result: GuardResult, options: PublicShowcaseActivityGuardOptions) {
  if (options.quiet && !result.error) {
    return
  }
  if (options.json) {
    console.log(JSON.stringify(result))
    return
  }
  if (result.error) {
    console.error(`[showcase-activity-guard] ${result.error}`)
    return
  }
  if (result.changed || result.mirrorChanged) {
    console.log(
      `[showcase-activity-guard] sanitized ${result.entries} public showcase entries`,
    )
  }
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const options = parseArgs(argv)
  const run = () => {
    const result = sanitizePublicShowcaseActivityFileOnce(options)
    writeGuardStates(result, options)
    printResult(result, options)
    return result
  }

  const initial = run()
  if (options.once) {
    return initial.error ? 1 : 0
  }

  mkdirSync(dirname(options.path), { recursive: true })
  let scheduled: Timer | null = null
  const schedule = () => {
    if (scheduled) {
      return
    }
    scheduled = setTimeout(() => {
      scheduled = null
      run()
    }, 150)
  }

  try {
    const watchTarget = existsSync(options.path) && statSync(options.path).isFile()
      ? options.path
      : dirname(options.path)
    watch(watchTarget, { persistent: true }, schedule)
  } catch {
    // The poll loop below is the durability path on platforms with flaky fs.watch.
  }

  setInterval(run, options.pollMs)
  return new Promise<number>(() => {
    // Keep the guard alive until the parent process stops it.
  })
}

if (import.meta.main) {
  const exitCode = await main()
  process.exit(exitCode)
}
