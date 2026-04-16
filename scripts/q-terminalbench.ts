import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'fs'
import { dirname, join, resolve } from 'path'
import { execa } from 'execa'

type AgentMode = 'openjaws' | 'oracle'

type CliOptions = {
  root: string
  outputDir: string | null
  dataset: string
  harborCommand: string
  agent: AgentMode
  model: string | null
  nTasks: number
  nConcurrent: number
  repeat: number
  includeTaskNames: string[]
  excludeTaskNames: string[]
  maxTurns: number
  agentSetupTimeoutMultiplier: number | null
  timeoutMs: number
  exportTraces: boolean
  exportSharegpt: boolean
  exportEpisodes: 'all' | 'last'
  exportPush: boolean
  exportRepo: string | null
  env: string
  dryRun: boolean
  force: boolean
}

type CheckStatus = 'passed' | 'failed' | 'warning'

type PreflightCheck = {
  name: string
  status: CheckStatus
  summary: string
}

type TerminalBenchExecutionStatus = 'completed' | 'error'
type TerminalBenchBenchmarkStatus = 'passed' | 'failed' | 'unknown'

type TerminalBenchTaskReceipt = {
  attempt: number
  taskIndex: number
  taskName: string | null
  trialName: string | null
  source: string | null
  trialUri: string | null
  harborResultPath: string
  executionStatus: TerminalBenchExecutionStatus
  benchmarkStatus: TerminalBenchBenchmarkStatus
  summary: string
  startedAt: string | null
  finishedAt: string | null
  totalDurationMs: number | null
  environmentSetupDurationMs: number | null
  agentSetupDurationMs: number | null
  agentExecutionDurationMs: number | null
  verifierDurationMs: number | null
  rewardTotal: number | null
  rewardBreakdown: Record<string, number> | null
  returnCode: number | null
  isError: boolean | null
  permissionDenialCount: number | null
  exceptionType: string | null
  exceptionMessage: string | null
}

type TerminalBenchTrialCounts = {
  total: number
  executionErrors: number
  benchmarkPassed: number
  benchmarkFailed: number
  benchmarkUnknown: number
}

type TerminalBenchAttemptReceipt = {
  attempt: number
  status: 'completed' | 'completed_with_errors' | 'failed'
  summary: string
  exitCode: number | null
  harborJobPath: string | null
  harborJobResultPath: string | null
  jobResultSummary: Record<string, unknown> | null
  stdoutTail: string
  stderrTail: string
  trialCounts: TerminalBenchTrialCounts
}

function resolveDefaultHarborCommand(): string {
  const configured = process.env.OPENJAWS_HARBOR_COMMAND
  if (configured) {
    return configured
  }

  const localAppData = process.env.LOCALAPPDATA
  if (localAppData) {
    const pythonScriptsHarbor = resolve(
      localAppData,
      'Packages',
      'PythonSoftwareFoundation.Python.3.13_qbz5n2kfra8p0',
      'LocalCache',
      'local-packages',
      'Python313',
      'Scripts',
      process.platform === 'win32' ? 'harbor.exe' : 'harbor',
    )
    if (existsSync(pythonScriptsHarbor)) {
      return pythonScriptsHarbor
    }
  }

  return 'harbor'
}

