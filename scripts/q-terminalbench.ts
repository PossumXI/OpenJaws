import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'fs'
import { dirname, join, resolve } from 'path'
import { execa } from 'execa'
import {
  appendBenchmarkTraceEvent,
  closeBenchmarkTraceWriter,
  createBenchmarkTraceWriter,
  type BenchmarkTraceSessionMetadata,
} from '../src/immaculate/benchmarkTrace.js'
import {
  buildBenchmarkSeedEnv,
  resolveDeterministicSeed,
  resolveDefaultHarborCommand,
  runQPreflightChecks,
} from '../src/q/preflight.js'
import { type QPreflightCheck as PreflightCheck } from '../src/q/runtime.js'
import {
  buildAggregateSummary,
  buildAttemptSummary,
  buildCycleReceipt,
  buildDryRunCycles,
  buildReportOutcome,
  buildTrialCounts,
  resolveAttemptJobName,
  type QTerminalBenchAggregateSummary as TerminalBenchAggregateSummary,
  type QTerminalBenchAttemptReceipt as TerminalBenchAttemptReceipt,
  type QTerminalBenchBenchmarkStatus as TerminalBenchBenchmarkStatus,
  type QTerminalBenchCycleReceipt as TerminalBenchCycleReceipt,
  type QTerminalBenchCycleStatus as TerminalBenchCycleStatus,
  type QTerminalBenchExecutionStatus as TerminalBenchExecutionStatus,
  type QTerminalBenchSoakReceipt as TerminalBenchSoakReceipt,
  type QTerminalBenchSoakStopReason as TerminalBenchSoakStopReason,
  type QTerminalBenchTaskReceipt as TerminalBenchTaskReceipt,
  type QTerminalBenchTrialCounts as TerminalBenchTrialCounts,
} from '../src/q/terminalBench.js'
import {
  resolveBenchmarkSigningPrivateKey,
  signBenchmarkReceipt,
} from '../src/utils/benchmarkReceiptSignature.js'
import {
  buildImmaculateTraceReference,
  sha256File,
} from '../src/utils/immaculateTraceReceipt.js'
import { resolveOciQRuntime } from '../src/utils/ociQRuntime.js'

type AgentMode = 'openjaws' | 'oracle'
type TerminalBenchSessionMetadata = BenchmarkTraceSessionMetadata