function parseOptionalInt(value: string | undefined): number | null {
  if (!value) {
    return null
  }
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : null
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    root: process.cwd(),
    outputDir: null,
    dataset: 'terminal-bench/terminal-bench-2',
    harborCommand: resolveDefaultHarborCommand(),
    agent: 'openjaws',
    model: 'oci:Q',
    nTasks: 1,
    nConcurrent: 1,
    repeat: 1,
    includeTaskNames: [],
    excludeTaskNames: [],
    maxTurns: 12,
    agentSetupTimeoutMultiplier: 3,
    timeoutMs: 7_200_000,
    exportTraces: false,
    exportSharegpt: false,
    exportEpisodes: 'last',
    exportPush: false,
    exportRepo: null,
    env: 'docker',
    dryRun: false,
    force: false,
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
      '  --dataset <name>             Harbor dataset name (default terminal-bench/terminal-bench-2)',
      '  --agent <mode>               openjaws | oracle',
      '  --model <name>               OpenJaws model identifier for the Harbor adapter (default oci:Q)',
      '  --no-model                   Do not pass a model to the OpenJaws agent',
      '  --n-tasks <n>                Maximum number of tasks to run (default 1)',
      '  --n-concurrent <n>           Harbor concurrency for parallel task execution (default 1)',
      '  --repeat <n>                 Repeat the Harbor run sequentially and aggregate the receipts (default 1)',
      '  --include-task-name <glob>   Include only matching task names',
      '  --exclude-task-name <glob>   Exclude matching task names',
      '  --max-turns <n>              Max OpenJaws turns inside Harbor (default 12)',
      '  --agent-setup-timeout-multiplier <n>  Harbor agent setup timeout multiplier (default 3)',
      '  --env <name>                 Harbor environment (default docker)',
      '  --harbor <command>           Harbor CLI command or path',
      '  --out-dir <path>             Output directory for receipts',
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

function makeRunId(): string {
  return `q-terminalbench-${new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\..+/, '')}`
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

async function runPreflightCheck(
  name: string,
  command: string,
  args: string[],
  options: { cwd?: string; env?: Record<string, string | undefined> } = {},
): Promise<PreflightCheck> {
  const result = await execa(command, args, {
    cwd: options.cwd,
    env: options.env,
    reject: false,
    windowsHide: true,
    timeout: 120_000,
  })
  return {
    name,
    status: result.exitCode === 0 ? 'passed' : 'failed',
    summary:
      result.exitCode === 0
        ? `${name} reachable`
        : tailText(result.stderr || result.stdout) || `${name} failed`,
  }
}

async function runOpenJawsProviderPreflight(options: CliOptions): Promise<PreflightCheck> {
  const binary =
    process.platform === 'win32'
      ? resolve(options.root, 'dist', 'openjaws.exe')
      : resolve(options.root, 'dist', 'openjaws')
  if (!existsSync(binary)) {
    return {
      name: 'openjaws-provider-preflight',
      status: 'failed',
      summary: `Compiled OpenJaws binary not found at ${binary}. Run bun run build:native first.`,
    }
  }

  const args = [
    '-p',
    '--output-format',
    'json',
    '--bare',
    '--max-turns',
    '1',
  ]
  if (options.model) {
    args.push('--model', options.model)
  }
  args.push('Reply with the single word OK.')

  const result = await execa(binary, args, {
    cwd: options.root,
    reject: false,
    windowsHide: true,
    timeout: 180_000,
  })

  const stdout = result.stdout.trim()
  const lastLine = stdout ? stdout.split(/\r?\n/).slice(-1)[0] ?? stdout : ''
  let payload: Record<string, unknown> | null = null
  if (lastLine) {
    try {
      payload = JSON.parse(lastLine) as Record<string, unknown>
    } catch {
      payload = null
    }
  }

  if (result.exitCode === 0 && payload && payload.is_error === false) {
    return {
      name: 'openjaws-provider-preflight',
      status: 'passed',
      summary: 'OpenJaws local provider preflight succeeded.',
    }
  }

  const summary =
    (payload && typeof payload.result === 'string' && payload.result) ||
    tailText(result.stderr || result.stdout) ||
    'OpenJaws provider preflight failed.'
  return {
    name: 'openjaws-provider-preflight',
    status: 'warning',
    summary,
  }
}

function collectAgentEnv(): Record<string, string> {
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
  const collected: Record<string, string> = {}
  for (const name of envNames) {
    const value = process.env[name]
    if (value) {
      collected[name] = value
    }
  }
  return collected
}

function buildHarborArgs(options: CliOptions): string[] {
  const agentEnv = collectAgentEnv()
  const args = [
    'run',
    '--dataset',
    options.dataset,
    '--n-tasks',
    String(options.nTasks),
    '--env',
    options.env,
    '--n-concurrent',
    String(options.nConcurrent),
    '--yes',
  ]
  if (options.agentSetupTimeoutMultiplier !== null) {
    args.push(
      '--agent-setup-timeout-multiplier',
      String(options.agentSetupTimeoutMultiplier),
    )
  }

  for (const includeTaskName of options.includeTaskNames) {
    args.push('--include-task-name', includeTaskName)
  }
  for (const excludeTaskName of options.excludeTaskNames) {
    args.push('--exclude-task-name', excludeTaskName)
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
    for (const [name, value] of Object.entries(agentEnv)) {
      args.push('--ae', `${name}=${value}`)
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

function redactHarborArgs(args: string[]): string[] {
  return args.map((value, index) => {
    if (index > 0 && args[index - 1] === '--ae') {
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

function listHarborJobResultPaths(): string[] {
  const resultPaths: string[] = []
  for (const root of scanHarborJobRoots()) {
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

function guessLatestHarborJobResultPath(excludedPaths?: ReadonlySet<string>): string | null {
  let latestPath: string | null = null
  let latestMtime = -Infinity
  for (const path of listHarborJobResultPaths()) {
    if (excludedPaths?.has(path)) {
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

function buildTrialCounts(
  tasks: readonly TerminalBenchTaskReceipt[],
): TerminalBenchTrialCounts {
  return {
    total: tasks.length,
    executionErrors: tasks.filter(task => task.executionStatus === 'error').length,
    benchmarkPassed: tasks.filter(task => task.benchmarkStatus === 'passed').length,
    benchmarkFailed: tasks.filter(task => task.benchmarkStatus === 'failed').length,
    benchmarkUnknown: tasks.filter(task => task.benchmarkStatus === 'unknown').length,
  }
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

function percentile(values: readonly number[], fraction: number): number | null {
  if (values.length === 0) {
    return null
  }
  const sorted = [...values].sort((left, right) => left - right)
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * fraction) - 1),
  )
  return sorted[index] ?? null
}

function buildAggregateSummary(
  attempts: readonly TerminalBenchAttemptReceipt[],
  tasks: readonly TerminalBenchTaskReceipt[],
): Record<string, number> {
  const counts = buildTrialCounts(tasks)
  const completedAttempts = attempts.filter(attempt => attempt.status === 'completed').length
  const attemptsWithErrors = attempts.filter(
    attempt => attempt.status === 'completed_with_errors',
  ).length
  const failedAttempts = attempts.filter(attempt => attempt.status === 'failed').length
  const durationValues = tasks
    .map(task => task.totalDurationMs)
    .filter((value): value is number => value !== null)
  const rewardValues = tasks
    .map(task => task.rewardTotal)
    .filter((value): value is number => value !== null)

  return {
    attemptCount: attempts.length,
    completedAttempts,
    attemptsWithErrors,
    failedAttempts,
    totalTrials: counts.total,
    executionErrorTrials: counts.executionErrors,
    benchmarkPassedTrials: counts.benchmarkPassed,
    benchmarkFailedTrials: counts.benchmarkFailed,
    benchmarkUnknownTrials: counts.benchmarkUnknown,
    avgTrialDurationMs:
      durationValues.length > 0
        ? Math.round(
            durationValues.reduce((sum, value) => sum + value, 0) / durationValues.length,
          )
        : 0,
    p50TrialDurationMs: percentile(durationValues, 0.5) ?? 0,
    p95TrialDurationMs: percentile(durationValues, 0.95) ?? 0,
    avgReward:
      rewardValues.length > 0
        ? Math.round(
            (rewardValues.reduce((sum, value) => sum + value, 0) / rewardValues.length) *
              1000,
          ) / 1000
        : 0,
  }
}

function buildAttemptSummary(args: {
  attempt: number
  exitCode: number | null
  trialCounts: TerminalBenchTrialCounts
}): { status: TerminalBenchAttemptReceipt['status']; summary: string } {
  if (args.exitCode !== 0) {
    return {
      status: 'failed',
      summary: `Attempt ${args.attempt} failed to finish the Harbor run.`,
    }
  }

  if (args.trialCounts.executionErrors > 0 || args.trialCounts.benchmarkFailed > 0) {
    const issueParts = [
      args.trialCounts.executionErrors > 0
        ? `${args.trialCounts.executionErrors} execution error${args.trialCounts.executionErrors === 1 ? '' : 's'}`
        : null,
      args.trialCounts.benchmarkFailed > 0
        ? `${args.trialCounts.benchmarkFailed} benchmark failure${args.trialCounts.benchmarkFailed === 1 ? '' : 's'}`
        : null,
    ].filter(Boolean)
    return {
      status: 'completed_with_errors',
      summary: `Attempt ${args.attempt} completed with ${issueParts.join(' and ')} across ${args.trialCounts.total} trial${args.trialCounts.total === 1 ? '' : 's'}.`,
    }
  }

  return {
    status: 'completed',
    summary: `Attempt ${args.attempt} completed with ${args.trialCounts.benchmarkPassed}/${args.trialCounts.total} passing trial${args.trialCounts.total === 1 ? '' : 's'}.`,
  }
}

async function runHarborAttempt(args: {
  attempt: number
  options: CliOptions
  harborArgs: string[]
}): Promise<{
  attemptReceipt: TerminalBenchAttemptReceipt
  taskReceipts: TerminalBenchTaskReceipt[]
}> {
  const beforeJobResultPaths = new Set(listHarborJobResultPaths())
  const result = await execa(args.options.harborCommand, args.harborArgs, {
    cwd: args.options.root,
    reject: false,
    windowsHide: true,
    timeout: args.options.timeoutMs,
  })

  const harborJobResultPath =
    guessLatestHarborJobResultPath(beforeJobResultPaths) ??
    guessLatestHarborJobResultPath()
  const harborJobPath = resolveHarborJobRoot(harborJobResultPath)
  const jobResultSummary = readHarborResultSummary(harborJobResultPath)
  const taskReceipts = readHarborTaskReceipts(harborJobPath, args.attempt)
  sanitizeHarborJobArtifacts(harborJobPath, harborJobResultPath)
  const trialCounts = buildTrialCounts(taskReceipts)
  const attemptSummary = buildAttemptSummary({
    attempt: args.attempt,
    exitCode: result.exitCode,
    trialCounts,
  })

  return {
    attemptReceipt: {
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

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const runId = makeRunId()
  const outputDir =
    options.outputDir ?? resolve(options.root, 'artifacts', 'terminalbench', runId)
  mkdirSync(outputDir, { recursive: true })

  const checks: PreflightCheck[] = []
  checks.push(
    await runPreflightCheck('harbor', options.harborCommand, ['--help'], {
      cwd: options.root,
    }),
  )
  checks.push(await runPreflightCheck('docker', 'docker', ['info'], { cwd: options.root }))
  if (options.agent === 'openjaws') {
    checks.push(await runOpenJawsProviderPreflight(options))
  }

  const harborArgs = buildHarborArgs(options)
  const report: Record<string, unknown> = {
    runId,
    generatedAt: new Date().toISOString(),
    outputDir,
    dataset: options.dataset,
    agent: options.agent,
    model: options.model,
    nTasks: options.nTasks,
    nConcurrent: options.nConcurrent,
    repeat: options.repeat,
    agentSetupTimeoutMultiplier: options.agentSetupTimeoutMultiplier,
    harborCommand: options.harborCommand,
    harborArgs: redactHarborArgs(harborArgs),
    agentEnvNames:
      options.agent === 'openjaws' ? Object.keys(collectAgentEnv()) : [],
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
    report.status =
      options.dryRun
        ? 'dry_run'
        : 'blocked'
    report.summary =
      options.dryRun
        ? 'Terminal-Bench preflight completed.'
        : 'Terminal-Bench run blocked because the OpenJaws provider preflight is not healthy.'
    report.command = [options.harborCommand, ...redactHarborArgs(harborArgs)].join(' ')
    const reportPath = join(outputDir, 'terminalbench-report.json')
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
    console.log(
      JSON.stringify(
        {
          status: 'ok',
          runId,
          reportPath,
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
    const reportPath = join(outputDir, 'terminalbench-report.json')
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
    console.log(
      JSON.stringify(
        {
          status: 'failed',
          runId,
          reportPath,
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
    report.command = [options.harborCommand, ...redactHarborArgs(harborArgs)].join(' ')
    const reportPath = join(outputDir, 'terminalbench-report.json')
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
    console.log(
      JSON.stringify(
        {
          status: 'ok',
          runId,
          reportPath,
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

  const attempts: TerminalBenchAttemptReceipt[] = []
  const tasks: TerminalBenchTaskReceipt[] = []
  for (let attempt = 1; attempt <= options.repeat; attempt++) {
    const attemptResult = await runHarborAttempt({
      attempt,
      options,
      harborArgs,
    })
    attempts.push(attemptResult.attemptReceipt)
    tasks.push(...attemptResult.taskReceipts)
  }

  const aggregate = buildAggregateSummary(attempts, tasks)
  const failedAttempts = attempts.filter(attempt => attempt.status === 'failed')
  const attemptsWithErrors = attempts.filter(
    attempt => attempt.status === 'completed_with_errors',
  )
  const lastAttempt = attempts.at(-1) ?? null

  report.aggregate = aggregate
  report.attempts = attempts
  report.tasks = tasks
  report.exitCode = failedAttempts.length > 0 ? 1 : 0
  report.jobPathGuess = lastAttempt?.harborJobPath ?? null
  report.jobResultPath = lastAttempt?.harborJobResultPath ?? null
  report.jobResultSummary = lastAttempt?.jobResultSummary ?? null
  report.stdoutTail = lastAttempt?.stdoutTail ?? ''
  report.stderrTail = lastAttempt?.stderrTail ?? ''

  if (failedAttempts.length > 0) {
    report.status = 'failed'
    report.summary =
      options.repeat > 1
        ? `Terminal-Bench repeated run failed in ${failedAttempts.length}/${options.repeat} attempt${options.repeat === 1 ? '' : 's'}.`
        : 'Harbor Terminal-Bench run failed.'
  } else if (
    aggregate.executionErrorTrials > 0 ||
    aggregate.benchmarkFailedTrials > 0 ||
    attemptsWithErrors.length > 0
  ) {
    report.status = 'completed_with_errors'
    report.summary =
      options.repeat > 1
        ? `Terminal-Bench repeated run completed with ${aggregate.executionErrorTrials} execution error trial${aggregate.executionErrorTrials === 1 ? '' : 's'} and ${aggregate.benchmarkFailedTrials} benchmark-failing trial${aggregate.benchmarkFailedTrials === 1 ? '' : 's'} across ${aggregate.totalTrials} total trial${aggregate.totalTrials === 1 ? '' : 's'}.`
        : `Harbor Terminal-Bench run completed with ${aggregate.executionErrorTrials} execution error trial${aggregate.executionErrorTrials === 1 ? '' : 's'} and ${aggregate.benchmarkFailedTrials} benchmark-failing trial${aggregate.benchmarkFailedTrials === 1 ? '' : 's'}.`
  } else {
    report.status = 'completed'
    report.summary =
      options.repeat > 1
        ? `Terminal-Bench repeated run completed with ${aggregate.benchmarkPassedTrials}/${aggregate.totalTrials} passing trial${aggregate.totalTrials === 1 ? '' : 's'} across ${options.repeat} attempt${options.repeat === 1 ? '' : 's'}.`
        : 'Harbor Terminal-Bench run completed.'
  }

  const reportPath = join(outputDir, 'terminalbench-report.json')
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
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

await main()