type CliOptions = {
  root: string
  outputDir: string | null
  dataset: string
  harborCommand: string
  agent: AgentMode
  model: string | null
  seed: number
  nTasks: number
  nConcurrent: number
  nAttempts: number
  repeat: number
  includeTaskNames: string[]
  excludeTaskNames: string[]
  maxTurns: number
  agentSetupTimeoutMultiplier: number | null
  jobsDir: string | null
  jobName: string | null
  timeoutMs: number
  exportTraces: boolean
  exportSharegpt: boolean
  exportEpisodes: 'all' | 'last'
  exportPush: boolean
  exportRepo: string | null
  env: string
  dryRun: boolean
  force: boolean
  soak: boolean
  soakCycles: number
  soakDurationMinutes: number | null
  soakIntervalMs: number
  officialSubmission: boolean
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

export function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    root: process.cwd(),
    outputDir: null,
    dataset: 'terminal-bench@2.0',
    harborCommand: resolveDefaultHarborCommand(),
    agent: 'openjaws',
    model: 'oci:Q',
    seed: resolveDeterministicSeed(),
    nTasks: 1,
    nConcurrent: 1,
    nAttempts: 1,
    repeat: 1,
    includeTaskNames: [],
    excludeTaskNames: [],
    maxTurns: 12,
    agentSetupTimeoutMultiplier: 3,
    jobsDir: null,
    jobName: null,
    timeoutMs: 7_200_000,
    exportTraces: false,
    exportSharegpt: false,
    exportEpisodes: 'last',
    exportPush: false,
    exportRepo: null,
    env: 'docker',
    dryRun: false,
    force: false,
    soak: false,
    soakCycles: 3,
    soakDurationMinutes: null,
    soakIntervalMs: 0,
    officialSubmission: false,
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--root' && argv[i + 1]) {
      options.root = resolve(argv[++i]!)
      continue
    }
    if ((arg === '--out-dir' || arg === '--output-dir') && argv[i + 1]) {
      options.outputDir = resolve(argv[++i]!)
      continue
    }
    if (arg === '--dataset' && argv[i + 1]) {
      options.dataset = argv[++i]!
      continue
    }
    if (arg === '--harbor' && argv[i + 1]) {
      options.harborCommand = argv[++i]!
      continue
    }
    if (arg === '--agent' && argv[i + 1]) {
      const value = argv[++i]!
      if (value === 'openjaws' || value === 'oracle') {
        options.agent = value
      }
      continue
    }
    if (arg === '--model' && argv[i + 1]) {
      options.model = argv[++i]!
      continue
    }
    if (arg === '--no-model') {
      options.model = null
      continue
    }
    if (arg === '--seed' && argv[i + 1]) {
      const parsed = parseOptionalInt(argv[++i]!)
      if (parsed !== null) {
        options.seed = resolveDeterministicSeed(parsed)
      }
      continue
    }
    if (arg === '--n-tasks' && argv[i + 1]) {
      const parsed = parseOptionalInt(argv[++i]!)
      if (parsed !== null && parsed > 0) {
        options.nTasks = parsed
      }
      continue
    }
    if (arg === '--n-concurrent' && argv[i + 1]) {
      const parsed = parseOptionalInt(argv[++i]!)
      if (parsed !== null && parsed > 0) {
        options.nConcurrent = parsed
      }
      continue
    }
    if ((arg === '--n-attempts' || arg === '-k') && argv[i + 1]) {
      const parsed = parseOptionalInt(argv[++i]!)
      if (parsed !== null && parsed > 0) {
        options.nAttempts = parsed
      }
      continue
    }
    if (arg === '--repeat' && argv[i + 1]) {
      const parsed = parseOptionalInt(argv[++i]!)
      if (parsed !== null && parsed > 0) {
        options.repeat = parsed
      }
      continue
    }
    if (arg === '--include-task-name' && argv[i + 1]) {
      options.includeTaskNames.push(argv[++i]!)
      continue
    }
    if (arg === '--exclude-task-name' && argv[i + 1]) {
      options.excludeTaskNames.push(argv[++i]!)
      continue
    }
    if (arg === '--max-turns' && argv[i + 1]) {
      const parsed = parseOptionalInt(argv[++i]!)
      if (parsed !== null && parsed > 0) {
        options.maxTurns = parsed
      }
      continue
    }
    if (arg === '--agent-setup-timeout-multiplier' && argv[i + 1]) {
      const parsed = Number.parseFloat(argv[++i]!)
      if (Number.isFinite(parsed) && parsed > 0) {
        options.agentSetupTimeoutMultiplier = parsed
      }
      continue
    }
    if ((arg === '--jobs-dir' || arg === '-o') && argv[i + 1]) {
      options.jobsDir = resolve(argv[++i]!)
      continue
    }
    if (arg === '--job-name' && argv[i + 1]) {
      options.jobName = argv[++i]!
      continue
    }
    if (arg === '--timeout-ms' && argv[i + 1]) {
      const parsed = parseOptionalInt(argv[++i]!)
      if (parsed !== null && parsed > 0) {
        options.timeoutMs = parsed
      }
      continue
    }
    if (arg === '--export-traces') {
      options.exportTraces = true
      continue
    }
    if (arg === '--export-sharegpt') {
      options.exportSharegpt = true
      continue
    }
    if (arg === '--export-episodes' && argv[i + 1]) {
      const value = argv[++i]!
      if (value === 'all' || value === 'last') {
        options.exportEpisodes = value
      }
      continue
    }
    if (arg === '--export-push') {
      options.exportPush = true
      continue
    }
    if (arg === '--export-repo' && argv[i + 1]) {
      options.exportRepo = argv[++i]!
      continue
    }
    if (arg === '--env' && argv[i + 1]) {
      options.env = argv[++i]!
      continue
    }
    if (arg === '--dry-run') {
      options.dryRun = true
      continue
    }
    if (arg === '--force') {
      options.force = true
      continue
    }
    if (arg === '--soak') {
      options.soak = true
      continue
    }
    if (arg === '--soak-cycles' && argv[i + 1]) {
      const parsed = parseOptionalInt(argv[++i]!)
      if (parsed !== null && parsed > 0) {
        options.soak = true
        options.soakCycles = parsed
      }
      continue
    }
    if (arg === '--soak-duration-minutes' && argv[i + 1]) {
      const parsed = parseOptionalFloat(argv[++i]!)
      if (parsed !== null && parsed > 0) {
        options.soak = true
        options.soakDurationMinutes = parsed
      }
      continue
    }
    if (arg === '--soak-interval-ms' && argv[i + 1]) {
      const parsed = parseOptionalInt(argv[++i]!)
      if (parsed !== null && parsed >= 0) {
        options.soak = true
        options.soakIntervalMs = parsed
      }
      continue
    }
    if (arg === '--official-submission') {
      options.officialSubmission = true
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
      'Usage: bun scripts/q-terminalbench.ts [options]',
      '',
      'Options:',
      '  --dataset <name>             Harbor dataset name (default terminal-bench@2.0)',
      '  --agent <mode>               openjaws | oracle',
      '  --model <name>               OpenJaws model identifier for the Harbor adapter (default oci:Q)',
      '  --no-model                   Do not pass a model to the OpenJaws agent',
      '  --seed <n>                   Deterministic benchmark seed emitted into receipts (default 42)',
      '  --n-tasks <n>                Maximum number of tasks to run (default 1)',
      '  --n-concurrent <n>           Harbor concurrency for parallel task execution (default 1)',
      '  --n-attempts, -k <n>         Harbor attempts per trial (default 1)',
      '  --repeat <n>                 Repeat the Harbor run sequentially and aggregate the receipts (default 1)',
      '  --include-task-name <glob>   Include only matching task names',
      '  --exclude-task-name <glob>   Exclude matching task names',
      '  --max-turns <n>              Max OpenJaws turns inside Harbor (default 12)',
      '  --agent-setup-timeout-multiplier <n>  Harbor agent setup timeout multiplier (default 3)',
      '  --jobs-dir, -o <path>        Harbor jobs directory for deterministic job capture',
      '  --job-name <name>            Harbor job name for deterministic job capture',
      '  --env <name>                 Harbor environment (default docker)',
      '  --harbor <command>           Harbor CLI command or path',
      '  --out-dir <path>             Output directory for receipts',
      '  --soak                       Run repeated bounded Terminal-Bench cycles under one soak receipt',
      '  --soak-cycles <n>            Maximum bounded cycles to execute in soak mode (default 3)',
      '  --soak-duration-minutes <n>  Optional wall-clock ceiling for soak mode',
      '  --soak-interval-ms <n>       Delay between soak cycles in milliseconds (default 0)',
      '  --official-submission        Force Terminal-Bench 2.0 leaderboard-compliant settings',
      '  --dry-run                    Run only preflight checks and emit the command receipt',
      '  --force                      Run Harbor even if provider preflight fails',
      '  --export-traces              Ask Harbor to export ATIF traces after the job',
      '  --export-sharegpt            Include ShareGPT output in Harbor trace export',
      '  --export-episodes <mode>     all | last (default last)',
      '  --export-push                Push exported traces to HF Hub',
      '  --export-repo <org/name>     Target HF dataset repo for exported traces',
      '  -h, --help                   Show this help',
    ].join('\n'),
  )
  process.exit(0)
}

function makeRunId(options: Pick<CliOptions, 'soak'>): string {
  return `${options.soak ? 'q-terminalbench-soak' : 'q-terminalbench'}-${new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\..+/, '')}`
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function tailText(text: string, maxLines = 30, maxChars = 4000): string {
  const trimmed = text.trim()
  if (!trimmed) {
    return ''
  }
  const tailLines = trimmed.split(/\r?\n/).slice(-maxLines).join('\n')
  return tailLines.length > maxChars
    ? tailLines.slice(tailLines.length - maxChars)
    : tailLines
}

function sanitizeSubmissionSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'submission'
}

function buildTerminalBenchSessionScope(options: Pick<CliOptions, 'officialSubmission' | 'soak'>): string {
  if (options.officialSubmission) {
    return 'terminalbench:official'
  }
  return options.soak ? 'terminalbench:soak' : 'terminalbench:bounded'
}

async function readGitText(args: {
  cwd: string
  argv: string[]
}): Promise<string | null> {
  const result = await execa('git', ['-C', args.cwd, ...args.argv], {
    reject: false,
    windowsHide: true,
    timeout: 10_000,
  })
  const text = (result.stdout || result.stderr || '').trim()
  return result.exitCode === 0 && text ? text : null
}

export async function resolveTerminalBenchSessionMetadata(args: {
  root: string
  runId: string
  options: Pick<CliOptions, 'officialSubmission' | 'soak'>
}): Promise<TerminalBenchSessionMetadata> {
  const repoPath = resolve(args.root)
  const [worktreePath, gitBranch, repoSha] = await Promise.all([
    readGitText({ cwd: repoPath, argv: ['rev-parse', '--show-toplevel'] }),
    readGitText({ cwd: repoPath, argv: ['rev-parse', '--abbrev-ref', 'HEAD'] }),
    readGitText({ cwd: repoPath, argv: ['rev-parse', 'HEAD'] }),
  ])

  return {
    runId: args.runId,
    sessionScope: buildTerminalBenchSessionScope(args.options),
    repoPath,
    worktreePath: worktreePath ?? repoPath,
    gitBranch: gitBranch && gitBranch !== 'HEAD' ? gitBranch : null,
    repoSha,
  }
}

function collectAgentEnv(options?: { officialSubmission?: boolean; model?: string | null }): Record<string, string> {
  const envNames = [
    'Q_API_KEY',
    'Q_BASE_URL',
    'Q_MODEL',
    'OPENAI_API_KEY',
    'OPENAI_BASE_URL',
    'OPENAI_MODEL',
    'OPENAI_ORG_ID',
    'OPENAI_ORGANIZATION',
    'OPENROUTER_API_KEY',
    'OPENROUTER_BASE_URL',
    'OCI_CONFIG_FILE',
    'OCI_COMPARTMENT_ID',
    'OCI_GENAI_API_KEY',
    'OCI_GENAI_PROJECT_ID',
    'OCI_GENAI_ENDPOINT',
    'OCI_PROFILE',
    'OCI_REGION',
    'OCI_BASE_URL',
    'OCI_MODEL',
    'OCI_API_KEY',
    'ANTHROPIC_API_KEY',
    'GOOGLE_API_KEY',
    'GEMINI_API_KEY',
    'AWS_REGION',
    'AWS_DEFAULT_REGION',
    'AZURE_OPENAI_API_KEY',
    'AZURE_OPENAI_ENDPOINT',
    'HF_TOKEN',
  ]
  const officialAllowedNames = new Set([
    'Q_API_KEY',
    'Q_BASE_URL',
    'Q_MODEL',
    'OCI_CONFIG_FILE',
    'OCI_COMPARTMENT_ID',
    'OCI_GENAI_API_KEY',
    'OCI_GENAI_PROJECT_ID',
    'OCI_GENAI_ENDPOINT',
    'OCI_PROFILE',
    'OCI_REGION',
    'OCI_BASE_URL',
    'OCI_MODEL',
    'OCI_API_KEY',
  ])
  const collected: Record<string, string> = {}
  for (const name of envNames) {
    if (
      options?.officialSubmission &&
      options.model === 'oci:Q' &&
      !officialAllowedNames.has(name)
    ) {
      continue
    }
    const value = process.env[name]
    if (value) {
      collected[name] = value
    }
  }
  return collected
}

function normalizeTaskFilter(options: CliOptions, value: string): string {
  if (options.dataset.startsWith('terminal-bench@')) {
    return value.startsWith('terminal-bench/') ? value.slice('terminal-bench/'.length) : value
  }
  return value
}

function buildHarborArgs(options: CliOptions, cycle: number, attempt: number): string[] {
  const attemptJobName = resolveAttemptJobName(options, cycle, attempt)
  const args = [
    'run',
    '--dataset',
    options.dataset,
    '--n-attempts',
    String(options.nAttempts),
    '--n-tasks',
    String(options.nTasks),
    '--env',
    options.env,
    '--n-concurrent',
    String(options.nConcurrent),
  ]
  if (options.jobsDir) {
    args.push('--jobs-dir', options.jobsDir)
  }
  if (attemptJobName) {
    args.push('--job-name', attemptJobName)
  }
  if (options.agentSetupTimeoutMultiplier !== null) {
    args.push(
      '--timeout-multiplier',
      String(options.agentSetupTimeoutMultiplier),
    )
  }

  for (const includeTaskName of options.includeTaskNames) {
    args.push('--task-name', normalizeTaskFilter(options, includeTaskName))
  }
  for (const excludeTaskName of options.excludeTaskNames) {
    args.push('--exclude-task-name', normalizeTaskFilter(options, excludeTaskName))
  }

  if (options.agent === 'oracle') {
    args.push('--agent', 'oracle')
  } else {
    args.push(
      '--agent-import-path',
      'benchmarks.harbor.openjaws_agent:OpenJawsHarborAgent',
      '--ak',
      `source_root=${options.root}`,
      '--ak',
      `max_turns=${options.maxTurns}`,
    )
    if (options.model) {
      args.push('--model', options.model)
    }
  }

  if (options.exportTraces) {
    args.push('--export-traces', '--export-episodes', options.exportEpisodes)
    if (options.exportSharegpt) {
      args.push('--export-sharegpt')
    }
    if (options.exportPush) {
      args.push('--export-push')
    }
    if (options.exportRepo) {
      args.push('--export-repo', options.exportRepo)
    }
  }

  return args
}

function buildHarborProcessEnv(options: CliOptions): Record<string, string> {
  const env: Record<string, string> = {
    ...buildBenchmarkSeedEnv(options.seed),
    PYTHONUTF8: '1',
    PYTHONIOENCODING: 'utf-8',
    NO_COLOR: '1',
    FORCE_COLOR: '0',
    TERM: 'dumb',
  }
  if (options.agent === 'openjaws') {
    Object.assign(
      env,
      collectAgentEnv({
        officialSubmission: options.officialSubmission,
        model: options.model,
      }),
    )
  }
  return env
}

function redactHarborArgs(args: string[]): string[] {
  return args.map((value, index) => {
    if (index > 0 && (args[index - 1] === '--ae' || args[index - 1] === '--ek')) {
      const splitIndex = value.indexOf('=')
      if (splitIndex > 0) {
        return `${value.slice(0, splitIndex)}=<redacted>`
      }
      return '<redacted>'
    }
    return value
  })
}

function scanHarborJobRoots(): string[] {
  const roots = [
    resolve(process.env.USERPROFILE ?? '', '.harbor'),
    resolve(process.cwd(), '.harbor'),
    resolve(process.cwd()),
  ]
  return roots.filter(root => root && existsSync(root))
}

function visitPaths(root: string, visitor: (path: string) => void): void {
  const entries = readdirSync(root, { withFileTypes: true })
  for (const entry of entries) {
    const path = join(root, entry.name)
    visitor(path)
    if (entry.isDirectory()) {
      visitPaths(path, visitor)
    }
  }
}

function listHarborJobResultPaths(roots?: readonly string[]): string[] {
  const resultPaths: string[] = []
  const selectedRoots =
    roots && roots.length > 0
      ? roots.filter(root => root && existsSync(root))
      : scanHarborJobRoots()
  for (const root of selectedRoots) {
    const jobsDir = join(root, 'jobs')
    if (!existsSync(jobsDir)) {
      continue
    }
    const entries = readdirSync(jobsDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue
      }
      const resultPath = join(jobsDir, entry.name, 'result.json')
      if (existsSync(resultPath)) {
        resultPaths.push(resultPath)
      }
    }
  }
  return resultPaths
}

function guessLatestHarborJobResultPath(args?: {
  excludedPaths?: ReadonlySet<string>
  roots?: readonly string[]
}): string | null {
  let latestPath: string | null = null
  let latestMtime = -Infinity
  for (const path of listHarborJobResultPaths(args?.roots)) {
    if (args?.excludedPaths?.has(path)) {
      continue
    }
    const lastModified = statSync(path).mtimeMs
    if (lastModified > latestMtime) {
      latestMtime = lastModified
      latestPath = path
    }
  }
  return latestPath
}

function resolveExpectedHarborJobRoot(args: {
  jobsDir: string | null
  jobName: string | null
}): string | null {
  if (!args.jobsDir || !args.jobName) {
    return null
  }
  const root = resolve(args.jobsDir, args.jobName)
  return existsSync(root) ? root : null
}

function resolveHarborJobRoot(jobResultPath: string | null): string | null {
  return jobResultPath ? dirname(jobResultPath) : null
}

function sanitizeJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(entry => sanitizeJson(entry))
  }
  if (value && typeof value === 'object') {
    const sanitized: Record<string, unknown> = {}
    for (const [key, entry] of Object.entries(value)) {
      if (
        key === 'env' &&
        entry &&
        typeof entry === 'object' &&
        !Array.isArray(entry)
      ) {
        sanitized[key] = Object.fromEntries(
          Object.keys(entry as Record<string, unknown>).map(name => [name, '<redacted>']),
        )
        continue
      }
      sanitized[key] = sanitizeJson(entry)
    }
    return sanitized
  }
  return value
}

function readHarborResultSummary(path: string | null): Record<string, unknown> | null {
  if (!path || !existsSync(path)) {
    return null
  }
  try {
    const payload = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
    return sanitizeJson(payload) as Record<string, unknown>
  } catch {
    return null
  }
}

function readJsonIfExists(path: string): Record<string, unknown> | null {
  if (!existsSync(path)) {
    return null
  }
  try {
    return sanitizeJson(JSON.parse(readFileSync(path, 'utf8'))) as Record<string, unknown>
  } catch {
    return null
  }
}

function sanitizeHarborResultFileInPlace(path: string | null): void {
  if (!path || !existsSync(path)) {
    return
  }
  try {
    const payload = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
    writeFileSync(path, `${JSON.stringify(sanitizeJson(payload), null, 2)}\n`, 'utf8')
  } catch {
    // Best-effort only. Do not let cleanup break the benchmark receipt.
  }
}

function sanitizeHarborJobArtifacts(jobRoot: string | null, jobResultPath: string | null): void {
  sanitizeHarborResultFileInPlace(jobResultPath)
  for (const trialResultPath of listHarborTrialResultPaths(jobRoot)) {
    sanitizeHarborResultFileInPlace(trialResultPath)
  }
}

function shouldScrubTextFile(path: string): boolean {
  const normalized = path.toLowerCase()
  return (
    normalized.endsWith('.json') ||
    normalized.endsWith('.log') ||
    normalized.endsWith('.txt') ||
    normalized.endsWith('.yaml') ||
    normalized.endsWith('.yml') ||
    normalized.endsWith('.toml')
  )
}

function scrubTextSecrets(text: string, secretValues: readonly string[]): string {
  let next = text
  for (const value of secretValues) {
    if (value) {
      next = next.split(value).join('<redacted>')
    }
  }
  return next
}

function scrubSubmissionBundle(submissionRoot: string, secretValues: readonly string[]): void {
  visitPaths(submissionRoot, path => {
    if (!statSync(path).isFile() || !shouldScrubTextFile(path)) {
      return
    }
    try {
      const original = readFileSync(path, 'utf8')
      const scrubbedText = scrubTextSecrets(original, secretValues)
      if (path.toLowerCase().endsWith('.json')) {
        try {
          const payload = JSON.parse(scrubbedText) as Record<string, unknown>
          writeFileSync(path, `${JSON.stringify(sanitizeJson(payload), null, 2)}\n`, 'utf8')
          return
        } catch {
          // Fall through to plain text rewrite.
        }
      }
      if (scrubbedText !== original) {
        writeFileSync(path, scrubbedText, 'utf8')
      }
    } catch {
      // Best-effort scrub only.
    }
  })
}

function writeSubmissionMetadata(args: {
  metadataPath: string
  agentDisplayName: string
  agentOrgDisplayName: string
  agentUrl: string
  modelName: string
  modelProvider: string
  modelDisplayName: string
  modelOrgDisplayName: string
}): void {
  const contents = [
    `agent_url: ${args.agentUrl}`,
    `agent_display_name: "${args.agentDisplayName}"`,
    `agent_org_display_name: "${args.agentOrgDisplayName}"`,
    '',
    'models:',
    `  - model_name: ${args.modelName}`,
    `    model_provider: ${args.modelProvider}`,
    `    model_display_name: "${args.modelDisplayName}"`,
    `    model_org_display_name: "${args.modelOrgDisplayName}"`,
    '',
  ].join('\n')
  writeFileSync(args.metadataPath, contents, 'utf8')
}

function stageOfficialSubmissionBundle(args: {
  outputDir: string
  attempts: readonly TerminalBenchAttemptReceipt[]
  secretValues: readonly string[]
  modelLabel: string
}): {
  submissionDir: string
  metadataPath: string
  stagedJobDirs: string[]
} {
  const submissionDir = join(
    args.outputDir,
    'submission',
    'submissions',
    'terminal-bench',
    '2.0',
    `openjaws__${sanitizeSubmissionSlug(args.modelLabel)}`,
  )
  if (existsSync(submissionDir)) {
    rmSync(submissionDir, { recursive: true, force: true })
  }
  mkdirSync(submissionDir, { recursive: true })

  const ociRuntime = resolveOciQRuntime()
  const metadataPath = join(submissionDir, 'metadata.yaml')
  writeSubmissionMetadata({
    metadataPath,
    agentDisplayName: 'OpenJaws',
    agentOrgDisplayName: 'Arobi Technology Alliance',
    agentUrl: 'https://github.com/PossumXI/OpenJaws',
    modelName: ociRuntime.model,
    modelProvider: 'oci',
    modelDisplayName: args.modelLabel,
    modelOrgDisplayName: 'Oracle',
  })

  const stagedJobDirs: string[] = []
  for (const attempt of args.attempts) {
    if (!attempt.harborJobPath || !existsSync(attempt.harborJobPath)) {
      continue
    }
    const targetPath = join(submissionDir, attempt.harborJobPath.split(/[\\/]/).at(-1) ?? `job-${attempt.attempt}`)
    cpSync(attempt.harborJobPath, targetPath, { recursive: true })
    stagedJobDirs.push(targetPath)
  }

  for (const stagedJobDir of stagedJobDirs) {
    scrubSubmissionBundle(stagedJobDir, args.secretValues)
  }
  return {
    submissionDir,
    metadataPath,
    stagedJobDirs,
  }
}


function readOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function readOptionalNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function readIsoDurationMs(start: unknown, end: unknown): number | null {
  if (typeof start !== 'string' || typeof end !== 'string') {
    return null
  }
  const startMs = Date.parse(start)
  const endMs = Date.parse(end)
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return null
  }
  return Math.max(0, Math.round(endMs - startMs))
}

function normalizeRewardBreakdown(
  rewards: unknown,
): Record<string, number> | null {
  if (!rewards || typeof rewards !== 'object' || Array.isArray(rewards)) {
    return null
  }
  const normalized = Object.fromEntries(
    Object.entries(rewards)
      .filter(([, value]) => typeof value === 'number' && Number.isFinite(value))
      .map(([key, value]) => [key, value as number]),
  )
  return Object.keys(normalized).length > 0 ? normalized : null
}

function listHarborTrialResultPaths(jobRoot: string | null): string[] {
  if (!jobRoot || !existsSync(jobRoot)) {
    return []
  }
  return readdirSync(jobRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => join(jobRoot, entry.name, 'result.json'))
    .filter(path => existsSync(path))
    .sort((left, right) => left.localeCompare(right))
}

function buildTaskSummary(args: {
  taskName: string | null
  executionStatus: TerminalBenchExecutionStatus
  benchmarkStatus: TerminalBenchBenchmarkStatus
  rewardTotal: number | null
  exceptionMessage: string | null
  permissionDenialCount: number | null
}): string {
  const taskName = args.taskName ?? 'Terminal-Bench task'
  if (args.executionStatus === 'error') {
    const permissionNote =
      args.permissionDenialCount && args.permissionDenialCount > 0
        ? ` (${args.permissionDenialCount} permission denial${args.permissionDenialCount === 1 ? '' : 's'})`
        : ''
    return args.exceptionMessage
      ? `${taskName} errored${permissionNote}: ${args.exceptionMessage}`
      : `${taskName} errored${permissionNote}.`
  }
  const permissionNote =
    args.permissionDenialCount && args.permissionDenialCount > 0
      ? ` with ${args.permissionDenialCount} permission denial${args.permissionDenialCount === 1 ? '' : 's'}`
      : ''
  if (args.benchmarkStatus === 'passed') {
    return `${taskName} passed${permissionNote}.`
  }
  if (args.benchmarkStatus === 'failed') {
    return args.rewardTotal !== null
      ? `${taskName} completed with reward ${args.rewardTotal.toFixed(2)}${permissionNote}.`
      : `${taskName} completed with a failing verifier result.`
  }
  return `${taskName} completed without a verifier reward${permissionNote}.`
}

function readHarborTaskReceipts(
  jobRoot: string | null,
  cycle: number,
  attempt: number,
): TerminalBenchTaskReceipt[] {
  return listHarborTrialResultPaths(jobRoot)
    .map((path, index) => {
      const payload = readJsonIfExists(path)
      if (!payload) {
        return null
      }

      const agentResult =
        payload.agent_result && typeof payload.agent_result === 'object'
          ? (payload.agent_result as Record<string, unknown>)
          : null
      const metadata =
        agentResult?.metadata && typeof agentResult.metadata === 'object'
          ? (agentResult.metadata as Record<string, unknown>)
          : null
      const exceptionInfo =
        payload.exception_info && typeof payload.exception_info === 'object'
          ? (payload.exception_info as Record<string, unknown>)
          : null
      const verifierResult =
        payload.verifier_result && typeof payload.verifier_result === 'object'
          ? (payload.verifier_result as Record<string, unknown>)
          : null

      const rewardBreakdown = normalizeRewardBreakdown(verifierResult?.rewards)
      const rewardTotal =
        rewardBreakdown !== null
          ? Object.values(rewardBreakdown).reduce((sum, value) => sum + value, 0)
          : null
      const executionStatus: TerminalBenchExecutionStatus =
        exceptionInfo || metadata?.is_error === true ? 'error' : 'completed'
      const benchmarkStatus: TerminalBenchBenchmarkStatus =
        executionStatus === 'error'
          ? 'unknown'
          : rewardTotal === null
            ? 'unknown'
            : rewardTotal > 0
              ? 'passed'
              : 'failed'
      const exceptionMessage =
        readOptionalString(exceptionInfo?.exception_message) ??
        readOptionalString(payload.exception_message)
      const taskName = readOptionalString(payload.task_name)
      const permissionDenialCount = Array.isArray(metadata?.permission_denials)
        ? metadata.permission_denials.length
        : null

      return {
        cycle,
        attempt,
        taskIndex: index + 1,
        taskName,
        trialName: readOptionalString(payload.trial_name),
        source: readOptionalString(payload.source),
        trialUri: readOptionalString(payload.trial_uri),
        harborResultPath: path,
        executionStatus,
        benchmarkStatus,
        summary: buildTaskSummary({
          taskName,
          executionStatus,
          benchmarkStatus,
          rewardTotal,
          exceptionMessage,
          permissionDenialCount,
        }),
        startedAt: readOptionalString(payload.started_at),
        finishedAt: readOptionalString(payload.finished_at),
        totalDurationMs: readIsoDurationMs(payload.started_at, payload.finished_at),
        environmentSetupDurationMs: readIsoDurationMs(
          (payload.environment_setup as Record<string, unknown> | null)?.started_at,
          (payload.environment_setup as Record<string, unknown> | null)?.finished_at,
        ),
        agentSetupDurationMs: readIsoDurationMs(
          (payload.agent_setup as Record<string, unknown> | null)?.started_at,
          (payload.agent_setup as Record<string, unknown> | null)?.finished_at,
        ),
        agentExecutionDurationMs: readIsoDurationMs(
          (payload.agent_execution as Record<string, unknown> | null)?.started_at,
          (payload.agent_execution as Record<string, unknown> | null)?.finished_at,
        ),
        verifierDurationMs: readIsoDurationMs(
          (payload.verifier as Record<string, unknown> | null)?.started_at,
          (payload.verifier as Record<string, unknown> | null)?.finished_at,
        ),
        rewardTotal,
        rewardBreakdown,
        returnCode: readOptionalNumber(metadata?.return_code),
        isError:
          typeof metadata?.is_error === 'boolean' ? (metadata.is_error as boolean) : null,
        permissionDenialCount,
        exceptionType: readOptionalString(exceptionInfo?.exception_type),
        exceptionMessage,
      }
    })
    .filter((task): task is TerminalBenchTaskReceipt => task !== null)
}

async function runHarborAttempt(args: {
  cycle: number
  attempt: number
  options: CliOptions
}): Promise<{
  attemptReceipt: TerminalBenchAttemptReceipt
  taskReceipts: TerminalBenchTaskReceipt[]
}> {
  const harborArgs = buildHarborArgs(args.options, args.cycle, args.attempt)
  const harborRoots = args.options.jobsDir ? [dirname(args.options.jobsDir)] : undefined
  const beforeJobResultPaths = new Set(listHarborJobResultPaths(harborRoots))
  const result = await execa(args.options.harborCommand, harborArgs, {
    cwd: args.options.root,
    reject: false,
    windowsHide: true,
    timeout: args.options.timeoutMs,
    env: buildHarborProcessEnv(args.options),
  })

  const expectedJobName = resolveAttemptJobName(args.options, args.cycle, args.attempt)
  const expectedJobPath = resolveExpectedHarborJobRoot({
    jobsDir: args.options.jobsDir,
    jobName: expectedJobName,
  })
  const harborJobPath =
    expectedJobPath ??
    (args.options.officialSubmission
      ? null
      : resolveHarborJobRoot(
          guessLatestHarborJobResultPath({
            excludedPaths: beforeJobResultPaths,
            roots: harborRoots,
          }) ??
            guessLatestHarborJobResultPath(),
        ))
  const harborJobResultPath =
    harborJobPath && existsSync(join(harborJobPath, 'result.json'))
      ? join(harborJobPath, 'result.json')
      : args.options.officialSubmission
        ? null
        : guessLatestHarborJobResultPath({
            excludedPaths: beforeJobResultPaths,
            roots: harborRoots,
          }) ??
          guessLatestHarborJobResultPath()
  const jobResultSummary = readHarborResultSummary(harborJobResultPath)
  const taskReceipts = readHarborTaskReceipts(harborJobPath, args.cycle, args.attempt)
  sanitizeHarborJobArtifacts(harborJobPath, harborJobResultPath)
  const trialCounts = buildTrialCounts(taskReceipts)
  const attemptSummary = buildAttemptSummary({
    attempt: args.attempt,
    exitCode: result.exitCode,
    trialCounts,
  })

  return {
    attemptReceipt: {
      cycle: args.cycle,
      attempt: args.attempt,
      status: attemptSummary.status,
      summary: attemptSummary.summary,
      exitCode: result.exitCode,
      harborJobPath,
      harborJobResultPath,
      jobResultSummary,
      stdoutTail: tailText(result.stdout),
      stderrTail: tailText(result.stderr),
      trialCounts,
    },
    taskReceipts,
  }
}

function validateOfficialSubmissionOptions(options: CliOptions): void {
  if (!options.officialSubmission) {
    return
  }
  const violations: string[] = []
  if (options.dataset !== 'terminal-bench@2.0') {
    violations.push('dataset must be terminal-bench@2.0')
  }
  if (options.nAttempts < 5) {
    violations.push('n-attempts must be at least 5')
  }
  if (options.agentSetupTimeoutMultiplier !== null) {
    violations.push('agent-setup-timeout-multiplier must be omitted')
  }
  if (options.repeat !== 1) {
    violations.push('repeat must stay at 1 for a single official submission job')
  }
  if (options.soak) {
    violations.push('soak must be disabled for a single official submission job')
  }
  if (violations.length > 0) {
    throw new Error(
      `Official Terminal-Bench submission mode is misconfigured: ${violations.join('; ')}.`,
    )
  }
}

function writeSignedBenchmarkArtifacts(args: {
  outputDir: string
  runId: string
  report: Record<string, unknown>
  traceWriter: ReturnType<typeof createBenchmarkTraceWriter>
}): { reportPath: string; receiptPath: string } {
  closeBenchmarkTraceWriter(args.traceWriter)
  args.report.traceReferences = [
    buildImmaculateTraceReference(args.traceWriter.path),
  ]
  const reportPath = join(args.outputDir, 'terminalbench-report.json')
  writeFileSync(reportPath, `${JSON.stringify(args.report, null, 2)}\n`, 'utf8')
  const receipt: Record<string, unknown> = {
    kind: 'q_terminalbench_benchmark_receipt',
    runId: args.runId,
    generatedAt: new Date().toISOString(),
    reportPath,
    reportSha256: sha256File(reportPath),
    seed: args.report.seed ?? null,
    traceReferences: args.report.traceReferences,
    provenance: args.report.provenance ?? null,
    summary: args.report.summary ?? null,
    status: args.report.status ?? null,
  }
  const signingKey = resolveBenchmarkSigningPrivateKey()
  if (signingKey) {
    receipt.signature = signBenchmarkReceipt({
      receipt,
      privateKeyPem: signingKey,
    })
  } else {
    receipt.signature = null
  }
  const receiptPath = join(args.outputDir, 'terminalbench-receipt.json')
  writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8')
  return { reportPath, receiptPath }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const runId = makeRunId(options)
  const outputDir =
    options.outputDir ?? resolve(options.root, 'artifacts', 'terminalbench', runId)
  const plannedCycleCount = options.soak ? options.soakCycles : 1
  mkdirSync(outputDir, { recursive: true })
  if (!options.jobsDir) {
    options.jobsDir = join(outputDir, 'jobs')
    mkdirSync(options.jobsDir, { recursive: true })
  }
  if (options.officialSubmission) {
    options.dataset = 'terminal-bench@2.0'
    options.nAttempts = Math.max(options.nAttempts, 5)
    options.agentSetupTimeoutMultiplier = null
    options.jobsDir = options.jobsDir ?? join(outputDir, 'jobs')
    options.jobName = options.jobName ?? `${runId}-official`
  }
  validateOfficialSubmissionOptions(options)
  const sessionMetadata = await resolveTerminalBenchSessionMetadata({
    root: options.root,
    runId,
    options,
  })
  const traceWriter = createBenchmarkTraceWriter({
    outputDir,
    sessionId: runId,
    sessionMetadata,
  })

  const checks: PreflightCheck[] = await runQPreflightChecks({
    root: options.root,
    requirements:
      options.agent === 'openjaws'
        ? ['harbor', 'docker', 'openjaws-provider-preflight', 'clock-skew']
        : ['harbor', 'docker', 'clock-skew'],
    model: options.model,
    harborCommand: options.harborCommand,
    timeoutMs: 30_000,
    warnOnProviderFailure: true,
  })
  appendBenchmarkTraceEvent(traceWriter, 'route.dispatched', {
    routeId: `${runId}-preflight`,
    runId,
    provider: options.agent,
    model: options.model,
    projectRoot: options.root,
    queueDepth: options.nTasks,
  })

  const representativeHarborArgs = buildHarborArgs(options, 1, 1)
  const report: Record<string, unknown> = {
    runId,
    generatedAt: new Date().toISOString(),
    outputDir,
    lane: options.soak ? 'soak' : 'bounded',
    dataset: options.dataset,
    agent: options.agent,
    model: options.model,
    seed: options.seed,
    nTasks: options.nTasks,
    nConcurrent: options.nConcurrent,
    nAttempts: options.nAttempts,
    repeat: options.repeat,
    soak:
      options.soak
        ? {
            enabled: true,
            maxCycles: options.soakCycles,
            maxDurationMinutes: options.soakDurationMinutes,
            cycleDelayMs: options.soakIntervalMs,
            plannedCycleCount,
            completedCycleCount: 0,
            stopReason: options.dryRun ? 'dry_run' : null,
            startedAt: null,
            finishedAt: null,
            durationMs: null,
          }
        : null,
    agentSetupTimeoutMultiplier: options.agentSetupTimeoutMultiplier,
    jobsDir: options.jobsDir,
    jobName: options.jobName,
    officialSubmission: options.officialSubmission,
    harborCommand: options.harborCommand,
    harborArgs: redactHarborArgs(representativeHarborArgs),
    provenance: sessionMetadata,
    agentEnvNames:
      options.agent === 'openjaws'
        ? Object.keys(
            collectAgentEnv({
              officialSubmission: options.officialSubmission,
              model: options.model,
            }),
          )
        : [],
    checks,
    exportTraces: options.exportTraces,
    exportSharegpt: options.exportSharegpt,
    exportEpisodes: options.exportEpisodes,
    exportPush: options.exportPush,
    exportRepo: options.exportRepo,
    honestyBoundary:
      'This Terminal-Bench lane is a Harbor-backed wrapper around OpenJaws. Live leaderboard claims still require a working provider path plus real Harbor/Terminal-Bench provenance.',
  }

  const failedChecks = checks.filter(check => check.status === 'failed')
  const warningChecks = checks.filter(check => check.status === 'warning')

  if (options.dryRun) {
    const dryRunCycles = buildDryRunCycles(options, plannedCycleCount)
    report.status = 'dry_run'
    report.summary = options.soak
      ? `Terminal-Bench soak dry run prepared for ${plannedCycleCount} bounded cycle${plannedCycleCount === 1 ? '' : 's'}.`
      : 'Terminal-Bench preflight completed.'
    report.command = [options.harborCommand, ...redactHarborArgs(representativeHarborArgs)].join(' ')
    report.cycles = dryRunCycles
    report.aggregate = buildAggregateSummary(dryRunCycles, [], [])
    report.attempts = []
    report.tasks = []
    report.exitCode = 0
    report.jobPathGuess = null
    report.jobResultPath = null
    report.jobResultSummary = null
    report.stdoutTail = ''
    report.stderrTail = ''
    const { reportPath, receiptPath } = writeSignedBenchmarkArtifacts({
      outputDir,
      runId,
      report,
      traceWriter,
    })
    console.log(
      JSON.stringify(
        {
          status: 'ok',
          runId,
          reportPath,
          receiptPath,
          summary: report.summary,
          checks,
          command: report.command,
        },
        null,
        2,
      ),
    )
    return
  }

  if (failedChecks.length > 0) {
    report.status = 'failed_preflight'
    report.summary = 'Terminal-Bench run blocked by failed Harbor/Docker preflight.'
    const { reportPath, receiptPath } = writeSignedBenchmarkArtifacts({
      outputDir,
      runId,
      report,
      traceWriter,
    })
    console.log(
      JSON.stringify(
        {
          status: 'failed',
          runId,
          reportPath,
          receiptPath,
          summary: report.summary,
          checks,
        },
        null,
        2,
      ),
    )
    process.exit(1)
  }

  if (options.agent === 'openjaws' && warningChecks.length > 0 && !options.force) {
    report.status = 'blocked'
    report.summary =
      'Terminal-Bench run blocked because the OpenJaws provider preflight is not healthy.'
    report.command = [options.harborCommand, ...redactHarborArgs(representativeHarborArgs)].join(' ')
    const { reportPath, receiptPath } = writeSignedBenchmarkArtifacts({
      outputDir,
      runId,
      report,
      traceWriter,
    })
    console.log(
      JSON.stringify(
        {
          status: 'ok',
          runId,
          reportPath,
          receiptPath,
          summary: report.summary,
          checks,
          command: report.command,
        },
        null,
        2,
      ),
    )
    return
  }

  const cycles: TerminalBenchCycleReceipt[] = []
  const attempts: TerminalBenchAttemptReceipt[] = []
  const tasks: TerminalBenchTaskReceipt[] = []
  const soakStartedAt = options.soak ? new Date() : null
  const soakDeadlineMs =
    options.soak && options.soakDurationMinutes !== null
      ? soakStartedAt!.getTime() + options.soakDurationMinutes * 60_000
      : null
  let soakStopReason: TerminalBenchSoakStopReason | null = options.soak
    ? 'cycle_limit'
    : 'single_cycle'

  for (let cycle = 1; cycle <= plannedCycleCount; cycle++) {
    if (soakDeadlineMs !== null && Date.now() >= soakDeadlineMs) {
      soakStopReason = 'duration_limit'
      break
    }

    const cycleStartedAt = new Date().toISOString()
    const cycleAttempts: TerminalBenchAttemptReceipt[] = []
    const cycleTasks: TerminalBenchTaskReceipt[] = []

    for (let attempt = 1; attempt <= options.repeat; attempt++) {
      const routeId = resolveAttemptJobName(
        {
          jobName: options.jobName,
          repeat: options.repeat,
          soak: options.soak,
        },
        cycle,
        attempt,
      )
      const traceRouteId = routeId ?? `${runId}-cycle-${cycle}-attempt-${attempt}`
      appendBenchmarkTraceEvent(traceWriter, 'route.dispatched', {
        routeId: traceRouteId,
        runId,
        provider: options.agent,
        model: options.model,
        queueDepth: options.nTasks,
        projectRoot: options.root,
      })
      const attemptResult = await runHarborAttempt({
        cycle,
        attempt,
        options,
      })
      cycleAttempts.push(attemptResult.attemptReceipt)
      cycleTasks.push(...attemptResult.taskReceipts)
      attempts.push(attemptResult.attemptReceipt)
      tasks.push(...attemptResult.taskReceipts)
      for (const task of attemptResult.taskReceipts) {
        appendBenchmarkTraceEvent(traceWriter, 'turn.complete', {
          turnId: task.trialName,
          routeId: traceRouteId,
          workerId: task.taskName,
          status:
            task.executionStatus === 'error'
              ? 'failed'
              : task.benchmarkStatus === 'passed'
                ? 'completed'
                : task.exceptionType?.toLowerCase().includes('timeout')
                  ? 'timeout'
                  : 'failed',
          latencyMs: Math.max(0, task.totalDurationMs ?? 0),
          promptTokens: null,
          completionTokens: null,
        })
      }
    }

    cycles.push(
      buildCycleReceipt({
        cycle,
        startedAt: cycleStartedAt,
        finishedAt: new Date().toISOString(),
        attempts: cycleAttempts,
        tasks: cycleTasks,
      }),
    )

    if (!options.soak || cycle === plannedCycleCount) {
      continue
    }
    if (soakDeadlineMs !== null && Date.now() >= soakDeadlineMs) {
      soakStopReason = 'duration_limit'
      break
    }
    if (options.soakIntervalMs > 0) {
      const delayMs =
        soakDeadlineMs === null
          ? options.soakIntervalMs
          : Math.min(options.soakIntervalMs, Math.max(0, soakDeadlineMs - Date.now()))
      if (delayMs <= 0) {
        soakStopReason = 'duration_limit'
        break
      }
      await sleep(delayMs)
    }
  }

  const aggregate = buildAggregateSummary(cycles, attempts, tasks)
  const lastCycle = cycles.at(-1) ?? null

  report.cycles = cycles
  report.aggregate = aggregate
  report.attempts = attempts
  report.tasks = tasks
  report.jobPathGuess = lastCycle?.jobPathGuess ?? null
  report.jobResultPath = lastCycle?.jobResultPath ?? null
  report.jobResultSummary = lastCycle?.jobResultSummary ?? null
  report.stdoutTail = lastCycle?.stdoutTail ?? ''
  report.stderrTail = lastCycle?.stderrTail ?? ''
  if (options.soak) {
    const soakFinishedAt = new Date()
    report.soak = {
      enabled: true,
      maxCycles: options.soakCycles,
      maxDurationMinutes: options.soakDurationMinutes,
      cycleDelayMs: options.soakIntervalMs,
      plannedCycleCount,
      completedCycleCount: cycles.length,
      stopReason:
        cycles.length >= plannedCycleCount && soakStopReason !== 'duration_limit'
          ? 'cycle_limit'
          : soakStopReason,
      startedAt: soakStartedAt?.toISOString() ?? null,
      finishedAt: soakFinishedAt.toISOString(),
      durationMs: soakStartedAt
        ? Math.max(0, soakFinishedAt.getTime() - soakStartedAt.getTime())
        : null,
    }
  }
  if (options.officialSubmission) {
    const agentEnv = collectAgentEnv({
      officialSubmission: options.officialSubmission,
      model: options.model,
    })
    const submissionSecretValues = Object.entries(agentEnv)
      .filter(([name]) =>
        !(
          name.endsWith('_MODEL') ||
          name.endsWith('_BASE_URL') ||
          name === 'Q_MODEL' ||
          name === 'Q_BASE_URL'
        ),
      )
      .map(([, value]) => value)
    const attemptsWithJobDirs = attempts.filter(
      attempt => attempt.harborJobPath && existsSync(attempt.harborJobPath),
    )
    if (attemptsWithJobDirs.length > 0) {
      const submission = stageOfficialSubmissionBundle({
        outputDir,
        attempts: attemptsWithJobDirs,
        secretValues: submissionSecretValues,
        modelLabel: options.model === 'oci:Q' ? 'q' : options.model ?? 'model',
      })
      report.submissionPath = submission.submissionDir
      report.submissionMetadataPath = submission.metadataPath
      report.submissionJobDirs = submission.stagedJobDirs
    }
  }

  const outcome = buildReportOutcome({
    options,
    cycles,
    aggregate,
  })
  report.status = outcome.status
  report.summary = outcome.summary
  report.exitCode = outcome.exitCode

  const { reportPath, receiptPath } = writeSignedBenchmarkArtifacts({
    outputDir,
    runId,
    report,
    traceWriter,
  })
  console.log(
    JSON.stringify(
      {
        status:
          report.status === 'completed_with_errors'
            ? 'warning'
            : report.status === 'completed'
              ? 'ok'
              : 'failed',
        runId,
        reportPath,
        receiptPath,
        summary: report.summary,
        exitCode: report.exitCode,
        jobPathGuess: report.jobPathGuess,
        jobResultPath: report.jobResultPath,
      },
      null,
      2,
    ),
  )

  if (typeof report.exitCode === 'number' && report.exitCode !== 0) {
    process.exit(report.exitCode)
  }
}

if (import.meta.main) {
  await main()
}
